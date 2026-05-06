const API_URL = 'https://ilisy-golf-and-country-club-enrollment.onrender.com/api';

let selectedDate = null;
let selectedTimeSlot = null;
let currentConversationId = null;
let pollingInterval = null;
let currentMembershipApplicationId = null;
let baseDate = new Date();
let lastMessageCount = 0;
let lastMessageTimestamp = null;

// ──────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────

function getAuthToken() {
    return localStorage.getItem('authToken');
}

function checkSession() {
    const token = getAuthToken();
    const userId = localStorage.getItem('userId');
    const loginTime = localStorage.getItem('loginTime');
    
    if (!token || !userId) {
        showToast('Session expired. Please login again.', 'error');
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 2000);
        return false;
    }
    
    if (loginTime) {
        const hoursSinceLogin = (Date.now() - parseInt(loginTime)) / (1000 * 60 * 60);
        if (hoursSinceLogin >= 24) {
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 2000);
            return false;
        }
    }
    
    return true;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function handleLogout() {
    localStorage.clear();
    if (pollingInterval) clearInterval(pollingInterval);
    showToast('Logged out successfully', 'success');
    setTimeout(() => {
        window.location.href = '../index.html';
    }, 1000);
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function scrollToSection(id) {
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
}

// ──────────────────────────────────────────────────────────────────
// Message Functions
// ──────────────────────────────────────────────────────────────────

function addMsg(text, type, isHistory = false) {
    const chatBody = document.getElementById('chatBody');
    const row = document.createElement('div');
    row.className = `msg-row ${type === 'sent' ? 'right' : ''}`;
    
    if (type === 'received') {
        row.innerHTML = `
            <div class="user-avatar">👤</div>
            <div class="msg-bubble received">${escapeHtml(text)}</div>
        `;
    } else {
        row.innerHTML = `
            <div class="msg-bubble sent">${escapeHtml(text)}</div>
            <div class="avatar-right">👤</div>
        `;
    }
    
    chatBody.appendChild(row);
    
    // Only auto-scroll if it's a new message (not history)
    if (!isHistory) {
        chatBody.scrollTop = chatBody.scrollHeight;
    }
}

async function sendMessage() {
    if (!checkSession()) return;
    
    const token = getAuthToken();
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    if (!text) return;
    
    addMsg(text, 'sent');
    input.value = '';
    
    try {
        let response;
        const existingConversationId = localStorage.getItem('currentConversationId');
        
        // Validate if the stored ID looks like a valid MongoDB ObjectId (24 chars)
        const isValidObjectId = existingConversationId && /^[0-9a-fA-F]{24}$/.test(existingConversationId);
        
        if (isValidObjectId) {
            console.log('Using existing conversation:', existingConversationId);
            response = await fetch(`${API_URL}/messages/followup/${existingConversationId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: text })
            });
        } else {
            console.log('Creating new conversation');
            response = await fetch(`${API_URL}/messages/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    userId: localStorage.getItem('userId'), 
                    userName: localStorage.getItem('userName') || 'Member', 
                    message: text, 
                    concernType: 'general' 
                })
            });
        }
        
        if (response.status === 401) {
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '../index.html', 2000);
            return;
        }
        
        const result = await response.json();
        
        if (result.concernId) {
            currentConversationId = result.concernId;
            localStorage.setItem('currentConversationId', currentConversationId);
            console.log('Conversation ID saved:', currentConversationId);
        }
        
        startPollingForResponses();
        
    } catch(e) { 
        console.error('Error sending message:', e);
        showToast('Error sending message. Please try again.', 'error');
    }
}


async function sendQuickReply(text) {
    if (!checkSession()) return;
    
    const token = getAuthToken();
    const quickReplies = document.getElementById('quickReplies');
    if (quickReplies) quickReplies.style.display = 'none';
    
    addMsg(text, 'sent');
    
    try {
        let response;
        const existingConversationId = localStorage.getItem('currentConversationId');
        
        // Validate if the stored ID looks like a valid MongoDB ObjectId (24 chars)
        const isValidObjectId = existingConversationId && /^[0-9a-fA-F]{24}$/.test(existingConversationId);
        
        if (isValidObjectId) {
            console.log('Using existing conversation for quick reply:', existingConversationId);
            response = await fetch(`${API_URL}/messages/followup/${existingConversationId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: text })
            });
        } else {
            console.log('Creating new conversation for quick reply');
            response = await fetch(`${API_URL}/messages/submit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    userId: localStorage.getItem('userId'), 
                    userName: localStorage.getItem('userName') || 'Member', 
                    message: text, 
                    concernType: 'general' 
                })
            });
        }
        
        if (response.status === 401) {
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '../index.html', 2000);
            return;
        }
        
        const result = await response.json();
        
        if (result.concernId) {
            currentConversationId = result.concernId;
            localStorage.setItem('currentConversationId', currentConversationId);
            console.log('Conversation ID saved:', currentConversationId);
        }
        
        startPollingForResponses();
        
    } catch(e) { 
        console.error('Error sending quick reply:', e);
        showToast('Error sending message. Please try again.', 'error');
    }
}

function startPollingForResponses() {
    if (pollingInterval) clearInterval(pollingInterval);
    // Poll every 3 seconds for faster response time
    pollingInterval = setInterval(checkForNewMessages, 3000);
}

async function checkForNewMessages() {
    if (!checkSession()) return;
    
    const token = getAuthToken();
    const userId = localStorage.getItem('userId');
    
    if (!userId) return;
    
    try {
        const response = await fetch(`${API_URL}/messages/user/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const conversations = await response.json();
            
            if (conversations.length > 0) {
                const latest = conversations[0];
                
                // Update conversation ID if needed
                if (!currentConversationId && latest._id) {
                    currentConversationId = latest._id;
                    localStorage.setItem('currentConversationId', currentConversationId);
                }
                
                // Check for new messages
                if (currentConversationId === latest._id) {
                    const conversation = latest.conversation || [];
                    const currentMessageCount = conversation.length;
                    
                    // Get the last message
                    if (conversation.length > 0) {
                        const lastMessage = conversation[conversation.length - 1];
                        const lastMessageId = `${lastMessage.timestamp}_${lastMessage.message}`;
                        
                        // Check if this is a new message from admin
                        if (lastMessage.sender === 'admin') {
                            const lastShown = localStorage.getItem(`last_shown_${latest._id}`);
                            
                            if (lastShown !== lastMessageId) {
                                // New message detected - show toast and add message
                                showToast(`New message from admin: "${lastMessage.message.substring(0, 50)}${lastMessage.message.length > 50 ? '...' : ''}"`, 'info');
                                addMsg(lastMessage.message, 'received');
                                localStorage.setItem(`last_shown_${latest._id}`, lastMessageId);
                                
                                // Play notification sound (optional - uncomment if you have a sound file)
                                // playNotificationSound();
                            }
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error checking for messages:', error);
    }
}

async function loadConversationHistory() {
    if (!checkSession()) return;
    
    const token = getAuthToken();
    const userId = localStorage.getItem('userId');
    
    if (!userId) return;
    
    try {
        const response = await fetch(`${API_URL}/messages/user/${userId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const conversations = await response.json();
            
            if (conversations.length > 0) {
                const latest = conversations[0];
                currentConversationId = latest._id;
                localStorage.setItem('currentConversationId', currentConversationId);
                
                const chatBody = document.getElementById('chatBody');
                chatBody.innerHTML = '';
                
                // Load all conversation history
                if (latest.conversation && latest.conversation.length > 0) {
                    latest.conversation.forEach(conv => {
                        const row = document.createElement('div');
                        row.className = `msg-row ${conv.sender === 'user' ? 'right' : ''}`;
                        if (conv.sender === 'admin') {
                            row.innerHTML = `
                                <div class="user-avatar">👤</div>
                                <div class="msg-bubble received">${escapeHtml(conv.message)}</div>
                            `;
                        } else {
                            row.innerHTML = `
                                <div class="msg-bubble sent">${escapeHtml(conv.message)}</div>
                                <div class="avatar-right">👤</div>
                            `;
                        }
                        chatBody.appendChild(row);
                    });
                    
                    // Mark last message as shown
                    const lastMessage = latest.conversation[latest.conversation.length - 1];
                    if (lastMessage) {
                        const lastMessageId = `${lastMessage.timestamp}_${lastMessage.message}`;
                        localStorage.setItem(`last_shown_${latest._id}`, lastMessageId);
                    }
                }
                
                // Add quick replies
                const quickRepliesDiv = document.createElement('div');
                quickRepliesDiv.className = 'quick-replies';
                quickRepliesDiv.id = 'quickReplies';
                quickRepliesDiv.innerHTML = `
                    <button class="quick-btn" onclick="sendQuickReply('I want to make a refund')">💰 I want to make a refund</button>
                    <button class="quick-btn" onclick="sendQuickReply('My payment did not process')">💳 My payment did not process</button>
                    <button class="quick-btn" onclick="sendQuickReply('I have an inquiry about my reservation')">📅 I have an inquiry about my reservation</button>
                `;
                chatBody.appendChild(quickRepliesDiv);
                chatBody.scrollTop = chatBody.scrollHeight;
            }
        }
    } catch (error) {
        console.error('Error loading conversation history:', error);
    }
}

async function manualRefreshMessages() {
    showToast('Refreshing messages...', 'info');
    await loadConversationHistory();
    showToast('Messages refreshed', 'success');
}

// ──────────────────────────────────────────────────────────────────
// Calendar Functions
// ──────────────────────────────────────────────────────────────────

function renderCal(containerId, titleId, date, booked, partial) {
    const grid = document.getElementById(containerId);
    const title = document.getElementById(titleId);
    if (!grid || !title) return;
    grid.innerHTML = '';
    title.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
    ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
        grid.innerHTML += `<div class="day-lbl">${d}</div>`;
    });
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date);
    for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="day-box empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        let cls = booked.includes(d) ? 'booked' : partial.includes(d) ? 'partial' : '';
        const click = cls !== 'booked' ? `openTimeModal(${d}, '${monthName}', ${date.getFullYear()})` : '';
        grid.innerHTML += `<div class="day-box ${cls}" onclick="${click}">${d}</div>`;
    }
}

function renderCalendars() {
    const next = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
    renderCal('cal1', 'cal1Title', baseDate, [15, 20], [5, 10]);
    renderCal('cal2', 'cal2Title', next, [], []);
}

function changeMonth(n) { 
    baseDate.setMonth(baseDate.getMonth() + n); 
    renderCalendars(); 
}

function openTimeModal(day, month, year) {
    selectedDate = `${year}-${String(baseDate.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    document.getElementById('modalTitle').textContent = `${month} ${day}, ${year}`;
    document.getElementById('timeModal').style.display = 'flex';
}

function confirmTimeSlot() {
    const slot1 = document.getElementById('modalSlot1');
    const slot2 = document.getElementById('modalSlot2');
    const slot3 = document.getElementById('modalSlot3');
    if (slot1.checked) selectedTimeSlot = slot1.value;
    else if (slot2.checked) selectedTimeSlot = slot2.value;
    else if (slot3.checked) selectedTimeSlot = slot3.value;
    if (selectedTimeSlot) {
        document.getElementById('timeModal').style.display = 'none';
        showToast(`Selected: ${selectedTimeSlot} on ${selectedDate}`, 'success');
    } else {
        alert('Please select a time slot');
    }
}

// ──────────────────────────────────────────────────────────────────
// Membership Functions
// ──────────────────────────────────────────────────────────────────

async function submitMembership() {
    if (!checkSession()) return;
    
    const token = getAuthToken();
    
    const firstName = document.getElementById('memFirstName').value.trim();
    const lastName = document.getElementById('memLastName').value.trim();
    const email = document.getElementById('memEmail').value.trim();
    const phone = document.getElementById('memPhone').value.trim();
    const gender = document.getElementById('memGender').value;
    const age = parseInt(document.getElementById('memAge').value) || 0;
    const address = document.getElementById('memAddress').value.trim();
    
    if (!firstName || !lastName || !email || !phone) { 
        alert('Please fill all required fields (First Name, Last Name, Email, Phone)'); 
        return; 
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    const phoneRegex = /^[0-9+\-\s]{7,15}$/;
    if (!phoneRegex.test(phone)) {
        alert('Please enter a valid phone number');
        return;
    }
    
    const data = {
        userId: localStorage.getItem('userId'),
        firstName: firstName,
        lastName: lastName,
        email: email,
        phone: phone,
        gender: gender,
        age: age,
        address: address
    };
    
    const applyBtn = event.target;
    const originalText = applyBtn.textContent;
    applyBtn.textContent = 'Submitting...';
    applyBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_URL}/membership/apply`, { 
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }, 
            body: JSON.stringify(data) 
        });
        
        if (response.status === 401) {
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '../index.html', 2000);
            return;
        }
        
        const result = await response.json();
        
        if (response.ok) { 
            currentMembershipApplicationId = result.applicationId;
            showToast('Membership application submitted successfully!', 'success');
            document.getElementById('membershipPopup').style.display = 'flex'; 
        } else {
            alert(result.message || 'Application failed');
        }
    } catch(e) { 
        console.error('Error:', e);
        alert('Connection error: ' + e.message); 
    } finally {
        applyBtn.textContent = originalText;
        applyBtn.disabled = false;
    }
}

function proceedToMembershipPayment() {
    document.getElementById('membershipPopup').style.display = 'none';
    document.getElementById('membershipPayment').style.display = 'block';
    document.getElementById('membershipPayment').scrollIntoView({ behavior: 'smooth' });
}

async function processMembershipPayment() {
    if (!checkSession()) return;
    
    if (!currentMembershipApplicationId) {
        alert('Please submit your membership application first.');
        return;
    }
    
    const token = getAuthToken();
    const method = document.querySelector('#membershipPayment .method-btn.active')?.textContent || 'GCash';
    const account = document.getElementById('paymentAccount').value.trim();
    
    if (!account && method !== 'Cash') {
        alert('Please enter account details');
        return;
    }
    
    const firstName = document.getElementById('memFirstName').value.trim();
    const lastName = document.getElementById('memLastName').value.trim();
    
    if (!firstName || !lastName) {
        alert('Please fill in your name in the membership form first');
        return;
    }
    
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'flex';
    
    try {
        const response = await fetch(`${API_URL}/membership/payment`, { 
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }, 
            body: JSON.stringify({ 
                userId: localStorage.getItem('userId'),
                applicationId: currentMembershipApplicationId,
                firstName: firstName, 
                lastName: lastName, 
                paymentMethod: method, 
                accountNumber: account, 
                amount: 1000000
            }) 
        });
        
        if (response.status === 401) {
            overlay.style.display = 'none';
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '../index.html', 2000);
            return;
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Payment failed');
        }
        
        setTimeout(() => {
            overlay.style.display = 'none';
            document.getElementById('successMsg').innerHTML = 'Your membership payment has been processed!<br><br>A receipt has been sent to your registered email address.<br><br>Transaction ID: ' + (result.transactionId || 'N/A');
            document.getElementById('successPopup').style.display = 'flex';
            currentMembershipApplicationId = null;
        }, 2000);
    } catch(e) { 
        overlay.style.display = 'none'; 
        alert('Payment failed: ' + e.message);
    }
}

// ──────────────────────────────────────────────────────────────────
// Reservation Functions
// ──────────────────────────────────────────────────────────────────

async function submitReservation() {
    if (!checkSession()) return;
    
    const token = getAuthToken();
    if (!selectedDate || !selectedTimeSlot) { 
        alert('Please select a date and time slot'); 
        return; 
    }
    
    const data = { 
        userId: localStorage.getItem('userId'), 
        firstName: document.getElementById('resFirstName').value.trim(), 
        lastName: document.getElementById('resLastName').value.trim(), 
        email: document.getElementById('resEmail').value.trim(), 
        phone: document.getElementById('resPhone').value.trim(), 
        date: selectedDate, 
        timeSlot: selectedTimeSlot 
    };
    
    if (!data.firstName || !data.lastName || !data.email || !data.phone) {
        alert('Please fill all personal details');
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
        alert('Please enter a valid email address');
        return;
    }
    
    const submitBtn = event.target;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_URL}/reservations/apply`, { 
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }, 
            body: JSON.stringify(data) 
        });
        
        if (response.status === 401) {
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '../index.html', 2000);
            return;
        }
        
        const result = await response.json();
        
        if (response.ok) { 
            localStorage.setItem('currentReservationApplicationId', result.applicationId);
            document.getElementById('reservationPayment').style.display = 'block'; 
            document.getElementById('reservationPayment').scrollIntoView({ behavior: 'smooth' });
            showToast('Reservation application submitted! Please proceed to payment.', 'success');
        } else {
            alert(result.message || 'Reservation failed');
        }
    } catch(e) { 
        console.error('Error:', e);
        alert('Connection error: ' + e.message); 
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

function pickMethod(btn) { 
    const row = btn.closest('.method-row'); 
    if(row) row.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active')); 
    btn.classList.add('active'); 
}

function selectTimeSlot() { 
    const slot1=document.getElementById('slot1'), slot2=document.getElementById('slot2'), slot3=document.getElementById('slot3'); 
    if(slot1.checked) selectedTimeSlot=slot1.value; 
    else if(slot2.checked) selectedTimeSlot=slot2.value; 
    else if(slot3.checked) selectedTimeSlot=slot3.value; 
    if(selectedTimeSlot) {
        showToast(`Selected: ${selectedTimeSlot}`, 'success');
    } else {
        alert('Please select a time slot');
    }
}

async function processReservationPayment() {
    if (!checkSession()) return;
    
    const token = getAuthToken();
    const method = document.querySelector('#reservationPayment .method-btn.active')?.textContent || 'GCash';
    const account = document.getElementById('resPaymentAccount').value.trim();
    const applicationId = localStorage.getItem('currentReservationApplicationId');
    
    if (!account && method !== 'Cash') {
        alert('Please enter account details');
        return;
    }
    
    if (!applicationId) {
        alert('No reservation application found. Please submit your reservation first.');
        return;
    }
    
    const firstName = document.getElementById('resFirstName').value.trim();
    const lastName = document.getElementById('resLastName').value.trim();
    
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'flex';
    
    try {
        const response = await fetch(`${API_URL}/reservations/payment/${applicationId}`, { 
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }, 
            body: JSON.stringify({ 
                userId: localStorage.getItem('userId'),
                firstName: firstName,
                lastName: lastName,
                paymentMethod: method, 
                accountNumber: account, 
                amount: 500
            }) 
        });
        
        if (response.status === 401) {
            overlay.style.display = 'none';
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '../index.html', 2000);
            return;
        }
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Payment failed');
        }
        
        setTimeout(() => {
            overlay.style.display = 'none';
            document.getElementById('successMsg').innerHTML = 'Your reservation payment has been processed!<br><br>A confirmation email with your receipt has been sent to your registered email address.<br><br>Reservation ID: ' + (result.reservationId || 'N/A');
            document.getElementById('successPopup').style.display = 'flex';
            localStorage.removeItem('currentReservationApplicationId');
        }, 2000);
    } catch(e) { 
        overlay.style.display = 'none'; 
        alert('Payment failed: ' + e.message);
    }
}

// ──────────────────────────────────────────────────────────────────
// Navigation & Initialization
// ──────────────────────────────────────────────────────────────────

const sections = ['home', 'membership', 'messages', 'reservation'];

window.addEventListener('scroll', () => {
    const nav = document.getElementById('mainNav');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 10);
    const scrollY = window.scrollY + 80;
    sections.forEach(id => {
        const el = document.getElementById(id);
        const navEl = document.getElementById('nav-' + id);
        if (!el || !navEl) return;
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        navEl.classList.toggle('active', scrollY >= top && scrollY < bottom);
    });
});

document.addEventListener('DOMContentLoaded', () => {
    if (!checkSession()) return;
    
    renderCalendars();
    loadConversationHistory();
    startPollingForResponses(); // Start auto-refresh
    
    const adminName = localStorage.getItem('userName') || 'Member';
    const navSpan = document.querySelector('.admin-text span');
    if (navSpan && navSpan.textContent === 'admin account name') {
        navSpan.textContent = adminName;
    }
    
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.addEventListener('click', e => {
            if (e.target === o) o.classList.remove('show');
        });
    });
    
    const msgInput = document.getElementById('msgInput');
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
    
    // Clean up polling on page unload
    window.addEventListener('beforeunload', () => {
        if (pollingInterval) clearInterval(pollingInterval);
    });
});

window.scrollToSection = scrollToSection;
window.sendMessage = sendMessage;
window.sendQuickReply = sendQuickReply;
window.submitMembership = submitMembership;
window.proceedToMembershipPayment = proceedToMembershipPayment;
window.processMembershipPayment = processMembershipPayment;
window.submitReservation = submitReservation;
window.pickMethod = pickMethod;
window.selectTimeSlot = selectTimeSlot;
window.processReservationPayment = processReservationPayment;
window.changeMonth = changeMonth;
window.confirmTimeSlot = confirmTimeSlot;
window.handleLogout = handleLogout;