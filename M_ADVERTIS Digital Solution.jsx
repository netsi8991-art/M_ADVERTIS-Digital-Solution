import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, getDoc, onSnapshot, collection, query, where, addDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';

// Set Firebase log level for debugging
setLogLevel('debug');

// --------------------------------------------------------------------------------
// 1. Firebase Initialization & Global Constants
// --------------------------------------------------------------------------------

// Global variables for Firebase configuration (Mandatory for Canvas Environment)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// VIP Levels and their registration fee (in ETB)
const VIP_LEVELS = [
    { level: 1, amount: 1000, name: 'VIP 1', coinReward: 5, scamCoinReward: 100 },
    { level: 2, amount: 2000, name: 'VIP 2', coinReward: 10, scamCoinReward: 200 },
    { level: 3, amount: 5000, name: 'VIP 3', coinReward: 15, scamCoinReward: 500 },
    { level: 4, amount: 10000, name: 'VIP 4', coinReward: 20, scamCoinReward: 1000 },
    { level: 5, amount: 20000, name: 'VIP 5', coinReward: 25, scamCoinReward: 2000 },
    { level: 6, amount: 50000, name: 'VIP 6', coinReward: 30, scamCoinReward: 5000 },
    { level: 7, amount: 100000, name: 'VIP 7', coinReward: 35, scamCoinReward: 10000 },
    { level: 8, amount: 500000, name: 'VIP 8', coinReward: 40, scamCoinReward: 15000 },
    { level: 9, amount: 1000000, name: 'VIP 9', coinReward: 50, scamCoinReward: 20000 },
    { level: 10, amount: 2000000, name: 'VIP 10', coinReward: 60, scamCoinReward: 25000 },
    { level: 11, amount: 5000000, name: 'VIP 11', coinReward: 80, scamCoinReward: 30000 },
    { level: 12, amount: 10000000, name: 'VIP 12', coinReward: 100, scamCoinReward: 50000 },
];

const ADMIN_CREDENTIALS = {
    phone: '0974485986',
    password: 'q1w2e3r44',
};

// Simulated Telegram Bot Token
const TELEGRAM_BOT_TOKEN = '7683713920:AAHcYMNB5bqSM-hmdg_RwuMkACOm1-Ff5ew';

let app, db, auth;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
} catch (error) {
    console.error("Firebase Initialization Error:", error);
}

// --------------------------------------------------------------------------------
// 2. Utility Functions
// --------------------------------------------------------------------------------

/**
 * የዳታቤዝ ዩአርኤል ፓዝ የሚሰራ
 * @param {string} collectionName - የሚኒ አፕ ስብስብ ስም
 * @param {boolean} isPublic - የህዝብ ዳታ ከሆነ እውነት
 * @param {string} userId - የተጠቃሚ መለያ
 * @returns {string} የ Firestore ሰነድ ፓዝ
 */
const getCollectionPath = (collectionName, isPublic = false, userId = '') => {
    if (isPublic) {
        return `artifacts/${appId}/public/data/${collectionName}`;
    }
    // የግል ዳታ ከሆነ
    if (!userId) {
        console.error("Private collection requires a userId.");
        return null;
    }
    return `artifacts/${appId}/users/${userId}/${collectionName}`;
};

/**
 * ለሪፈራል ሲስተም አዲሱን Level ያሰላል
 * @param {number} invitedCount - የተጋባዦች ብዛት
 * @returns {number} Level (1-5)
 */
const calculateLevel = (invitedCount) => {
    if (invitedCount >= 71) return 5;
    if (invitedCount >= 51) return 4;
    if (invitedCount >= 31) return 3;
    if (invitedCount >= 11) return 2;
    return 1;
};

// --------------------------------------------------------------------------------
// 3. Main App Component
// --------------------------------------------------------------------------------

const App = () => {
    const [page, setPage] = useState('login'); // login, signup, payment, dashboard, admin, banned
    const [user, setUser] = useState(null);
    const [userId, setUserId] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [scamUsers, setScamUsers] = useState([]);
    const [coinRates, setCoinRates] = useState({});

    // ------------------- AUTHENTICATION & INITIAL SETUP -------------------

    useEffect(() => {
        // የ Firebase Authentication ማስተናገድ
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                setUserId(currentUser.uid);
            } else {
                // በ__initial_auth_token ከሌለ ማንነትን የማያውቅ (Anonymously) መግባት
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                } catch (error) {
                    console.error("Initial sign-in failed:", error);
                }
            }
            setIsAuthReady(true);
        });
        return () => unsubscribe();
    }, []);

    // የተጠቃሚውን መረጃ (Profile) ከ Firestore መጫን
    useEffect(() => {
        if (!isAuthReady || !userId) return;

        const path = getCollectionPath('profiles', true);
        if (!path) return;

        const docRef = doc(db, path, userId);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const profile = docSnap.data();
                setUserProfile(profile);

                // ገጹን መወሰን
                if (profile.status === 'BANNED') {
                    setPage('banned');
                } else if (profile.isAdmin) {
                    setPage('admin');
                } else if (profile.status === 'ACTIVE') {
                    setPage('dashboard');
                } else if (profile.status === 'PENDING') {
                    setPage('pending_verification');
                } else {
                    setPage('login');
                }
            } else {
                setUserProfile(null);
                setPage('login'); // መጀመሪያ ላይ ካልተመዘገበ ወደ Login
            }
        }, (error) => {
            console.error("Error fetching user profile:", error);
            setMessage(`የተጠቃሚ መረጃን በመጫን ላይ ስህተት ተፈጥሯል: ${error.message}`);
        });

        return () => unsubscribe();
    }, [isAuthReady, userId]);

    // የ Scam Users ዝርዝር መጫን
    useEffect(() => {
        if (!isAuthReady) return;
        const path = `artifacts/${appId}/admin_settings/scamUsers`;
        const docRef = doc(db, path);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setScamUsers(docSnap.data().userIDs || []);
            }
        });
        return () => unsubscribe();
    }, [isAuthReady]);

    // የ Coin Rates መጫን
    useEffect(() => {
        if (!isAuthReady) return;
        const path = `artifacts/${appId}/admin_settings/coinRates`;
        const docRef = doc(db, path);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setCoinRates(docSnap.data().rates || {});
            }
        });
        return () => unsubscribe();
    }, [isAuthReady]);

    // ------------------- UI Helpers -------------------

    const showToast = (msg, type = 'info') => {
        setMessage(msg);
        setTimeout(() => setMessage(''), 5000);
        console.log(`[${type.toUpperCase()}] ${msg}`);
    };

    const handleLogout = async () => {
        setUserProfile(null);
        setPage('login');
        try {
            await signOut(auth);
            showToast('በስኬት ወጥተዋል!', 'success');
        } catch (error) {
            showToast('ከመውጣት ላይ ስህተት ተፈጥሯል: ' + error.message, 'error');
        }
    };

    const getCoinRate = (vip, coinAmount) => {
        return coinRates?.[`VIP${vip}`]?.[coinAmount] || null;
    };

    // ------------------- COMPONENTS RENDERED BASED ON PAGE STATE -------------------

    const renderCurrentPage = () => {
        if (!isAuthReady || loading) {
            return <LoadingScreen />;
        }

        switch (page) {
            case 'login':
                return <Login setPage={setPage} showToast={showToast} userId={userId} />;
            case 'signup':
                return <SignUp setPage={setPage} showToast={showToast} userId={userId} />;
            case 'payment':
                return <Payment setPage={setPage} showToast={showToast} userProfile={userProfile} userId={userId} />;
            case 'pending_verification':
                return <PendingVerification handleLogout={handleLogout} />;
            case 'dashboard':
                return <Dashboard
                    userProfile={userProfile}
                    setPage={setPage}
                    showToast={showToast}
                    scamUsers={scamUsers}
                    coinRates={coinRates}
                    userId={userId}
                />;
            case 'admin':
                return <AdminPanel
                    userProfile={userProfile}
                    showToast={showToast}
                    scamUsers={scamUsers}
                    coinRates={coinRates}
                    userId={userId}
                    setScamUsers={setScamUsers}
                    setCoinRates={setCoinRates}
                    handleLogout={handleLogout}
                />;
            case 'banned':
                return <BannedScreen />;
            default:
                return <Login setPage={setPage} showToast={showToast} userId={userId} />;
        }
    };

    // ------------------- MAIN APP RENDER -------------------

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-inter">
            <Toast message={message} />
            <div className="w-full max-w-xl bg-gray-800 shadow-2xl rounded-xl p-6 md:p-8">
                <Header />
                {renderCurrentPage()}
            </div>
            {/* ለትብብር የሚሆን የተጠቃሚ መታወቂያ */}
            {userId && (
                <div className="mt-4 text-xs text-gray-500">
                    የቴሌግራም መለያ ID: <span className="text-yellow-400 font-mono">{userId}</span>
                </div>
            )}
        </div>
    );
};

// --------------------------------------------------------------------------------
// 4. Shared Components
// --------------------------------------------------------------------------------

const Header = () => (
    <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-yellow-400">M_ADVERTIS</h1>
        <p className="text-sm text-gray-400">Digital Solution</p>
    </div>
);

const LoadingScreen = () => (
    <div className="flex flex-col items-center justify-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-yellow-400"></div>
        <p className="mt-4 text-gray-400">እባክዎ ይግቡ/ይጠብቁ...</p>
    </div>
);

const BannedScreen = () => (
    <div className="text-center p-8 bg-red-900/50 border border-red-700 rounded-lg">
        <h2 className="text-2xl font-bold text-red-400">ይህ አካውንት ታግዷል!</h2>
        <p className="mt-4 text-gray-300">ይህ አካውንት በማጭበርበር ምክንያት ከመተግበሪያው ታግዷል።</p>
    </div>
);

const PendingVerification = ({ handleLogout }) => (
    <div className="text-center p-8 bg-blue-900/50 border border-blue-700 rounded-lg">
        <h2 className="text-2xl font-bold text-blue-400">ምዝገባ በሂደት ላይ ነው</h2>
        <p className="mt-4 text-gray-300">የክፍያ ዝርዝርዎ እየተረጋገጠ ነው። እባክዎ የአድሚን ማረጋገጫ እስኪደርስ ይጠብቁ።</p>
        <button
            onClick={handleLogout}
            className="mt-6 w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold text-white transition duration-200"
        >
            ውጣ
        </button>
    </div>
);

const Toast = ({ message }) => {
    if (!message) return null;
    return (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white p-3 rounded-lg shadow-lg z-50 transition duration-300">
            {message}
        </div>
    );
};

// --------------------------------------------------------------------------------
// 5. Login/Signup/Payment Components
// --------------------------------------------------------------------------------

const Login = ({ setPage, showToast, userId }) => {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [isForgot, setIsForgot] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        // 1. የቴሌግራም User ID እና ስልክ ቁጥር ማጣራት (ሲሙሌሽን)
        if (!userId) {
            showToast('የቴሌግራም ተጠቃሚ መለያ (User ID) አልተገኘም።', 'error');
            return;
        }

        try {
            const path = getCollectionPath('profiles', true);
            const userDoc = await getDoc(doc(db, path, userId));

            if (!userDoc.exists()) {
                showToast('የተጠቃሚ መረጃ አልተገኘም። እባክዎ ይመዝገቡ።', 'error');
                return;
            }

            const profile = userDoc.data();
            // 2. የስልክ ቁጥር እና ፓስወርድ ማጣራት
            if (profile.phone !== phone || profile.password !== password) {
                showToast('የስልክ ቁጥር ወይም የይለፍ ቃል የተሳሳተ ነው።', 'error');
                return;
            }

            // 3. የሁኔታ (Status) ማጣራት
            if (profile.status === 'BANNED') {
                setPage('banned');
                return;
            }
            if (profile.status === 'PENDING') {
                setPage('pending_verification');
                return;
            }
            if (profile.isAdmin) {
                setPage('admin');
                return;
            }

            showToast('በስኬት ገብተዋል!', 'success');
            setPage('dashboard');

        } catch (error) {
            showToast('መግባት አልተቻለም: ' + error.message, 'error');
        }
    };

    const handleForgotPassword = () => {
        const botUrl = `https://t.me/M_ADVERTISbot?start=forgot_password_${userId}`;
        window.Telegram.WebApp.openTelegramLink(botUrl);
        showToast('የይለፍ ቃል መልሶ ማግኛ ጥያቄ ወደ ቦቱ ተልኳል። እባክዎ ቦቱን ይጀምሩ።', 'info');
    };

    if (isForgot) {
        return (
            <div className="text-center">
                <h2 className="text-xl font-semibold mb-6 text-yellow-400">የይለፍ ቃል ረሱ</h2>
                <p className="text-gray-400 mb-6">የይለፍ ቃልዎን ለማስመለስ፣ እባክዎ ከታች ያለውን ቁልፍ በመጫን ቦቱን ይጀምሩ።</p>
                <button
                    onClick={handleForgotPassword}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold text-white transition duration-200"
                >
                    @M\_ADVERTISbot ጀምር
                </button>
                <p className="mt-4 text-sm text-gray-500 cursor-pointer" onClick={() => setIsForgot(false)}>
                    ወደ መግቢያ ተመለስ
                </p>
            </div>
        );
    }

    return (
        <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-2xl font-semibold mb-4 text-yellow-400">ይግቡ</h2>
            <InputField
                label="ስልክ ቁጥር (+251)"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').substring(0, 10))}
                placeholder="9xxxxxxxx"
                required
            />
            <InputField
                label="የይለፍ ቃል"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
            />
            <button
                type="submit"
                className="w-full py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-bold text-gray-900 transition duration-200"
            >
                ይግቡ
            </button>
            <p className="text-center text-sm text-gray-400">
                መለያ የለዎትም?{' '}
                <span className="text-yellow-400 cursor-pointer font-semibold" onClick={() => setPage('signup')}>
                    ይመዝገቡ
                </span>
            </p>
            <p className="text-center text-sm text-gray-500 cursor-pointer" onClick={() => setIsForgot(true)}>
                የይለፍ ቃል ረሱ?
            </p>
            <p className="text-center text-xs text-red-400 pt-2">
                ማሳሰቢያ፡ ሚኒ አፑን የከፈቱበት የቴሌግራም አካውንት የተመዘገቡበት ስልክ ቁጥር መሆን አለበት።
            </p>
        </form>
    );
};

const SignUp = ({ setPage, showToast, userId }) => {
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        phone: '',
        password: '',
        confirmPassword: '',
        agree: false,
        referrerId: '', // ለግብዣ ሊንክ
    });

    useEffect(() => {
        // የግብዣ ሊንክ ካለ User ID ን ለመለየት
        const params = new URLSearchParams(window.location.search);
        const referrerId = params.get('start')?.split('_')[1];
        if (referrerId) {
            setFormData(prev => ({ ...prev, referrerId }));
            showToast(`በተጠቃሚ ID: ${referrerId} ተጋብዘዋል`, 'info');
        }
    }, [showToast]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (name === 'phone' ? value.replace(/[^0-9]/g, '').substring(0, 10) : value)
        }));
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            showToast('የይለፍ ቃል ማረጋገጫ አይዛመድም።', 'error');
            return;
        }
        if (!formData.agree) {
            showToast('የግላዊነት ፖሊሲውን መቀበል አለብዎት።', 'error');
            return;
        }
        if (!userId) {
            showToast('የቴሌግራም ተጠቃሚ መለያ (User ID) አልተገኘም።', 'error');
            return;
        }

        // 1. መለያ መኖሩን ማጣራት
        const path = getCollectionPath('profiles', true);
        const userDoc = await getDoc(doc(db, path, userId));
        if (userDoc.exists()) {
            showToast('በዚህ የቴሌግራም መለያ አካውንት ተፈጥሯል። እባክዎ ይግቡ።', 'error');
            return;
        }

        // 2. የመመዝገቢያ መረጃ ማስቀመጥ (ለክፍያ ሂደት)
        const initialProfile = {
            id: userId,
            telegramUsername: window.Telegram.WebApp.initDataUnsafe?.user?.username || 'N/A',
            firstName: formData.firstName,
            lastName: formData.lastName,
            phone: formData.phone,
            password: formData.password, // በ Backend Hash መደረግ አለበት (በዚህ ሲሙሌሽን ቀጥታ እናስቀምጣለን)
            status: 'UNPAID', // ወደ ክፍያ ገጽ ለመሄድ
            isAdmin: false,
            vipLevel: 0,
            etbBalance: 0,
            coinBalance: 0,
            invitedUsers: [],
            referrerId: formData.referrerId || null,
            registrationDate: new Date().toISOString(),
            isScamUser: false,
        };

        try {
            await setDoc(doc(db, path, userId), initialProfile);
            showToast('ምዝገባ በስኬት ተጠናቋል። አሁን የክፍያ ደረጃ ይምረጡ።', 'success');
            setPage('payment');
        } catch (error) {
            showToast('ምዝገባ አልተቻለም: ' + error.message, 'error');
        }
    };

    return (
        <form onSubmit={handleSignUp} className="space-y-4">
            <h2 className="text-2xl font-semibold mb-4 text-yellow-400">አዲስ አካውንት ይመዝገቡ</h2>
            <div className="flex space-x-2">
                <div className="w-1/2">
                    <InputField label="የመጀመሪያ ስም" name="firstName" value={formData.firstName} onChange={handleChange} required />
                </div>
                <div className="w-1/2">
                    <InputField label="የአባት ስም" name="lastName" value={formData.lastName} onChange={handleChange} required />
                </div>
            </div>
            <InputField label="ስልክ ቁጥር (+251)" name="phone" type="tel" value={formData.phone} onChange={handleChange} placeholder="9xxxxxxxx" required />
            <InputField label="የይለፍ ቃል" name="password" type="password" value={formData.password} onChange={handleChange} required />
            <InputField label="የይለፍ ቃል አረጋግጥ" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} required />
            {formData.referrerId && (
                <div className="text-sm text-green-400 p-2 border border-green-700 rounded-lg">
                    ግብዣ በ: {formData.referrerId}
                </div>
            )}
            <div className="flex items-center">
                <input
                    type="checkbox"
                    name="agree"
                    checked={formData.agree}
                    onChange={handleChange}
                    className="h-4 w-4 text-yellow-600 bg-gray-700 border-gray-600 rounded focus:ring-yellow-500"
                    required
                />
                <label className="ml-2 block text-sm text-gray-400">
                    የግላዊነት ፖሊሲውን ተስማምቻለሁ
                </label>
            </div>
            <button
                type="submit"
                className="w-full py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-bold text-gray-900 transition duration-200"
            >
                ይመዝገቡ
            </button>
            <p className="text-center text-sm text-gray-400">
                መለያ አለዎት?{' '}
                <span className="text-yellow-400 cursor-pointer font-semibold" onClick={() => setPage('login')}>
                    ይግቡ
                </span>
            </p>
        </form>
    );
};

const Payment = ({ setPage, showToast, userProfile, userId }) => {
    const [selectedVIP, setSelectedVIP] = useState(null);
    const [paymentDetails, setPaymentDetails] = useState({
        bankName: '',
        transferedByName: '',
        bankAccountNumber: '',
        transactionID: '',
        paymentDate: new Date().toISOString().substring(0, 10),
    });

    const handleVIPSelect = (vip) => {
        setSelectedVIP(vip);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setPaymentDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmitPayment = async (e) => {
        e.preventDefault();
        if (!selectedVIP) {
            showToast('እባክዎ የ VIP ደረጃ ይምረጡ።', 'error');
            return;
        }

        try {
            // 1. የክፍያ ጥያቄ ማስገባት (Transaction Message -> NEW User ላይ እንዲታይ)
            const paymentPath = `artifacts/${appId}/admin_settings/paymentRequests`;
            await addDoc(collection(db, paymentPath), {
                ...paymentDetails,
                userId: userId,
                userName: `${userProfile.firstName} ${userProfile.lastName}`,
                telegramUsername: userProfile.telegramUsername,
                vipLevel: selectedVIP.level,
                paymentAmount: selectedVIP.amount,
                status: 'PENDING',
                type: 'NEW_REGISTRATION',
                date: new Date().toISOString(),
            });

            // 2. የተጠቃሚውን ሁኔታ ወደ PENDING መቀየር
            const profilePath = getCollectionPath('profiles', true);
            await updateDoc(doc(db, profilePath, userId), {
                status: 'PENDING',
                vipLevel: selectedVIP.level, // አስቀድሞ ማስቀመጥ
                pendingPaymentDetails: paymentDetails,
            });

            showToast('የክፍያ ዝርዝርዎ ተልኳል! አድሚን እስኪያረጋግጥ ድረስ ይጠብቁ።', 'success');
            setPage('pending_verification');

        } catch (error) {
            showToast('ክፍያውን መላክ አልተቻለም: ' + error.message, 'error');
        }
    };

    if (userProfile?.status === 'UNPAID' || userProfile?.status === 'PENDING') {
        // ወደ ቀጣዩ ደረጃ እንዲሄድ መፍቀድ
    } else if (userProfile?.status === 'ACTIVE') {
        setPage('dashboard');
        return <LoadingScreen />;
    } else if (userProfile?.status === 'BANNED') {
        setPage('banned');
        return <LoadingScreen />;
    } else if (userProfile?.isAdmin) {
        setPage('admin');
        return <LoadingScreen />;
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-yellow-400 text-center">የምዝገባ ክፍያ ይምረጡ</h2>

            {/* VIP Level ምርጫ */}
            <div className="grid grid-cols-3 gap-3 max-h-48 overflow-y-auto p-2 bg-gray-700 rounded-lg">
                {VIP_LEVELS.map(vip => (
                    <button
                        key={vip.level}
                        onClick={() => handleVIPSelect(vip)}
                        className={`py-2 px-1 text-xs font-semibold rounded-lg transition duration-200 border-2 ${
                            selectedVIP?.level === vip.level
                                ? 'bg-yellow-600 text-gray-900 border-yellow-400'
                                : 'bg-gray-800 text-yellow-400 border-gray-600 hover:bg-gray-700'
                        }`}
                    >
                        {vip.name} ({vip.amount.toLocaleString()} ብር)
                    </button>
                ))}
            </div>

            {selectedVIP && (
                <form onSubmit={handleSubmitPayment} className="space-y-4 mt-6 p-4 border border-yellow-600 rounded-lg bg-gray-700/50">
                    <h3 className="text-xl font-bold text-yellow-400">የክፍያ ማረጋገጫ ለ {selectedVIP.name}</h3>
                    <p className="text-sm text-gray-300">እባክዎ ክፍያውን {selectedVIP.amount.toLocaleString()} ብር ወደ ድርጅቱ ባንክ ቁጥር ካስተላለፉ በኋላ ዝርዝሩን ይሙሉ።</p>

                    <InputField
                        label="ገቢ ያደረጉበት ባንክ (ለምሳሌ CBE)"
                        name="bankName"
                        value={paymentDetails.bankName}
                        onChange={handleChange}
                        required
                    />
                    <InputField
                        label="ገቢ ያደረገው ሰው የባንክ ስም"
                        name="transferedByName"
                        value={paymentDetails.transferedByName}
                        onChange={handleChange}
                        required
                    />
                    <InputField
                        label="የዝውውር መለያ ቁጥር (Transaction ID)"
                        name="transactionID"
                        value={paymentDetails.transactionID}
                        onChange={handleChange}
                        required
                    />
                    <InputField
                        label="ገንዘቡን ያስገቡበት ቀን"
                        name="paymentDate"
                        type="date"
                        value={paymentDetails.paymentDate}
                        onChange={handleChange}
                        required
                    />

                    <button
                        type="submit"
                        className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-white transition duration-200"
                    >
                        አካውንት ይፍጠሩ (ለማረጋገጫ ይላኩ)
                    </button>
                </form>
            )}
        </div>
    );
};

const InputField = ({ label, name, type = 'text', value, onChange, placeholder, required = false, readOnly = false }) => (
    <div>
        <label className="block text-sm font-medium text-gray-400 mb-1">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            required={required}
            readOnly={readOnly}
            className={`w-full p-3 border ${readOnly ? 'bg-gray-700 text-gray-400' : 'bg-gray-900 text-white'} border-gray-600 rounded-lg focus:ring-yellow-500 focus:border-yellow-500 transition duration-150`}
        />
    </div>
);

// --------------------------------------------------------------------------------
// 6. Dashboard Components
// --------------------------------------------------------------------------------

const Dashboard = ({ userProfile, setPage, showToast, scamUsers, coinRates, userId }) => {
    const [activeTab, setActiveTab] = useState('home');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [homePosts, setHomePosts] = useState([]);
    const [advertVideos, setAdvertVideos] = useState([]);
    const [lastSeenAdvertId, setLastSeenAdvertId] = useState(null); // ለቪዲዮ ድግግሞሽ መቆጣጠሪያ
    const [currentPostIndex, setCurrentPostIndex] = useState(0);

    // የHOME ገጽ ፖስቶች መጫን (በየ10 ሰከንዱ የሚቀያየር)
    useEffect(() => {
        const path = `artifacts/${appId}/posts`;
        const q = query(collection(db, path), where('page', '==', 'HOME'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setHomePosts(posts);
            setCurrentPostIndex(0); // ዳታ ሲዘምን ወደ መጀመሪያው ይመለስ
        });

        // ስላይድ መቆጣጠሪያ (በየ10 ሰከንዱ)
        const interval = setInterval(() => {
            if (homePosts.length > 0) {
                setCurrentPostIndex(prevIndex => (prevIndex + 1) % homePosts.length);
            }
        }, 10000);

        return () => {
            unsubscribe();
            clearInterval(interval);
        };
    }, []);


    // የADVERT ገጽ ቪዲዮዎች መጫን (ከ24 ሰአት በኋላ የሚጠፉትን ጨምሮ)
    useEffect(() => {
        const path = `artifacts/${appId}/posts`;
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // ADVERT እና VIP ደረጃ የሚዛመዱ ቪዲዮዎችን መጫን
        const q = query(collection(db, path),
            where('page', 'in', ['ADVERTISE', `VIP${userProfile?.vipLevel}`]),
            where('postDate', '>', twentyFourHoursAgo) // ከ24 ሰአት በኋላ እንዲጠፉ (በFirestore Query ሲሙሌሽን)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const videos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAdvertVideos(videos.sort((a, b) => new Date(a.postDate) - new Date(b.postDate)));
        });

        return () => unsubscribe();
    }, [userProfile?.vipLevel]);


    const handleWatchVideo = async (video) => {
        if (!userProfile) return;
        const currentUserId = userProfile.id;

        // የቪዲዮ ድግግሞሽ መጣራት (በተጠቃሚው ታሪክ ውስጥ መፈለግ አለበት)
        // በዚህ ሲሙሌሽን ውስጥ፣ የዳታቤዝ ጥሪዎችን ለማስወገድ ቀለል ያለ መቆጣጠሪያ እንጠቀማለን።
        // በትክክለኛው Backend ላይ፣ የ"UserWatchedVideos" ስብስብ ያስፈልጋል።
        if (lastSeenAdvertId === video.id) {
            showToast('ይህንን ቪዲዮ ዛሬ አይተዋል። የሚከፈልዎ አንድ ጊዜ ብቻ ነው።', 'info');
            return;
        }

        // ኮይን ስሌት
        const vipInfo = VIP_LEVELS.find(v => v.level === userProfile.vipLevel);
        const coinReward = userProfile.isScamUser ? vipInfo.scamCoinReward : vipInfo.coinReward;

        try {
            const profilePath = getCollectionPath('profiles', true);
            const userRef = doc(db, profilePath, currentUserId);

            await updateDoc(userRef, {
                coinBalance: userProfile.coinBalance + coinReward,
            });

            // የማስታወቂያ ታሪክ መዝገብ (ሲሙሌሽን)
            setLastSeenAdvertId(video.id);

            showToast(`${coinReward} ኮይን ተከፍለዋል!`, 'success');

        } catch (error) {
            showToast('ኮይን መጨመር አልተቻለም: ' + error.message, 'error');
        }
    };


    // ------------------- RENDER TABS -------------------

    const renderTabContent = () => {
        if (!userProfile) return <LoadingScreen />;

        switch (activeTab) {
            case 'home':
                return <HomeTab posts={homePosts} currentPostIndex={currentPostIndex} />;
            case 'advert':
                return <AdvertTab videos={advertVideos} handleWatchVideo={handleWatchVideo} userProfile={userProfile} showToast={showToast} />;
            case 'task':
                return <TaskTab userProfile={userProfile} showToast={showToast} coinRates={coinRates} />;
            case 'withdraw':
                return <WithdrawTab userProfile={userProfile} showToast={showToast} />;
            case 'mine':
                return <MineTab userProfile={userProfile} showToast={showToast} />;
            case 'contact':
                return <ContactTab />;
            default:
                return <HomeTab posts={homePosts} currentPostIndex={currentPostIndex} />;
        }
    };

    return (
        <div className="flex h-full min-h-[70vh]">
            <Sidebar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                userProfile={userProfile}
                handleLogout={() => setIsSidebarOpen(true)} // Open sidebar for logout
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
            />

            <div className="flex-grow p-4 overflow-y-auto">
                {renderTabContent()}
            </div>
            <LogoutModal
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                handleLogout={handleLogout}
            />
        </div>
    );
};

const Sidebar = ({ activeTab, setActiveTab, userProfile, handleLogout, isSidebarOpen, setIsSidebarOpen }) => {
    const tabs = [
        { id: 'home', label: 'ዋና ገጽ' },
        { id: 'advert', label: 'ማስታወቂያ' },
        { id: 'task', label: 'ተግባር' },
        { id: 'withdraw', label: 'ገንዘብ ማውጫ' },
        { id: 'mine', label: 'የኔ አካውንት' },
        { id: 'contact', label: 'አግኙን' },
    ];

    return (
        <div className="relative">
            {/* Mobile Menu Button */}
            <button
                className="md:hidden fixed top-4 right-4 z-40 p-2 bg-yellow-600 rounded-full"
                onClick={() => setIsSidebarOpen(true)}
            >
                <svg className="w-6 h-6 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>

            {/* Sidebar Desktop/Mobile Overlay */}
            <div className={`fixed inset-0 bg-gray-900 bg-opacity-75 z-30 transition-opacity ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} md:hidden`} onClick={() => setIsSidebarOpen(false)}></div>

            <div className={`fixed top-0 bottom-0 w-64 bg-gray-900 p-4 transform transition-transform duration-300 z-40 md:static md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    <h2 className="text-xl font-bold text-yellow-400 mb-4 text-center">M_ADVERTIS</h2>
                    <p className="text-sm text-gray-400 mb-6 text-center">VIP: {VIP_LEVELS.find(v => v.level === userProfile?.vipLevel)?.name || 'N/A'}</p>

                    <nav className="space-y-2 flex-grow">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
                                className={`w-full text-left py-3 px-4 rounded-lg font-semibold transition duration-200 flex items-center ${
                                    activeTab === tab.id
                                        ? 'bg-yellow-600 text-gray-900 shadow-lg'
                                        : 'text-gray-300 hover:bg-gray-700'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>

                    <button
                        onClick={handleLogout}
                        className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold text-white transition duration-200 mt-4"
                    >
                        ውጣ
                    </button>
                </div>
            </div>
        </div>
    );
};

const LogoutModal = ({ isOpen, onClose, handleLogout }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-sm text-center">
                <h3 className="text-xl font-bold text-yellow-400 mb-4">መውጣት</h3>
                <p className="text-gray-300 mb-6">በእርግጥ መውጣት ይፈልጋሉ?</p>
                <div className="flex justify-between space-x-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg font-semibold text-white transition duration-200"
                    >
                        ተመለስ
                    </button>
                    <button
                        onClick={handleLogout}
                        className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-bold text-white transition duration-200"
                    >
                        ውጣ
                    </button>
                </div>
            </div>
        </div>
    );
};


// ------------------- Dashboard Tabs -------------------

const HomeTab = ({ posts, currentPostIndex }) => {
    const currentPost = posts[currentPostIndex];

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold text-yellow-400 mb-4">ዋና ገጽ</h2>
            <div className="bg-gray-700/50 p-4 rounded-xl h-96 flex items-center justify-center overflow-hidden relative">
                {posts.length > 0 && currentPost ? (
                    <div key={currentPost.id} className="w-full h-full">
                        {/* ምስል ለማስቀመጥ ሲሙሌሽን */}
                        <div className="w-full h-full bg-gray-600 flex items-center justify-center text-center">
                            <p className="text-lg text-white font-mono">
                                [ምስል: {currentPost.title || 'ያልተሰየመ ፖስት'}]
                                <br />
                                <span className="text-sm text-yellow-400">ፖስት በየ 10 ሰከንዱ ይቀየራል</span>
                            </p>
                            {/* በትክክለኛው አፕሊኬሽን ላይ ምስል እዚህ ይታይ ነበር */}
                        </div>
                        <p className="mt-2 text-sm text-gray-300">{currentPost.content}</p>
                    </div>
                ) : (
                    <p className="text-gray-400">በአድሚን የተለጠፈ ፖስት የለም።</p>
                )}
                {posts.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex space-x-2">
                        {posts.map((_, index) => (
                            <div
                                key={index}
                                className={`w-2 h-2 rounded-full ${index === currentPostIndex ? 'bg-yellow-400' : 'bg-gray-500'}`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const AdvertTab = ({ videos, handleWatchVideo, userProfile, showToast }) => {
    const [socialStatus, setSocialStatus] = useState({ telegram: false, tiktok: false, youtube: false });

    // የማህበራዊ ሚዲያ ሁኔታን መጫን (ሲሙሌሽን)
    useEffect(() => {
        // በትክክለኛው Backend ላይ የማህበራዊ ሚዲያ ሁኔታ መረጋገጥ አለበት።
        // ለጊዜው እዚህ ላይ እውነት (true) እንበል።
        setSocialStatus({ telegram: true, tiktok: true, youtube: true });
    }, []);

    const isSocialMediaJoined = Object.values(socialStatus).every(status => status === true);

    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-bold text-yellow-400 mb-4">ማስታወቂያ ቪዲዮዎች</h2>
            <div className="p-3 bg-gray-700 rounded-lg text-sm text-gray-300">
                <p>እይታዎ ከ {userProfile.isScamUser ? 'ከፍተኛ (SCAM)' : 'መደበኛ'} ኮይን ይከፍላል።</p>
                <p className="text-yellow-400">VIP {userProfile.vipLevel}: {userProfile.isScamUser ? VIP_LEVELS.find(v => v.level === userProfile.vipLevel)?.scamCoinReward : VIP_LEVELS.find(v => v.level === userProfile.vipLevel)?.coinReward} ኮይን በአንድ ቪዲዮ</p>
            </div>

            {videos.length === 0 ? (
                <div className="text-center p-8 bg-gray-700 rounded-xl">
                    <p className="text-gray-400">ዛሬ የተለቀቀ ማስታወቂያ የለም።</p>
                </div>
            ) : (
                <div className="space-y-4 max-h-[50vh] overflow-y-auto">
                    {videos.map((video, index) => (
                        <div key={video.id} className="bg-gray-700 p-4 rounded-xl flex items-center justify-between shadow-lg">
                            <div>
                                <h3 className="text-lg font-semibold text-white">ማስታወቂያ {index + 1}</h3>
                                <p className="text-sm text-gray-400">የሚከፈል ኮይን: {userProfile.isScamUser ? VIP_LEVELS.find(v => v.level === userProfile.vipLevel)?.scamCoinReward : VIP_LEVELS.find(v => v.level === userProfile.vipLevel)?.coinReward}</p>
                            </div>
                            <button
                                onClick={() => handleWatchVideo(video)}
                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
                                disabled={!isSocialMediaJoined}
                            >
                                ይመልከቱ
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {!isSocialMediaJoined && (
                <p className="text-red-400 text-sm mt-4 p-2 bg-red-900/50 rounded-lg">
                    ገንዘብ ለማውጣት ከመሞከርዎ በፊት ሁሉንም የማህበራዊ ሚዲያ ገጾች (Task ገጽ ላይ ያሉ) መቀላቀል/መከተል አለብዎት።
                </p>
            )}
        </div>
    );
};

const TaskTab = ({ userProfile, showToast, coinRates }) => {
    const { id: currentUserId, vipLevel, etbBalance, coinBalance, invitedUsers = [] } = userProfile;
    const currentVIP = VIP_LEVELS.find(v => v.level === vipLevel);
    const invitedCount = invitedUsers.length;
    const currentLevel = calculateLevel(invitedCount);
    const referralLink = `https://t.me/M_ADVERTIS_MiniApp?start=ref_${currentUserId}`; // ሲሙሌሽን ሊንክ

    const [isCoinToETBOpen, setIsCoinToETBOpen] = useState(false);
    const [isSocialStatusOpen, setIsSocialStatusOpen] = useState(false);

    const handleCopy = (text, type) => {
        document.execCommand('copy'); // For iFrame compatibility
        navigator.clipboard.writeText(text).then(() => {
            showToast(`${type} በስኬት ተቀድቷል!`, 'success');
        });
    };

    // ------------------- COIN TO ETB LOGIC -------------------

    const handleCoinToETB = async (coinAmount, etbAmount) => {
        if (invitedCount < 5) {
            showToast(`ኮይን ወደ ብር ለመቀየር ቢያንስ ${5 - invitedCount} ተጨማሪ ሰዎችን መጋበዝ አለብዎት።`, 'error');
            return;
        }
        if (coinBalance < coinAmount) {
            showToast(`በቂ ኮይን የለዎትም። (አለዎት: ${coinBalance})`, 'error');
            return;
        }

        try {
            const profilePath = getCollectionPath('profiles', true);
            const userRef = doc(db, profilePath, currentUserId);

            await updateDoc(userRef, {
                coinBalance: coinBalance - coinAmount,
                etbBalance: etbBalance + etbAmount,
            });

            // ግብይት ታሪክ መመዝገብ (ሲሙሌሽን)
            await addDoc(collection(db, `artifacts/${appId}/transactions`), {
                userId: currentUserId,
                type: 'COIN_TO_ETB',
                coinOut: coinAmount,
                etbIn: etbAmount,
                date: new Date().toISOString(),
            });

            showToast(`${coinAmount} ኮይን ወደ ${etbAmount} ብር በስኬት ተለውጧል!`, 'success');

        } catch (error) {
            showToast('ኮይን መለወጥ አልተቻለም: ' + error.message, 'error');
        }
    };

    // ------------------- RENDER -------------------

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-yellow-400">የተጠቃሚ ተግባር</h2>

            {/* Balances and Levels Card */}
            <div className="bg-gray-700 p-4 rounded-xl shadow-lg">
                <div className="grid grid-cols-2 gap-4 text-sm font-medium">
                    <DataBox label="የ Level ደረጃ" value={`Level ${currentLevel}`} />
                    <DataBox label="VIP ደረጃ" value={currentVIP.name} />
                    <DataBox label="የተጋበዙ ሰዎች ብዛት" value={`${invitedCount} ሰዎች`} />
                    <DataBox label="የሪፈራል ገቢ (25%)" value={`${userProfile.totalReferralETB || 0} ብር`} />
                    <DataBox label="ቀሪ ኮይን" value={`${coinBalance.toLocaleString()} ኮይን`} isCoin={true} />
                    <DataBox label="ቀሪ ብር" value={`${etbBalance.toLocaleString()} ብር`} isETB={true} />
                </div>
            </div>

            {/* Referral Link */}
            <div className="bg-gray-700 p-4 rounded-xl shadow-lg">
                <h3 className="text-lg font-semibold text-yellow-400 mb-2">የግብዣ ሊንክ</h3>
                <div className="flex items-center space-x-2 bg-gray-800 p-2 rounded-lg">
                    <input
                        type="text"
                        readOnly
                        value={referralLink}
                        className="flex-grow bg-transparent text-sm text-gray-300 truncate"
                    />
                    <button
                        onClick={() => handleCopy(referralLink, 'የግብዣ ሊንክ')}
                        className="p-1 bg-yellow-600 hover:bg-yellow-700 rounded-md text-gray-900 font-bold text-xs"
                    >
                        ቅዳ
                    </button>
                </div>
            </div>

            {/* COIN to ETB Button */}
            <button
                onClick={() => setIsCoinToETBOpen(true)}
                className="w-full py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-bold text-gray-900 transition duration-200"
            >
                ኮይን ወደ ብር ቀይር
            </button>

            {/* Social Media Links */}
            <button
                onClick={() => setIsSocialStatusOpen(true)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-white transition duration-200"
            >
                ማህበራዊ ሚዲያ (ለገንዘብ ማውጫ ቅድመ ሁኔታ)
            </button>

            {isSocialStatusOpen && (
                <SocialMediaStatus setIsOpen={setIsSocialStatusOpen} />
            )}

            {isCoinToETBOpen && (
                <CoinToETBModal
                    vipLevel={vipLevel}
                    coinRates={coinRates}
                    onClose={() => setIsCoinToETBOpen(false)}
                    handleConvert={handleCoinToETB}
                />
            )}
        </div>
    );
};

const DataBox = ({ label, value, isCoin = false, isETB = false }) => (
    <div className="bg-gray-800 p-3 rounded-lg border border-gray-600">
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`text-xl font-bold ${isETB ? 'text-green-400' : isCoin ? 'text-yellow-400' : 'text-white'}`}>
            {value}
        </p>
    </div>
);

const CoinToETBModal = ({ vipLevel, coinRates, onClose, handleConvert }) => {
    const rates = coinRates[`VIP${vipLevel}`] || {};
    const rateEntries = Object.entries(rates).map(([coin, etb]) => ({ coin: parseInt(coin), etb: parseInt(etb) }));

    return (
        <Modal title="ኮይን ወደ ብር መቀየር" onClose={onClose}>
            <p className="text-yellow-400 mb-4">የእርስዎ VIP {vipLevel} የመለወጫ ዋጋዎች:</p>
            {rateEntries.length === 0 ? (
                <p className="text-red-400">የመለወጫ ዋጋዎች አልተዘጋጁም።</p>
            ) : (
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-gray-600 text-gray-400">
                            <th className="py-2">ኮይን</th>
                            <th className="py-2">ብር (ETB)</th>
                            <th className="py-2">ቀይር</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rateEntries.map((rate, index) => (
                            <tr key={index} className="border-b border-gray-700 hover:bg-gray-700">
                                <td className="py-2 text-white">{rate.coin.toLocaleString()}</td>
                                <td className="py-2 text-green-400">{rate.etb.toLocaleString()}</td>
                                <td className="py-2">
                                    <button
                                        onClick={() => handleConvert(rate.coin, rate.etb)}
                                        className="bg-yellow-600 hover:bg-yellow-700 text-gray-900 font-semibold py-1 px-3 rounded-md text-sm"
                                    >
                                        ቀይር
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <p className="text-sm text-red-400 mt-4">ማሳሰቢያ: ለመቀየር ቢያንስ 5 ሰዎችን መጋበዝ ግዴታ ነው።</p>
        </Modal>
    );
};

const SocialMediaStatus = ({ setIsOpen }) => {
    const socialLinks = [
        { name: 'Telegram', url: 'https://t.me/M_ADVERTIS', joined: true }, // ሲሙሌሽን
        { name: 'TikTok', url: 'https://tiktok.com/M_ADVERTIS', followed: true }, // ሲሙሌሽን
        { name: 'YouTube', url: 'https://youtube.com/M_ADVERTIS', subscribed: true }, // ሲሙሌሽን
    ];
    const allJoined = socialLinks.every(l => l.joined || l.followed || l.subscribed);

    return (
        <Modal title="ማህበራዊ ሚዲያ ሁኔታ" onClose={() => setIsOpen(false)}>
            <p className="mb-4 text-gray-300">ገንዘብ ለማውጣት ሁሉንም ሊንኮች መቀላቀል/መከተል አለብዎት።</p>
            <div className="space-y-3">
                {socialLinks.map((link, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                        <span className="text-white font-semibold">{link.name}</span>
                        <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-yellow-400 hover:text-yellow-300 underline text-sm"
                        >
                            <span role="img" aria-label="link">🔗</span> ይሂዱ
                        </a>
                        <span className={`font-bold ${link.joined || link.followed || link.subscribed ? 'text-green-400' : 'text-red-400'}`}>
                            {link.joined || link.followed || link.subscribed ? '✅ ተጠናቋል' : '❌ አላበቃም'}
                        </span>
                    </div>
                ))}
            </div>
            <p className={`mt-4 text-center font-bold ${allJoined ? 'text-green-400' : 'text-red-400'}`}>
                {allJoined ? 'ሁሉንም ቅድመ ሁኔታዎች አሟልተዋል!' : 'ሁሉንም ቅድመ ሁኔታዎች ማሟላት አለብዎት።'}
            </p>
        </Modal>
    );
};


const WithdrawTab = ({ userProfile, showToast }) => {
    const { id: currentUserId, etbBalance, invitedUsers = [], withdrawDetails, isSocialMediaJoined = true } = userProfile; // isSocialMediaJoined ሲሙሌሽን
    const [amount, setAmount] = useState('');
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [passwordInput, setPasswordInput] = useState('');
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(!withdrawDetails);

    const invitedCount = invitedUsers.length;

    // ------------------- WITHDRAW LOGIC -------------------

    const handleSaveDetails = async (details) => {
        if (details.phone !== userProfile.phone) {
            showToast('ያስገቡት ስልክ ቁጥር ከተመዘገቡበት ስልክ ቁጥር ጋር አይዛመድም።', 'error');
            return;
        }

        try {
            const profilePath = getCollectionPath('profiles', true);
            await updateDoc(doc(db, profilePath, currentUserId), {
                withdrawDetails: details,
            });
            showToast('የማውጫ ዝርዝሮች በስኬት ተቀምጠዋል!', 'success');
            setIsDetailsModalOpen(false);
        } catch (error) {
            showToast('ዝርዝሮችን ማስቀመጥ አልተቻለም: ' + error.message, 'error');
        }
    };

    const handleWithdrawRequest = (e) => {
        e.preventDefault();

        const withdrawalAmount = parseFloat(amount);

        if (!userProfile.withdrawDetails) {
            showToast('ገንዘብ ለማውጣት በመጀመሪያ የባንክ ዝርዝሮችዎን ማስገባት አለብዎት።', 'error');
            setIsDetailsModalOpen(true);
            return;
        }
        if (invitedCount < 5) {
            showToast('ገንዘብ ለማውጣት ቢያንስ 5 ሰዎችን መጋበዝ ግዴታ ነው።', 'error');
            return;
        }
        if (withdrawalAmount < 500) {
            showToast('ቢያንስ 500 ብር ማውጣት አለብዎት።', 'error');
            return;
        }
        if (withdrawalAmount > etbBalance) {
            showToast('ያለዎት ቀሪ ሂሳብ በቂ አይደለም።', 'error');
            return;
        }
        if (!isSocialMediaJoined) {
            showToast('ገንዘብ ለማውጣት ሁሉንም የማህበራዊ ሚዲያ ቅድመ ሁኔታዎች ማሟላት አለብዎት።', 'error');
            return;
        }

        // ለይለፍ ቃል ማረጋገጫ ሞዳል መክፈት
        setIsPasswordModalOpen(true);
    };

    const confirmWithdrawal = async () => {
        if (passwordInput !== userProfile.password) {
            showToast('የይለፍ ቃል የተሳሳተ ነው።', 'error');
            setPasswordInput('');
            return;
        }

        const withdrawalAmount = parseFloat(amount);

        try {
            // 1. ገንዘቡን ከተጠቃሚው ቀሪ ሂሳብ ላይ መቀነስ
            const profilePath = getCollectionPath('profiles', true);
            await updateDoc(doc(db, profilePath, currentUserId), {
                etbBalance: etbBalance - withdrawalAmount,
            });

            // 2. የማውጫ ጥያቄ ወደ አድሚን ገጽ መላክ (WITHDRAW CASH)
            const requestPath = `artifacts/${appId}/admin_settings/withdrawRequests`;
            await addDoc(collection(db, requestPath), {
                userId: currentUserId,
                userName: `${userProfile.firstName} ${userProfile.lastName}`,
                telegramUsername: userProfile.telegramUsername,
                amount: withdrawalAmount,
                status: 'PENDING',
                date: new Date().toISOString(),
                ...userProfile.withdrawDetails,
            });

            // 3. ግብይት ታሪክ መመዝገብ
            await addDoc(collection(db, `artifacts/${appId}/transactions`), {
                userId: currentUserId,
                type: 'WITHDRAWAL_REQUEST',
                etbOut: withdrawalAmount,
                etbIn: 0,
                date: new Date().toISOString(),
            });

            showToast('የገንዘብ ማውጫ ጥያቄ በስኬት ተልኳል።', 'success');
            setIsPasswordModalOpen(false);
            setAmount('');

        } catch (error) {
            showToast('ገንዘብ ማውጣት አልተቻለም: ' + error.message, 'error');
        }
    };

    // ------------------- RENDER -------------------

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-yellow-400">ገንዘብ ማውጫ</h2>

            <div className="bg-gray-700 p-4 rounded-xl shadow-lg">
                <p className="text-lg font-medium text-gray-300">የአሁኑ ቀሪ ሂሳብ (ETB)</p>
                <p className="text-3xl font-bold text-green-400 mt-1">{etbBalance?.toLocaleString() || 0} ብር</p>
            </div>

            <form onSubmit={handleWithdrawRequest} className="space-y-4">
                <InputField
                    label="ማውጣት የሚፈልጉት የብር መጠን"
                    type="number"
                    value={amount}
                    onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (val <= etbBalance) {
                            setAmount(e.target.value);
                        } else {
                            showToast(`ከቀሪ ሂሳብዎ በላይ ማስገባት አይችሉም (${etbBalance.toLocaleString()} ብር)።`, 'error');
                            setAmount(etbBalance.toString());
                        }
                    }}
                    placeholder="ቢያንስ 500 ብር"
                    required
                />

                {userProfile.withdrawDetails && (
                    <div className="bg-gray-700 p-4 rounded-lg border border-yellow-600">
                        <h3 className="text-lg font-semibold text-yellow-400 mb-2">የተቀመጡ የባንክ ዝርዝሮች</h3>
                        <p className="text-sm text-gray-300">ባንክ: {userProfile.withdrawDetails.bankOption}</p>
                        <p className="text-sm text-gray-300">ስም: {userProfile.withdrawDetails.accountName}</p>
                        <p className="text-sm text-gray-300">ቁጥር: {userProfile.withdrawDetails.bankAccount}</p>
                        <p className="text-sm text-gray-300">ስልክ: {userProfile.withdrawDetails.phone}</p>
                        <button
                            type="button"
                            onClick={() => setIsDetailsModalOpen(true)}
                            className="text-xs text-blue-400 hover:underline mt-2"
                        >
                            ዝርዝሮችን አድስ/ቀይር
                        </button>
                    </div>
                )}

                <button
                    type="submit"
                    className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold text-white transition duration-200"
                >
                    ጥያቄ አቅርብ
                </button>
            </form>

            <p className="text-sm text-red-400 p-2 bg-red-900/50 rounded-lg">
                ቅድመ ሁኔታዎች: 5+ ተጋባዦች፣ 500+ ብር ቀሪ ሂሳብ፣ ሁሉንም ማህበራዊ ሚዲያ መቀላቀል/መከተል ግዴታ ነው።
            </p>

            {isDetailsModalOpen && (
                <WithdrawDetailsModal
                    userProfile={userProfile}
                    onClose={() => setIsDetailsModalOpen(false)}
                    onSave={handleSaveDetails}
                />
            )}

            {isPasswordModalOpen && (
                <PasswordVerificationModal
                    onClose={() => setIsPasswordModalOpen(false)}
                    onConfirm={confirmWithdrawal}
                    passwordInput={passwordInput}
                    setPasswordInput={setPasswordInput}
                />
            )}
        </div>
    );
};

const WithdrawDetailsModal = ({ userProfile, onClose, onSave }) => {
    const [details, setDetails] = useState(userProfile.withdrawDetails || {
        accountName: '',
        bankOption: 'Commercial Bank of Ethiopia',
        bankAccount: '',
        phone: userProfile.phone || '',
    });

    const bankOptions = ['Commercial Bank of Ethiopia', 'Dashen Bank', 'Awash Bank'];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setDetails(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = (e) => {
        e.preventDefault();
        onSave(details);
    };

    return (
        <Modal title="የባንክ ዝርዝሮች" onClose={onClose}>
            <form onSubmit={handleSave} className="space-y-4">
                <InputField
                    label="የባንክ ቁጥሩ ባለቤት ስም (Account Name)"
                    name="accountName"
                    value={details.accountName}
                    onChange={handleChange}
                    required
                />
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">የባንክ ምርጫ</label>
                    <select
                        name="bankOption"
                        value={details.bankOption}
                        onChange={handleChange}
                        className="w-full p-3 bg-gray-900 text-white border border-gray-600 rounded-lg focus:ring-yellow-500"
                        required
                    >
                        {bankOptions.map(bank => (
                            <option key={bank} value={bank}>{bank}</option>
                        ))}
                    </select>
                </div>
                <InputField
                    label="የባንክ ቁጥር"
                    name="bankAccount"
                    value={details.bankAccount}
                    onChange={(e) => setDetails(prev => ({ ...prev, bankAccount: e.target.value.replace(/[^0-9]/g, '') }))}
                    type="tel"
                    required
                />
                <InputField
                    label="የተመዘገቡበት ስልክ ቁጥር"
                    name="phone"
                    value={details.phone}
                    onChange={handleChange}
                    type="tel"
                    required
                />
                <button
                    type="submit"
                    className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-white transition duration-200"
                >
                    አስቀምጥ
                </button>
            </form>
        </Modal>
    );
};

const PasswordVerificationModal = ({ onClose, onConfirm, passwordInput, setPasswordInput }) => (
    <Modal title="የይለፍ ቃል ማረጋገጫ" onClose={onClose}>
        <p className="text-gray-300 mb-4">ገንዘብ ማውጣቱን ለማረጋገጥ እባክዎ የይለፍ ቃልዎን ያስገቡ።</p>
        <InputField
            label="የይለፍ ቃል"
            type="password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            required
        />
        <div className="flex justify-end space-x-3 mt-4">
            <button
                onClick={onClose}
                className="py-2 px-4 bg-gray-600 hover:bg-gray-500 rounded-lg text-white"
            >
                ይቅር
            </button>
            <button
                onClick={onConfirm}
                className="py-2 px-4 bg-yellow-600 hover:bg-yellow-700 rounded-lg text-gray-900 font-bold"
            >
                እሺ
            </button>
        </div>
    </Modal>
);

const MineTab = ({ userProfile, showToast }) => {
    const { id, firstName, lastName, phone, telegramUsername, password } = userProfile;
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-yellow-400">የኔ አካውንት</h2>

            <div className="bg-gray-700 p-6 rounded-xl shadow-lg space-y-3">
                <DataRow label="ስም" value={`${firstName} ${lastName}`} />
                <DataRow label="ስልክ ቁጥር" value={`+251${phone}`} />
                <DataRow label="Telegram User ID" value={id} />
                <DataRow label="Telegram Username" value={`@${telegramUsername || 'N/A'}`} />
                <DataRow label="የይለፍ ቃል" value="********" />

                <button
                    onClick={() => setIsChangePasswordOpen(true)}
                    className="w-full mt-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold text-white transition duration-200"
                >
                    የይለፍ ቃል ቀይር
                </button>
            </div>

            {isChangePasswordOpen && (
                <ChangePasswordModal
                    currentPassword={password}
                    userId={id}
                    onClose={() => setIsChangePasswordOpen(false)}
                    showToast={showToast}
                />
            )}
        </div>
    );
};

const ChangePasswordModal = ({ currentPassword, userId, onClose, showToast }) => {
    const [passwords, setPasswords] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setPasswords(prev => ({ ...prev, [name]: value }));
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (passwords.oldPassword !== currentPassword) {
            showToast('የአሁኑ የይለፍ ቃል የተሳሳተ ነው።', 'error');
            return;
        }
        if (passwords.newPassword !== passwords.confirmPassword) {
            showToast('አዲሱ የይለፍ ቃል ማረጋገጫ አይዛመድም።', 'error');
            return;
        }

        try {
            const profilePath = getCollectionPath('profiles', true);
            await updateDoc(doc(db, profilePath, userId), {
                password: passwords.newPassword, // በትክክለኛው Backend ላይ ሃሽ መሆን አለበት
            });

            showToast('የይለፍ ቃል በስኬት ተቀይሯል።', 'success');
            onClose();
        } catch (error) {
            showToast('የይለፍ ቃል መቀየር አልተቻለም: ' + error.message, 'error');
        }
    };

    return (
        <Modal title="የይለፍ ቃል ቀይር" onClose={onClose}>
            <form onSubmit={handlePasswordChange} className="space-y-4">
                <InputField
                    label="የአሁኑ የይለፍ ቃል"
                    name="oldPassword"
                    type="password"
                    value={passwords.oldPassword}
                    onChange={handleChange}
                    required
                />
                <InputField
                    label="አዲስ የይለፍ ቃል"
                    name="newPassword"
                    type="password"
                    value={passwords.newPassword}
                    onChange={handleChange}
                    required
                />
                <InputField
                    label="አዲስ የይለፍ ቃል አረጋግጥ"
                    name="confirmPassword"
                    type="password"
                    value={passwords.confirmPassword}
                    onChange={handleChange}
                    required
                />
                <button
                    type="submit"
                    className="w-full py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-bold text-gray-900 transition duration-200"
                >
                    አስቀምጥ
                </button>
            </form>
        </Modal>
    );
};

const DataRow = ({ label, value }) => (
    <div className="flex justify-between border-b border-gray-600 py-2">
        <span className="text-gray-400 font-medium">{label}:</span>
        <span className="text-white font-semibold">{value}</span>
    </div>
);

const ContactTab = () => {
    const contactUrl = 'https://t.me/M_ADVERTIS_Owner'; // የአድሚን የቴሌግራም URL ሲሙሌሽን

    const handleContact = () => {
        window.Telegram.WebApp.openTelegramLink(contactUrl);
    };

    return (
        <div className="text-center p-8 space-y-6 bg-gray-700 rounded-xl shadow-lg">
            <h2 className="text-2xl font-bold text-yellow-400">አግኙን</h2>
            <p className="text-gray-300">ከድርጅቱ ባለቤት ጋር በቀጥታ ለመገናኘት ከታች ያለውን አዝራር ይጫኑ።</p>

            <button
                onClick={handleContact}
                className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-white transition duration-200 flex items-center justify-center space-x-2"
            >
                <span role="img" aria-label="telegram">💬</span>
                <span>የቴሌግራም መልዕክት ይላኩ</span>
            </button>

            <p className="text-sm text-gray-400">ለአስቸኳይ ጥያቄዎች እና የቴክኒክ ድጋፍ</p>
        </div>
    );
};

const Modal = ({ title, onClose, children }) => (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-4">
                <h3 className="text-xl font-bold text-yellow-400">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            {children}
        </div>
    </div>
);

// --------------------------------------------------------------------------------
// 7. Admin Panel Components
// --------------------------------------------------------------------------------

const AdminPanel = ({ userProfile, showToast, scamUsers, coinRates, userId, setScamUsers, setCoinRates, handleLogout }) => {
    const [activeTab, setActiveTab] = useState('members');
    const [allUsers, setAllUsers] = useState([]);
    const [paymentRequests, setPaymentRequests] = useState([]);
    const [withdrawRequests, setWithdrawRequests] = useState([]);

    // የሁሉም ተጠቃሚዎች መረጃ መጫን
    useEffect(() => {
        const path = getCollectionPath('profiles', true);
        const q = query(collection(db, path));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllUsers(users.filter(u => !u.isAdmin));
        });
        return () => unsubscribe();
    }, []);

    // የክፍያ እና የማውጫ ጥያቄዎች መጫን
    useEffect(() => {
        const paymentPath = `artifacts/${appId}/admin_settings/paymentRequests`;
        const withdrawPath = `artifacts/${appId}/admin_settings/withdrawRequests`;

        const unsubPayment = onSnapshot(query(collection(db, paymentPath), where('status', '==', 'PENDING')), (snapshot) => {
            setPaymentRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const unsubWithdraw = onSnapshot(query(collection(db, withdrawPath), where('status', '==', 'PENDING')), (snapshot) => {
            setWithdrawRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => {
            unsubPayment();
            unsubWithdraw();
        };
    }, []);

    const adminTabs = [
        { id: 'members', label: 'የአባላት ዝርዝር' },
        { id: 'transaction', label: 'ግብይት መቆጣጠሪያ' },
        { id: 'post', label: 'ፖስት ማድረጊያ' },
        { id: 'coin', label: 'ኮይን መቆጣጠሪያ' },
    ];

    const renderAdminTabContent = () => {
        switch (activeTab) {
            case 'members':
                return <AdminMembersTab allUsers={allUsers} />;
            case 'transaction':
                return <AdminTransactionTab
                    paymentRequests={paymentRequests}
                    withdrawRequests={withdrawRequests}
                    allUsers={allUsers}
                    showToast={showToast}
                />;
            case 'post':
                return <AdminPostTab showToast={showToast} allUsers={allUsers} />;
            case 'coin':
                return <AdminCoinTab
                    scamUsers={scamUsers}
                    setScamUsers={setScamUsers}
                    allUsers={allUsers}
                    coinRates={coinRates}
                    setCoinRates={setCoinRates}
                    showToast={showToast}
                />;
            default:
                return <AdminMembersTab allUsers={allUsers} />;
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-red-400">የአድሚን ገጽ</h2>
            <div className="flex space-x-2 border-b border-gray-700 overflow-x-auto pb-2">
                {adminTabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`py-2 px-4 rounded-t-lg font-semibold whitespace-nowrap ${
                            activeTab === tab.id
                                ? 'bg-yellow-600 text-gray-900'
                                : 'text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
                <button
                    onClick={handleLogout}
                    className="py-2 px-4 rounded-lg font-semibold bg-red-700 hover:bg-red-800 text-white ml-auto"
                >
                    ውጣ
                </button>
            </div>
            <div className="p-4 bg-gray-800 rounded-lg min-h-[50vh]">
                {renderAdminTabContent()}
            </div>
        </div>
    );
};

// ------------------- Admin Tabs -------------------

const AdminMembersTab = ({ allUsers }) => {
    const [selectedVIP, setSelectedVIP] = useState(0); // 0 = All
    const [searchTerm, setSearchTerm] = useState('');

    const filteredUsers = useMemo(() => {
        let users = allUsers;
        if (selectedVIP > 0) {
            users = users.filter(u => u.vipLevel === selectedVIP);
        }
        if (searchTerm) {
            users = users.filter(u => u.id?.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        return users;
    }, [allUsers, selectedVIP, searchTerm]);

    const usersByVIP = VIP_LEVELS.map(v => ({
        ...v,
        count: allUsers.filter(u => u.vipLevel === v.level).length
    }));

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-bold text-yellow-400">የአባላት ዝርዝር</h3>

            {/* VIP Filters */}
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setSelectedVIP(0)}
                    className={`py-1 px-3 text-sm rounded ${selectedVIP === 0 ? 'bg-yellow-600 text-gray-900' : 'bg-gray-600 text-white'}`}
                >
                    ጠቅላላ ({allUsers.length})
                </button>
                {usersByVIP.map(vip => (
                    <button
                        key={vip.level}
                        onClick={() => setSelectedVIP(vip.level)}
                        className={`py-1 px-3 text-xs rounded ${selectedVIP === vip.level ? 'bg-yellow-600 text-gray-900' : 'bg-gray-600 text-white'}`}
                    >
                        {vip.name} ({vip.count})
                    </button>
                ))}
            </div>

            {/* Search Bar */}
            <InputField
                label="በUser ID ይፈልጉ"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Telegram User ID አስገባ..."
            />

            {/* User Table */}
            <div className="overflow-x-auto max-h-[60vh]">
                <table className="min-w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-900 uppercase bg-yellow-400 sticky top-0">
                        <tr>
                            <th scope="col" className="px-2 py-3">ስም</th>
                            <th scope="col" className="px-2 py-3">User ID</th>
                            <th scope="col" className="px-2 py-3">VIP</th>
                            <th scope="col" className="px-2 py-3">የጋበዙት</th>
                            <th scope="col" className="px-2 py-3">ሪፈራል ብር</th>
                            <th scope="col" className="px-2 py-3">ኮይን ቀሪ</th>
                            <th scope="col" className="px-2 py-3">ሁኔታ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map((user) => (
                            <tr key={user.id} className="bg-gray-700 border-b border-gray-600 hover:bg-gray-600">
                                <td className="px-2 py-2">{user.firstName} {user.lastName}</td>
                                <td className="px-2 py-2 text-xs">{user.id}</td>
                                <td className="px-2 py-2">{VIP_LEVELS.find(v => v.level === user.vipLevel)?.name || 'N/A'}</td>
                                <td className="px-2 py-2">{user.invitedUsers?.length || 0}</td>
                                <td className="px-2 py-2 text-green-400">{user.totalReferralETB?.toLocaleString() || 0}</td>
                                <td className="px-2 py-2 text-yellow-400">{user.coinBalance?.toLocaleString() || 0}</td>
                                <td className={`px-2 py-2 font-bold ${user.status === 'ACTIVE' ? 'text-green-500' : 'text-red-500'}`}>{user.status}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AdminTransactionTab = ({ paymentRequests, withdrawRequests, allUsers, showToast }) => {
    const [activeSubTab, setActiveSubTab] = useState('new_user');
    const [targetUserId, setTargetUserId] = useState('');
    const [etbAmount, setEtbAmount] = useState(0);
    const [isBackup, setIsBackup] = useState(false);

    const backupDocRef = doc(db, `artifacts/${appId}/admin_settings/backupFund`);

    const handleTransaction = async (type) => {
        if (!targetUserId) {
            showToast('User ID ግዴታ ነው።', 'error');
            return;
        }
        const user = allUsers.find(u => u.id === targetUserId);
        if (!user) {
            showToast('የተጠቃሚ ID አልተገኘም።', 'error');
            return;
        }

        try {
            let newBalance = user.etbBalance;
            const profilePath = getCollectionPath('profiles', true);

            if (type === 'ADD') {
                newBalance += etbAmount;
            } else if (type === 'SUBTRACT') {
                newBalance -= etbAmount;
            }

            await updateDoc(doc(db, profilePath, targetUserId), {
                etbBalance: newBalance,
            });

            // ግብይት ታሪክ መመዝገብ
            await addDoc(collection(db, `artifacts/${appId}/transactions`), {
                userId: targetUserId,
                type: `ADMIN_ETB_${type}`,
                etbChange: type === 'ADD' ? etbAmount : -etbAmount,
                date: new Date().toISOString(),
                adminId: targetUserId, // የአድሚን ID ከዚህ ሊገኝ ይችላል
            });

            showToast(`ለUser ID ${targetUserId}: ${etbAmount} ብር በስኬት ተስተካክሏል።`, 'success');
        } catch (error) {
            showToast('ግብይት አልተቻለም: ' + error.message, 'error');
        }
    };

    const handleBackupTransaction = async (type) => {
        try {
            const backupSnap = await getDoc(backupDocRef);
            const currentAmount = backupSnap.exists() ? backupSnap.data().amount : 0;
            let newAmount = currentAmount;

            if (type === 'ADD') {
                newAmount += etbAmount;
            } else if (type === 'SUBTRACT') {
                newAmount -= etbAmount;
            }

            await setDoc(backupDocRef, { amount: newAmount }, { merge: true });
            showToast(`ለተጠባባቂ ተቀማጭ: ${etbAmount} ብር በስኬት ተስተካክሏል።`, 'success');
        } catch (error) {
            showToast('የተጠባባቂ ተቀማጭ ማስተካከያ አልተቻለም: ' + error.message, 'error');
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-bold text-yellow-400">ግብይት መቆጣጠሪያ</h3>
            <div className="flex space-x-2 border-b border-gray-700 pb-2">
                <button onClick={() => setActiveSubTab('new_user')} className={`py-1 px-3 text-sm rounded ${activeSubTab === 'new_user' ? 'bg-yellow-600 text-gray-900' : 'bg-gray-600 text-white'}`}>አዲስ ተጠቃሚ ({paymentRequests.length})</button>
                <button onClick={() => setActiveSubTab('withdraw_cash')} className={`py-1 px-3 text-sm rounded ${activeSubTab === 'withdraw_cash' ? 'bg-yellow-600 text-gray-900' : 'bg-gray-600 text-white'}`}>ገንዘብ ማውጣት ጥያቄ ({withdrawRequests.length})</button>
                <button onClick={() => setActiveSubTab('etb_adjust')} className={`py-1 px-3 text-sm rounded ${activeSubTab === 'etb_adjust' ? 'bg-yellow-600 text-gray-900' : 'bg-gray-600 text-white'}`}>ብር +/-</button>
            </div>

            {activeSubTab === 'new_user' && <AdminNewUserRequests paymentRequests={paymentRequests} allUsers={allUsers} showToast={showToast} />}
            {activeSubTab === 'withdraw_cash' && <AdminWithdrawRequests withdrawRequests={withdrawRequests} showToast={showToast} />}

            {activeSubTab === 'etb_adjust' && (
                <div className="space-y-4 p-4 bg-gray-700 rounded-lg">
                    <h4 className="text-lg font-semibold text-white">ብር መጨመር/መቀነስ</h4>
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            checked={isBackup}
                            onChange={() => setIsBackup(!isBackup)}
                            className="h-4 w-4 text-yellow-600 bg-gray-600 border-gray-500 rounded"
                        />
                        <label className="text-sm text-gray-400">ለተጠባባቂ ተቀማጭ (Backup Fund) ማስተካከል</label>
                    </div>

                    {!isBackup && <InputField label="ዒላማ User ID" type="text" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} />}
                    <InputField label="የብር መጠን" type="number" value={etbAmount} onChange={(e) => setEtbAmount(parseFloat(e.target.value))} />

                    <div className="flex space-x-3">
                        <button onClick={() => (isBackup ? handleBackupTransaction('ADD') : handleTransaction('ADD'))} className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-bold">
                            + ይጨምሩ
                        </button>
                        <button onClick={() => (isBackup ? handleBackupTransaction('SUBTRACT') : handleTransaction('SUBTRACT'))} className="flex-1 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-bold">
                            - ይቀንሱ
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const AdminNewUserRequests = ({ paymentRequests, allUsers, showToast }) => {

    const handleActivation = async (request, isActive) => {
        const userRef = doc(db, getCollectionPath('profiles', true), request.userId);
        const requestRef = doc(db, `artifacts/${appId}/admin_settings/paymentRequests`, request.id);

        try {
            if (isActive) {
                // 1. የተጠቃሚውን ሁኔታ ወደ ACTIVE መለወጥ
                await updateDoc(userRef, { status: 'ACTIVE' });

                // 2. የሪፈራል ኮሚሽን ስሌት እና ማስተላለፍ
                const vipInfo = VIP_LEVELS.find(v => v.level === request.vipLevel);
                const paymentAmount = vipInfo.amount;
                const ownerShare = paymentAmount * 0.50;
                const referrerCommission = paymentAmount * 0.25;
                const incentiveReserve = paymentAmount * 0.125;
                const backupReserve = paymentAmount * 0.125;

                const userProfile = allUsers.find(u => u.id === request.userId);
                if (userProfile && userProfile.referrerId) {
                    const referrerRef = doc(db, getCollectionPath('profiles', true), userProfile.referrerId);
                    const referrerDoc = await getDoc(referrerRef);

                    if (referrerDoc.exists()) {
                        const referrer = referrerDoc.data();
                        // 25% ወዲያውኑ ለጋባዡ
                        await updateDoc(referrerRef, {
                            etbBalance: (referrer.etbBalance || 0) + referrerCommission,
                            totalReferralETB: (referrer.totalReferralETB || 0) + referrerCommission,
                            // የማበረታቻ ገንዘብ ማስቀመጫ
                            levelReserve: (referrer.levelReserve || 0) + incentiveReserve,
                        });
                        // የተጋበዙትን ዝርዝር ማዘመን
                        await updateDoc(referrerRef, {
                            invitedUsers: [...(referrer.invitedUsers || []), request.userId]
                        });
                    }
                }

                // 3. Backup Fund መጨመር (ሲሙሌሽን)
                const backupDocRef = doc(db, `artifacts/${appId}/admin_settings/backupFund`);
                const backupSnap = await getDoc(backupDocRef);
                const currentAmount = backupSnap.exists() ? backupSnap.data().amount : 0;
                await setDoc(backupDocRef, { amount: currentAmount + backupReserve }, { merge: true });

                // 4. የጥያቄውን ሁኔታ ማዘመን
                await updateDoc(requestRef, { status: 'APPROVED', approvalDate: new Date().toISOString() });

                showToast(`የተጠቃሚ ${request.userId} መለያ በስኬት ገቢ ሆኗል። ኮሚሽኖች ተላልፈዋል።`, 'success');

            } else {
                // 1. ሁኔታውን ወደ UNPAID መለወጥ
                await updateDoc(userRef, { status: 'UNPAID' });
                // 2. የጥያቄውን ሁኔታ ማዘመን
                await updateDoc(requestRef, { status: 'REJECTED', rejectionDate: new Date().toISOString() });
                showToast(`የተጠቃሚ ${request.userId} ምዝገባ ውድቅ ሆኗል።`, 'error');
            }

        } catch (error) {
            showToast('የአክቲቬሽን/ዲአክቲቬሽን ሂደት አልተሳካም: ' + error.message, 'error');
        }
    };


    return (
        <div className="overflow-x-auto max-h-[60vh]">
            <h4 className="text-lg font-semibold text-white mb-3">አዲስ የምዝገባ ጥያቄዎች ({paymentRequests.length})</h4>
            <table className="min-w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-900 uppercase bg-yellow-400 sticky top-0">
                    <tr>
                        <th className="px-2 py-3">ስም/ID</th>
                        <th className="px-2 py-3">VIP/ብር</th>
                        <th className="px-2 py-3">Transaction ID</th>
                        <th className="px-2 py-3">ባንክ ስም</th>
                        <th className="px-2 py-3">እርምጃ</th>
                    </tr>
                </thead>
                <tbody>
                    {paymentRequests.map((req) => (
                        <tr key={req.id} className="bg-gray-700 border-b border-gray-600 hover:bg-gray-600">
                            <td className="px-2 py-2">{req.userName} ({req.userId})</td>
                            <td className="px-2 py-2">{VIP_LEVELS.find(v => v.level === req.vipLevel)?.name} ({req.paymentAmount.toLocaleString()} ብር)</td>
                            <td className="px-2 py-2 text-xs">{req.transactionID}</td>
                            <td className="px-2 py-2">{req.bankName}</td>
                            <td className="px-2 py-2 flex space-x-1">
                                <button onClick={() => handleActivation(req, true)} className="bg-green-600 text-white p-1 rounded-md text-xs">Active</button>
                                <button onClick={() => handleActivation(req, false)} className="bg-red-600 text-white p-1 rounded-md text-xs">Disactive</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const AdminWithdrawRequests = ({ withdrawRequests, showToast }) => {
    // የማውጣት ጥያቄ ሲረጋገጥ ገንዘብ ከመጠባበቂያ ገንዘብ ወይም ከሌላ ቦታ እንደተላከ ይቆጠራል (Backend ተግባር)

    const handleConfirmWithdrawal = async (request) => {
        const requestRef = doc(db, `artifacts/${appId}/admin_settings/withdrawRequests`, request.id);

        try {
            // ጥያቄውን ወደ APPROVED መለወጥ
            await updateDoc(requestRef, { status: 'COMPLETED', completionDate: new Date().toISOString() });

            showToast(`የተጠቃሚ ${request.userId} ${request.amount} ብር ማውጣት በስኬት ተረጋግጧል።`, 'success');
        } catch (error) {
            showToast('የማውጫ ማረጋገጫ አልተሳካም: ' + error.message, 'error');
        }
    };

    return (
        <div className="overflow-x-auto max-h-[60vh]">
            <h4 className="text-lg font-semibold text-white mb-3">ገንዘብ ማውጣት ጥያቄዎች ({withdrawRequests.length})</h4>
            <table className="min-w-full text-sm text-left text-gray-400">
                <thead className="text-xs text-gray-900 uppercase bg-yellow-400 sticky top-0">
                    <tr>
                        <th className="px-2 py-3">ስም/ID</th>
                        <th className="px-2 py-3">መጠን (ብር)</th>
                        <th className="px-2 py-3">ባንክ</th>
                        <th className="px-2 py-3">ስልክ</th>
                        <th className="px-2 py-3">እርምጃ</th>
                    </tr>
                </thead>
                <tbody>
                    {withdrawRequests.map((req) => (
                        <tr key={req.id} className="bg-gray-700 border-b border-gray-600 hover:bg-gray-600">
                            <td className="px-2 py-2">{req.userName} ({req.userId})</td>
                            <td className="px-2 py-2 font-bold text-red-400">{req.amount.toLocaleString()}</td>
                            <td className="px-2 py-2 text-xs">{req.bankOption} ({req.bankAccount})</td>
                            <td className="px-2 py-2">{req.phone}</td>
                            <td className="px-2 py-2">
                                <button onClick={() => handleConfirmWithdrawal(req)} className="bg-green-600 text-white p-1 rounded-md text-xs">ክፈል/አረጋግጥ</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const AdminPostTab = ({ showToast }) => {
    const [activePostTab, setActivePostTab] = useState('home');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [targetVIP, setTargetVIP] = useState(1);
    const [homePosts, setHomePosts] = useState([]);

    // የHOME ፖስቶችን መጫን (ለማጥፋት)
    useEffect(() => {
        const path = `artifacts/${appId}/posts`;
        const q = query(collection(db, path), where('page', '==', 'HOME'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setHomePosts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, []);

    const handlePost = async () => {
        if (!title || !content) {
            showToast('ርዕስ እና ይዘት ግዴታ ነው።', 'error');
            return;
        }

        let postTarget = activePostTab === 'home' ? 'HOME' : activePostTab === 'advert' ? 'ADVERTISE' : `VIP${targetVIP}`;

        try {
            await addDoc(collection(db, `artifacts/${appId}/posts`), {
                title,
                content,
                page: postTarget,
                postDate: new Date().toISOString(),
                // ቪዲዮ መላክ ቢሆንም፣ በሲሙሌሽን ጽሑፍ ነው የምንልከው
            });
            showToast(`ፖስት ለ ${postTarget} በስኬት ተልኳል።`, 'success');
            setTitle('');
            setContent('');
        } catch (error) {
            showToast('ፖስት መላክ አልተቻለም: ' + error.message, 'error');
        }
    };

    const handleDeleteHomePost = async (postId) => {
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/posts`, postId));
            showToast('የHOME ገጽ ፖስት በስኬት ተሰርዟል።', 'success');
        } catch (error) {
            showToast('ፖስቱን መሰረዝ አልተቻለም: ' + error.message, 'error');
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-bold text-yellow-400">ፖስት ማድረጊያ</h3>

            <div className="flex space-x-2 border-b border-gray-700 pb-2">
                <PostTabButton id="home" activeTab={activePostTab} setActiveTab={setActivePostTab} label="HOME ፎቶ" />
                <PostTabButton id="advert" activeTab={activePostTab} setActiveTab={setActivePostTab} label="ADVERTISE ቪዲዮ (ለሁሉም)" />
                <PostTabButton id="choose_vip" activeTab={activePostTab} setActiveTab={setActivePostTab} label="VIP ምረጥ ቪዲዮ" />
            </div>

            {activePostTab === 'choose_vip' && (
                <div className="flex items-center space-x-2">
                    <label className="text-gray-400">ዒላማ VIP:</label>
                    <select
                        value={targetVIP}
                        onChange={(e) => setTargetVIP(parseInt(e.target.value))}
                        className="p-2 bg-gray-700 rounded text-white"
                    >
                        {VIP_LEVELS.map(v => <option key={v.level} value={v.level}>{v.name}</option>)}
                    </select>
                </div>
            )}

            <InputField label="ርዕስ / የማስታወቂያ መግለጫ" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-400 mb-1">የይዘት/ቪዲዮ URL (ሲሙሌሽን)</label>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full p-3 bg-gray-900 text-white border border-gray-600 rounded-lg focus:ring-yellow-500"
                    rows="3"
                ></textarea>
            </div>

            <button
                onClick={handlePost}
                className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-white transition duration-200"
            >
                ፖስት ላክ
            </button>

            {activePostTab === 'home' && (
                <div className="mt-6 border-t border-gray-700 pt-4">
                    <h4 className="text-lg font-semibold text-white mb-3">የHOME ገጽ ፖስቶች መሰረዣ</h4>
                    <div className="space-y-2">
                        {homePosts.map(post => (
                            <div key={post.id} className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                                <span className="text-gray-300 truncate">{post.title}</span>
                                <button
                                    onClick={() => handleDeleteHomePost(post.id)}
                                    className="bg-red-600 text-white p-1 rounded-md text-xs"
                                >
                                    ሰርዝ
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <p className="text-xs text-red-400 mt-2">ማስታወቂያዎች (ADVERTISE/VIP) ከ24 ሰዓት በኋላ አውቶማቲክ ይጠፋሉ።</p>
        </div>
    );
};

const PostTabButton = ({ id, activeTab, setActiveTab, label }) => (
    <button
        onClick={() => setActiveTab(id)}
        className={`py-1 px-3 text-sm rounded transition duration-200 ${
            activeTab === id
                ? 'bg-yellow-600 text-gray-900'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        }`}
    >
        {label}
    </button>
);

const AdminCoinTab = ({ scamUsers, setScamUsers, allUsers, coinRates, setCoinRates, showToast }) => {
    const [activeCoinTab, setActiveCoinTab] = useState('scam_list');
    const [scamInput, setScamInput] = useState('');
    const [selectedVIP, setSelectedVIP] = useState(1);
    const [coinInput, setCoinInput] = useState({});
    const [etbInput, setEtbInput] = useState({});

    // ------------------- SCAM USER LOGIC -------------------

    const handleAddScamUsers = async () => {
        const newUsers = scamInput.split(/[\/,]/).map(id => id.trim()).filter(id => id.length > 0);
        if (newUsers.length === 0) {
            showToast('እባክዎ ትክክለኛ User IDs ያስገቡ።', 'error');
            return;
        }

        try {
            const currentScamUsers = new Set(scamUsers);
            let addedCount = 0;
            const profilePath = getCollectionPath('profiles', true);

            for (const id of newUsers) {
                if (!currentScamUsers.has(id)) {
                    currentScamUsers.add(id);
                    addedCount++;
                    // የተጠቃሚውን isScamUser ሁኔታ ማዘመን
                    await updateDoc(doc(db, profilePath, id), { isScamUser: true });
                }
            }

            // የ Scam Users ዝርዝር ማዘመን
            const scamDocRef = doc(db, `artifacts/${appId}/admin_settings/scamUsers`);
            await setDoc(scamDocRef, { userIDs: Array.from(currentScamUsers) });
            setScamInput('');
            showToast(`${addedCount} ተጠቃሚዎች ወደ SCAM ዝርዝር በስኬት ተጨምረዋል።`, 'success');
        } catch (error) {
            showToast('SCAM ተጠቃሚዎችን መጨመር አልተቻለም: ' + error.message, 'error');
        }
    };

    const handleRemoveScamUser = async (targetId, shouldDeleteAccount = false) => {
        try {
            const profilePath = getCollectionPath('profiles', true);
            const userRef = doc(db, profilePath, targetId);
            const currentScamUsers = new Set(scamUsers);

            if (shouldDeleteAccount) {
                // መለያውን ሙሉ በሙሉ መሰረዝ
                await deleteDoc(userRef);
                currentScamUsers.delete(targetId);
                showToast(`የተጠቃሚ ${targetId} አካውንት ሙሉ በሙሉ ተሰርዟል።`, 'success');
            } else {
                // ከ SCAM ዝርዝር ማስወገድ እና isScamUser ሁኔታን ወደ false መለወጥ
                if (currentScamUsers.has(targetId)) {
                    currentScamUsers.delete(targetId);
                    await updateDoc(userRef, { isScamUser: false });
                    showToast(`የተጠቃሚ ${targetId} ከ SCAM ዝርዝር ተሰርዟል።`, 'success');
                } else {
                    showToast('ተጠቃሚው በ SCAM ዝርዝር ውስጥ የለም።', 'info');
                    return;
                }
            }

            // የ Scam Users ዝርዝር ማዘመን
            const scamDocRef = doc(db, `artifacts/${appId}/admin_settings/scamUsers`);
            await setDoc(scamDocRef, { userIDs: Array.from(currentScamUsers) });

        } catch (error) {
            showToast('SCAM ተጠቃሚን መሰረዝ አልተቻለም: ' + error.message, 'error');
        }
    };

    const handleBlockScamUser = async (targetId, isBlocked) => {
        try {
            const profilePath = getCollectionPath('profiles', true);
            await updateDoc(doc(db, profilePath, targetId), {
                status: isBlocked ? 'BANNED' : 'ACTIVE',
            });
            showToast(`የተጠቃሚ ${targetId} ሁኔታ ወደ ${isBlocked ? 'ታግዷል' : 'ገባሪ'} ተቀይሯል።`, 'success');
        } catch (error) {
            showToast('የማገድ ሂደት አልተሳካም: ' + error.message, 'error');
        }
    };

    const scamUsersProfiles = allUsers.filter(u => scamUsers.includes(u.id));

    // ------------------- COIN RATE LOGIC -------------------

    const loadCoinRates = useCallback((vip) => {
        const currentRates = coinRates[`VIP${vip}`] || {};
        const entries = Object.entries(currentRates);

        // ለቅጽበት መረጃ ማስቀመጥ
        const newCoinInput = {};
        const newEtbInput = {};

        if (entries.length > 0) {
            entries.forEach(([coin, etb]) => {
                newCoinInput[coin] = coin;
                newEtbInput[coin] = etb;
            });
        } else {
            // መጀመሪያ ላይ ክፍት መስመሮችን መስጠት
            newCoinInput['100'] = 100;
            newEtbInput['100'] = 50;
        }

        setCoinInput(newCoinInput);
        setEtbInput(newEtbInput);
    }, [coinRates]);

    useEffect(() => {
        loadCoinRates(selectedVIP);
    }, [selectedVIP, loadCoinRates]);

    const handleUpdateCoinRates = async () => {
        const newRates = {};
        const updatedVIPRates = {};

        // አሁን ያለውን የ VIP ተመን ማዘመን
        Object.keys(coinInput).forEach(key => {
            const coin = parseInt(coinInput[key]);
            const etb = parseInt(etbInput[key]);
            if (coin > 0 && etb > 0) {
                updatedVIPRates[coin] = etb;
            }
        });

        // ሁሉንም ተመኖች በVIP ማስቀመጥ
        newRates[`VIP${selectedVIP}`] = updatedVIPRates;
        const finalRates = { ...coinRates, ...newRates };

        try {
            const coinDocRef = doc(db, `artifacts/${appId}/admin_settings/coinRates`);
            await setDoc(coinDocRef, { rates: finalRates }, { merge: true });
            setCoinRates(finalRates);
            showToast(`የ VIP ${selectedVIP} የኮይን ተመን በስኬት ተቀይሯል።`, 'success');
        } catch (error) {
            showToast('የኮይን ተመን መቀየር አልተቻለም: ' + error.message, 'error');
        }
    };

    // የኮይን ተመን መቀየሪያ (ON/OFF)
    const handleToggleCoinConvert = async (vipLevel, isEnabled) => {
        const coinDocRef = doc(db, `artifacts/${appId}/admin_settings/coinToggle`);
        try {
            await setDoc(coinDocRef, { [`VIP${vipLevel}`]: isEnabled }, { merge: true });
            showToast(`VIP ${vipLevel} ኮይን መለወጥ ${isEnabled ? 'ተፈቅዷል' : 'ተከልክሏል'}።`, 'success');
        } catch (error) {
            showToast('ቶግል መቀየር አልተቻለም: ' + error.message, 'error');
        }
    };


    return (
        <div className="space-y-4">
            <div className="flex space-x-2 border-b border-gray-700 pb-2">
                <PostTabButton id="scam_list" activeTab={activeCoinTab} setActiveTab={setActiveCoinTab} label="ማጭበርበር (SCAM) ተጠቃሚዎች" />
                <PostTabButton id="coin_rate" activeTab={activeCoinTab} setActiveTab={setActiveCoinTab} label="የኮይን ዋጋ ማስተካከያ" />
            </div>

            {activeCoinTab === 'scam_list' && (
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-red-400">የማጭበርበር ተጠቃሚዎች (SCAM Users)</h3>
                    <div className="space-y-2 p-3 bg-gray-700 rounded-lg">
                        <label className="text-gray-400 text-sm">User ID(ዎች) አስገባ (በ / ወይም , ይለያሉ)</label>
                        <textarea
                            value={scamInput}
                            onChange={(e) => setScamInput(e.target.value)}
                            className="w-full p-2 bg-gray-900 text-white border border-gray-600 rounded-lg"
                            rows="2"
                            placeholder="6424059359/7829046708..."
                        />
                        <button onClick={handleAddScamUsers} className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-bold">
                            ወደ SCAM ዝርዝር ጨምር
                        </button>
                    </div>

                    <div className="overflow-x-auto max-h-[40vh]">
                        <table className="min-w-full text-sm text-left text-gray-400">
                            <thead className="text-xs text-gray-900 uppercase bg-yellow-400 sticky top-0">
                                <tr>
                                    <th className="px-2 py-3">No</th>
                                    <th className="px-2 py-3">User ID</th>
                                    <th className="px-2 py-3">VIP</th>
                                    <th className="px-2 py-3">ሁኔታ</th>
                                    <th className="px-2 py-3">እርምጃዎች</th>
                                </tr>
                            </thead>
                            <tbody>
                                {scamUsersProfiles.map((user, index) => (
                                    <tr key={user.id} className="bg-gray-700 border-b border-gray-600 hover:bg-gray-600">
                                        <td className="px-2 py-2">{index + 1}</td>
                                        <td className="px-2 py-2 text-xs">{user.id}</td>
                                        <td className="px-2 py-2">{VIP_LEVELS.find(v => v.level === user.vipLevel)?.name || 'N/A'}</td>
                                        <td className="px-2 py-2">{user.status}</td>
                                        <td className="px-2 py-2 flex space-x-1">
                                            <button onClick={() => handleBlockScamUser(user.id, user.status !== 'BANNED')} className={`p-1 rounded-md text-xs font-bold ${user.status === 'BANNED' ? 'bg-blue-600' : 'bg-yellow-600'} text-gray-900`}>
                                                {user.status === 'BANNED' ? 'እገዳ አንሳ' : 'እገዳ (Block)'}
                                            </button>
                                            <button onClick={() => handleRemoveScamUser(user.id, false)} className="bg-red-500 text-white p-1 rounded-md text-xs">
                                                ከዝርዝር አስወግድ
                                            </button>
                                            <button onClick={() => handleRemoveScamUser(user.id, true)} className="bg-red-800 text-white p-1 rounded-md text-xs">
                                                አካውንት ሰርዝ
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeCoinTab === 'coin_rate' && (
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-yellow-400">የኮይን ዋጋ ማስተካከያ</h3>
                    <div className="flex items-center space-x-2">
                        <label className="text-gray-400">VIP ምረጥ:</label>
                        <select
                            value={selectedVIP}
                            onChange={(e) => setSelectedVIP(parseInt(e.target.value))}
                            className="p-2 bg-gray-700 rounded text-white"
                        >
                            {VIP_LEVELS.map(v => <option key={v.level} value={v.level}>{v.name}</option>)}
                        </select>
                        <button
                            onClick={() => handleToggleCoinConvert(selectedVIP, coinRates[`VIP${selectedVIP}`]?.enabled !== true)}
                            className={`py-2 px-3 text-xs rounded font-bold ${coinRates[`VIP${selectedVIP}`]?.enabled === true ? 'bg-red-500' : 'bg-green-500'} text-white`}
                        >
                            {coinRates[`VIP${selectedVIP}`]?.enabled === true ? 'OFF አድርግ' : 'ON አድርግ'}
                        </button>
                    </div>

                    <table className="w-full text-left text-gray-400">
                        <thead>
                            <tr className="border-b border-gray-600 text-gray-300">
                                <th className="py-2 w-1/3">ኮይን</th>
                                <th className="py-2 w-1/3">ብር (ETB)</th>
                                <th className="py-2 w-1/3">እርምጃ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.keys(coinInput).map((key, index) => (
                                <tr key={key} className="border-b border-gray-700">
                                    <td className="py-2">
                                        <input
                                            type="number"
                                            value={coinInput[key] || ''}
                                            onChange={(e) => setCoinInput({ ...coinInput, [key]: parseInt(e.target.value) || 0 })}
                                            className="w-full p-1 bg-gray-900 rounded text-white"
                                        />
                                    </td>
                                    <td className="py-2">
                                        <input
                                            type="number"
                                            value={etbInput[key] || ''}
                                            onChange={(e) => setEtbInput({ ...etbInput, [key]: parseInt(e.target.value) || 0 })}
                                            className="w-full p-1 bg-gray-900 rounded text-white"
                                        />
                                    </td>
                                    <td className="py-2">
                                        <button
                                            onClick={() => {
                                                const newCoin = { ...coinInput };
                                                const newEtb = { ...etbInput };
                                                delete newCoin[key];
                                                delete newEtb[key];
                                                setCoinInput(newCoin);
                                                setEtbInput(newEtb);
                                            }}
                                            className="bg-red-600 text-white p-1 rounded-md text-xs"
                                        >
                                            ሰርዝ
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <button
                        onClick={() => {
                            const newKey = Date.now();
                            setCoinInput({ ...coinInput, [newKey]: 0 });
                            setEtbInput({ ...etbInput, [newKey]: 0 });
                        }}
                        className="py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-bold text-sm"
                    >
                        + መስመር ጨምር
                    </button>

                    <button
                        onClick={handleUpdateCoinRates}
                        className="w-full py-3 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-bold text-gray-900 transition duration-200 mt-4"
                    >
                        Apply Changes
                    </button>
                </div>
            )}
        </div>
    );
};

// Export the main component
export default App;