const API_URL = 'https://ilisy-golf-and-country-club-enrollment.onrender.com/api';

let selectedDate = null;
let selectedTimeSlot = null;
let currentConversationId = null;
let pollingInterval = null;
let currentMembershipApplicationId = null;
let currentReservationApplicationId = null;
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
        const isValidObjectId = existingConversationId && /^[0-9a-fA-F]{24}$/.test(existingConversationId);
        
        if (isValidObjectId) {
            response = await fetch(`${API_URL}/messages/followup/${existingConversationId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: text })
            });
        } else {
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
        const isValidObjectId = existingConversationId && /^[0-9a-fA-F]{24}$/.test(existingConversationId);
        
        if (isValidObjectId) {
            response = await fetch(`${API_URL}/messages/followup/${existingConversationId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ message: text })
            });
        } else {
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
        }
        
        startPollingForResponses();
        
    } catch(e) { 
        console.error('Error sending quick reply:', e);
        showToast('Error sending message. Please try again.', 'error');
    }
}

function startPollingForResponses() {
    if (pollingInterval) clearInterval(pollingInterval);
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
                
                if (!currentConversationId && latest._id) {
                    currentConversationId = latest._id;
                    localStorage.setItem('currentConversationId', currentConversationId);
                }
                
                if (currentConversationId === latest._id) {
                    const conversation = latest.conversation || [];
                    
                    if (conversation.length > 0) {
                        const lastMessage = conversation[conversation.length - 1];
                        const lastMessageId = `${lastMessage.timestamp}_${lastMessage.message}`;
                        
                        if (lastMessage.sender === 'admin') {
                            const lastShown = localStorage.getItem(`last_shown_${latest._id}`);
                            
                            if (lastShown !== lastMessageId) {
                                showToast(`New message from admin`, 'info');
                                addMsg(lastMessage.message, 'received');
                                localStorage.setItem(`last_shown_${latest._id}`, lastMessageId);
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
                    
                    const lastMessage = latest.conversation[latest.conversation.length - 1];
                    if (lastMessage) {
                        const lastMessageId = `${lastMessage.timestamp}_${lastMessage.message}`;
                        localStorage.setItem(`last_shown_${latest._id}`, lastMessageId);
                    }
                }
                
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
        // Update the display on the reservation payment section
        const selectedDateDisplay = document.getElementById('selectedDateDisplay');
        const selectedTimeDisplay = document.getElementById('selectedTimeDisplay');
        const slotDateHeader = document.getElementById('slotDate');
        
        if (selectedDateDisplay) selectedDateDisplay.innerHTML = `Day of Reservation: <strong>${selectedDate}</strong>`;
        if (selectedTimeDisplay) selectedTimeDisplay.innerHTML = `Time of Reservation: <strong>${selectedTimeSlot}</strong>`;
        if (slotDateHeader) slotDateHeader.textContent = `${selectedDate}`;
        
        showToast(`Selected: ${selectedTimeSlot} on ${selectedDate}`, 'success');
    } else {
        alert('Please select a time slot');
    }
}

// ──────────────────────────────────────────────────────────────────
// Show Payment Form Functions
// ──────────────────────────────────────────────────────────────────

function showReservationPaymentForm() {
    // Validate date and time are selected
    if (!selectedDate || !selectedTimeSlot) {
        alert('Please select a date and time slot first');
        return false;
    }
    
    // Validate personal details
    const firstName = document.getElementById('resFirstName').value.trim();
    const lastName = document.getElementById('resLastName').value.trim();
    const email = document.getElementById('resEmail').value.trim();
    const phone = document.getElementById('resPhone').value.trim();
    
    if (!firstName || !lastName || !email || !phone) {
        alert('Please fill in all personal details first');
        return false;
    }
    
    // Show the payment form
    const paymentSection = document.getElementById('reservationPayment');
    if (paymentSection) {
        paymentSection.style.display = 'block';
        paymentSection.scrollIntoView({ behavior: 'smooth' });
        
        // Update displayed date and time
        const selectedDateDisplay = document.getElementById('selectedDateDisplay');
        const selectedTimeDisplay = document.getElementById('selectedTimeDisplay');
        const slotDateHeader = document.getElementById('slotDate');
        
        if (selectedDateDisplay) selectedDateDisplay.innerHTML = `Day of Reservation: <strong>${selectedDate}</strong>`;
        if (selectedTimeDisplay) selectedTimeDisplay.innerHTML = `Time of Reservation: <strong>${selectedTimeSlot}</strong>`;
        if (slotDateHeader) slotDateHeader.textContent = `${selectedDate}`;
        
        return true;
    }
    return false;
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
    
    // Get payment details
    const paymentMethod = document.querySelector('#membershipPayment .method-btn.active')?.textContent || 'GCash';
    const accountNumber = document.getElementById('paymentAccount').value.trim();
    const referenceNumber = document.getElementById('referenceNumber').value.trim();
    
    if (!firstName || !lastName || !email || !phone) { 
        alert('Please fill all required fields (First Name, Last Name, Email, Phone)'); 
        return; 
    }
    
    if (!accountNumber) {
        alert('Please enter your account number');
        return;
    }
    
    if (!referenceNumber) {
        alert('Please enter the reference/transaction ID from your payment');
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Please enter a valid email address');
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
        address: address,
        paymentMethod: paymentMethod,
        accountNumber: accountNumber,
        referenceNumber: referenceNumber,
        amount: 1000000
    };
    
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'flex';
    document.getElementById('processingMsg').textContent = 'Submitting your application...';
    
    try {
        const response = await fetch(`${API_URL}/membership/apply`, { 
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }, 
            body: JSON.stringify(data) 
        });
        
        const result = await response.json();
        
        if (response.status === 401) {
            overlay.style.display = 'none';
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '../index.html', 2000);
            return;
        }
        
        if (response.ok) { 
            currentMembershipApplicationId = result.applicationId;
            overlay.style.display = 'none';
            showToast('Application submitted! Admin will verify your payment.', 'success');
            document.getElementById('successMsg').innerHTML = 'Your membership application has been submitted.<br><br>Admin will verify your payment and activate your membership within 24-48 hours.<br><br>Application ID: ' + result.applicationId;
            document.getElementById('successPopup').style.display = 'flex';
            
            // Reset form
            document.getElementById('membershipPayment').style.display = 'none';
            document.getElementById('paymentAccount').value = '';
            document.getElementById('referenceNumber').value = '';
        } else {
            overlay.style.display = 'none';
            alert(result.message || 'Application failed');
        }
    } catch(e) { 
        overlay.style.display = 'none';
        console.error('Error:', e);
        alert('Connection error: ' + e.message); 
    }
}

function proceedToMembershipPayment() {
    document.getElementById('membershipPopup').style.display = 'none';
    document.getElementById('membershipPayment').style.display = 'block';
    document.getElementById('membershipPayment').scrollIntoView({ behavior: 'smooth' });
}

// ──────────────────────────────────────────────────────────────────
// Reservation Functions
// ──────────────────────────────────────────────────────────────────

async function submitReservation() {
    if (!checkSession()) return;
    
    const token = getAuthToken();
    
    // First, show the payment form to collect payment details
    const paymentFormShown = showReservationPaymentForm();
    if (!paymentFormShown) {
        return; // Payment form will show, user needs to fill it
    }
    
    // Now get payment details from the form
    const firstName = document.getElementById('resFirstName').value.trim();
    const lastName = document.getElementById('resLastName').value.trim();
    const email = document.getElementById('resEmail').value.trim();
    const phone = document.getElementById('resPhone').value.trim();
    const paymentMethod = document.querySelector('#reservationPayment .method-btn.active')?.textContent || 'GCash';
    const accountNumber = document.getElementById('resPaymentAccount').value.trim();
    const referenceNumber = document.getElementById('resReferenceNumber').value.trim();
    
    // Validate payment details
    if (!accountNumber) {
        alert('Please enter your account number');
        return;
    }
    
    if (!referenceNumber) {
        alert('Please enter the reference/transaction ID from your payment');
        return;
    }
    
    const data = { 
        userId: localStorage.getItem('userId'), 
        firstName: firstName, 
        lastName: lastName, 
        email: email, 
        phone: phone, 
        date: selectedDate, 
        timeSlot: selectedTimeSlot,
        paymentMethod: paymentMethod,
        accountNumber: accountNumber,
        referenceNumber: referenceNumber,
        amount: 500
    };
    
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'flex';
    document.getElementById('processingMsg').textContent = 'Submitting your reservation...';
    
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
            overlay.style.display = 'none';
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '../index.html', 2000);
            return;
        }
        
        const result = await response.json();
        
        if (response.ok) { 
            currentReservationApplicationId = result.applicationId;
            overlay.style.display = 'none';
            showToast('Reservation submitted! Admin will verify your payment.', 'success');
            document.getElementById('successMsg').innerHTML = 'Your reservation has been submitted.<br><br>Admin will verify your payment and confirm your reservation within 24-48 hours.<br><br>Reservation ID: ' + result.applicationId;
            document.getElementById('successPopup').style.display = 'flex';
            
            // Reset form
            document.getElementById('reservationPayment').style.display = 'none';
            document.getElementById('resPaymentAccount').value = '';
            document.getElementById('resReferenceNumber').value = '';
        } else {
            overlay.style.display = 'none';
            alert(result.message || 'Reservation failed');
        }
    } catch(e) { 
        overlay.style.display = 'none';
        console.error('Error:', e);
        alert('Connection error: ' + e.message); 
    }
}

function pickMethod(btn) { 
    const row = btn.closest('.method-row'); 
    if(row) row.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active')); 
    btn.classList.add('active'); 
}

function selectTimeSlot() { 
    const slot1 = document.getElementById('slot1'); 
    const slot2 = document.getElementById('slot2'); 
    const slot3 = document.getElementById('slot3'); 
    
    if(slot1.checked) selectedTimeSlot = slot1.value; 
    else if(slot2.checked) selectedTimeSlot = slot2.value; 
    else if(slot3.checked) selectedTimeSlot = slot3.value; 
    
    if(selectedTimeSlot) {
        showToast(`Selected: ${selectedTimeSlot}`, 'success');
    } else {
        alert('Please select a time slot');
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
    startPollingForResponses();
    
    const userName = localStorage.getItem('userName') || 'Member';
    const navSpan = document.querySelector('.admin-text span');
    if (navSpan && navSpan.textContent === 'admin account name') {
        navSpan.textContent = userName;
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
    
    window.addEventListener('beforeunload', () => {
        if (pollingInterval) clearInterval(pollingInterval);
    });
});

// Make functions global
window.scrollToSection = scrollToSection;
window.sendMessage = sendMessage;
window.sendQuickReply = sendQuickReply;
window.submitMembership = submitMembership;
window.proceedToMembershipPayment = proceedToMembershipPayment;
window.submitReservation = submitReservation;
window.pickMethod = pickMethod;
window.selectTimeSlot = selectTimeSlot;
window.changeMonth = changeMonth;
window.confirmTimeSlot = confirmTimeSlot;
window.handleLogout = handleLogout;