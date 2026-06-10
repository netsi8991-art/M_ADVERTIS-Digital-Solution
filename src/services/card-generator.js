const { createCanvas, loadImage, registerFont } = require('canvas');
const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');
const config = require('../config');

const fontRegular = path.join(config.ASSETS_DIR, 'fonts', 'NotoSansEthiopic.ttf');
const fontBold    = path.join(config.ASSETS_DIR, 'fonts', 'EbrimaBold.ttf');
const fontEbrima  = path.join(config.ASSETS_DIR, 'fonts', 'Ebrima.ttf');

if (fs.existsSync(fontRegular)) registerFont(fontRegular, { family: 'NotoEthiopic' });
if (fs.existsSync(fontEbrima))  registerFont(fontEbrima,  { family: 'Ebrima' });
if (fs.existsSync(fontBold))    registerFont(fontBold,    { family: 'Ebrima', weight: 'bold' });

const CARD_W = 1012;
const CARD_H = 638;
const A4_W   = 2480;
const A4_H   = 3508;

// Font helper: prefer NotoEthiopic for Ethiopic text
function font(size, bold, ethiopic) {
    if (ethiopic) return `${bold ? '500' : '400'} ${size}px NotoEthiopic, Ebrima, Arial`;
    return `${bold ? 'bold' : 'normal'} ${size}px Ebrima, NotoEthiopic, Arial`;
}

async function generateAllCards(idData, userSettings) {
    const photoMode = userSettings.photo_mode || 'Grey';
    const template  = userSettings.template   || 'A';
    const ovalCut   = userSettings.oval_cut   || 0;

    const frontCard = await drawFrontCard(idData, photoMode, template, ovalCut);
    const backCard  = await drawBackCard(idData, photoMode, template, ovalCut);

    const normal = await combineCards(frontCard, backCard);
    const mirror = await mirrorImage(normal);

    const fcColor = photoMode === 'Color' ? frontCard : await drawFrontCard(idData, 'Color', template, ovalCut);
    const bcColor = photoMode === 'Color' ? backCard  : await drawBackCard(idData, 'Color', template, ovalCut);
    const a4color = await placeOnA4(await mirrorImage(await combineCards(fcColor, bcColor)));

    const fcGray = await drawFrontCard(idData, 'Grey', template, ovalCut);
    const bcGray = await drawBackCard(idData, 'Grey', template, ovalCut);
    const a4gray = await placeOnA4(await mirrorImage(await combineCards(fcGray, bcGray)));

    return { normal, mirror, a4color, a4gray };
}

function drawBackground(ctx, w, h, template) {
    if (template === 'B') {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0,   '#b8d8b0');
        g.addColorStop(0.5, '#e0f0d8');
        g.addColorStop(1,   '#98c490');
        ctx.fillStyle = g;
    } else {
        const g = ctx.createRadialGradient(w*0.45, h*0.45, 20, w*0.5, h*0.5, w*0.85);
        g.addColorStop(0,    '#e6f2e0');
        g.addColorStop(0.45, '#c2ddba');
        g.addColorStop(1,    '#6aaa60');
        ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.045;
    ctx.strokeStyle = '#1a5a1a';
    ctx.lineWidth = 0.6;
    for (let y = 0; y < h; y += 8) {
        ctx.beginPath();
        for (let x = 0; x < w; x += 3) {
            const yOff = Math.sin(x*0.012 + y*0.008)*3 + Math.sin(x*0.025)*2;
            if (x === 0) ctx.moveTo(x, y+yOff); else ctx.lineTo(x, y+yOff);
        }
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.025;
    ctx.strokeStyle = '#1a5a1a';
    ctx.lineWidth = 0.5;
    const cx = w*0.5, cy = h*0.5;
    for (let r = 30; r < Math.max(w,h); r += 12) {
        ctx.beginPath();
        for (let a = 0; a < Math.PI*2; a += 0.02) {
            const rr = r + Math.sin(a*8 + r*0.05)*3;
            const px = cx + rr*Math.cos(a);
            const py = cy + rr*Math.sin(a)*(h/w);
            if (a === 0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function drawStarWatermark(ctx, cx, cy, outerR) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#2a5a2a';
    ctx.lineWidth = 2;
    for (let s = 0; s < 3; s++) {
        const r = outerR - s*15;
        if (r < 20) break;
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
            const rr = i % 2 === 0 ? r : r*0.45;
            const angle = (i * Math.PI/6) - Math.PI/2;
            const x = cx + rr*Math.cos(angle), y = cy + rr*Math.sin(angle);
            if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.closePath();
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, outerR*0.2, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
}

function drawEthiopianFlag(ctx, x, y, w, h) {
    const sH = h/3;
    ctx.save();
    roundRectClip(ctx, x, y, w, h, 5);
    ctx.fillStyle = '#009739'; ctx.fillRect(x, y, w, sH);
    ctx.fillStyle = '#FCDD09'; ctx.fillRect(x, y+sH, w, sH);
    ctx.fillStyle = '#DA121A'; ctx.fillRect(x, y+sH*2, w, sH);
    const fcx = x+w/2, fcy = y+h/2, cr = Math.min(w,h)*0.24;
    ctx.beginPath(); ctx.arc(fcx, fcy, cr, 0, Math.PI*2);
    ctx.fillStyle = '#0F47AF'; ctx.fill();
    ctx.fillStyle = '#FCDD09';
    drawStar5(ctx, fcx, fcy, cr*0.35, cr*0.8);
    ctx.strokeStyle = '#FCDD09'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
        const angle = (i*Math.PI*2/5) - Math.PI/2;
        ctx.beginPath(); ctx.moveTo(fcx,fcy);
        ctx.lineTo(fcx+cr*0.95*Math.cos(angle), fcy+cr*0.95*Math.sin(angle));
        ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle='#555'; ctx.lineWidth=1;
    roundRectStroke(ctx,x,y,w,h,5);
}

function drawStar5(ctx, cx, cy, innerR, outerR) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i%2===0 ? outerR : innerR;
        const angle = (i*Math.PI/5) - Math.PI/2;
        const x = cx+r*Math.cos(angle), y = cy+r*Math.sin(angle);
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.closePath(); ctx.fill();
}

function drawNationalIDLogo(ctx, cx, cy, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.fillStyle='#1a4a2e'; ctx.fill();
    ctx.strokeStyle='#7ab87a'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,cy,r*0.75,0,Math.PI*2);
    ctx.strokeStyle='#5a9a5a'; ctx.lineWidth=0.5; ctx.stroke();
    ctx.fillStyle='#ffffff';
    const dotR = r*0.08;
    const pts = [[0,-0.45],[0.35,-0.2],[0.35,0.25],[0,0.45],[-0.35,0.25],[-0.35,-0.2]];
    for (const [px,py] of pts) { ctx.beginPath(); ctx.arc(cx+r*px,cy+r*py,dotR,0,Math.PI*2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx,cy,dotR*1.3,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=0.8;
    for (let i=0; i<pts.length; i++) {
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+r*pts[i][0],cy+r*pts[i][1]); ctx.stroke();
        const n=(i+1)%pts.length;
        ctx.beginPath(); ctx.moveTo(cx+r*pts[i][0],cy+r*pts[i][1]); ctx.lineTo(cx+r*pts[n][0],cy+r*pts[n][1]); ctx.stroke();
    }
    ctx.fillStyle='#ffffff'; ctx.textAlign='center';
    ctx.font = font(9, true, true);
    ctx.fillText('ብሔራዊ መታወቂያ', cx, cy+r+14);
    ctx.font = font(8, false, false);
    ctx.fillText('National ID', cx, cy+r+25);
    ctx.textAlign='left'; ctx.restore();
}

function drawBarcode(ctx, x, y, w, h, data) {
    if (!data) return;
    ctx.fillStyle='#000000';
    const totalBars = data.length*11+35;
    const barW = w/totalBars;
    let cx = x;
    const patterns=[[2,1,2,2,2,1],[2,2,2,1,2,1],[2,2,1,2,2,1],[1,2,1,3,2,1],[1,1,3,2,2,1],[1,3,1,2,2,1],[2,1,1,2,1,3],[2,1,1,3,1,2],[3,1,1,2,1,2],[2,2,1,1,1,3]];
    [2,1,1,1,2,3,2].forEach((b,j) => { if(j%2===0) ctx.fillRect(cx,y,barW*b*0.9,h); cx+=barW*b; });
    for (const ch of data) {
        const p=patterns[parseInt(ch)||0];
        p.forEach((b,j) => { if(j%2===0) ctx.fillRect(cx,y,barW*b*0.9,h); cx+=barW*b; });
    }
    [2,3,3,1,1,1,2].forEach((b,j) => { if(j%2===0) ctx.fillRect(cx,y,barW*b*0.9,h); cx+=barW*b; });
}

async function drawFrontCard(idData, photoMode, template, ovalCut) {
    const canvas = createCanvas(CARD_W, CARD_H);
    const ctx = canvas.getContext('2d');
    drawBackground(ctx, CARD_W, CARD_H, template);
    ctx.save();
    roundRectClip(ctx, 0, 0, CARD_W, CARD_H, 14);
    drawStarWatermark(ctx, CARD_W*0.55, CARD_H*0.42, 160);

    ctx.fillStyle='rgba(18,55,30,0.75)';
    roundRectFill(ctx, 12, 8, CARD_W-24, 52, 8);
    drawEthiopianFlag(ctx, 18, 11, 90, 46);

    ctx.fillStyle='#ffffff';
    ctx.font = font(18, true, true);
    ctx.fillText('የኢትዮጵያ ዲጂታል መታወቂያ ካርድ', 118, 33);
    ctx.font = font(14, true, false);
    ctx.fillText('Ethiopian Digital ID Card', 118, 50);
    drawNationalIDLogo(ctx, CARD_W-62, 22, 26);

    const photoX=28, photoY=72, photoW=220, photoH=280;
    if (idData.images && idData.images.photo) {
        let photoBuffer = idData.images.photo;
        if (photoMode==='Grey') photoBuffer = await sharp(photoBuffer).grayscale().png().toBuffer();
        const photoImg = await loadImage(photoBuffer);
        if (ovalCut) {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(photoX+photoW/2, photoY+photoH/2, photoW/2, photoH/2, 0, 0, Math.PI*2);
            ctx.clip();
            ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
            ctx.restore();
        } else {
            ctx.drawImage(photoImg, photoX, photoY, photoW, photoH);
        }
    } else {
        ctx.fillStyle='#e0e0e0'; ctx.fillRect(photoX,photoY,photoW,photoH);
        ctx.fillStyle='#999'; ctx.font=font(16,false,false);
        ctx.fillText('Photo', photoX+80, photoY+145);
    }

    ctx.save();
    ctx.translate(13, CARD_H-15); ctx.rotate(-Math.PI/2);
    ctx.fillStyle='#2a5a2a';
    ctx.font = font(10, false, false);
    const issueGreg = idData.issueDateGregorian || '';
    ctx.fillText(`የተሰጠበት ቀን · Date of Issue${issueGreg ? ' · '+issueGreg : ''}`, 0, 0);
    ctx.restore();

    const tx=268, lc='#7a3300', vc='#0a2a12';
    let ty=90;
    const label = (t) => { ctx.fillStyle=lc; ctx.font=font(12,false,true); ctx.fillText(t,tx,ty); ty+=24; };
    const value = (t, sz, bold, eth) => { ctx.fillStyle=vc; ctx.font=font(sz,bold,eth); ctx.fillText(t,tx,ty); ty+=sz+6; };

    label('ሙሉ ስሞ | Full Name');
    value(idData.fullNameAmharic || '', 22, true, true);
    value(idData.fullNameEnglish || '', 17, true, false);
    ty += 4;
    label('የትውልድ ቀን | Date of Birth');
    value(formatDate(idData.dobEthiopian, idData.dobGregorian), 17, true, false);
    ty += 4;
    label('ፆታ | Sex');
    value(`${idData.sexAmharic||'ወንድ'} | ${idData.sex||'Male'}`, 17, true, false);
    ty += 4;
    label('የሚያበቃበት ቀን | Date of Expiry');
    value(formatDate(idData.expiryEthiopian, idData.expiryGregorian), 17, true, false);

    ctx.save();
    ctx.globalAlpha=0.08; ctx.fillStyle='#1a3a1a';
    ctx.font=font(130,true,true);
    ctx.fillText('ፋይዳ', CARD_W*0.45, CARD_H*0.78);
    ctx.restore();

    const barY=CARD_H-78;
    ctx.fillStyle='#ffffff'; roundRectFill(ctx,85,barY-8,520,68,5);
    ctx.fillStyle='#d4e8d0'; roundRectFill(ctx,90,barY-4,60,58,4);
    ctx.fillStyle='#1a4a2a'; ctx.font=font(11,true,true);
    ctx.fillText('ካርድ',97,barY+12); ctx.fillText('ቁጥር',97,barY+26);
    ctx.fillStyle='#cc0000'; ctx.font=font(14,true,false);
    ctx.fillText('FAN',98,barY+42);

    const fanNoSpaces=(idData.fanNumber||'').replace(/\s+/g,'');
    if (fanNoSpaces) {
        ctx.fillStyle='#000000'; ctx.font='bold 18px monospace';
        ctx.fillText(fanNoSpaces, 162, barY+15);
        drawBarcode(ctx, 162, barY+22, 410, 30, fanNoSpaces);
    }

    ctx.restore();
    ctx.strokeStyle='#4a8a4a'; ctx.lineWidth=2.5;
    roundRectStroke(ctx,1,1,CARD_W-2,CARD_H-2,14);
    return canvas.toBuffer('image/png');
}

async function drawBackCard(idData, photoMode, template, ovalCut) {
    const canvas = createCanvas(CARD_W, CARD_H);
    const ctx = canvas.getContext('2d');
    drawBackground(ctx, CARD_W, CARD_H, template);
    ctx.save();
    roundRectClip(ctx, 0, 0, CARD_W, CARD_H, 14);

    const qrSize=300, qrX=CARD_W-qrSize-25, qrY=18;
    if (idData.images && idData.images.qrCode) {
        const qrImg = await loadImage(idData.images.qrCode);
        ctx.fillStyle='#ffffff'; ctx.fillRect(qrX-5,qrY-5,qrSize+10,qrSize+10);
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    } else {
        ctx.fillStyle='#ffffff'; ctx.fillRect(qrX,qrY,qrSize,qrSize);
        ctx.fillStyle='#aaa'; ctx.font=font(16,false,false);
        ctx.fillText('QR Code', qrX+110, qrY+155);
    }

    const tx=28, lc='#7a3300', vc='#0a2a12';
    let ty=32;
    const label = (t) => { ctx.fillStyle=lc; ctx.font=font(12,false,true); ctx.fillText(t,tx,ty); ty+=22; };
    const value = (t, sz, bold, eth) => { ctx.fillStyle=vc; ctx.font=font(sz,bold,eth); ctx.fillText(t,tx,ty); ty+=sz+4; };

    label('ስልክ | Phone Number'); value(idData.phoneNumber||'', 22, true, false);
    ty+=6;
    label('ዜግነት | Nationality');
    ctx.fillStyle=lc; ctx.font=font(9,false,false);
    ctx.fillText('(በተገለጸው መሰረት | Self Declared)',tx,ty); ty+=18;
    value(`${idData.nationalityAmharic||'ኢትዮጵያዊ'} | ${idData.nationality||'Ethiopian'}`, 18, true, true);
    ty+=6;
    label('አድራሻ | Address');
    value(idData.regionAmharic||'', 15, true, true);
    value(idData.regionEnglish||'', 13, true, false);
    value(idData.zoneAmharic||'', 14, true, true);
    value(idData.zoneEnglish||'', 12, true, false);
    value(idData.cityAmharic||'', 14, true, true);
    value(idData.cityEnglish||'', 12, true, false);

    const spX=CARD_W-115, spY=CARD_H-210, spW=82, spH=105;
    if (idData.images && idData.images.photoSmall) {
        let photoBuffer = idData.images.photoSmall;
        if (photoMode==='Grey') photoBuffer = await sharp(photoBuffer).grayscale().png().toBuffer();
        const photoImg = await loadImage(photoBuffer);
        ctx.fillStyle='#ffffff'; ctx.fillRect(spX-2,spY-2,spW+4,spH+4);
        ctx.drawImage(photoImg, spX, spY, spW, spH);
    }

    const finY=CARD_H-82;
    ctx.fillStyle='#ffffff'; roundRectFill(ctx,tx-2,finY-5,450,38,4);
    ctx.fillStyle='#d4e8d0'; roundRectFill(ctx,tx,finY-2,58,32,3);
    ctx.fillStyle='#1a4a2a'; ctx.font=font(10,true,true);
    ctx.fillText('ፋይዳ',tx+8,finY+12); ctx.fillText('ልዩ ቁጥር',tx+4,finY+24);
    ctx.strokeStyle='#aaa'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(tx+62,finY); ctx.lineTo(tx+62,finY+30); ctx.stroke();
    ctx.fillStyle=vc; ctx.font=font(20,true,false);
    ctx.fillText(`FIN ${idData.finNumber||''}`, tx+70, finY+24);

    ctx.fillStyle='#333333'; ctx.font=font(7,false,true);
    ctx.fillText('ይህ መታወቂያ ጠፍቶ ካገኙ በአቅራቢያዎ ፖሊስ ጣቢያ ወይም ለተቋሙ ይመልሱ። ለግምገማ 9779 ላይ ይደውሉ ወይም id.et/cardprint ይጎብኙ።', tx, CARD_H-28);
    ctx.font=font(7,false,false);
    ctx.fillText('If lost and found, please return to nearby police station or to the institution. Call 9779 or visit id.et/cardprint', tx, CARD_H-18);

    ctx.fillStyle='#e8e8e8'; roundRectFill(ctx,CARD_W-175,CARD_H-35,160,22,3);
    ctx.fillStyle='#333'; ctx.font=font(11,false,false);
    ctx.fillText(`SN : ${idData.serialNumber||''}`, CARD_W-168, CARD_H-18);

    ctx.restore();
    ctx.strokeStyle='#4a8a4a'; ctx.lineWidth=2.5;
    roundRectStroke(ctx,1,1,CARD_W-2,CARD_H-2,14);
    return canvas.toBuffer('image/png');
}

function formatDate(ethDate, gregDate) {
    if (!ethDate && !gregDate) return '';
    const parts=[];
    if (ethDate) parts.push(ethDate);
    if (gregDate) {
        const m=gregDate.match(/(\d{4})\/(\d{2})\/(\d{2})/);
        if (m) { const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; parts.push(`${m[1]}/${months[parseInt(m[2])-1]||m[2]}/${m[3]}`); }
        else parts.push(gregDate);
    }
    return parts.join(' | ');
}

async function combineCards(frontBuf, backBuf) {
    const gap=12;
    const canvas=createCanvas(CARD_W*2+gap, CARD_H+10);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(await loadImage(frontBuf),3,5,CARD_W,CARD_H);
    ctx.drawImage(await loadImage(backBuf),CARD_W+gap+3,5,CARD_W,CARD_H);
    return canvas.toBuffer('image/png');
}

async function mirrorImage(buf) { return sharp(buf).flop().png().toBuffer(); }

async function placeOnA4(cardBuf) {
    const canvas=createCanvas(A4_W, A4_H);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,A4_W,A4_H);
    const img=await loadImage(cardBuf);
    const margin=40, availW=A4_W-margin*2, scale=availW/img.width;
    ctx.drawImage(img, margin, margin, availW, img.height*scale);
    return canvas.toBuffer('image/png');
}

function roundRectClip(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.clip();}
function roundRectFill(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.fill();}
function roundRectStroke(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();ctx.stroke();}

module.exports = { generateAllCards };
