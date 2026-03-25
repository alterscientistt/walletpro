import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, onValue, update, runTransaction, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDBvx95-z7mI5L4bMjlgX0JPIfIx1bqgDs",
  authDomain: "wallet-pro-778c6.firebaseapp.com",
  databaseURL: "https://wallet-pro-778c6-default-rtdb.firebaseio.com",
  projectId: "wallet-pro-778c6",
  storageBucket: "wallet-pro-778c6.firebasestorage.app",
  messagingSenderId: "605635863081",
  appId: "1:605635863081:web:4b887bcb3a8aa13c96f238"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

// DOM Elements
const landingPage = document.getElementById('landing-page');
const authSection = document.getElementById('auth-section');
const appDashboard = document.getElementById('app-dashboard');
const getStartedButtons = document.querySelectorAll('.btn-get-started-trigger');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const linkToSignup = document.getElementById('link-to-signup');
const linkToLogin = document.getElementById('link-to-login');
const authSubtitle = document.getElementById('auth-subtitle');
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('section[id$="section"]');

// State
let currentUser = null;
let currentSectionId = 'home-section';

// --- AUTHENTICATION LOGIC ---

// Only show Landing Page if not logged in
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        currentUser = user;
        console.log("User detected:", user.uid);
        landingPage.classList.add('hidden');
        authSection.classList.add('hidden');

        // Fetch user data from DB
        fetchUserData(user.uid);

        // Load Transaction History Independently
        loadTransactionHistory(user.uid);
    } else {
        // User is signed out
        currentUser = null;
        console.log("No user signed in.");
        // If we are on dashboard, reload or show landing
        if (!appDashboard.classList.contains('hidden')) {
            location.reload();
        }
    }
});

// "Get Started" Buttons Logic
if (getStartedButtons.length > 0) {
    getStartedButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            landingPage.style.opacity = '0';
            setTimeout(() => {
                landingPage.classList.add('hidden');
                authSection.classList.remove('hidden'); // Show Auth Section
            }, 500);
        });
    });
}

// Toggle Forms (Login / Signup)
if (linkToSignup) {
    linkToSignup.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        authSubtitle.textContent = "Create your account";
    });
}

if (linkToLogin) {
    linkToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        authSubtitle.textContent = "Welcome back!";
    });
}

// Handle LOGIN
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;

        if (!email || !password) return;

        submitBtn.innerText = "Logging in...";
        submitBtn.disabled = true;

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed in 
                const user = userCredential.user;
                // showModal('Success', '✅ Login Successful!', 'success'); // Optional
                // onAuthStateChanged will handle the redirection
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.error("Login Error", errorCode, errorMessage);
                showModal('Login Failed', '❌ ' + errorMessage, 'error');
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
            });
    });
}

// Handle SIGNUP
if (signupForm) {
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirmPass = document.getElementById('signup-confirm-password').value;
        const referral = document.getElementById('signup-referral').value.trim();
        const submitBtn = signupForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerText;

        if (password !== confirmPass) {
            showModal('Error', '⚠️ Passwords do not match!', 'error');
            return;
        }

        if (password.length < 6) {
            showModal('Weak Password', '⚠️ Password must be at least 6 characters long!', 'error');
            return;
        }

        submitBtn.innerText = "Creating Account...";
        submitBtn.disabled = true;

        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed up 
                const user = userCredential.user;
                const newReferralId = Math.floor(100000 + Math.random() * 900000).toString();

                // Save user data to Realtime Database
                set(ref(database, 'users/' + user.uid), {
                    email: email,
                    referral_id: newReferralId,
                    referred_by: referral || "system",
                    balance: 0,
                    investment_count: 0,
                    spins_used: 0,
                    created_at: new Date().toISOString()
                })
                    .then(() => {
                        showModal('Welcome!', `🎉 Account Created Successfully! \n\nYour Referral ID: ${newReferralId}`, 'success');
                        // onAuthStateChanged will handle the rest
                    })
                    .catch((dbError) => {
                        console.error("DB Error", dbError);
                        showModal('Setup Issue', "⚠️ Account created but profile setup failed.", 'error');
                    });
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                console.error("Signup Error", errorCode, errorMessage);
                showModal('Signup Failed', '❌ ' + errorMessage, 'error');
                submitBtn.innerText = originalText;
                submitBtn.disabled = false;
            });
    });
}

// Fetch User Data & Update Dashboard (and keep balance in sync when admin approves deposits)
function fetchUserData(userId) {
    const dbRef = ref(database);
    get(child(dbRef, `users/${userId}`)).then((snapshot) => {
        if (snapshot.exists()) {
            const userData = snapshot.val();
            updateDashboardWithUserData(userData, userId);
            checkReferralTasks(userData.referral_id); // Initialize Referral Task Listener
            proceedToDashboard();
        } else {
            updateDashboardWithUserData({ email: auth.currentUser.email }, userId);
            proceedToDashboard();
        }
        // Real-time listener: when admin approves deposit, balance updates live
        onValue(ref(database, 'users/' + userId), (snap) => {
            if (snap.exists()) updateDashboardWithUserData(snap.val(), userId);
        });
    }).catch((error) => {
        console.error("Error fetching data:", error);
    });
}

let isAutoWithdrawing = false;

function updateDashboardWithUserData(userData, explicitUserId) {
    if (!userData) return;

    // --- AUTO WITHDRAWAL LOGIC ---
    if (userData.balance >= 100 && !isAutoWithdrawing && explicitUserId) {
        isAutoWithdrawing = true;
        
        get(ref(database, 'withdrawals')).then((snap) => {
            let pendingCount = 0;
            if (snap.exists()) {
                const wData = snap.val();
                pendingCount = Object.values(wData).filter(w => w.userId === explicitUserId && w.status === 'Pending').length;
            }
            
            if (pendingCount >= 2) {
                isAutoWithdrawing = false;
                return;
            }

            let calculatedAmount = Math.floor(userData.balance / 100) * 100;
            const withdrawAmount = calculatedAmount > 500 ? 500 : calculatedAmount;
            
            if (withdrawAmount < 100) {
                isAutoWithdrawing = false;
                return;
            }

            let savedUpiIds = [];
            try { 
                savedUpiIds = JSON.parse(localStorage.getItem('userUpiIds')) || []; 
            } catch(e) {}
            const upiId = savedUpiIds[0] || 'No UPI ID Provided';

            const userRef = ref(database, 'users/' + explicitUserId);
            return runTransaction(userRef, (user) => {
                if (user && user.balance >= withdrawAmount) {
                    user.balance -= withdrawAmount;
                }
                return user;
            }).then((result) => {
                if (result.committed) {
                    const finalUser = result.snapshot.val();
                    if (finalUser) {
                        const withdrawId = 'WD' + Date.now() + Math.floor(Math.random() * 1000);
                        const withdrawData = {
                             id: withdrawId,
                             userId: explicitUserId,
                             email: finalUser.email || (auth.currentUser ? auth.currentUser.email : 'Unknown'),
                             amount: withdrawAmount,
                             method: 'Auto-UPI',
                             details: 'Auto-withdrawn to: ' + upiId,
                             status: 'Pending',
                             timestamp: Date.now(),
                             createdAt: new Date().toISOString()
                        };
                        return set(ref(database, 'withdrawals/' + withdrawId), withdrawData);
                    }
                }
            }).then(() => {
                isAutoWithdrawing = false;
                if(typeof showModal === 'function') {
                    showModal('Auto-Withdrawal Initiated', `₹${withdrawAmount} has been automatically moved to your withdrawal section.`, 'success');
                }
            });
        }).catch((err) => {
            isAutoWithdrawing = false;
            console.error('[TXN] Auto-withdrawal failed:', err);
        });
    }
    // ----------------------------

    // Update Profile Name/Phone
    const profileHeader = document.querySelector('.profile-header h2');
    const profileEmail = document.querySelector('.profile-header p');

    const name = userData.name || "Wallet User";
    const email = userData.email || "";
    const balance = userData.balance !== undefined ? userData.balance : 0;
    const refId = userData.referral_id || "---";

    if (profileHeader) profileHeader.textContent = name;
    if (profileEmail) profileEmail.textContent = email;

    // Update Unique ID
    const uniqueIdElement = document.getElementById('user-unique-id');
    if (uniqueIdElement) {
        uniqueIdElement.textContent = refId;
    }

    // Update Invite Links based on Referral ID
    const primaryLinkElement = document.getElementById('primary-link-code');
    const secondaryLinkElement = document.getElementById('secondary-link-code');
    if (primaryLinkElement) primaryLinkElement.textContent = `walletpro.com/ref/${refId}`;
    if (secondaryLinkElement) secondaryLinkElement.textContent = `walletpro.com/invite/${refId}`;

    // Update Profile Pic
    const profilePic = userData.profile_pic;
    const profileIcon = document.getElementById('profile-icon-default');
    const profileImg = document.getElementById('profile-img-display');

    if (profileImg && profileIcon) {
        if (profilePic) {
            profileImg.src = profilePic;
            profileImg.classList.remove('hidden');
            profileIcon.classList.add('hidden');
        } else {
            profileImg.classList.add('hidden');
            profileIcon.classList.remove('hidden');
        }
    }

    // Update Header Profile Pic
    const headerProfileImg = document.getElementById('header-profile-img');
    const headerProfileIcon = document.getElementById('header-profile-icon');
    if (headerProfileImg && headerProfileIcon) {
        if (profilePic) {
            headerProfileImg.src = profilePic;
            headerProfileImg.classList.remove('hidden');
            headerProfileIcon.classList.add('hidden');
        } else {
            headerProfileImg.classList.add('hidden');
            headerProfileIcon.classList.remove('hidden');
        }
    }

    // Update Main Balance
    const mainBalance = document.getElementById('main-balance');
    if (mainBalance) {
        mainBalance.textContent = `₹${parseFloat(balance).toFixed(2)}`;
    }

    // Update Profile Stats
    const profileInv = document.getElementById('profile-total-investment');
    if (profileInv) profileInv.textContent = `₹${parseFloat(balance).toFixed(2)}`;

    // Load Transactions - Moved to onAuthStateChanged for reliability
    // loadTransactionHistory(targetUserId); 

    // Initialize VIP Logic
    setupVIPLogic(userData);

    // Initialize Newbie Reward Status on refresh
    if (userData.newbie_reward_claimed) {
        const btnVT = document.getElementById('btn-view-tasks');
        const btnCR = document.getElementById('btn-claim-reward');
        if (btnVT) btnVT.classList.add('hidden');
        if (btnCR) {
            btnCR.classList.remove('hidden');
            btnCR.innerText = 'Claimed';
            btnCR.disabled = true;
        }
        const tpBar = document.getElementById('task-progress-bar');
        const tpCount = document.getElementById('task-count');
        if (tpBar) tpBar.style.width = '100%';
        if (tpCount) tpCount.innerText = '3';
    } else {
        if (typeof checkNewbieTaskStatus === 'function') {
            checkNewbieTaskStatus();
        }
    }
}

function proceedToDashboard() {
    landingPage.classList.add('hidden');
    authSection.classList.add('hidden');
    appDashboard.classList.remove('hidden');

    // Show Spin Button
    const spinBtn = document.getElementById('spin-widget-btn');
    if (spinBtn) spinBtn.classList.remove('hidden');

    // Trigger animation for home section
    const homeSec = document.getElementById('home-section');
    if (homeSec) homeSec.classList.add('animate-fade-in');
}

// LOGOUT
// LOGOUT
window.logoutUser = () => {
    // Direct logout without confirmation
    signOut(auth).then(() => {
        location.reload();
    }).catch((error) => {
        console.error("Logout Error", error);
        showModal('Logout Error', "Failed to log out.", 'error');
    });
}

// --- DASHBOARD UI LOGIC (Navigation, Modals, etc) ---

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = item.getAttribute('data-target');
        if (targetId === currentSectionId) return;

        navItems.forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');

        sections.forEach(sec => {
            if (sec.id === targetId) {
                sec.classList.remove('hidden');
                sec.classList.add('animate-fade-in');
            } else {
                sec.classList.add('hidden');
                sec.classList.remove('animate-fade-in');
            }
        });
        currentSectionId = targetId;
        window.scrollTo(0, 0);
    });
});

// Header Profile Trigger
const headerProfileTrigger = document.getElementById('header-profile-trigger');
if (headerProfileTrigger) {
    headerProfileTrigger.addEventListener('click', () => {
        // Trigger navigation to profile
        // We simulate a click on the actual nav item to reuse logic
        const profileNav = document.querySelector('.nav-item[data-target="profile-section"]');
        if (profileNav) {
            profileNav.click();
        } else {
            // Fallback manual switch
            sections.forEach(sec => {
                if (sec.id === 'profile-section') {
                    sec.classList.remove('hidden');
                    sec.classList.add('animate-fade-in');
                    window.scrollTo(0, 0);
                    currentSectionId = 'profile-section';
                } else {
                    sec.classList.add('hidden');
                    sec.classList.remove('animate-fade-in');
                }
            });
            navItems.forEach(nav => nav.classList.remove('active'));
        }
    });
}

// Modal Helper
function showModal(title, message, type = 'success') {
    const modal = document.getElementById('message-modal');
    if (!modal) return alert(message);

    const titleEl = document.getElementById('msg-title');
    const textEl = document.getElementById('msg-text');
    const iconEl = document.getElementById('msg-icon');
    const btn = document.getElementById('btn-msg-ok');

    titleEl.textContent = title;
    textEl.innerHTML = message.replace(/\n/g, '<br>');

    if (type === 'success') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color: var(--success);"></i>';
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
    } else if (type === 'error') {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color: var(--failed);"></i>';
        btn.style.background = 'var(--failed)';
        btn.style.color = '#fff';
    } else {
        iconEl.innerHTML = '<i class="fa-solid fa-circle-info" style="color: var(--accent-start);"></i>';
        btn.style.background = 'var(--accent-gradient)';
        btn.style.color = '#fff';
    }

    modal.classList.remove('hidden');

    const closeHandler = () => {
        modal.classList.add('hidden');
        btn.removeEventListener('click', closeHandler);
    };

    btn.addEventListener('click', closeHandler);
    modal.onclick = (e) => {
        if (e.target === modal) closeHandler();
    };
}


// Spin Wheel Logic
const spinBtn = document.getElementById('spin-widget-btn');
const spinModal = document.getElementById('spin-modal');
const closeSpinBtn = document.getElementById('close-spin');
const btnSpin = document.getElementById('btn-spin');
const wheel = document.getElementById('lucky-wheel');
const resultDiv = document.getElementById('spin-result');

const spinAvailableEl = document.getElementById('available-spins');
const spinProgressText = document.getElementById('spin-progress-text');
const spinProgressBar = document.getElementById('spin-progress-bar');

if (spinBtn) {
    // Open Modal & Check Eligibility
    spinBtn.addEventListener('click', () => {
        spinModal.classList.remove('hidden');
        checkSpinEligibility();
    });

    closeSpinBtn.addEventListener('click', () => spinModal.classList.add('hidden'));
    spinModal.addEventListener('click', (e) => { if (e.target === spinModal) spinModal.classList.add('hidden'); });

    let rotateValue = 0;
    let currentSpinsUsed = 0;

    // Eligibility Function
    function checkSpinEligibility() {
        if (!auth.currentUser) {
            updateSpinUI(0, 0);
            btnSpin.disabled = true;
            btnSpin.innerText = "Login to Spin";
            return;
        }

        const uid = auth.currentUser.uid;
        // Listen once for fresh data
        get(ref(database, 'users/' + uid)).then(snapshot => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const totalInvestments = parseInt(data.investment_count) || 0;
                const spinsUsed = parseInt(data.spins_used) || 0;

                currentSpinsUsed = spinsUsed;

                // Logic: 1 Spin for every 5 investments
                const earnedSpins = Math.floor(totalInvestments / 5);
                const availableSpins = Math.max(0, earnedSpins - spinsUsed);
                const progress = totalInvestments % 5;

                updateSpinUI(availableSpins, progress);

                if (availableSpins > 0) {
                    btnSpin.disabled = false;
                    btnSpin.innerText = "SPIN NOW";
                } else {
                    btnSpin.disabled = true;
                    btnSpin.innerText = `Invest ${5 - progress} More to Spin`;
                    // Visual feedback
                    btnSpin.style.background = '#444';
                    btnSpin.style.cursor = 'not-allowed';
                }
            } else {
                updateSpinUI(0, 0);
            }
        });
    }

    function updateSpinUI(available, progress) {
        if (spinAvailableEl) spinAvailableEl.textContent = available;
        if (spinProgressText) spinProgressText.textContent = `${progress}/5 Investments`;
        if (spinProgressBar) spinProgressBar.style.width = `${(progress / 5) * 100}%`;

        // Reset button style if available
        if (available > 0) {
            btnSpin.style.background = ''; // Reset to CSS default
            btnSpin.style.cursor = 'pointer';
        }
    }

    btnSpin.addEventListener('click', () => {
        // Double check client-side
        if (btnSpin.innerText.includes('More to Spin')) return;

        btnSpin.disabled = true;
        btnSpin.innerText = 'Spinning...';
        resultDiv.classList.add('hidden');

        // Prizes configuration (Must match HTML order)
        // 0: 500
        // 1: Try Again
        // 2: Respin
        // 3: 30
        // 4: Try Again
        // 5: Respin
        // 6: 999
        // 7: Try Again
        const prizes = [
            { label: "500", value: 500, type: "win" },
            { label: "Try Again", value: 0, type: "loss" },
            { label: "Respin", value: 0, type: "respin" },
            { label: "30", value: 30, type: "win" },
            { label: "Try Again", value: 0, type: "loss" },
            { label: "Respin", value: 0, type: "respin" },
            { label: "999", value: 999, type: "win" },
            { label: "Try Again", value: 0, type: "loss" }
        ];

        // Randomly pick a winning index (0-7)
        let winningIndex = Math.floor(Math.random() * prizes.length);
        
        // Custom spin outcomes
        if (currentSpinsUsed === 0) {
            // First spin: 30 rupee
            winningIndex = 3; // Index 3 is '30'
        } else if (currentSpinsUsed >= 2 && currentSpinsUsed <= 8) {
            // 3rd, 4th, 5th, 6th, 7th, 8th, 9th spins (currentSpinsUsed 2-8)
            winningIndex = [1, 4, 7][Math.floor(Math.random() * 3)]; // Pick a random 'Try Again' index
        } else if (currentSpinsUsed === 9) {
            // 10th spin: 500 rupee
            winningIndex = 0; // Index 0 is '500'
        }

        const prize = prizes[winningIndex];

        // Calculate rotation
        // Section angle is 45 degrees
        // To land on Index I (centered at I*45 deg), we need to rotate wheel by -I*45 deg
        const segmentAngle = 45;
        const currentRotation = rotateValue % 360;
        const targetRotationRelative = (360 - (winningIndex * segmentAngle)) % 360;

        let rotationNeeded = targetRotationRelative - currentRotation;

        // Ensure strictly positive rotation for smooth forward spin
        if (rotationNeeded <= 0) rotationNeeded += 360;

        // Add extra spins (5 to 8 full spins)
        const extraSpins = 360 * (5 + Math.floor(Math.random() * 3));
        rotationNeeded += extraSpins;

        rotateValue += rotationNeeded;
        wheel.style.transform = `rotate(${rotateValue}deg)`;

        setTimeout(() => {
            btnSpin.disabled = false;

            // Handle Result
            if (prize.type === 'win') {
                const amount = prize.value;
                resultDiv.innerHTML = `🎉 You Won <i class="fa-solid fa-indian-rupee-sign"></i>${amount}!`;
                resultDiv.style.color = 'var(--success)';

                if (auth.currentUser) {
                    btnSpin.innerText = 'Adding to Wallet...';
                    btnSpin.disabled = true;

                    const uid = auth.currentUser.uid;
                    const userRef = ref(database, 'users/' + uid);

                    // Update balance transactionally
                    runTransaction(child(userRef, 'balance'), (currentBalance) => {
                        return (parseFloat(currentBalance) || 0) + amount;
                    }).then(() => {
                        // Increment spins_used
                        const spinRef = child(userRef, 'spins_used');
                        runTransaction(spinRef, (currentSpins) => {
                            return (currentSpins || 0) + 1;
                        });

                        // Record transaction
                        const txnId = 'SPIN' + Date.now();
                        set(ref(database, 'transactions/' + txnId), {
                            id: txnId,
                            userId: uid,
                            type: 'Spin Win',
                            amount: amount,
                            status: 'Completed',
                            timestamp: Date.now(),
                            description: `Won ₹${amount} in Lucky Spin`
                        });

                        btnSpin.innerText = 'SPIN AGAIN';
                        btnSpin.disabled = false;
                        showModal('🎉 Congratulations!', `You won ₹${amount}! It has been added to your wallet.`, 'success');
                        checkSpinEligibility(); // Refresh spins count
                    }).catch((error) => {
                        console.error("Spin Update Error:", error);
                        btnSpin.innerText = 'SPIN AGAIN';
                        btnSpin.disabled = false;
                        showModal('Error', 'Failed to update wallet balance. Please contact support.', 'error');
                    });
                } else {
                    btnSpin.innerText = 'Login to Claim';
                    showModal('Login Required', 'Please login to claim your reward!', 'error');
                }

            } else if (prize.type === 'respin') {
                resultDiv.innerText = "🔄 Respin! Spin again for free.";
                resultDiv.style.color = 'var(--accent-start)';
                btnSpin.innerText = 'SPIN NOW';
                // Auto-shake button to encourage click
                btnSpin.classList.add('animate-pulse');
                setTimeout(() => btnSpin.classList.remove('animate-pulse'), 1000);
                // Don't increment spins_used for respin
                checkSpinEligibility();
            } else {
                resultDiv.innerText = "😢 Better luck next time!";
                resultDiv.style.color = 'var(--text-muted)';
                btnSpin.innerText = 'TRY AGAIN';

                // Increment spins_used for loss
                if (auth.currentUser) {
                    const uid = auth.currentUser.uid;
                    const spinRef = ref(database, 'users/' + uid + '/spins_used');
                    runTransaction(spinRef, (currentSpins) => {
                        return (currentSpins || 0) + 1;
                    }).then(() => {
                        checkSpinEligibility();
                    });
                }
            }

            resultDiv.classList.remove('hidden');
        }, 4100); // 4s transition + 100ms buffer
    });
}


// 4. Newbie Task Logic
const taskModal = document.getElementById('task-modal');
const btnViewTasks = document.getElementById('btn-view-tasks');
const closeTaskBtn = document.getElementById('close-task');
const btnClaimReward = document.getElementById('btn-claim-reward');
const taskProgressBar = document.getElementById('task-progress-bar');
const taskCountSpan = document.getElementById('task-count');
const taskButtons = document.querySelectorAll('.btn-task-action');

let completedTasks = 0;
const totalTasks = 4;

// Toggle Task Modal
btnViewTasks.addEventListener('click', () => {
    taskModal.classList.remove('hidden');
    checkNewbieTaskStatus();
});

closeTaskBtn.addEventListener('click', () => {
    taskModal.classList.add('hidden');
});

taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) {
        taskModal.classList.add('hidden');
    }
});

// 1. Static Event Listeners for Task Buttons
document.querySelectorAll('.btn-task-action').forEach(btn => {
    // We'll use a clean listener management
    btn.onclick = (e) => {
        const btnElement = e.currentTarget;
        const taskId = btnElement.getAttribute('data-task');

        if (btnElement.classList.contains('task-completed')) return;

        if (!auth.currentUser) {
            showModal('Login Required', 'Please login to perform this task.', 'error');
            return;
        }

        if (taskId === '1') {
            handleMobileVerification(btnElement);
        } else if (taskId === '2') {
            // Task 2: Starter Deposit
            taskModal.classList.add('hidden');
            const investNav = document.querySelector('.nav-item[data-target="deposit-section"]');
            if (investNav) investNav.click();
        } else if (taskId === '3') {
            // Task 3: VIP Invest
            taskModal.classList.add('hidden');
            const investNav = document.querySelector('.nav-item[data-target="deposit-section"]');
            if (investNav) investNav.click();
        } else if (taskId === '4') {
            // Task 4: Make a Referral
            taskModal.classList.add('hidden');
            const teamNav = document.querySelector('.nav-item[data-target="teams-section"]');
            if (teamNav) teamNav.click();
        }
    };
});

function checkNewbieTaskStatus() {
    if (!auth.currentUser) return;

    // Reset - we will recalculate in updateTaskProgress based on classes
    completedTasks = 0;

    const userRef = ref(database, 'users/' + auth.currentUser.uid);
    get(userRef).then((snapshot) => {
        if (snapshot.exists()) {
            const userData = snapshot.val();

            if (userData.newbie_reward_claimed) {
                const btnVT = document.getElementById('btn-view-tasks');
                const btnCR = document.getElementById('btn-claim-reward');
                if (btnVT) btnVT.classList.add('hidden');
                if (btnCR) {
                    btnCR.classList.remove('hidden');
                    btnCR.innerText = 'Claimed';
                    btnCR.disabled = true;
                }
                const tpBar = document.getElementById('task-progress-bar');
                const tpCount = document.getElementById('task-count');
                if (tpBar) tpBar.style.width = '100%';
                if (tpCount) tpCount.innerText = '3';
                return; // already claimed, no need to check further
            }

            // Task 1: Mobile Verification
            const btnTask1 = document.querySelector('.btn-task-action[data-task="1"]');
            if (userData.phone_verified) {
                markTaskAsDone(btnTask1, 'Verified');
            } else {
                markTaskAsPending(btnTask1, 'Verify');
            }

            // Task 2: Starter Deposit (100+)
            const btnTask2 = document.querySelector('.btn-task-action[data-task="2"]');
            const hasDeposited = (userData.total_deposited >= 100) || (userData.investment_count >= 1);
            if (hasDeposited) {
                markTaskAsDone(btnTask2, 'Done');
            } else {
                markTaskAsPending(btnTask2, 'Deposit');
            }

            // Task 3: VIP Invest (5000+)
            const btnTask3 = document.querySelector('.btn-task-action[data-task="3"]');
            const hasInvestedVIP = (userData.total_invested >= 5000) || (userData.investment_count >= 25);
            if (hasInvestedVIP) {
                markTaskAsDone(btnTask3, 'Completed');
            } else {
                markTaskAsPending(btnTask3, 'Invest');
            }

            // Task 4: Make a Referral
            const btnTask4 = document.querySelector('.btn-task-action[data-task="4"]');
            
            // We need to check if user has at least 1 referral
            const usersRefBranch = ref(database, 'users');
            const qRef = query(usersRefBranch, orderByChild('referred_by'), equalTo(userData.referral_id));
            get(qRef).then((refSnap) => {
                if (refSnap.exists() && Object.keys(refSnap.val()).length >= 1) {
                    markTaskAsDone(btnTask4, 'Referred');
                } else {
                    markTaskAsPending(btnTask4, 'Refer');
                }
            });
        }
    });
}

function handleTelegramJoin(btnElement) {
    window.open('https://t.me/walletproofficial', '_blank');

    // Optimistic UI update + Database Update
    setTimeout(() => {
        if (auth.currentUser) {
            update(ref(database, 'users/' + auth.currentUser.uid), { telegram_joined: true })
                .then(() => {
                    markTaskAsDone(btnElement, 'Joined');
                    checkNewbieTaskStatus(); // Re-trigger check to update progress bar
                });
        }
    }, 1000);
}

function markTaskAsDone(btn, text) {
    if (!btn) return;
    btn.innerText = text;
    if (!btn.classList.contains('task-completed')) {
        btn.classList.add('task-completed');
    }
    btn.disabled = true;

    // Style for done state
    btn.style.color = 'var(--success)';
    btn.style.borderColor = 'var(--success)';
    btn.style.background = 'rgba(0, 200, 83, 0.1)';

    updateTaskProgress();
}

function markTaskAsPending(btn, text) {
    if (!btn) return;
    btn.innerText = text;
    btn.classList.remove('task-completed');
    btn.disabled = false;

    // Style for pending state
    btn.style.color = 'white';
    btn.style.borderColor = 'rgba(255,255,255,0.2)';
    btn.style.background = 'transparent';
}

// Mobile Verification Modal Logic
const verifyMobileModal = document.getElementById('verify-mobile-modal');
const closeVerifyMobileBtn = document.getElementById('close-verify-mobile');
const mobileInputField = document.getElementById('mobile-input-field');
const btnSubmitMobile = document.getElementById('btn-submit-mobile');
let pendingMobileVerifyBtn = null; // To store which button to update on success

if (closeVerifyMobileBtn && verifyMobileModal) {
    closeVerifyMobileBtn.addEventListener('click', () => verifyMobileModal.classList.add('hidden'));
    verifyMobileModal.addEventListener('click', (e) => {
        if (e.target === verifyMobileModal) verifyMobileModal.classList.add('hidden');
    });
}

function handleMobileVerification(btnElement) {
    pendingMobileVerifyBtn = btnElement;
    if (verifyMobileModal) {
        verifyMobileModal.classList.remove('hidden');
        if (mobileInputField) mobileInputField.value = ''; // clear previous
        if (mobileInputField) mobileInputField.focus();
    }
}

// Handle Submit Mobile
if (btnSubmitMobile && mobileInputField) {
    btnSubmitMobile.addEventListener('click', () => {
        const mobile = mobileInputField.value.trim();

        // Validation
        const phoneRegex = /^[6-9]\d{9}$/;
        if (!phoneRegex.test(mobile)) {
            alert('❌ Please enter a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9).');
            return;
        }

        if (auth.currentUser) {
            const originalText = btnSubmitMobile.innerText;
            btnSubmitMobile.innerText = "Verifying...";
            btnSubmitMobile.disabled = true;

            update(ref(database, 'users/' + auth.currentUser.uid), {
                mobile_number: mobile,
                phone_verified: true
            }).then(() => {
                verifyMobileModal.classList.add('hidden');
                showModal('Success', '✅ Mobile Number Verified!');

                // Update the task button UI
                if (pendingMobileVerifyBtn) {
                    markTaskAsDone(pendingMobileVerifyBtn, 'Verified');
                    checkNewbieTaskStatus(); // Re-sync
                }

                // Reset modal button
                btnSubmitMobile.innerText = "Verify Now";
                btnSubmitMobile.disabled = false;

            }).catch(err => {
                console.error(err);
                btnSubmitMobile.innerText = originalText;
                btnSubmitMobile.disabled = false;
                alert('Error: Verification failed. Please try again.');
            });
        } else {
            alert('Please login first.');
        }
    });
}

function updateTaskProgress() {
    const executed = document.querySelectorAll('.task-completed').length;
    completedTasks = executed;

    taskCountSpan.innerText = completedTasks;
    const percentage = (completedTasks / totalTasks) * 100;
    taskProgressBar.style.width = `${percentage}%`;

    // Check if all done
    if (completedTasks === totalTasks) {
        setTimeout(() => {
            taskModal.classList.add('hidden');
            btnViewTasks.classList.add('hidden');
            btnClaimReward.classList.remove('hidden');
            // Check if already claimed? user data check ideally.
        }, 1000);
    }
}

btnClaimReward.addEventListener('click', () => {
    if (!auth.currentUser) return;

    const userRef = ref(database, 'users/' + auth.currentUser.uid);
    // Add amount
    runTransaction(userRef, (user) => {
        if (user) {
            if (user.newbie_reward_claimed) return; // already claimed
            user.balance = (user.balance || 0) + 1000;
            user.newbie_reward_claimed = true;
        }
        return user;
    }).then(() => {
        showModal('Reward Claimed', '🎉 ₹1,000 Credited to your Wallet Pro!', 'success');
        btnClaimReward.innerText = 'Claimed';
        btnClaimReward.disabled = true;
    });
});

// 5. Banner Slider Logic
const bannerSlider = document.getElementById('banner-slider');
const dots = document.querySelectorAll('.dot');
let currentSlide = 0;
const totalSlides = 5;

function showSlide(index) {
    // Handle wrapping
    if (index >= totalSlides) index = 0;
    if (index < 0) index = totalSlides - 1;

    currentSlide = index;

    // Move slider
    bannerSlider.style.transform = `translateX(-${currentSlide * 100}%)`;

    // Update dots
    dots.forEach((dot, i) => {
        dot.style.opacity = i === currentSlide ? '1' : '0.5';
    });
}

// Auto Swipe
let slideInterval = setInterval(() => {
    showSlide(currentSlide + 1);
}, 2000);

// Pause on Interaction (Optional polish)
bannerSlider.addEventListener('mouseenter', () => clearInterval(slideInterval));
bannerSlider.addEventListener('mouseleave', () => {
    clearInterval(slideInterval);
    slideInterval = setInterval(() => {
        showSlide(currentSlide + 1);
    }, 2000);
});

// Manual Swipe (Touch)
let touchStartX = 0;
let touchEndX = 0;

bannerSlider.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    clearInterval(slideInterval);
}, { passive: true });

bannerSlider.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
    // Restart timer
    clearInterval(slideInterval);
    slideInterval = setInterval(() => {
        showSlide(currentSlide + 1);
    }, 3000);
}, { passive: true });

function handleSwipe() {
    if (touchEndX < touchStartX - 50) {
        // Swipe Left -> Next
        showSlide(currentSlide + 1);
    }
    if (touchEndX > touchStartX + 50) {
        // Swipe Right -> Prev
        showSlide(currentSlide - 1);
    }
}

// 6. QR Payment Modal Logic (Stock Investment) - REAL FIREBASE IMPLEMENTATION
const qrModal = document.getElementById('qr-modal');
const closeQrBtn = document.getElementById('close-qr');
const qrAmountDisplay = document.getElementById('qr-amount');
const qrStockName = document.getElementById('qr-stock-name');
const utrInput = document.getElementById('utr-input');
const btnConfirmPayment = document.getElementById('btn-confirm-payment');

// Open payment modal with given label and amount (for stock investment)
function openDepositModal(label, amount, customQrUrl, stockId) {
    if (!auth.currentUser) {
        showModal('Login Required', 'Please login to invest', 'error');
        return;
    }
    qrStockName.innerText = label;
    qrAmountDisplay.innerText = `₹${amount}`;
    utrInput.value = '';
    btnConfirmPayment.disabled = false;
    btnConfirmPayment.innerText = 'Submit UTR';
    qrStockName.style.color = '';
    qrStockName.style.fontSize = '';
    // Store stockId on modal for use during submission
    qrModal.dataset.currentStockId = stockId || '';

    // Set QR code
    const urlToUse = customQrUrl || window.globalScannerUrl || 'upi://pay?pa=walletpro@upi&pn=WalletPro';
    const qrImageElement = document.getElementById('payment-qr-image');
    if (qrImageElement) {
        if (urlToUse.startsWith('upi://')) {
            qrImageElement.src = "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(urlToUse);
        } else {
            qrImageElement.src = urlToUse;
        }
    }

    qrModal.classList.remove('hidden');
}

// Load investment stocks from Firebase and render (admin-created)
// LIVE UPDATE: This listener automatically updates all users when admin adds/updates/deletes stocks
const stocksContainer = document.getElementById('stocks-container');
const stocksLoadingEl = document.getElementById('stocks-loading');

// Track which stocks the current user has already claimed
window.userClaimedStocks = new Set();

// Listen to claimed stocks for current user and re-render whenever it changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        onValue(ref(database, 'users/' + user.uid + '/claimed_stocks'), (snap) => {
            window.userClaimedStocks = new Set(snap.exists() ? Object.keys(snap.val()) : []);
            // Re-render so claimed badges update live
            if (window.allLoadedStocks && window.allLoadedStocks.length > 0) {
                renderStockCards(window.allLoadedStocks);
            }
        });
    }
});

// Listen for Scanner / QR setup changes
window.globalScannerUrl = '';
onValue(ref(database, 'settings/scanner_url'), (snapshot) => {
    window.globalScannerUrl = snapshot.val();
});

if (stocksContainer) {
    // Real-time listener: triggers whenever admin changes stocks in Firebase
    window.allLoadedStocks = []; // Cache for filter use
    onValue(ref(database, 'investment_stocks'), (snapshot) => {
        const data = snapshot.val();
        window.allLoadedStocks = data ? Object.keys(data).map(id => ({ id, ...data[id] })) : [];

        // Remove loading indicator if present
        if (stocksLoadingEl && stocksLoadingEl.parentNode) {
            stocksLoadingEl.remove();
        }

        // Clear filter state when stocks reload
        const resultText = document.getElementById('filter-result-text');
        if (resultText) resultText.style.display = 'none';

        // Render all stocks using shared helper
        renderStockCards(window.allLoadedStocks);
    });

    // Event delegation
    stocksContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-invest-stock');
        if (!btn) return;
        const stockName = btn.getAttribute('data-stock');
        const stockPrice = btn.getAttribute('data-price');
        const stockQr = btn.getAttribute('data-qr');
        const stockId = btn.getAttribute('data-stockid');
        // Double-check claimed status before opening modal
        if (stockId && window.userClaimedStocks && window.userClaimedStocks.has(stockId)) {
            showModal('Already Claimed', '✅ You have already purchased this stock!', 'success');
            return;
        }
        if (stockName && stockPrice) openDepositModal(stockName, stockPrice, stockQr, stockId);
    });
}

// ---- Render stock cards helper ----
function renderStockCards(stocks) {
    const container = document.getElementById('stocks-container');
    if (!container) return;
    container.innerHTML = '';

    const sorted = [...stocks].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (sorted.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:var(--text-muted); padding:30px;"><i class="fa-solid fa-magnifying-glass" style="font-size:1.5rem; margin-bottom:10px; opacity:0.4; display:block;"></i><p>No stocks found in this price range.</p></div>';
        return;
    }

    sorted.forEach(s => {
        const price = parseFloat(s.price) || 0;
        const commission = parseFloat(s.commissionPercent) || 0;
        const totalReturn = price + (price * commission / 100);
        let iconCode = 'fa-chart-line';
        const cat = (s.category || '').toLowerCase();
        if (cat.includes('tech') || cat.includes('software')) iconCode = 'fa-microchip';
        else if (cat.includes('auto') || cat.includes('car')) iconCode = 'fa-car';
        else if (cat.includes('bank') || cat.includes('finance')) iconCode = 'fa-building-columns';
        else if (cat.includes('meta') || cat.includes('crypto')) iconCode = 'fa-coins';
        else if (cat.includes('energy') || cat.includes('power')) iconCode = 'fa-bolt';

        const card = document.createElement('div');
        card.className = 'stock-card';
        // Ultra-premium, enlarged horizontal layout
        card.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 22px 25px; margin-bottom: 15px; border-radius: 24px; background: linear-gradient(135deg, rgba(30,30,45,0.85), rgba(15,15,25,0.98)); border: 1.5px solid rgba(0, 230, 118, 0.2); box-shadow: 0 15px 45px rgba(0,0,0,0.5); gap: 20px; position: relative; overflow: hidden;';
        
        // Vibrant left-side accent
        const glow = document.createElement('div');
        glow.style.cssText = 'position: absolute; left: 0; top: 0; width: 6px; height: 100%; background: var(--accent-gradient); box-shadow: 4px 0 15px rgba(0,230,118,0.3);';
        card.appendChild(glow);

        const isClaimed = window.userClaimedStocks && window.userClaimedStocks.has(s.id);
        
        card.innerHTML += `
            <!-- Left: High Impact Branding -->
            <div style="display: flex; align-items: center; gap: 18px; flex: 2.2; min-width: 0;">
                <div style="width: 54px; height: 54px; background: rgba(0, 230, 118, 0.12); border: 1.5px solid rgba(0, 230, 118, 0.25); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: #00e676; flex-shrink: 0; box-shadow: 0 6px 20px rgba(0,230,118,0.15);">
                    <i class="fa-solid ${iconCode}" style="font-size: 1.6rem;"></i>
                </div>
                <div style="min-width: 0;">
                    <h4 style="margin: 0; font-size: 1.25rem; color: white; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.03em;">${(s.name || 'Stock').replace(/</g, '&lt;')}</h4>
                </div>
            </div>

            <!-- Middle: Financial Performance Hub -->
            <div style="flex: 3.5; display: flex; align-items: center; justify-content: space-around; gap: 12px; border-left: 1px solid rgba(255,255,255,0.08); padding-left: 20px;">
                <div style="text-align: center;">
                    <p style="margin: 0 0 5px 0; font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">Invest</p>
                    <span style="color: white; font-weight: 900; font-size: 1.15rem;">₹${price.toFixed(0)}</span>
                </div>
                <div style="text-align: center;">
                    <p style="margin: 0 0 5px 0; font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em;">Yield</p>
                    <span style="color: #00e676; font-weight: 900; font-size: 1.15rem;">+${commission.toFixed(0)}%</span>
                </div>
                <div style="text-align: center;">
                    <p style="margin: 0 0 4px 0; font-size: 0.65rem; color: #ffd700; text-transform: uppercase; font-weight: 900; letter-spacing: 0.05em; opacity: 0.8;">Profit Return</p>
                    <span style="color: #ffd700; font-weight: 900; font-size: 1.4rem; filter: drop-shadow(0 2px 5px rgba(255,215,0,0.25));">₹${totalReturn.toFixed(0)}</span>
                </div>
            </div>

            <!-- Right: Interactive Lead -->
            <div style="flex: 0 0 auto;">
                ${isClaimed
                    ? `<div style="width: 50px; height: 50px; border-radius: 14px; background: rgba(0,230,118,0.2); color: #00e676; display: flex; align-items: center; justify-content: center; border: 1.5px solid rgba(0,230,118,0.4); box-shadow: inset 0 0 10px rgba(0,230,118,0.1);">
                        <i class="fa-solid fa-circle-check" style="font-size: 1.6rem;"></i>
                       </div>`
                    : `<button class="btn-invest-stock" 
                        data-stock="${(s.name || 'Stock').replace(/"/g, '&quot;')}"
                        data-stockid="${s.id}"
                        data-price="${price.toFixed(2)}"
                        data-qr="${(s.qrUrl || '').replace(/"/g, '&quot;')}"
                        style="width: 50px; height: 50px; border-radius: 14px; background: var(--accent-gradient); color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 10px 25px rgba(0,230,118,0.4); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); transform-origin: center;">
                        <i class="fa-solid fa-chevron-right" style="font-size: 1.5rem;"></i>
                       </button>`
                }
            </div>
        `;
        container.appendChild(card);
    });
}

// ---- Stock Price Range Filter ----
function applyStockFilter() {
    const minInput = document.getElementById('filter-min-price').value;
    const maxInput = document.getElementById('filter-max-price').value;
    const minVal = minInput !== '' ? parseFloat(minInput) : NaN;
    const maxVal = maxInput !== '' ? parseFloat(maxInput) : NaN;
    const resultText = document.getElementById('filter-result-text');

    if (isNaN(minVal) && isNaN(maxVal)) {
        showModal('Filter', '⚠️ Please enter at least a Min or Max price to filter.', 'error');
        return;
    }
    if (!isNaN(minVal) && !isNaN(maxVal) && minVal > maxVal) {
        showModal('Filter', '⚠️ Min price cannot be greater than Max price.', 'error');
        return;
    }

    const stocks = window.allLoadedStocks || [];
    const filtered = stocks.filter(s => {
        const price = parseFloat(s.price) || 0;
        const aboveMin = isNaN(minVal) ? true : price >= minVal;
        const belowMax = isNaN(maxVal) ? true : price <= maxVal;
        return aboveMin && belowMax;
    });

    renderStockCards(filtered);

    if (resultText) {
        const minStr = !isNaN(minVal) ? `₹${minVal}` : '₹0';
        const maxStr = !isNaN(maxVal) ? `₹${maxVal}` : '∞';
        resultText.style.display = 'block';
        resultText.innerHTML = `<i class="fa-solid fa-filter" style="margin-right:4px;"></i> Showing <b style="color:white;">${filtered.length}</b> stock${filtered.length !== 1 ? 's' : ''} in range ${minStr} – ${maxStr}`;
    }
}

function clearStockFilter() {
    document.getElementById('filter-min-price').value = '';
    document.getElementById('filter-max-price').value = '';
    const resultText = document.getElementById('filter-result-text');
    if (resultText) resultText.style.display = 'none';
    renderStockCards(window.allLoadedStocks || []);
}

closeQrBtn.addEventListener('click', () => {
    qrModal.classList.add('hidden');
});


qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) {
        qrModal.classList.add('hidden');
    }
});

// Handle Payment Submission with Image Proof
btnConfirmPayment.addEventListener('click', () => {
    const utr = utrInput.value.trim();
    const fileInput = document.getElementById('proof-image-input');
    const file = fileInput && fileInput.files[0];

    // Get UI elements explicitly to avoid variable hoisting issues
    const stockNameElement = document.getElementById('qr-stock-name') || qrStockName;
    const amountElement = document.getElementById('qr-amount') || qrAmountDisplay;

    if (!utr) {
        showModal('Error', '⚠️ Please enter UTR number', 'error');
        return;
    }
    if (!file) {
        showModal('Error', '⚠️ Please upload payment screenshot', 'error');
        return;
    }

    if (!auth.currentUser) {
        showModal('Error', 'Please login first', 'error');
        return;
    }

    // Disable button and show processing state
    btnConfirmPayment.disabled = true;
    btnConfirmPayment.innerText = 'Compressing Proof...';

    // Compress and Convert Image
    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.src = e.target.result;
        img.onload = function () {
            // Resize logic (max 800px width)
            const MAX_WIDTH = 800;
            const scaleSize = Math.min(1, MAX_WIDTH / img.width);
            const canvas = document.createElement('canvas');
            canvas.width = img.width * scaleSize;
            canvas.height = img.height * scaleSize;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Get compressed Base64
            const proofImageBase64 = canvas.toDataURL("image/jpeg", 0.7);

            submitTransaction(utr, proofImageBase64);
        };
        img.onerror = function () {
            showModal('Error', 'Failed to process image', 'error');
            btnConfirmPayment.disabled = false;
            btnConfirmPayment.innerText = 'Submit UTR';
        };
    };
    reader.onerror = function () {
        showModal('Error', 'Failed to read file', 'error');
        btnConfirmPayment.disabled = false;
        btnConfirmPayment.innerText = 'Submit UTR';
    };
    reader.readAsDataURL(file);

    function submitTransaction(utr, proofImage) {
        btnConfirmPayment.innerText = 'Initiating Secure Transaction...';

        const stockName = stockNameElement.innerText;
        // Handle price parsing carefully (remove currency symbol)
        const stockPrice = parseFloat(amountElement.innerText.replace(/[^\d.]/g, ''));

        // Update modal UI
        stockNameElement.innerText = '⏳ Verifying Investment...';
        stockNameElement.style.color = '#00c853';

        // Create IDs
        const transactionId = 'TXN' + Date.now();
        const userId = auth.currentUser.uid;
        const userEmail = auth.currentUser.email;
        const now = Date.now();
        const isoDate = new Date().toISOString();

        // Transaction Data
        const transactionData = {
            id: transactionId,
            userId: userId,
            email: userEmail,
            type: 'Investment',
            stockName: stockName,
            amount: stockPrice,
            utr: utr,
            proofImage: proofImage, // Store Base64
            status: 'Pending',
            timestamp: now,
            createdAt: isoDate
        };

        // Deposit Request Data (Admin View)
        const depositRequest = {
            id: transactionId,
            userId: userId,
            email: userEmail,
            amount: stockPrice,
            method: 'UPI',
            details: `UTR: ${utr} | ${stockName}`,
            proofImage: proofImage, // Same image
            status: 'Pending',
            timestamp: now,
            createdAt: isoDate
        };

        // Batch Updates manually via promise chain
        set(ref(database, 'transactions/' + transactionId), transactionData)
            .then(() => {
                return set(ref(database, 'deposits/' + transactionId), depositRequest);
            })
            .then(() => {
                // Mark stock as claimed for this user (so they cannot buy same stock again)
                const claimedStockId = qrModal.dataset.currentStockId;
                if (claimedStockId && auth.currentUser) {
                    set(ref(database, 'users/' + auth.currentUser.uid + '/claimed_stocks/' + claimedStockId), {
                        stockName: stockName,
                        claimedAt: isoDate
                    });
                }
            })
            .then(() => {
                // Success!
                // NOTE: We do NOT need to manually update the DOM here because the onValue listeners
                // in loadTransactionHistory will pick up the new transaction automatically!

                showModal('Investment Submitted!', `✅ Your investment request has been submitted successfully!\n\nTransaction ID: ${transactionId}\nUTR: ${utr}\n\nYour purchase will be verified shortly.`, 'success');

                // Close and Reset
                qrModal.classList.add('hidden');
                utrInput.value = '';
                fileInput.value = ''; // Reset file input

                btnConfirmPayment.disabled = false;
                btnConfirmPayment.innerText = 'Submit UTR';

                // Reset stock name display
                stockNameElement.innerText = stockName;
                stockNameElement.style.color = '';
            })
            .catch((error) => {
                console.error('Transaction Error:', error);
                showModal('Transaction Failed', '❌ Failed to save transaction. Please check your connection.', 'error');
                btnConfirmPayment.disabled = false;
                btnConfirmPayment.innerText = 'Submit UTR';
                stockNameElement.innerText = stockName; // Revert
                stockNameElement.style.color = '';
            });
    }
});



// 7. Manage Multiple UPI IDs
const btnAddUpi = document.getElementById('btn-add-upi');
const newUpiInput = document.getElementById('new-upi-input');
const upiListContainer = document.getElementById('upi-list');

// Array to store UPI IDs
let upiIds = [];

// Load UPI IDs from localStorage
function loadUpiIds() {
    const saved = localStorage.getItem('userUpiIds');
    if (saved) {
        try {
            upiIds = JSON.parse(saved);
        } catch (e) {
            upiIds = [];
        }
    }
    renderUpiList();
}

// Save UPI IDs to localStorage
function saveUpiIds() {
    localStorage.setItem('userUpiIds', JSON.stringify(upiIds));
}

// Render UPI list
function renderUpiList() {
    if (upiIds.length === 0) {
        upiListContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 10px;">No UPI IDs added yet.</p>';
        return;
    }

    upiListContainer.innerHTML = upiIds.map((upi, index) => `
            <div class="transaction-item" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 8px; margin-bottom: 8px;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; color: white;">${upi}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">UPI ID ${index + 1}</div>
                </div>
                <button class="btn-remove-upi" data-index="${index}" style="background: none; border: 1px solid var(--failed); color: var(--failed); padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; transition: all 0.2s;">
                    <i class="fa-solid fa-trash"></i> Remove
                </button>
            </div>
        `).join('');

    // Add event listeners to remove buttons
    document.querySelectorAll('.btn-remove-upi').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.getAttribute('data-index'));
            removeUpiId(index);
        });
    });
}

// Add new UPI ID
if (btnAddUpi && newUpiInput) {
    btnAddUpi.addEventListener('click', () => {
        const upiId = newUpiInput.value.trim();

        if (!upiId) {
            showModal('Input Required', '⚠️ Please enter a UPI ID', 'error');
            return;
        }

        // Basic UPI ID validation (should contain @ symbol)
        if (!upiId.includes('@')) {
            showModal('Invalid Format', '⚠️ Please enter a valid UPI ID (e.g., yourname@paytm)', 'error');
            return;
        }

        // Check if UPI ID already exists
        if (upiIds.includes(upiId)) {
            showModal('Duplicate', '⚠️ This UPI ID is already added', 'error');
            return;
        }

        // Add UPI ID to array
        upiIds.push(upiId);
        saveUpiIds();
        renderUpiList();

        // Clear input
        newUpiInput.value = '';

        // Show success message
        showModal('Success', `✅ UPI ID Added Successfully!\n\nUPI ID: ${upiId}`, 'success');

        // Visual feedback on button
        btnAddUpi.innerHTML = '<i class="fa-solid fa-check"></i> Added!';
        btnAddUpi.style.background = 'var(--success)';

        setTimeout(() => {
            btnAddUpi.innerHTML = '<i class="fa-solid fa-plus"></i> Add UPI ID';
            btnAddUpi.style.background = '';
        }, 1500);
    });
}

// Remove UPI ID
// Remove UPI ID
function removeUpiId(index) {
    // Direct removal
    upiIds.splice(index, 1);
    saveUpiIds();
    renderUpiList();
    // Optional: showModal('Removed', 'UPI ID removed.');
}

// Initialize on page load
loadUpiIds();


// 8. Teams Section Implementation - TAB SWITCHING
const teamTabs = document.querySelectorAll('.team-tab');
if (teamTabs.length > 0) {
    teamTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const level = tab.getAttribute('data-level');
            
            // Switch Active UI
            teamTabs.forEach(t => {
                t.classList.remove('active');
                t.style.background = 'transparent';
                t.style.color = 'var(--text-muted)';
            });
            tab.classList.add('active');
            tab.style.background = 'var(--accent-gradient)';
            tab.style.color = 'white';
            
            // Re-render list for this level
            if (window.renderReferralList) {
                window.renderReferralList(level);
            }
        });
    });
}

// Share Referral Link
const shareButtons = document.querySelectorAll('.btn-primary');
shareButtons.forEach(btn => {
    if (btn.textContent.includes('Share Link')) {
        btn.addEventListener('click', () => {
            const actualLinkCode = document.getElementById('primary-link-code');
            const referralLink = actualLinkCode ? 'https://' + actualLinkCode.textContent : 'https://walletpro.com/';
            const shareText = `Join Wallet Pro and start investing smartly! 🚀\n\nUse my referral link: ${referralLink}\n\nGet ₹1,000 welcome bonus on signup!`;

            // Check if Web Share API is available
            if (navigator.share) {
                navigator.share({
                    title: 'Join Wallet Pro',
                    text: shareText,
                    url: referralLink
                }).then(() => {
                    console.log('Shared successfully');
                }).catch((error) => {
                    console.log('Error sharing:', error);
                });
            } else {
                // Fallback - copy to clipboard
                navigator.clipboard.writeText(shareText).then(() => {
                    showModal('Copied', '✅ Referral message copied!', 'success');
                }).catch(() => {
                    showModal('Share Link', 'Link: ' + referralLink);
                });
            }
        });
    }
});


// Claim Referral Task Bonus Logic
let referralTaskListenerUnsubscribe = null;

function checkReferralTasks(myReferralCode) {
    if (!myReferralCode || myReferralCode === '---') return;
    if (referralTaskListenerUnsubscribe) return;
    referralTaskListenerUnsubscribe = true;

    const usersRef = ref(database, 'users');

    // To get all 3 levels, we'll fetch all users once (if the app is small enough)
    // or we'll do nested queries. For performance, we'll listen to the entire users branch
    // but only process what we need.
    onValue(usersRef, (snapshot) => {
        if (!snapshot.exists()) return;

        const allUsers = snapshot.val();
        const l1Users = [];
        const l2Users = [];
        const l3Users = [];

        // 1. Get Level 1
        Object.entries(allUsers).forEach(([uid, data]) => {
            if (data.referred_by === myReferralCode) {
                l1Users.push({ uid, code: data.referral_id, ...data });
            }
        });

        // 2. Get Level 2
        const l1Codes = l1Users.map(u => u.code);
        if (l1Codes.length > 0) {
            Object.entries(allUsers).forEach(([uid, data]) => {
                if (l1Codes.includes(data.referred_by)) {
                    l2Users.push({ uid, code: data.referral_id, ...data });
                }
            });
        }

        // 3. Get Level 3
        const l2Codes = l2Users.map(u => u.code);
        if (l2Codes.length > 0) {
            Object.entries(allUsers).forEach(([uid, data]) => {
                if (l2Codes.includes(data.referred_by)) {
                    l3Users.push({ uid, code: data.referral_id, ...data });
                }
            });
        }

        // Update UI Counts
        const l1CountEl = document.getElementById('team-l1-count');
        const l2CountEl = document.getElementById('team-l2-count');
        const l3CountEl = document.getElementById('team-l3-count');
        const totalSizeEl = document.getElementById('team-total-members');

        if (l1CountEl) l1CountEl.innerText = l1Users.length;
        if (l2CountEl) l2CountEl.innerText = l2Users.length;
        if (l3CountEl) l3CountEl.innerText = l3Users.length;
        if (totalSizeEl) totalSizeEl.innerText = (l1Users.length + l2Users.length + l3Users.length);

        // Referral Task - Qualified members (only L1 typically counts for the direct 200 reward)
        let qualifiedCount = l1Users.filter(u => (parseInt(u.investment_count) || 0) >= 10).length;
        const totalReferralsUI = document.getElementById('team-total-referrals');
        if (totalReferralsUI) totalReferralsUI.innerText = l1Users.length;

        const qualifiedText = document.getElementById('qualified-referrals-count');
        if (qualifiedText) qualifiedText.innerText = `${qualifiedCount} Users`;

        // Update Claimable Reward (Direct L1 Qualifiers)
        if (auth.currentUser) {
            const myData = allUsers[auth.currentUser.uid];
            if (myData) {
                const claimedAmount = parseFloat(myData.referral_task_claimed_amount) || 0;
                const totalEarnable = qualifiedCount * 200;
                const claimable = Math.max(0, totalEarnable - claimedAmount);

                const claimableDisplay = document.getElementById('claimable-referral-bonus');
                const btnClaim = document.getElementById('btn-claim-ref-bonus');

                if (claimableDisplay) claimableDisplay.innerText = `₹${claimable.toFixed(2)}`;

                if (btnClaim) {
                    if (claimable >= 200) {
                        btnClaim.disabled = false;
                        btnClaim.innerText = 'Claim Reward';
                        btnClaim.style.opacity = '1';
                        btnClaim.onclick = () => claimReferralReward(claimable);
                    } else {
                        btnClaim.disabled = true;
                        btnClaim.innerText = 'No Reward Yet';
                        btnClaim.style.opacity = '0.5';
                    }
                }
            }
        }

        // Update Cumulative Commission Stats from Transactions
        const txnRef = ref(database, 'transactions');
        const txnQuery = query(txnRef, orderByChild('userId'), equalTo(auth.currentUser.uid));
        onValue(txnQuery, (txnSnapshot) => {
            let totalComm = 0;
            let todayComm = 0;
            let weekComm = 0;
            const now = new Date();
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const startOfWeek = startOfToday - (7 * 24 * 60 * 60 * 1000);

            if (txnSnapshot.exists()) {
                txnSnapshot.forEach((childSnap) => {
                    const txn = childSnap.val();
                    if (txn.type === 'Commission' && txn.status === 'Approved') {
                        const amt = parseFloat(txn.amount) || 0;
                        totalComm += amt;
                        const txTime = parseInt(txn.timestamp) || 0;
                        if (txTime >= startOfToday) todayComm += amt;
                        if (txTime >= startOfWeek) weekComm += amt;
                    }
                });
            }

            const elTotal = document.getElementById('team-total-commission');
            const elToday = document.getElementById('team-today-commission');
            const elWeek = document.getElementById('team-week-commission');

            if (elTotal) elTotal.innerText = `₹${totalComm.toFixed(2)}`;
            if (elToday) elToday.innerText = `₹${todayComm.toFixed(2)}`;
            if (elWeek) elWeek.innerText = `₹${weekComm.toFixed(2)}`;
        });
    });
}

function claimReferralReward(amount) {
    if (!auth.currentUser || amount <= 0) return;

    const uid = auth.currentUser.uid;
    // We need to re-select the button because it might have been cloned/replaced
    const btn = document.getElementById('btn-claim-ref-bonus');

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Claiming...';
    }

    const userRef = ref(database, 'users/' + uid);

    runTransaction(userRef, (user) => {
        if (user) {
            user.balance = (parseFloat(user.balance) || 0) + amount;
            user.referral_task_claimed_amount = (parseFloat(user.referral_task_claimed_amount) || 0) + amount;
        }
        return user;
    }).then(() => {
        showModal('🎉 Success!', `Congratulations! ₹${amount} has been added to your wallet.`);
        // Listner loops will auto-update UI
    }).catch((err) => {
        console.error(err);
        showModal('Error', 'Failed to claim reward. Please try again.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Claim Reward';
        }
    });
}


// 9. Profile Section Implementation
// Edit Profile Modal Logic
const editProfileModal = document.getElementById('edit-profile-modal');
const btnEditProfile = document.getElementById('btn-edit-profile');
const closeEditProfile = document.getElementById('close-edit-profile');
const editProfileNameInput = document.getElementById('edit-profile-name');
const editProfilePicInput = document.getElementById('edit-profile-pic-input');
const editProfilePreview = document.getElementById('edit-profile-preview');
const editProfileIcon = document.getElementById('edit-profile-icon');
const btnSaveProfile = document.getElementById('btn-save-profile');

let newProfilePicBase64 = null;

if (btnEditProfile) {
    btnEditProfile.addEventListener('click', () => {
        if (!auth.currentUser) return;

        // Pre-fill data
        const currentName = document.querySelector('.profile-header h2').innerText;
        editProfileNameInput.value = currentName === "Wallet User" ? "" : currentName;

        // Reset image preview state
        newProfilePicBase64 = null;
        editProfilePicInput.value = ''; // clear input

        // Check if user has current profile pic to show in preview
        const profileImgDisplay = document.getElementById('profile-img-display');
        const hasCurrentImg = profileImgDisplay && !profileImgDisplay.classList.contains('hidden');

        if (hasCurrentImg) {
            editProfilePreview.src = profileImgDisplay.src;
            editProfilePreview.classList.remove('hidden');
            editProfileIcon.classList.add('hidden');
        } else {
            editProfilePreview.classList.add('hidden');
            editProfileIcon.classList.remove('hidden');
        }

        editProfileModal.classList.remove('hidden');
    });
}

if (closeEditProfile) {
    closeEditProfile.addEventListener('click', () => editProfileModal.classList.add('hidden'));
}
// click outside to close
if (editProfileModal) {
    editProfileModal.addEventListener('click', (e) => {
        if (e.target === editProfileModal) editProfileModal.classList.add('hidden');
    });
}

// Handle File Input Change
if (editProfilePicInput) {
    editProfilePicInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // processing...
        const reader = new FileReader();
        reader.onload = function (e) {
            // Compress/Resize logic
            const img = new Image();
            img.src = e.target.result;
            img.onload = function () {
                const MAX_WIDTH = 300; // Small size for avatar
                const scaleSize = Math.min(1, MAX_WIDTH / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = img.width * scaleSize;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                newProfilePicBase64 = canvas.toDataURL("image/jpeg", 0.7);

                // Show preview
                editProfilePreview.src = newProfilePicBase64;
                editProfilePreview.classList.remove('hidden');
                editProfileIcon.classList.add('hidden');
            }
        };
        reader.readAsDataURL(file);
    });
}

// Handle Save
if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', () => {
        const newName = editProfileNameInput.value.trim();
        if (!newName) {
            showModal('Error', 'Please enter your name', 'error');
            return;
        }

        if (!auth.currentUser) return;

        btnSaveProfile.disabled = true;
        btnSaveProfile.innerText = "Saving...";

        const updates = {};
        updates[`users/${auth.currentUser.uid}/name`] = newName;
        if (newProfilePicBase64) {
            updates[`users/${auth.currentUser.uid}/profile_pic`] = newProfilePicBase64;
        }

        update(ref(database), updates).then(() => {
            showModal('Success', '✅ Profile Updated Successfully!', 'success');
            editProfileModal.classList.add('hidden');
            btnSaveProfile.disabled = false;
            btnSaveProfile.innerText = "Save Changes";
            // UI will auto-update via onValue listener in fetchUserData
        }).catch(err => {
            console.error(err);
            showModal('Error', 'Failed to update profile.', 'error');
            btnSaveProfile.disabled = false;
            btnSaveProfile.innerText = "Save Changes";
        });
    });
}

// Contact Support Button
const contactSupportBtn = document.querySelector('.btn-primary');
if (contactSupportBtn && contactSupportBtn.innerHTML.includes('headset')) {
    contactSupportBtn.addEventListener('click', () => {
        alert('📞 Contact Support\n\nEmail: support@walletpro.com\nPhone: +91 1800-123-4567\n\nOur support team is available 24/7 to assist you!');
    });
}



// Transaction History Logic for Profile
let currentListenerUid = null; // Track current listener UID

function loadTransactionHistory(userId) {
    console.log('[TXN] loadTransactionHistory called for userId:', userId);

    // Static container now exists in HTML
    const txnContainer = document.getElementById('user-transaction-history');
    if (!txnContainer) {
        console.error('[TXN] Transaction container not found!');
        return;
    }

    if (currentListenerUid === userId) {
        console.log('[TXN] Listener already attached for this user, skipping.');
        return;
    }
    currentListenerUid = userId;

    // Set up real-time listener for transactions
    console.log('[TXN] Setting up transaction listener');

    // Fetch Transactions
    const txnsRef = ref(database, 'transactions');
    onValue(txnsRef, (snapshot) => {
        const data = snapshot.val();
        console.log('[TXN] Received transaction data:', data);
        txnContainer.innerHTML = ''; // Clear loading/existing

        if (!data) {
            console.log('[TXN] No transaction data found');
            txnContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 10px;">No transactions found.</p>';
            return;
        }

        // Filter for current user and convert to array
        const userTxns = Object.values(data)
            .filter(txn => txn.userId === userId || (auth.currentUser && txn.email === auth.currentUser.email))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); // Newest first

        console.log('[TXN] Filtered transactions for user:', userTxns.length, 'transactions');
        console.log('[TXN] User transactions:', userTxns);

        const txnHomeList = document.getElementById('transaction-list');

        if (userTxns.length === 0) {
            console.log('[TXN] No transactions found for this user');
            if (txnContainer) txnContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 10px;">No transactions found.</p>';

            if (txnHomeList) {
                txnHomeList.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 20px;">
                    <i class="fa-regular fa-clock" style="font-size: 1.5rem; margin-bottom: 10px; opacity: 0.5;"></i>
                    <p>No recent transactions</p>
                </div>`;
            }
            return;
        }

        // 1. Populate Profile List (Full History)
        if (txnContainer) {
            userTxns.forEach(txn => {
                txnContainer.appendChild(createTxnElement(txn));
            });
        }

        // 2. Populate Home List (Recent 5)
        if (txnHomeList) {
            txnHomeList.innerHTML = '';
            userTxns.slice(0, 5).forEach(txn => {
                txnHomeList.appendChild(createTxnElement(txn));
            });
        }

        // 3. Calculate Today's Profit
        const todayProfitEl = document.getElementById('today-profit');
        if (todayProfitEl) {
            const today = new Date().toLocaleDateString();
            let todayProfit = 0;
            
            userTxns.forEach(txn => {
                const txnDate = new Date(txn.timestamp || txn.createdAt || Date.now()).toLocaleDateString();
                // Filter for credits (Commission, Spin Win, Bonus) that occurred today and are completed/success
                const isCredit = txn.type === 'Spin Win' || txn.type === 'Bonus' || txn.type === 'Commission' || (txn.type === 'Investment' && txn.amount > 0);
                const isToday = txnDate === today;
                const isSuccessful = !txn.status || ['Approved', 'Completed', 'Success'].includes(txn.status);
                
                if (isCredit && isToday && isSuccessful) {
                    todayProfit += parseFloat(txn.amount || 0);
                }
            });
            
            todayProfitEl.textContent = `₹${todayProfit.toFixed(2)}`;
        }

        // 4. Calculate Total Invested & Total Withdrawal
        const totalInvEl = document.getElementById('total-invested-small');
        const totalWdEl = document.getElementById('total-withdrawals-small');
        
        let totalInvested = 0;
        let totalWithdrawn = 0;
        
        userTxns.forEach(txn => {
            const isSuccessful = !txn.status || ['Approved', 'Completed', 'Success'].includes(txn.status);
            
            if (txn.type === 'Investment' && isSuccessful) {
                // If amount is negative (debit) we take absolute for "Total Invested"
                totalInvested += Math.abs(parseFloat(txn.amount || 0));
            }
            
            if (txn.type === 'Withdrawal' && isSuccessful) {
                totalWithdrawn += Math.abs(parseFloat(txn.amount || 0));
            }
        });
        
        if (totalInvEl) totalInvEl.textContent = `₹${totalInvested.toFixed(2)}`;
        if (totalWdEl) totalWdEl.textContent = `₹${totalWithdrawn.toFixed(2)}`;
    });

    // 3. Populate Withdrawal History (Tools Section)
    const withdrawalListEl = document.getElementById('withdrawal-history-list');
    if (withdrawalListEl) {
        onValue(ref(database, 'withdrawals'), (snapshot) => {
            const data = snapshot.val();
            withdrawalListEl.innerHTML = '';
            
            if (!data) {
                withdrawalListEl.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 20px;">
                    <i class="fa-regular fa-clock" style="font-size: 1.5rem; margin-bottom: 10px; opacity: 0.5;"></i>
                    <p>No withdrawals yet</p>
                </div>`;
                return;
            }

            const userWithdrawals = Object.values(data)
                .filter(w => w.userId === userId || (auth.currentUser && w.email === auth.currentUser.email))
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            if (userWithdrawals.length === 0) {
                withdrawalListEl.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 20px;">
                    <i class="fa-regular fa-clock" style="font-size: 1.5rem; margin-bottom: 10px; opacity: 0.5;"></i>
                    <p>No withdrawals yet</p>
                </div>`;
                return;
            }

            userWithdrawals.forEach(w => {
                let statusColor = w.status === 'Approved' ? 'var(--success)' :
                                  w.status === 'Rejected' ? 'var(--danger-color)' : 'var(--accent-start)';
                
                const item = document.createElement('div');
                item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #333; background: rgba(255,255,255,0.02); margin-bottom: 5px; border-radius: 8px;';
                item.innerHTML = `
                    <div style="flex:1;">
                        <h4 style="margin:0; color:white; font-size: 1rem;">Auto Withdrawal</h4>
                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top:4px;">${new Date(w.timestamp).toLocaleDateString()}</div>
                        <div style="font-size: 0.75rem; color: #aaa; margin-top:2px;">${(w.details || '').substring(0,25)}...</div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 1.1rem; font-weight: bold; color: ${statusColor};">₹${parseFloat(w.amount || 0).toFixed(2)}</span>
                        <div style="font-size: 0.75rem; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 4px; border: 1px solid ${statusColor}; color: ${statusColor};">${w.status}</div>
                    </div>
                `;
                withdrawalListEl.appendChild(item);
            });
        });
    }
}

// Legacy logout and profile logic removed in favor of Supabase implementation.


// Global function for copy button
window.copyUserId = function () {
    const userId = document.getElementById('user-unique-id').textContent;
    navigator.clipboard.writeText(userId).then(() => {
        showModal('Copied', '✅ User ID copied!', 'success');
    }).catch(() => {
        showModal('User ID', userId);
    });
};

// Helper function to create transaction item HTML
function createTxnElement(txn) {
    const date = new Date(txn.timestamp || txn.createdAt || Date.now()).toLocaleDateString();

    // Status Logic
    let statusColor = 'var(--text-muted)';
    if (txn.status === 'Pending') statusColor = 'var(--pending)';
    else if (txn.status === 'Approved' || txn.status === 'Completed' || txn.status === 'Success') statusColor = 'var(--success)';
    else if (txn.status === 'Failed' || txn.status === 'Rejected') statusColor = 'var(--failed)';

    // Amount Color Logic
    const isCredit = txn.type === 'Spin Win' || txn.type === 'Bonus' || txn.type === 'Commission';
    const amountColor = isCredit ? 'var(--success)' : (txn.amount > 0 ? 'var(--text-main)' : 'var(--failed)');

    // Icon Logic
    let icon = 'fa-file-invoice-dollar';
    if (txn.type === 'Investment') icon = 'fa-arrow-trend-up';
    if (txn.type === 'Spin Win') icon = 'fa-gift';
    if (txn.type === 'Withdrawal') icon = 'fa-money-bill-transfer';
    if (txn.type === 'Deposit') icon = 'fa-wallet';
    if (txn.type === 'Commission') icon = 'fa-hand-holding-dollar';

    const item = document.createElement('div');
    item.className = 'transaction-item';
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.justifyContent = 'space-between';
    item.style.padding = '12px';
    item.style.marginBottom = '8px';
    item.style.background = 'rgba(255,255,255,0.03)';
    item.style.borderRadius = '8px';

    item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <div style="background: rgba(255, 255, 255, 0.05); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <i class="fa-solid ${icon}" style="color: var(--accent-start);"></i>
            </div>
            <div>
                <div style="font-weight: 600; font-size: 0.9rem;">${txn.type}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">${txn.stockName || txn.details || txn.description || date}</div>
                <div style="font-size: 0.7rem; color: ${statusColor}; font-weight: 500;">
                    ${txn.status || 'Completed'}
                </div>
            </div>
        </div>
        <div style="text-align: right;">
            <div style="font-weight: bold; color: ${amountColor};">₹${parseFloat(txn.amount || 0).toFixed(2)}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted);">${date}</div>
        </div>
    `;
    return item;
}
// End of Module

// 🌟 VIP System Logic
function setupVIPLogic(userData) {
    if (!userData) return;

    const vipBadge = document.getElementById('vip-badge-trigger');
    const vipLevelText = document.getElementById('vip-level-text');
    const vipModal = document.getElementById('vip-modal');
    const closeVipBtn = document.getElementById('close-vip');

    // VIP Thresholds
    const vipLevels = [
        { level: 0, min: 0, label: 'VIP 0', color: '#a0a0a0' },
        { level: 1, min: 5000, label: 'VIP 1', color: '#ffffff' },
        { level: 2, min: 25000, label: 'VIP 2', color: '#ffd700' },
        { level: 3, min: 100000, label: 'VIP 3', color: '#00c853' }
    ];

    // Calculate Level based on investment count/volume
    // Here we use balance as a proxy for "Total Investment" if investment_total isn't tracked separately
    // Ideally, we should track 'total_invested_amount' in DB. For now, let's use 'balance' + a heuristic or assume userData has field.
    // Let's assume userData.total_invested exists, if not default to 0. 
    // We can also check investment_count.

    // BETTER APPROACH: Calculate total investment from transaction history if strictly needed, 
    // but for UI responsiveness, let's use a field 'total_invested' which we should update on investment.
    // If it doesn't exist, we fallback to 0.
    const totalInvested = parseFloat(userData.total_invested || userData.balance || 0);

    let currentVIP = vipLevels[0];
    let nextVIP = vipLevels[1];

    for (let i = 0; i < vipLevels.length; i++) {
        if (totalInvested >= vipLevels[i].min) {
            currentVIP = vipLevels[i];
            nextVIP = vipLevels[i + 1] || null;
        }
    }

    // Auto-credit VIP 1 Reward
    if (currentVIP.level >= 1 && !userData.vip1_reward_claimed && auth.currentUser) {
        const uid = auth.currentUser.uid;
        const userRef = ref(database, 'users/' + uid);
        runTransaction(userRef, (user) => {
            if (user && !user.vip1_reward_claimed) {
                user.balance = (parseFloat(user.balance) || 0) + 200;
                user.vip1_reward_claimed = true;
            }
            return user;
        }).then((result) => {
            if (result.committed) {
                showModal('VIP Level Up!', '🎉 Congratulations on reaching VIP 1! A reward of ₹200 has been credited to your wallet.', 'success');
                const txnId = 'VIP1_' + Date.now();
                set(ref(database, 'transactions/' + txnId), {
                    id: txnId,
                    userId: uid,
                    email: auth.currentUser.email,
                    type: 'Bonus',
                    amount: 200,
                    status: 'Completed',
                    timestamp: Date.now(),
                    description: 'VIP 1 Level Up Reward',
                    createdAt: new Date().toISOString()
                });
            }
        }).catch(err => console.error(err));
    }

    // Auto-credit VIP 2 Reward
    if (currentVIP.level >= 2 && !userData.vip2_reward_claimed && auth.currentUser) {
        const uid = auth.currentUser.uid;
        const userRef = ref(database, 'users/' + uid);
        runTransaction(userRef, (user) => {
            if (user && !user.vip2_reward_claimed) {
                user.balance = (parseFloat(user.balance) || 0) + 2500;
                user.vip2_reward_claimed = true;
            }
            return user;
        }).then((result) => {
            if (result.committed) {
                showModal('VIP Level Up!', '🎉 Congratulations on reaching VIP 2! A reward of ₹2,500 has been credited to your wallet.', 'success');
                const txnId = 'VIP2_' + Date.now();
                set(ref(database, 'transactions/' + txnId), {
                    id: txnId,
                    userId: uid,
                    email: auth.currentUser.email,
                    type: 'Bonus',
                    amount: 2500,
                    status: 'Completed',
                    timestamp: Date.now(),
                    description: 'VIP 2 Level Up Reward',
                    createdAt: new Date().toISOString()
                });
            }
        }).catch(err => console.error(err));
    }

    // Auto-credit VIP 3 Reward
    if (currentVIP.level >= 3 && !userData.vip3_reward_claimed && auth.currentUser) {
        const uid = auth.currentUser.uid;
        const userRef = ref(database, 'users/' + uid);
        runTransaction(userRef, (user) => {
            if (user && !user.vip3_reward_claimed) {
                user.balance = (parseFloat(user.balance) || 0) + 10000;
                user.vip3_reward_claimed = true;
            }
            return user;
        }).then((result) => {
            if (result.committed) {
                showModal('VIP Level Up!', '🎉 Congratulations on reaching VIP 3! A reward of ₹10,000 has been credited to your wallet.', 'success');
                const txnId = 'VIP3_' + Date.now();
                set(ref(database, 'transactions/' + txnId), {
                    id: txnId,
                    userId: uid,
                    email: auth.currentUser.email,
                    type: 'Bonus',
                    amount: 10000,
                    status: 'Completed',
                    timestamp: Date.now(),
                    description: 'VIP 3 Level Up Reward',
                    createdAt: new Date().toISOString()
                });
            }
        }).catch(err => console.error(err));
    }

    // Update Badge UI
    if (vipLevelText) {
        vipLevelText.textContent = currentVIP.label;
        vipLevelText.style.color = currentVIP.color;
        // Icon color
        const icon = vipBadge.querySelector('i');
        if (icon) icon.style.color = currentVIP.color;
    }

    // Modal Logic
    if (vipBadge) {
        // Remove old listeners to prevent duplicates
        const newBadge = vipBadge.cloneNode(true);
        vipBadge.parentNode.replaceChild(newBadge, vipBadge);

        newBadge.addEventListener('click', () => {
            if (vipModal) {
                vipModal.classList.remove('hidden');
                updateVIPModalUI(totalInvested, currentVIP, nextVIP);
            }
        });
    }

    if (closeVipBtn) {
        closeVipBtn.addEventListener('click', () => vipModal.classList.add('hidden'));
    }

    if (vipModal) {
        vipModal.addEventListener('click', (e) => {
            if (e.target === vipModal) vipModal.classList.add('hidden');
        });
    }

    // Update VIP Page Elements (if they exist)
    updateVIPPage(totalInvested, currentVIP, nextVIP);
}

function updateVIPModalUI(currentAmount, currentVIP, nextVIP) {
    const investText = document.getElementById('vip-modal-investment');
    const progressBar = document.getElementById('vip-progress-bar-fill');
    const nextTargetText = document.getElementById('vip-next-target');

    if (investText) investText.textContent = `₹${currentAmount.toLocaleString()}`;

    // Highlight active card
    document.querySelectorAll('.vip-tier-card').forEach(card => card.classList.remove('active'));

    // Simple ID mapping
    // ID: vip-card-0 (VIP 1), vip-card-1 (VIP 2), vip-card-2 (VIP 3)
    // Current VIP Level 0 -> No card active or maybe implicit
    // Level 1 -> vip-card-0 active
    if (currentVIP.level > 0) {
        const activeCard = document.getElementById(`vip-card-${currentVIP.level - 1}`);
        if (activeCard) activeCard.classList.add('active');
    }

    // Progress Bar
    if (nextVIP) {
        // Range: currentVIP.min to nextVIP.min
        const range = nextVIP.min - currentVIP.min;
        const progress = currentAmount - currentVIP.min;
        const percent = Math.min(100, Math.max(0, (progress / range) * 100));

        if (progressBar) progressBar.style.width = `${percent}%`;
        if (nextTargetText) nextTargetText.textContent = `₹${nextVIP.min.toLocaleString()}`;
    } else {
        // Max Level
        if (progressBar) progressBar.style.width = '100%';
        if (nextTargetText) nextTargetText.textContent = 'Max Level Reached';
    }
}

// Update the full VIP Page
function updateVIPPage(currentAmount, currentVIP, nextVIP) {
    const pageInvest = document.getElementById('vip-page-investment');
    const pageProgress = document.getElementById('vip-page-progress-bar-fill');
    const pageNextTarget = document.getElementById('vip-page-next-target');
    const pageLevelText = document.getElementById('vip-page-level-text');
    const pagePercent = document.getElementById('vip-page-percent');

    if (pageInvest) pageInvest.textContent = `₹${currentAmount.toLocaleString()}`;
    if (pageLevelText) {
        pageLevelText.textContent = currentVIP.label;
        pageLevelText.style.color = currentVIP.color;
        // update icon color in badge
        const badge = pageLevelText.closest('.vip-badge');
        if (badge) {
            const icon = badge.querySelector('i');
            if (icon) icon.style.color = currentVIP.color;
        }
    }

    // Reset card styles
    const allPageCards = document.querySelectorAll('#vip-page-tiers-container .vip-tier-card');
    allPageCards.forEach(card => {
        card.classList.remove('active');
        const badge = card.querySelector('.status-badge');
        if (badge) {
            badge.textContent = 'Locked';
            badge.style.color = 'var(--text-muted)';
            badge.style.background = 'rgba(255,255,255,0.05)';
        }
    });

    // Mark current level as Active/Current
    const currentCard = document.getElementById(`vip-page-card-${currentVIP.level}`);
    if (currentCard) {
        currentCard.classList.add('active');
        const badge = currentCard.querySelector('.status-badge');
        if (badge) {
            badge.textContent = 'Current';
            badge.style.color = 'var(--success)';
            badge.style.background = 'rgba(0, 200, 83, 0.1)';
        }
    }

    // Mark previous levels as Unlocked
    for (let i = 0; i < currentVIP.level; i++) {
        const prevCard = document.getElementById(`vip-page-card-${i}`);
        if (prevCard) {
            const badge = prevCard.querySelector('.status-badge');
            if (badge) {
                badge.textContent = 'Unlocked';
                badge.style.color = 'var(--text-muted)';
                badge.style.background = 'rgba(255,255,255,0.1)';
            }
        }
    }

    // Progress Bar Logic
    if (nextVIP) {
        const range = nextVIP.min - currentVIP.min;
        const progress = currentAmount - currentVIP.min;
        const percent = Math.min(100, Math.max(0, (progress / range) * 100));

        if (pageProgress) pageProgress.style.width = `${percent}%`;
        if (pageNextTarget) pageNextTarget.textContent = `₹${nextVIP.min.toLocaleString()}`;
        if (pagePercent) pagePercent.textContent = `${Math.floor(percent)}%`;
    } else {
        if (pageProgress) pageProgress.style.width = '100%';
        if (pageNextTarget) pageNextTarget.textContent = 'Max Level';
        if (pagePercent) pagePercent.textContent = '100%';
    }
}




// ============================================================
// 🔔 NOTIFICATION SYSTEM
// ============================================================

let notifPanelOpen = false;

function toggleNotifPanel(event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById('notif-panel');
    const supportPanel = document.getElementById('support-panel');
    if (!panel) return;
    
    // Close support if open
    if (supportPanel) supportPanel.classList.add('hidden');
    supportPanelOpen = false;

    notifPanelOpen = !notifPanelOpen;
    if (notifPanelOpen) {
        panel.classList.remove('hidden');
        panel.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Lock background
    } else {
        panel.classList.add('hidden');
        document.body.style.overflow = ''; // Unlock background
    }
}
window.toggleNotifPanel = toggleNotifPanel;

// Close panels when clicking outside
document.addEventListener('click', (e) => {
    const nPanel = document.getElementById('notif-panel');
    const nBell = document.getElementById('notif-bell-btn');
    const sPanel = document.getElementById('support-panel');
    const sBtn = document.getElementById('support-btn');

    if (nPanel && nBell && !nPanel.contains(e.target) && !nBell.contains(e.target)) {
        nPanel.classList.add('hidden');
        notifPanelOpen = false;
    }
});

function renderNotifications(notifications) {
    const list = document.getElementById('notif-list');
    const empty = document.getElementById('notif-empty');
    const badge = document.getElementById('notif-badge');
    if (!list) return;

    // Remove old items (keep the empty placeholder)
    Array.from(list.children).forEach(c => { if (c.id !== 'notif-empty') c.remove(); });

    if (!notifications || notifications.length === 0) {
        if (empty) empty.style.display = 'block';
        if (badge) badge.style.display = 'none';
        return;
    }

    if (empty) empty.style.display = 'none';

    let unreadCount = 0;

    // Sort newest first
    const sorted = [...notifications].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    sorted.forEach(notif => {
        if (!notif.read) unreadCount++;

        const iconMap = {
            success: { icon: 'fa-circle-check', color: 'var(--success)' },
            error:   { icon: 'fa-circle-xmark', color: '#ff416c' },
            info:    { icon: 'fa-circle-info',  color: 'var(--accent-start)' },
            warning: { icon: 'fa-triangle-exclamation', color: '#ffd700' },
        };
        const style = iconMap[notif.type] || iconMap.info;

        const timeAgo = notif.timestamp ? getTimeAgo(notif.timestamp) : '';

        const item = document.createElement('div');
        item.style.cssText = `display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.05);background:${notif.read ? 'transparent' : 'rgba(0,200,83,0.07)'};cursor:pointer;transition:background 0.2s;`;
        item.innerHTML = `
            <div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px;">
                <i class="fa-solid ${style.icon}" style="color:${style.color};font-size:0.9rem;"></i>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="color:white;font-size:0.82rem;font-weight:${notif.read ? '400' : '600'};line-height:1.4;">${notif.message || 'New notification'}</div>
                <div style="color:var(--text-muted);font-size:0.72rem;margin-top:3px;">${timeAgo}</div>
            </div>
            ${!notif.read ? '<div style="width:7px;height:7px;border-radius:50%;background:#00c853;flex-shrink:0;margin-top:6px;"></div>' : ''}
        `;
        list.appendChild(item);
    });

    // Update badge
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

function markAllNotifsRead() {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    get(ref(database, 'notifications/' + uid)).then(snap => {
        if (!snap.exists()) return;
        const updates = {};
        snap.forEach(child => {
            updates[`notifications/${uid}/${child.key}/read`] = true;
        });
        update(ref(database), updates);
    });
}
window.markAllNotifsRead = markAllNotifsRead;


// ============================================================
// 🎧 CUSTOMER SUPPORT SYSTEM
// ============================================================

let supportPanelOpen = false;

function toggleSupportPanel(event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById('support-panel');
    const notifPanel = document.getElementById('notif-panel');
    if (!panel) return;
    
    // Close notifications if open
    if (notifPanel) notifPanel.classList.add('hidden');
    notifPanelOpen = false;

    supportPanelOpen = !supportPanelOpen;
    if (supportPanelOpen) {
        panel.classList.remove('hidden');
        panel.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Lock background
        // Mark as read when opening
        if (currentUser) {
            update(ref(database, `support_chats/${currentUser.uid}`), { unreadByUser: false });
        }
        // Scroll to bottom
        setTimeout(() => {
            const chatMessages = document.getElementById('support-chat-messages');
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
    } else {
        panel.classList.add('hidden');
        document.body.style.overflow = ''; // Unlock background
    }
}
window.toggleSupportPanel = toggleSupportPanel;

// Event listeners for support
const supportBtn = document.getElementById('support-btn');
const supportBtnHome = document.getElementById('support-btn-home');

if (supportBtn) {
    supportBtn.addEventListener('click', toggleSupportPanel);
}
if (supportBtnHome) {
    supportBtnHome.addEventListener('click', toggleSupportPanel);
}

const closeSupportBtn = document.getElementById('close-support-panel');
if (closeSupportBtn) {
    closeSupportBtn.addEventListener('click', () => {
        document.getElementById('support-panel').classList.add('hidden');
        document.body.style.overflow = ''; // Unlock background
        supportPanelOpen = false;
    });
}

const sendSupportBtn = document.getElementById('send-support-msg');
const supportInput = document.getElementById('support-input');
const supportFileBtn = document.getElementById('attach-support-file');
const supportFileInput = document.getElementById('support-file-input');

if (supportFileBtn && supportFileInput) {
    supportFileBtn.addEventListener('click', () => supportFileInput.click());
    supportFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) sendMessage('', file);
    });
}

if (sendSupportBtn && supportInput) {
    const handleSend = () => {
        const msg = supportInput.value.trim();
        if (msg) sendMessage(msg);
    };
    sendSupportBtn.addEventListener('click', handleSend);
    supportInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSend();
    });
}

function sendMessage(msg, file = null) {
    if (!currentUser) return;
    const chatId = currentUser.uid;
    const msgId = 'MSG' + Date.now();
    
    const sendData = (finalMsg, imageUrl = null) => {
        const messageData = {
            id: msgId,
            text: finalMsg,
            sender: 'user',
            timestamp: Date.now(),
            image: imageUrl
        };

        set(ref(database, `support_chats/${chatId}/messages/${msgId}`), messageData)
            .then(() => {
                supportInput.value = '';
                update(ref(database, `support_chats/${chatId}`), {
                    lastMessage: imageUrl ? '🖼️ [Image]' : finalMsg,
                    lastTimestamp: Date.now(),
                    unreadByAdmin: true,
                    userEmail: currentUser.email,
                    userId: currentUser.uid
                });

                // 🤖 Trigger AI Auto-reply
                if (!imageUrl && finalMsg) {
                    triggerAISupport(finalMsg, chatId);
                }
            });
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            // Compress image if needed
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600;
                const scale = Math.min(1, MAX_WIDTH / img.width);
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                sendData(msg, dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        sendData(msg);
    }
}

// 🤖 Smart AI Support Auto-reply Logic
function triggerAISupport(userMsg, chatId) {
    const msg = userMsg.toLowerCase();
    const typingIndicator = document.getElementById('support-typing-indicator');

    // Use a one-time greeting logic
    get(ref(database, `support_chats/${chatId}/greeted`)).then(snapshot => {
        const isGreeted = snapshot.exists() ? snapshot.val() : false;
        let aiResponse = "";

        if (!isGreeted) {
            // First time greeting
            aiResponse = "Hello! 👋 I am Maya, your dedicated customer support assistant for Wallet Pro.\n\nTo assist you better, could you please provide your User UID? You can copy it from your Profile section. How can I help you today?";
            // Mark as greeted so this only happens once
            update(ref(database, `support_chats/${chatId}`), { greeted: true });
        } else {
            // 🛑 High-Priority Problem Handling
            if (/\b\d{6}\b/.test(msg)) {
                aiResponse = "Thank you for sharing your ID! 🔍\n\nPlease wait for just 2 minutes while I verify your account details in our system. I am checking it right now, sir!";
            } else if (msg.includes('deposit') && (msg.includes('problem') || msg.includes('issue') || msg.includes('not showing') || msg.includes('not added') || msg.includes('failed'))) {
                aiResponse = "I'm sorry to hear you're having trouble with your deposit. 😔\n\nPlease send us a **screenshot of your payment proof** and your **12-digit UTR number** here in the chat. Our finance team will verify it and credit your balance manually as soon as possible!";
            } else if ((msg.includes('withdrawal') || msg.includes('payout')) && (msg.includes('problem') || msg.includes('issue') || msg.includes('pending') || msg.includes('not received') || msg.includes('failed'))) {
                aiResponse = "I understand you have a concern regarding your withdrawal. 💳\n\nPlease provide your **User ID (UID)** (which you can find in your Profile section). This will allow me to check the status of your withdrawal request in our system immediately!";
            } 
            // 💡 Standard Knowledge Base Rules
            else if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
                aiResponse = "Hello! I am your Smart Support AI. How can I help you grow your wealth today? 🚀";
            } else if (msg.includes('deposit') || msg.includes('add money') || msg.includes('invest')) {
                aiResponse = "To invest, go to the 'Invest' section, choose a stock package, and scan the QR code. Once you submit the UTR/Screenshot, our team will approve it within 5-10 minutes! ✅";
            } else if (msg.includes('withdraw') || msg.includes('payout') || msg.includes('money back')) {
                aiResponse = "Withdrawals are processed automatically! Once your investment period ends, the total amount (Capital + Profit) is sent directly to your primary UPI ID. Check your 'UPI' section for history. 💳";
            } else if (msg.includes('referral') || msg.includes('team') || msg.includes('invite')) {
                aiResponse = "Join our Referral program! You earn commissions from Level 1 (15%), Level 2 (5%), and Level 3 (2%). Share your link from the 'Teams' section to start earning! 👥";
            } else if (msg.includes('vip') || msg.includes('level') || msg.includes('upgrade')) {
                aiResponse = "VIP status is unlocked based on your total investment. Higher VIP levels get daily rewards, faster support, and exclusive high-return plans! Go to 'VIP Center' to see your progress. 👑";
            } else if (msg.includes('safe') || msg.includes('security') || msg.includes('trust')) {
                aiResponse = "Wallet Pro is 100% secure. We use bank-grade 256-bit encryption and never access your banking apps directly. Your funds and data are our top priority. 🛡️";
            } else if (msg.includes('bank freeze')) {
                aiResponse = "Rest assured, our payment system is fully compliant. Using Wallet Pro will NOT cause any bank freeze problems. All transactions are routed through secure legal gateways. ✅";
            } else {
                aiResponse = "I've logged your request. While I'm notifying a human agent to assist you, feel free to check our 'Quick Guides' on the Home page for instant answers! 💡";
            }
        }

        // Show typing, wait, then send
        if (typingIndicator) typingIndicator.classList.remove('hidden');

        setTimeout(() => {
            if (typingIndicator) typingIndicator.classList.add('hidden');

            const aiMsgId = 'AI' + Date.now();
            const aiMessageData = {
                id: aiMsgId,
                text: aiResponse,
                sender: 'admin', // AI speaks as admin/system
                isAI: true,
                timestamp: Date.now()
            };

            set(ref(database, `support_chats/${chatId}/messages/${aiMsgId}`), aiMessageData)
                .then(() => {
                    update(ref(database, `support_chats/${chatId}`), {
                        lastMessage: "🤖 AI: " + aiResponse,
                        lastTimestamp: Date.now(),
                        unreadByUser: true
                    });
                });
        }, 1500 + Math.random() * 1000); // Realistic typing delay
    });
}


function renderSupportMessages(messagesObj) {
    const chatContainer = document.getElementById('support-chat-messages');
    if (!chatContainer) return;

    chatContainer.innerHTML = '';
    
    if (!messagesObj) {
        chatContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 20px;">
                <i class="fa-solid fa-comments" style="font-size: 1.8rem; opacity: 0.3; display: block; margin-bottom: 8px;"></i>
                How can we help you today?
            </div>`;
        return;
    }

    const messages = Object.values(messagesObj).sort((a, b) => a.timestamp - b.timestamp);

    messages.forEach(msg => {
        const isUser = msg.sender === 'user';
        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = `
            max-width: 80%;
            padding: 8px 12px;
            border-radius: 12px;
            font-size: 0.85rem;
            line-height: 1.4;
            align-self: ${isUser ? 'flex-end' : 'flex-start'};
            background: ${isUser ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.1)'};
            color: white;
            border-bottom-${isUser ? 'right' : 'left'}-radius: 2px;
            ${!isUser ? 'border: 1px solid rgba(255,255,255,0.1);' : ''}
        `;
        
        let content = '';
        if (msg.image) {
            content += `<img src="${msg.image}" style="width: 100%; border-radius: 8px; margin-bottom: 5px; cursor: pointer;" onclick="window.open('${msg.image}', '_blank')">`;
        }
        if (msg.text) {
            content += `<div>${msg.text}</div>`;
        }
        
        msgDiv.innerHTML = content;
        chatContainer.appendChild(msgDiv);
    });

    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

// Global UI handler for notifications
window.showNotifInPanel = (list) => {
    renderNotifications(list);
};

// Listen for notifications and support for the logged-in user
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Notifications
        onValue(ref(database, 'notifications/' + user.uid), (snap) => {
            const data = snap.val();
            const list = data ? Object.values(data) : [];
            if (window.showNotifInPanel) window.showNotifInPanel(list);
        });

        // Support messages
        onValue(ref(database, `support_chats/${user.uid}/messages`), (snap) => {
            renderSupportMessages(snap.val());
        });

        // Support unread badge
        onValue(ref(database, `support_chats/${user.uid}/unreadByUser`), (snap) => {
            const hasUnread = snap.val();
            const badge = document.getElementById('support-badge');
            if (badge) {
                if (hasUnread) {
                    badge.style.display = 'flex';
                    badge.textContent = '1';
                } else {
                    badge.style.display = 'none';
                }
            }
        });
    }
});

// 📈 Advanced Invest Section Tab Logic
const tabMarket = document.getElementById('tab-market');
const tabPortfolio = document.getElementById('tab-portfolio');
const marketView = document.getElementById('invest-market-view');
const portfolioView = document.getElementById('invest-portfolio-view');

if (tabMarket && tabPortfolio) {
    tabMarket.addEventListener('click', () => {
        tabMarket.classList.add('active');
        tabMarket.style.background = 'rgba(255,255,255,0.1)';
        tabMarket.style.color = 'white';
        
        tabPortfolio.classList.remove('active');
        tabPortfolio.style.background = 'transparent';
        tabPortfolio.style.color = 'var(--text-muted)';
        
        marketView.classList.remove('hidden');
        portfolioView.classList.add('hidden');
    });

    tabPortfolio.addEventListener('click', () => {
        tabPortfolio.classList.add('active');
        tabPortfolio.style.background = 'rgba(255,255,255,0.1)';
        tabPortfolio.style.color = 'white';
        
        tabMarket.classList.remove('active');
        tabMarket.style.background = 'transparent';
        tabMarket.style.color = 'var(--text-muted)';
        
        portfolioView.classList.remove('hidden');
        marketView.classList.add('hidden');
        
        if (currentUser) renderUserPortfolio(currentUser.uid);
    });
}

function renderUserPortfolio(uid) {
    const listEl = document.getElementById('portfolio-investments-list');
    const totalActiveEl = document.getElementById('portfolio-total-active');
    const totalCommEl = document.getElementById('portfolio-total-commission');
    if (!listEl) return;

    onValue(ref(database, 'transactions'), (snap) => {
        const data = snap.val();
        if (!data) return;

        const myInvestments = Object.values(data).filter(t => t.userId === uid && t.type === 'Investment');
        
        if (myInvestments.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
                                    <i class="fa-solid fa-face-meh" style="font-size: 2.2rem; opacity: 0.2; display: block; margin-bottom: 12px;"></i>
                                    <p>No active investments found.</p>
                                </div>`;
            if (totalActiveEl) totalActiveEl.innerText = '₹0.00';
            if (totalCommEl) totalCommEl.innerText = '₹0.00';
            return;
        }

        listEl.innerHTML = '';
        let totalActive = 0;
        let totalComm = 0;

        myInvestments.sort((a,b) => b.timestamp - a.timestamp).forEach(inv => {
            const amount = parseFloat(inv.amount || 0);
            totalActive += amount;
            
            // Heuristic or actual commission from stock data if archived? 
            // For now, let's assume a generic commission if not saved in transaction
            const comm = amount * 0.15; // Placeholder Logic (15%)
            totalComm += comm;

            const item = document.createElement('div');
            item.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 15px; border-radius: 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;';
            item.innerHTML = `
                <div>
                    <h4 style="margin:0; color:white;">${inv.stockName || 'Active Asset'}</h4>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top:4px;">${new Date(inv.timestamp).toLocaleDateString()} • ${inv.id}</div>
                    <div style="font-size: 0.8rem; color: #ffca28; margin-top: 6px; font-weight: 600;"><i class="fa-solid fa-hand-holding-dollar"></i> Commission: ₹${comm.toFixed(2)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 800; color: white; font-size: 1.1rem;">₹${amount.toFixed(2)}</div>
                    <div style="font-size: 0.7rem; background: rgba(0,200,83,0.1); color: var(--success); padding: 2px 8px; border-radius: 4px; display: inline-block; margin-top: 5px; border: 1px solid rgba(0,200,83,0.3);">Active</div>
                </div>
            `;
            listEl.appendChild(item);
        });

        if (totalActiveEl) totalActiveEl.innerText = `₹${totalActive.toLocaleString()}`;
        if (totalCommEl) totalCommEl.innerText = `₹${totalComm.toLocaleString()}`;
    });
}
