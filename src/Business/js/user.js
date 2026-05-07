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
// Member Rate Detection
// ──────────────────────────────────────────────────────────────────

function isUserMember() {
    const membershipStatus = localStorage.getItem('membershipStatus');
    return membershipStatus === 'active';
}

function getUserRateMultiplier() {
    // Member gets 20% discount (0.8), Non-member pays full price (1.0)
    return isUserMember() ? 0.8 : 1.0;
}

function getRateLabel() {
    return isUserMember() ? 'Member Rate (20% off)' : 'Guest Rate';
}


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

async function submitMembership(event) {
    if (event) event.preventDefault();
    
    // Check session
    if (!checkSession()) return;
    
    const token = getAuthToken();
    
    // Get personal details from the form
    const firstName = document.getElementById('memFirstName').value.trim();
    const lastName = document.getElementById('memLastName').value.trim();
    const email = document.getElementById('memEmail').value.trim();
    const phone = document.getElementById('memPhone').value.trim();
    const gender = document.getElementById('memGender').value;
    const age = parseInt(document.getElementById('memAge').value) || 0;
    const address = document.getElementById('memAddress').value.trim();
    
    // ========== NEW: Name Validation ==========
    const nameRegex = /^[A-Za-z\s\-']+$/;
    
    if (!firstName) {
        showToast('Please enter your first name.', 'error');
        return;
    }
    if (!nameRegex.test(firstName)) {
        showToast('First name contains invalid characters. Use letters, spaces, hyphens, or apostrophes only.', 'error');
        return;
    }
    if (firstName.length < 1) {
        showToast('First name must have at least 1 character.', 'error');
        return;
    }
    
    if (!lastName) {
        showToast('Please enter your last name.', 'error');
        return;
    }
    if (!nameRegex.test(lastName)) {
        showToast('Last name contains invalid characters. Use letters, spaces, hyphens, or apostrophes only.', 'error');
        return;
    }
    if (lastName.length < 1) {
        showToast('Last name must have at least 1 character.', 'error');
        return;
    }
    
    // Validate payment details
    if (!accountNumber) {
        showToast('Please enter your card number', 'error');
        return;
    }
    
    // Clean card number (remove spaces)
    const cleanCard = accountNumber.replace(/\s+/g, '');
    if (!/^\d{16}$/.test(cleanCard)) {
        showToast('Please enter a valid 16-digit card number', 'error');
        return;
    }
    
    if (!expiry || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
        showToast('Please enter valid expiration date (MM/YY)', 'error');
        return;
    }
    
    if (!cvc || !/^\d{3,4}$/.test(cvc)) {
        showToast('Please enter valid CVV code', 'error');
        return;
    }
    
    // Validate personal details
    if (!firstName || !lastName || !email || !phone) {
        showToast('Please fill in all personal details first', 'error');
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }
    
    const cleanPhone = phone.replace(/[\s-]/g, '');
    const phoneRegex = /^(09\d{9}|\+639\d{9})$/;
    if (!phoneRegex.test(cleanPhone)) {
        showToast('Please enter a valid 11-digit mobile number', 'error');
        return;
    }
    
    // Generate a reference number
    const referenceNumber = `MEM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const data = {
        userId: localStorage.getItem('userId'),
        firstName: firstName,
        lastName: lastName,
        email: email,
        phone: cleanPhone,
        gender: gender,
        age: age,
        address: address,
        paymentMethod: paymentMethod,
        accountNumber: cleanCard,
        referenceNumber: referenceNumber,
        amount: 1000000,
        cardExpiry: expiry,
        cardCvc: cvc
    };
    
    console.log('📤 Submitting membership application:', data);
    
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'flex';
    document.getElementById('processingMsg').textContent = 'Submitting your membership application...';
    
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
        console.log('📥 Server response:', response.status, result);
        
        if (response.status === 401) {
            overlay.style.display = 'none';
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => window.location.href = '../index.html', 2000);
            return;
        }
        
        if (response.ok) {
            overlay.style.display = 'none';
            showToast('✅ Membership application submitted! Admin will verify your payment.', 'success');
            console.log('✅ Application saved with ID:', result.applicationId);
            
            // Update receipt popup
            document.getElementById('receiptTracking').textContent = referenceNumber;
            document.getElementById('receiptName').textContent = firstName + ' ' + lastName;
            
            // Hide payment form and show receipt
            document.getElementById('membershipPayment').style.display = 'none';
            document.getElementById('receiptPopup').style.display = 'flex';
            
            // Reset form
            document.getElementById('paymentAccount').value = '';
            if (expiryInput) expiryInput.value = '';
            document.getElementById('cardCvc').value = '';
            
        } else {
            overlay.style.display = 'none';
            showToast(result.message || 'Application failed', 'error');
        }
    } catch (error) {
        overlay.style.display = 'none';
        console.error('❌ Error:', error);
        showToast('Connection error: ' + error.message, 'error');
    }
}

function proceedToMembershipPayment() {
    // 1. Grab all the values from the form
    const fName = document.getElementById('memFirstName').value.trim();
    const lName = document.getElementById('memLastName').value.trim();
    const gender = document.getElementById('memGender').value;
    const age = document.getElementById('memAge').value.trim();
    const email = document.getElementById('memEmail').value.trim();
    const address = document.getElementById('memAddress').value.trim();
    const phone = document.getElementById('memPhone').value.trim();

    const errorDiv = document.getElementById('memError');

    // Helper function to display errors
    const showError = (msg) => {
        if (errorDiv) {
            errorDiv.textContent = '⚠ ' + msg;
            errorDiv.style.display = 'block';
            setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
        } else {
            alert(msg);
        }
    };

    // 2. Check for empty fields
    if (!fName || !lName || !gender || !age || !email || !address || !phone) {
        return showError('Please fill out all required personal details.');
    }

    // 3. Validate Age
    if (isNaN(age) || parseInt(age) < 1) {
        return showError('Please enter a valid age.');
    }

    // 4. Validate Email Format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return showError('Please enter a valid email address (e.g., name@gmail.com).');
    }

    // 5. Validate Phone Number
    const cleanPhone = phone.replace(/[\s-]/g, '');
    const phoneRegex = /^(09\d{9}|\+639\d{9})$/;
    if (!phoneRegex.test(cleanPhone)) {
        return showError('Please enter a valid 11-digit mobile number (e.g., 09123456789).');
    }

    // 6. If all validation passes, hide errors and show the modern payment form
    if (errorDiv) errorDiv.style.display = 'none';
    
    // Hide the personal details form
    const personalDetailsCard = document.querySelector('#tab-membership .section-card');
    if (personalDetailsCard) {
        personalDetailsCard.style.display = 'none';
    }
    
    // Show the modern payment form
    document.getElementById('membershipPayment').style.display = 'block';
    
    // Scroll to the payment form
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

const sections = ['home', 'portal'];

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
    
    // Display username in navbar
    displayUserName();
    
    renderCalendars();
    loadConversationHistory();
    startPollingForResponses();
    loadReservationTypes();
    
    // Start membership status polling
    startMembershipStatusPolling();
    
    // ========== NEW: Membership Form Name Validation ==========
    const memFirstName = document.getElementById('memFirstName');
    const memLastName = document.getElementById('memLastName');
    
    // Name validation function
    function validateMemberName(input, errorSpanId, fieldName) {
        const nameValue = input.value.trim();
        const nameRegex = /^[A-Za-z\s\-']*$/; // letters, spaces, hyphens, apostrophes
        const errorSpan = document.getElementById(errorSpanId);
        
        if (!errorSpan) return false;
        
        if (nameValue && !nameRegex.test(nameValue)) {
            errorSpan.textContent = '✗ Only letters, spaces, hyphens, and apostrophes allowed';
            errorSpan.style.color = '#ff9999';
            input.style.border = '1px solid #ff9999';
            return false;
        } else if (nameValue && nameValue.length < 1) {
            errorSpan.textContent = `✗ ${fieldName} must have at least 1 character`;
            errorSpan.style.color = '#ff9999';
            input.style.border = '1px solid #ff9999';
            return false;
        } else if (nameValue && nameValue.length > 0) {
            errorSpan.textContent = '✓ Valid';
            errorSpan.style.color = '#90EE90';
            input.style.border = '1px solid #90EE90';
            return true;
        } else {
            errorSpan.textContent = '';
            input.style.border = '';
            return false;
        }
    }
    
    if (memFirstName) {
        memFirstName.addEventListener('input', () => {
            validateMemberName(memFirstName, 'memFirstNameError', 'First name');
        });
    }
    
    if (memLastName) {
        memLastName.addEventListener('input', () => {
            validateMemberName(memLastName, 'memLastNameError', 'Last name');
        });
    }
    
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.addEventListener('click', e => {
            if (e.target === o) o.classList.remove('show');
        });
    });
    
    const msgInput = document.getElementById('msgInput');
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
        });
    }
    
    window.addEventListener('beforeunload', () => {
        if (pollingInterval) clearInterval(pollingInterval);
        stopMembershipStatusPolling();
    });
});

// ──────────────────────────────────────────────────────────────────
// Dynamic Reservation System (Fetches from Admin API)
// ──────────────────────────────────────────────────────────────────

let availableReservationTypes = [];
let selectedReservationTypeData = null;
let dynamicSelectedDate = null;
let dynamicSelectedTime = null;
let dynamicCurrentMonth = new Date();
let dynamicTotalPrice = 0;
let dynamicReservationDetails = {};

async function loadReservationTypes() {
    try {
        const response = await fetch(`${API_URL}/reservation-types/active`);
        if (response.ok) {
            availableReservationTypes = await response.json();
            populateReservationTypeSelect();
        }
    } catch (error) {
        console.error('Error loading reservation types:', error);
    }
}

function populateReservationTypeSelect() {
    const select = document.getElementById('reservationTypeSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- Select Reservation Type --</option>';
    
    availableReservationTypes.forEach(type => {
        const option = document.createElement('option');
        option.value = type._id;
        option.textContent = `${type.icon || '📌'} ${type.name}`;
        select.appendChild(option);
    });
}

function onReservationTypeChange() {
    const typeId = document.getElementById('reservationTypeSelect').value;
    if (!typeId) return;
    
    selectedReservationTypeData = availableReservationTypes.find(t => t._id === typeId);
    if (!selectedReservationTypeData) return;
    
    renderDynamicOptions();
    document.getElementById('dateTimeSelection').style.display = 'block';
    document.getElementById('submitReservationBtn').style.display = 'none';
    document.getElementById('priceDisplay').style.display = 'none';
    
    dynamicSelectedDate = null;
    dynamicSelectedTime = null;
    document.getElementById('selectedDateTimeDisplay').innerHTML = '';
}

function renderDynamicOptions() {
    const container = document.getElementById('dynamicOptionsContainer');
    if (!container) return;
    
    let html = '<p class="sub-title">Select Options</p>';
    
    // Add rate type display (auto-detected, not selectable)
    html += `
        <div class="option-group">
            <label>Rate Type</label>
            <div style="background: var(--sage); padding: 10px; border-radius: 6px;">
                <strong>${getRateLabel()}</strong>
                ${isUserMember() ? '<span style="color: #28a745; margin-left: 10px;">✓ 20% discount applied</span>' : '<span style="color: #856404; margin-left: 10px;">🔒 Member discount available with membership</span>'}
            </div>
        </div>
    `;
    
    if (selectedReservationTypeData.options && selectedReservationTypeData.options.length > 0) {
        selectedReservationTypeData.options.forEach(option => {
            html += `
                <div class="option-group">
                    <label>${option.optionName}</label>
                    <select id="opt_${option.optionName.replace(/\s/g, '_')}" onchange="calculateDynamicPrice()">
            `;
            option.optionValues.forEach(val => {
                // Apply member discount to displayed price
                const displayPrice = Math.round(val.price * getUserRateMultiplier());
                html += `<option value="${val.value}" data-price="${val.price}" data-capacity="${val.capacity || 0}">
                    ${val.value} - ₱${displayPrice.toLocaleString()} ${!isUserMember() && val.price > 0 ? '(regular ₱' + val.price.toLocaleString() + ')' : ''}
                </option>`;
            });
            html += `</select></div>`;
        });
    }
    
    container.innerHTML = html;
    calculateDynamicPrice();
}

function calculateDynamicPrice() {
    if (!selectedReservationTypeData) return;
    
    let total = selectedReservationTypeData.basePrice || 0;
    
    // Apply member discount
    const memberMultiplier = getUserRateMultiplier();
    
    if (selectedReservationTypeData.options) {
        selectedReservationTypeData.options.forEach(option => {
            const select = document.getElementById(`opt_${option.optionName.replace(/\s/g, '_')}`);
            if (select && select.selectedOptions[0]) {
                const price = parseInt(select.selectedOptions[0].dataset.price) || 0;
                total += price;
            }
        });
    }
    
    // Apply member discount to total
    const discountedTotal = Math.round(total * memberMultiplier);
    dynamicTotalPrice = discountedTotal;
    
    document.getElementById('totalPrice').textContent = discountedTotal.toLocaleString();
    document.getElementById('priceDisplay').style.display = 'block';
    document.getElementById('submitReservationBtn').style.display = 'block';
    
    // Update rate display
    const rateDisplay = document.querySelector('.price-display .guest-rate');
    if (rateDisplay) {
        if (isUserMember()) {
            rateDisplay.innerHTML = `✨ Member Discount Applied! Original: ₱${total.toLocaleString()} → You pay: ₱${discountedTotal.toLocaleString()}`;
            rateDisplay.style.color = '#28a745';
        } else {
            rateDisplay.innerHTML = `💎 Become a member to get 20% discount on all reservations!`;
            rateDisplay.style.color = '#856404';
        }
    }
    
    return discountedTotal;
}

function openDynamicCalendarPopup() {
    if (!selectedReservationTypeData) {
        showToast('Please select a reservation type first', 'error');
        return;
    }
    
    dynamicCurrentMonth = new Date();
    renderDynamicCalendar();
    document.getElementById('dynamicCalendarModal').classList.add('show');
}

function closeDynamicCalendarPopup() {
    document.getElementById('dynamicCalendarModal').classList.remove('show');
}

function renderDynamicCalendar() {
    const year = dynamicCurrentMonth.getFullYear();
    const month = dynamicCurrentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    document.getElementById('calendarMonthYear').textContent = 
        new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(dynamicCurrentMonth);
    
    const grid = document.getElementById('dynamicCalendarGrid');
    grid.innerHTML = '';
    
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(day => {
        grid.innerHTML += `<div class="calendar-weekday">${day}</div>`;
    });
    
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="calendar-day disabled"></div>`;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(year, month, d);
        const isPast = cellDate < today;
        const isSelected = dynamicSelectedDate === `${year}-${month + 1}-${d}`;
        
        let statusClass = 'available';
        if (isPast) statusClass = 'disabled';
        
        grid.innerHTML += `
            <div class="calendar-day ${statusClass} ${isSelected ? 'selected' : ''}" 
                 onclick="${!isPast ? `selectDynamicDate(${year}, ${month + 1}, ${d})` : ''}">
                ${d}
            </div>
        `;
    }
    
    
    if (dynamicSelectedDate) {
        renderDynamicTimeSlots();
    }
}

function selectDynamicDate(year, month, day) {
    dynamicSelectedDate = `${year}-${month}-${day}`;
    renderDynamicCalendar();
    renderDynamicTimeSlots();
}

function renderDynamicTimeSlots() {
    const container = document.getElementById('dynamicTimeSlotsList');
    if (!container) return;
    
    const timeSlots = selectedReservationTypeData?.timeSlots || [];
    
    if (timeSlots.length === 0) {
        container.innerHTML = '<p style="color:#999; text-align:center;">No time slots available for this reservation type</p>';
        return;
    }
    
    container.innerHTML = '';
    timeSlots.forEach(slot => {
        const isFull = slot.booked >= slot.capacity;
        container.innerHTML += `
            <div class="time-slot ${dynamicSelectedTime === slot.time ? 'selected' : ''} ${isFull ? 'full' : ''}"
                 onclick="${!isFull ? `selectDynamicTimeSlot('${slot.time}')` : ''}">
                ${slot.time} ${isFull ? '(Full)' : `(${slot.capacity - slot.booked} slots left)`}
            </div>
        `;
    });
}

function selectDynamicTimeSlot(time) {
    dynamicSelectedTime = time;
    renderDynamicTimeSlots();
}

function confirmDynamicDateTime() {
    if (!dynamicSelectedDate) {
        showToast('Please select a date', 'error');
        return;
    }
    if (!dynamicSelectedTime) {
        showToast('Please select a time slot', 'error');
        return;
    }
    
    const displayDiv = document.getElementById('selectedDateTimeDisplay');
    displayDiv.innerHTML = `Selected: ${dynamicSelectedDate} at ${dynamicSelectedTime}`;
    
    document.getElementById('selectedDateDisplay').innerHTML = `Day of Reservation: <strong>${dynamicSelectedDate}</strong>`;
    document.getElementById('selectedTimeDisplay').innerHTML = `Time of Reservation: <strong>${dynamicSelectedTime}</strong>`;
    document.getElementById('finalAmount').textContent = dynamicTotalPrice;
    
    closeDynamicCalendarPopup();
    showToast('Date and time confirmed!', 'success');
}

function changeCalendarMonth(delta) {
    dynamicCurrentMonth.setMonth(dynamicCurrentMonth.getMonth() + delta);
    renderDynamicCalendar();
}

async function submitDynamicReservation() {
    if (!checkSession()) return;
    
    if (!selectedReservationTypeData) {
        showToast('Please select a reservation type', 'error');
        return;
    }
    
    if (!dynamicSelectedDate || !dynamicSelectedTime) {
        showToast('Please select a date and time first', 'error');
        return;
    }
    
    const firstName = document.getElementById('resFirstName').value.trim();
    const lastName = document.getElementById('resLastName').value.trim();
    const email = document.getElementById('resEmail').value.trim();
    const phone = document.getElementById('resPhone').value.trim();
    
    if (!firstName || !lastName || !email || !phone) {
        showToast('Please fill in all personal details', 'error');
        return;
    }
    
    // Show payment form
    const paymentSection = document.getElementById('reservationPayment');
    paymentSection.style.display = 'block';
    paymentSection.scrollIntoView({ behavior: 'smooth' });
    
    document.getElementById('selectedDateDisplay').innerHTML = `Day of Reservation: <strong>${dynamicSelectedDate}</strong>`;
    document.getElementById('selectedTimeDisplay').innerHTML = `Time of Reservation: <strong>${dynamicSelectedTime}</strong>`;
    document.getElementById('finalAmount').textContent = dynamicTotalPrice;
}

async function submitDynamicReservationPayment() {
    if (!checkSession()) return;
    
    const token = getAuthToken();
    
    const firstName = document.getElementById('resFirstName').value.trim();
    const lastName = document.getElementById('resLastName').value.trim();
    const email = document.getElementById('resEmail').value.trim();
    const phone = document.getElementById('resPhone').value.trim();
    const paymentMethod = document.querySelector('#reservationPayment .method-btn.active')?.textContent || 'GCash';
    const accountNumber = document.getElementById('resPaymentAccount').value.trim();
    const referenceNumber = document.getElementById('resReferenceNumber').value.trim();
    
    if (!accountNumber) {
        showToast('Please enter your account number', 'error');
        return;
    }
    
    if (!referenceNumber) {
        showToast('Please enter the reference/transaction ID', 'error');
        return;
    }
    
    const data = {
        userId: localStorage.getItem('userId'),
        firstName: firstName,
        lastName: lastName,
        email: email,
        phone: phone,
        date: dynamicSelectedDate,
        timeSlot: dynamicSelectedTime,
        reservationType: selectedReservationTypeData?.name,
        paymentMethod: paymentMethod,
        accountNumber: accountNumber,
        referenceNumber: referenceNumber,
        amount: dynamicTotalPrice,
        originalAmount: calculateOriginalPrice(), // Store original price for reference
        isMember: isUserMember(), // Send membership status
        memberDiscount: isUserMember() ? 0.2 : 0
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
            overlay.style.display = 'none';
            const memberText = isUserMember() ? ' (Member discount applied!)' : '';
            showToast(`Reservation submitted!${memberText} Admin will verify your payment.`, 'success');
            document.getElementById('successMsg').innerHTML = `Your reservation has been submitted.<br><br>Admin will verify your payment and confirm your reservation.<br><br>Reservation ID: ${result.applicationId}<br><br>Amount: ₱${dynamicTotalPrice.toLocaleString()}${memberText}`;
            document.getElementById('successPopup').style.display = 'flex';
            
            // Reset form
            document.getElementById('reservationPayment').style.display = 'none';
            document.getElementById('resPaymentAccount').value = '';
            document.getElementById('resReferenceNumber').value = '';
            document.getElementById('reservationTypeSelect').value = '';
            document.getElementById('dynamicOptionsContainer').innerHTML = '';
            document.getElementById('dateTimeSelection').style.display = 'none';
            document.getElementById('priceDisplay').style.display = 'none';
            document.getElementById('submitReservationBtn').style.display = 'none';
            dynamicSelectedDate = null;
            dynamicSelectedTime = null;
            selectedReservationTypeData = null;
        } else {
            overlay.style.display = 'none';
            showToast(result.message || 'Reservation failed', 'error');
        }
    } catch (error) {
        overlay.style.display = 'none';
        console.error('Error:', error);
        showToast('Connection error: ' + error.message, 'error');
    }
}

function calculateOriginalPrice() {
    if (!selectedReservationTypeData) return 0;
    
    let total = selectedReservationTypeData.basePrice || 0;
    
    if (selectedReservationTypeData.options) {
        selectedReservationTypeData.options.forEach(option => {
            const select = document.getElementById(`opt_${option.optionName.replace(/\s/g, '_')}`);
            if (select && select.selectedOptions[0]) {
                const price = parseInt(select.selectedOptions[0].dataset.price) || 0;
                total += price;
            }
        });
    }
    
    return total;
}

// 1. Shows the Payment Form after clicking "Proceed to Payment" on the first popup
function showPaymentSection() {
    // Hide the popup
    document.getElementById('membershipPopup').style.display = 'none';
    
    // Hide the personal details form section
    const personalDetailsCard = document.querySelector('#tab-membership .section-card');
    if (personalDetailsCard) {
        personalDetailsCard.style.display = 'none';
    }
    
    // Show the payment form section
    document.getElementById('membershipPayment').style.display = 'block';
    
    // Scroll to the top of the payment form so the user sees it
    window.scrollTo({ top: 0, behavior: 'smooth' });
}



// Generates a high-quality .png image of the receipt using html2canvas
function downloadReceiptImage() {
    // Target the receipt content area
    const captureArea = document.getElementById('receiptImageArea');
    if (!captureArea) {
        // If no specific area, capture the whole popup content
        const receiptContent = document.querySelector('#receiptPopup .popup-card');
        if (receiptContent) {
            html2canvas(receiptContent, {
                scale: 2,
                backgroundColor: "#ffffff",
                logging: false
            }).then(canvas => {
                const imgData = canvas.toDataURL("image/png");
                const link = document.createElement('a');
                link.download = `ILISY_Receipt_${Date.now()}.png`;
                link.href = imgData;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }).catch(error => {
                console.error('Error generating receipt:', error);
                showToast('Error generating receipt', 'error');
            });
        }
        return;
    }
    
    html2canvas(captureArea, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false
    }).then(canvas => {
        const imgData = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.download = `ILISY_Receipt_${Date.now()}.png`;
        link.href = imgData;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Receipt downloaded successfully!', 'success');
    }).catch(error => {
        console.error('Error generating receipt:', error);
        showToast('Error generating receipt', 'error');
    });
}

// 4. Closes everything and resets the page
function closeReceiptAndReset() {
    document.getElementById('receiptPopup').style.display = 'none';
    // Reset the membership form to show personal details again
    const personalDetailsCard = document.querySelector('#tab-membership .section-card');
    if (personalDetailsCard) {
        personalDetailsCard.style.display = 'block';
    }
    document.getElementById('membershipPayment').style.display = 'none';
    // Clear form fields
    document.getElementById('memFirstName').value = '';
    document.getElementById('memLastName').value = '';
    document.getElementById('memEmail').value = '';
    document.getElementById('memPhone').value = '';
    document.getElementById('memGender').value = '';
    document.getElementById('memAge').value = '';
    document.getElementById('memAddress').value = '';
    document.getElementById('paymentAccount').value = '';
    const expiryInput = document.querySelector('#membershipPayment input[placeholder="MM/YY"]');
    if (expiryInput) expiryInput.value = '';
    const cvcInput = document.getElementById('cardCvc');
    if (cvcInput) cvcInput.value = '';
}

// Auto-formats the Card Number to add spaces every 4 digits
function formatCardNumber(input) {
    // 1. Strip out anything that isn't a number
    let val = input.value.replace(/\D/g, '');
    
    // 2. Add a space after every 4 digits
    val = val.replace(/(.{4})/g, '$1 ').trim();
    
    // 3. Update the visible input box
    input.value = val;
}

// Auto-formats the Expiration Date (Caps MM at 12, Caps DD at 31)
function formatExpiry(input, event) {
    // 1. If the user hits Backspace, let them delete naturally
    if (event.inputType === 'deleteContentBackward') return;
    
    // 2. Strip out anything that isn't a number
    let val = input.value.replace(/\D/g, '');
    
    if (val.length >= 2) {
        // 3. Format the Month (First 2 digits)
        let month = val.substring(0, 2);
        if (parseInt(month) > 12) month = '12';
        if (parseInt(month) === 0) month = '01'; // Prevents 00
        
        // 4. Format the Day/Second Half (Last 2 digits)
        let day = val.substring(2, 4);
        if (day.length === 2) {
            if (parseInt(day) > 31) day = '31';
            if (parseInt(day) === 0) day = '01'; // Prevents 00
        }
        
        // 5. Automatically add the slash
        input.value = month + '/' + day;
    } else {
        input.value = val;
    }
}

function pickMethod(btn) {
    console.log("Button clicked: " + btn.innerText); // This helps you see if it's working in F12

    // 1. Swap active class
    document.querySelectorAll('.pm-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const method = btn.innerText.trim();
    
    // 2. Grab the elements
    const bankNameDisplay = document.getElementById('merchantBankName');
    const accountNoDisplay = document.getElementById('merchantAccountNumber');
    const inputLabel = document.getElementById('labelPaymentAccount');

    // 3. The "Safety" Check - If any of these are missing, the code stops here
    if (!bankNameDisplay || !accountNoDisplay) {
        console.error("Error: Could not find the merchant info IDs in your HTML!");
        return;
    }

    // 4. Perform the Swap
    bankNameDisplay.innerText = method;
    
    if (inputLabel) {
        inputLabel.innerText = method + " Card number";
    }

    if (method.includes("BDO")) {
        accountNoDisplay.innerText = "4512 3456 7890 1234";
    } else if (method.includes("Metrobank")) {
        accountNoDisplay.innerText = "5123 9988 7766 5544";
    } else if (method.includes("BPI")) {
        accountNoDisplay.innerText = "4213 0011 2233 4455";
    }

    // 5. Clear the user's input box
    const userAccountInput = document.getElementById('paymentAccount');
    if (userAccountInput) userAccountInput.value = "";
}



// Smart helper to show errors right above the pay button without ugly alerts
function showPaymentError(buttonElement, message) {
    // Remove old error if they clicked twice
    const oldErr = document.getElementById('tempPayError');
    if (oldErr) oldErr.remove();

    // Create a new elegant red text warning
    const err = document.createElement('div');
    err.id = 'tempPayError';
    err.style.color = '#9c403d';
    err.style.fontSize = '13px';
    err.style.marginBottom = '12px';
    err.style.textAlign = 'center';
    err.style.fontWeight = 'bold';
    err.textContent = '⚠ ' + message;

    // Insert it exactly above the button they just clicked
    buttonElement.parentNode.insertBefore(err, buttonElement);
    
    // Make it vanish after 4 seconds
    setTimeout(() => { if (err.parentNode) err.remove(); }, 4000);
}



// Submits the Reservation Payment with STRICT formatting checks
function submitDynamicReservationPayment(event) {
    const btn = event ? event.target : document.querySelector('#reservationPayment .btn-olive');
    const activeMethod = document.querySelector('#reservationPayment .pm-tab.active').innerText.trim();
    const accountInput = document.getElementById('resPaymentAccount').value.trim();
    const reference = document.getElementById('resReferenceNumber').value.trim();

    // Basic empty check
    if (!accountInput || !reference) {
         return showPaymentError(btn, `Please enter your ${activeMethod} details and Reference ID.`);
    }

    // Strict regex checks based on the active tab
    if (activeMethod.includes('GCash') || activeMethod.includes('Maya')) {
        const cleanPhone = accountInput.replace(/[\s-]/g, '');
        if (!/^(09\d{9}|\+639\d{9})$/.test(cleanPhone)) {
            return showPaymentError(btn, `Invalid ${activeMethod}: Must be a valid 11-digit mobile number.`);
        }
    } else if (activeMethod.includes('Card')) {
        const cleanCard = accountInput.replace(/\s+/g, '');
        if (!/^\d{16}$/.test(cleanCard)) {
            return showPaymentError(btn, "Invalid Card: Must be exactly 16 digits.");
        }
    }

    if (reference.length < 6) {
        return showPaymentError(btn, "Invalid Reference ID: Please enter the exact transaction ID.");
    }

    // If everything is strictly correct, process it!
    processPaymentAndShowReceipt('resFirstName', 'resLastName', 'reservationPayment');
}



// Validates the Reservation Personal Details before showing payment
function submitDynamicReservation() {
    // 1. Grab all the values
    const fName = document.getElementById('resFirstName').value.trim();
    const lName = document.getElementById('resLastName').value.trim();
    const gender = document.getElementById('resGender').value;
    const phone = document.getElementById('resPhone').value.trim();
    const email = document.getElementById('resEmail').value.trim();
    const resType = document.getElementById('reservationTypeSelect').value;

    const errorDiv = document.getElementById('resError');

    // Helper to show errors smoothly
    const showError = (msg) => {
        if (errorDiv) {
            errorDiv.textContent = '⚠ ' + msg;
            errorDiv.style.display = 'block';
            setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
        }
    };

    // 2. Check for empty fields
    if (!fName || !lName || !gender || !phone || !email || !resType) {
        return showError("Please fill out all personal details and select a reservation type.");
    }

    // 3. Validate Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return showError("Please enter a valid email address.");
    }

    // 4. Validate Phone Number
    const cleanPhone = phone.replace(/[\s-]/g, '');
    const phoneRegex = /^(09\d{9}|\+639\d{9})$/;
    if (!phoneRegex.test(cleanPhone)) {
        return showError("Please enter a valid 11-digit mobile number.");
    }

    // 5. If everything is perfect, hide errors and swap to the payment screen!
    if (errorDiv) errorDiv.style.display = 'none';
    
    // Hide the details form and show the payment card
    document.querySelector('#tab-reservation .reservation-card').style.display = 'none';
    document.getElementById('reservationPayment').style.display = 'block';
    
    // Scroll to the top of the new payment section
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

let membershipCheckInterval = null;
let currentMembershipStatus = null;

// Add this function to check membership status
async function checkMembershipStatus() {
    if (!checkSession()) return;
    
    const token = getAuthToken();
    const userId = localStorage.getItem('userId');
    
    if (!userId) return;
    
    try {
        const response = await fetch(`${API_URL}/users/${userId}/membership-status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const data = await response.json();
            const newStatus = data.membershipStatus;
            const previousStatus = currentMembershipStatus;
            currentMembershipStatus = newStatus;
            
            // Update localStorage
            localStorage.setItem('membershipStatus', newStatus);
            
            // Update the username display (will add/remove glow)
            displayUserName();
            
            // Check if status changed to active (just got approved)
            if (previousStatus !== 'active' && newStatus === 'active') {
                showMembershipApprovedNotification();
                hideMembershipTab();
            }
            
            // If membership was revoked (active -> expired/none)
            if (previousStatus === 'active' && newStatus !== 'active') {
                showToast('Your membership has been revoked. Please contact admin.', 'error');
                showMembershipTab();
                displayUserName(); // Refresh to remove glow
            }
            
            updateMembershipUI(newStatus);
        }
    } catch (error) {
        console.error('Error checking membership status:', error);
    }
}

// Show membership approved notification
function showMembershipApprovedNotification() {
    // Create custom modal popup
    const modalHtml = `
        <div class="modal-overlay show" id="membershipApprovedModal" style="display:flex;">
            <div class="popup-card" style="max-width: 450px; background: linear-gradient(135deg, #0d2b0f 0%, #1a4a1a 100%);">
                <div style="font-size: 64px; text-align: center;">🎉⛳</div>
                <hr style="border-color: var(--gold); margin: 15px 0;">
                <h3 style="color: var(--gold); font-size: 24px; text-align: center;">Membership Approved!</h3>
                <p style="color: white; text-align: center; margin: 15px 0; font-size: 16px;">
                    Congratulations! Your membership has been approved.<br>
                    You now get <strong style="color: var(--gold);">20% discount</strong> on all reservations!
                </p>
                <div style="text-align: center;">
                    <button class="popup-close" onclick="closeMembershipApprovedModal()" style="background: var(--gold); color: #0d2b0f; padding: 10px 30px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                        Continue to Portal
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('membershipApprovedModal');
    if (existingModal) existingModal.remove();
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Play sound (optional - requires user interaction first)
    // showToast('🎉 Congratulations! Your membership has been approved!', 'success');
    
    // Close after 5 seconds if not clicked
    setTimeout(() => {
        const modal = document.getElementById('membershipApprovedModal');
        if (modal && modal.style.display === 'flex') {
            modal.style.display = 'none';
            modal.remove();
        }
    }, 8000);
}

function closeMembershipApprovedModal() {
    const modal = document.getElementById('membershipApprovedModal');
    if (modal) {
        modal.style.display = 'none';
        modal.remove();
    }
    showToast('Welcome to the ILISY Golf Club family! 🏌️', 'success');
}

// Hide the membership tab for active members
function hideMembershipTab() {
    const membershipTab = document.querySelector('.tab-btn[onclick*="membership"]');
    if (membershipTab) {
        membershipTab.style.display = 'none';
    }
    
    // Also hide the membership tab content if it's active
    const membershipContent = document.getElementById('tab-membership');
    if (membershipContent && membershipContent.classList.contains('active')) {
        // Switch to another tab (e.g., reservation)
        const reservationTab = document.querySelector('.tab-btn[onclick*="reservation"]');
        if (reservationTab) {
            reservationTab.click();
        }
    }
}

// Show the membership tab (for non-members)
function showMembershipTab() {
    const membershipTab = document.querySelector('.tab-btn[onclick*="membership"]');
    if (membershipTab) {
        membershipTab.style.display = 'flex';
    }
}

// Update UI based on membership status
function updateMembershipUI(status) {
    const membershipTab = document.querySelector('.tab-btn[onclick*="membership"]');
    const membershipHero = document.querySelector('.membership-hero-bar');
    
    if (status === 'active') {
        if (membershipTab) membershipTab.style.display = 'none';
        
        // Add member badge to header
        addMemberBadge();
        
        // Show member welcome message in reservation tab
        showMemberWelcomeMessage();
    } else {
        if (membershipTab) membershipTab.style.display = 'flex';
    }
}

// Add member badge to portal header
function addMemberBadge() {
    const portalHeader = document.querySelector('.portal-header');
    if (portalHeader && !document.querySelector('.member-badge-header')) {
        const badgeHtml = `
            <div class="member-badge-header" style="
                display: inline-block;
                background: linear-gradient(135deg, var(--gold), #f1d592);
                color: var(--deep-green);
                padding: 5px 15px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: bold;
                margin-top: 10px;
            ">
                ⭐ ACTIVE MEMBER - 20% DISCOUNT ⭐
            </div>
        `;
        portalHeader.insertAdjacentHTML('beforeend', badgeHtml);
    }
}

// Show member welcome message in reservation tab
function showMemberWelcomeMessage() {
    const reservationCard = document.querySelector('#tab-reservation .reservation-card');
    if (reservationCard && !document.querySelector('.member-welcome')) {
        const welcomeHtml = `
            <div class="member-welcome" style="
                background: linear-gradient(135deg, var(--gold), #f1d592);
                color: var(--deep-green);
                padding: 15px;
                border-radius: 8px;
                margin-bottom: 20px;
                text-align: center;
            ">
                <strong>🏌️ Welcome, Member!</strong> You get 20% off on all reservations!
            </div>
        `;
        reservationCard.insertAdjacentHTML('afterbegin', welcomeHtml);
    }
}

// Start polling for membership status changes
function startMembershipStatusPolling() {
    if (membershipCheckInterval) clearInterval(membershipCheckInterval);
    
    // Check immediately
    checkMembershipStatus();
    
    // Then check every 30 seconds
    membershipCheckInterval = setInterval(() => {
        checkMembershipStatus();
    }, 30000);
}

function stopMembershipStatusPolling() {
    if (membershipCheckInterval) {
        clearInterval(membershipCheckInterval);
        membershipCheckInterval = null;
    }
}

function displayUserName() {
    const userNameSpan = document.getElementById('userNameDisplay');
    if (!userNameSpan) return;
    
    const firstName = localStorage.getItem('firstName');
    const lastName = localStorage.getItem('lastName');
    const username = localStorage.getItem('userName');
    const membershipStatus = localStorage.getItem('membershipStatus');
    
    // Use first name if available, otherwise username
    let displayName = '';
    if (firstName && lastName) {
        displayName = `${firstName} ${lastName}`;
    } else if (firstName) {
        displayName = firstName;
    } else {
        displayName = username || 'Member';
    }
    
    userNameSpan.textContent = displayName;
    
    // Add member class and glow if membership is active
    if (membershipStatus === 'active') {
        userNameSpan.classList.add('member');
        
        // Add a small badge next to the name
        const badge = document.createElement('span');
        badge.className = 'member-badge';
        badge.textContent = '⭐ MEMBER';
        userNameSpan.appendChild(badge);
    } else {
        userNameSpan.classList.remove('member');
    }
}


window.submitDynamicReservation = submitDynamicReservation;
window.submitDynamicReservationPayment = submitDynamicReservationPayment;
window.onReservationTypeChange = onReservationTypeChange;
window.calculateDynamicPrice = calculateDynamicPrice;
window.openDynamicCalendarPopup = openDynamicCalendarPopup;
window.closeDynamicCalendarPopup = closeDynamicCalendarPopup;
window.selectDynamicDate = selectDynamicDate;
window.selectDynamicTimeSlot = selectDynamicTimeSlot;
window.confirmDynamicDateTime = confirmDynamicDateTime;
window.changeCalendarMonth = changeCalendarMonth;

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