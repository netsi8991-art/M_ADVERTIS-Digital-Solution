const fs   = require('fs');
const pdfParse = require('pdf-parse');
const sharp    = require('sharp');

function extractEmbeddedImages(pdfBuffer) {
    const images = [];
    const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
    let i = 0;
    while (i < buf.length - 1) {
        if (buf[i] === 0xFF && buf[i + 1] === 0xD8) {
            const start = i;
            let j = i + 2;
            while (j < buf.length - 1) {
                if (buf[j] === 0xFF && buf[j + 1] === 0xD9) {
                    const imgData = buf.slice(start, j + 2);
                    if (imgData.length > 5000) images.push(imgData);
                    i = j + 2;
                    break;
                }
                j++;
            }
            if (j >= buf.length - 1) break;
        } else {
            i++;
        }
    }
    return images;
}

async function extractCardImages(imageBuffers) {
    const result = { photo: null, photoSmall: null, qrCode: null, frontCard: null, backCard: null };
    if (!imageBuffers || !imageBuffers.length) return result;

    const classified = [];
    for (const buf of imageBuffers) {
        try {
            const meta = await sharp(buf).metadata();
            classified.push({ buffer: buf, width: meta.width, height: meta.height, size: buf.length });
        } catch (_) {}
    }
    classified.sort((a, b) => b.size - a.size);

    const cardImages  = classified.filter(i => i.width > 500 && i.height > 500);
    const smallImages = classified.filter(i => i.width <= 500 && i.height <= 500);

    if (cardImages.length >= 2) {
        result.frontCard = cardImages[0].buffer;
        result.backCard  = cardImages[1].buffer;
    } else if (cardImages.length === 1) {
        result.frontCard = cardImages[0].buffer;
    }
    if (smallImages.length > 0) result.qrCode = smallImages[0].buffer;

    if (result.frontCard) {
        try {
            const meta = await sharp(result.frontCard).metadata();
            const w = meta.width, h = meta.height;
            result.photo = await sharp(result.frontCard)
                .extract({ left: Math.round(w*0.12), top: Math.round(h*0.12), width: Math.round(w*0.76), height: Math.round(h*0.46) })
                .png().toBuffer();
            result.photoSmall = await sharp(result.photo)
                .resize(150, 190, { fit: 'cover' }).png().toBuffer();
        } catch (e) { console.error('Photo crop failed:', e.message); }
    }

    if (result.backCard && !result.qrCode) {
        try {
            const meta = await sharp(result.backCard).metadata();
            const w = meta.width, h = meta.height;
            result.qrCode = await sharp(result.backCard)
                .extract({ left: Math.round(w*0.05), top: Math.round(h*0.08), width: Math.round(w*0.90), height: Math.round(h*0.50) })
                .png().toBuffer();
        } catch (e) { console.error('QR crop failed:', e.message); }
    }

    return result;
}

async function extractText(pdfBuffer) {
    const data  = await pdfParse(pdfBuffer);
    const lines = data.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const result = {
        fullNameAmharic: '', fullNameEnglish: '',
        dobEthiopian: '', dobGregorian: '',
        sex: '', sexAmharic: '',
        expiryEthiopian: '', expiryGregorian: '',
        fanNumber: '', phoneNumber: '',
        nationality: 'Ethiopian', nationalityAmharic: 'ኢትዮጵያዊ',
        regionAmharic: '', regionEnglish: '',
        zoneAmharic: '', zoneEnglish: '',
        cityAmharic: '', cityEnglish: '',
        finNumber: '', serialNumber: '',
        issueDateEthiopian: '', issueDateGregorian: '',
    };

    // flexible name patterns: 2, 3, or 4 name parts
    const nameRegex = /^([A-Z][a-zA-Z'-]+)(\s+[A-Z][a-zA-Z'-]+){1,3}$/;
    let dataStartIdx = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
        if (nameRegex.test(lines[i].trim())) {
            result.fullNameEnglish = lines[i].trim();
            if (i-1 >= 0 && /[\u1200-\u137F]/.test(lines[i-1])) {
                result.fullNameAmharic = lines[i-1].trim();
            }
            if (i-2 >= 0 && /^\d{4}\s+\d{4}\s+\d{4}\s+\d{4}$/.test(lines[i-2].trim())) {
                result.fanNumber = lines[i-2].trim();
            }
            dataStartIdx = i;
            break;
        }
    }

    if (dataStartIdx > 0) {
        let idx = dataStartIdx - 3;
        const pick = (test) => { if (idx >= 0 && test(lines[idx])) { const v = lines[idx].trim(); idx--; return v; } idx--; return ''; };

        result.cityEnglish    = pick(l => /[A-Za-z]/.test(l) && !/Male|Female/.test(l));
        result.cityAmharic    = pick(l => /[\u1200-\u137F]/.test(l));
        result.zoneEnglish    = pick(l => /[A-Za-z]/.test(l) && !/Male|Female/.test(l));
        result.zoneAmharic    = pick(l => /[\u1200-\u137F]/.test(l));
        result.regionEnglish  = pick(l => /[A-Za-z]/.test(l) && !/Male|Female/.test(l));
        result.regionAmharic  = pick(l => /[\u1200-\u137F]/.test(l));
        result.phoneNumber    = pick(l => /^0\d{9}$/.test(l.trim()));
        pick(l => l.trim() === 'Ethiopian');
        pick(l => l.trim() === 'ኢትዮጵያዊ');
        result.sex            = pick(l => l.trim() === 'Male' || l.trim() === 'Female');
        result.sexAmharic     = pick(l => l.trim() === 'ወንድ'   || l.trim() === 'ሴት');
        result.dobGregorian   = pick(l => /^\d{4}\/\d{2}\/\d{2}$/.test(l.trim()));
        result.dobEthiopian   = pick(l => /^\d{2}\/\d{2}\/\d{4}$/.test(l.trim()));
    }

    const fullText = lines.join(' ');

    // FIN
    const finLine = lines.find(l => l.startsWith('FCN:'));
    if (finLine) { const m = finLine.match(/FCN:\s*(.+)/); if (m) result.finNumber = m[1].trim(); }
    if (!result.finNumber) {
        const m = fullText.match(/FIN\s+(\d{4}\s+\d{4}\s+\d{4})/i);
        if (m) result.finNumber = m[1];
    }

    // Serial number
    const snM = fullText.match(/SN\s*:?\s*(\w{5,})/i);
    if (snM) result.serialNumber = snM[1];

    // Dates from text
    const dateMatches = [...fullText.matchAll(/\b(\d{4}\/\d{2}\/\d{2})\b/g)];
    if (dateMatches.length >= 2) {
        result.issueDateGregorian  = dateMatches[0][1];
        result.expiryGregorian     = dateMatches[1][1];
    } else if (dateMatches.length === 1) {
        result.issueDateGregorian  = dateMatches[0][1];
    }

    return result;
}

async function parseAndExtract(pdfPath) {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const textData  = await extractText(pdfBuffer);

    let images = { photo: null, photoSmall: null, qrCode: null, frontCard: null, backCard: null };
    try {
        const rawImages = extractEmbeddedImages(pdfBuffer);
        if (rawImages.length > 0) {
            images = await extractCardImages(rawImages);
        }
    } catch (err) {
        console.error('Image extraction failed:', err.message);
    }

    return { ...textData, images };
}

module.exports = { parseAndExtract, extractText, extractEmbeddedImages, extractCardImages };
