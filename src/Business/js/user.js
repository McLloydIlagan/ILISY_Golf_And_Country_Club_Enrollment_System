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
let membershipCheckInterval = null;
let currentMembershipStatus = null;
let hasShownApprovalNotification = false;

// ──────────────────────────────────────────────────────────────────
// Member Rate Detection
// ──────────────────────────────────────────────────────────────────

function isUserMember() {
    const membershipStatus = localStorage.getItem('membershipStatus');
    return membershipStatus === 'active';
}

function getUserRateMultiplier() {
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

async function apiFetch(url, options = {}) {
    const token = getAuthToken();
    
    if (!token) {
        console.error('❌ No auth token found!');
        showToast('Session expired. Please login again.', 'error');
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 1500);
        throw new Error('No auth token');
    }
    
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    
    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };
    
    try {
        const response = await fetch(url, mergedOptions);
        
        if (response.status === 401 || response.status === 403) {
            console.error(`❌ Auth failed with status ${response.status}`);
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1500);
            throw new Error('Unauthorized');
        }
        
        return response;
    } catch (error) {
        console.error('❌ API fetch error:', error);
        throw error;
    }
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
    stopMembershipStatusPolling();
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
// Tab Persistence Functions
// ──────────────────────────────────────────────────────────────────

function saveCurrentTab(tabName) {
    localStorage.setItem('userCurrentTab', tabName);
}

function saveTabScrollPosition(tabName) {
    const tabContent = document.getElementById(`tab-${tabName}`);
    if (tabContent) {
        const scrollY = tabContent.scrollTop || window.scrollY;
        localStorage.setItem(`user_scroll_${tabName}`, scrollY);
    }
}

function restoreTabScrollPosition(tabName) {
    const savedScroll = localStorage.getItem(`user_scroll_${tabName}`);
    if (savedScroll) {
        const tabContent = document.getElementById(`tab-${tabName}`);
        if (tabContent) {
            setTimeout(() => {
                tabContent.scrollTop = parseInt(savedScroll);
            }, 100);
        }
    }
}

function switchTab(name, btn) {
    // Save current scroll position before leaving
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id) {
        const currentTabName = activeTab.id.replace('tab-', '');
        saveTabScrollPosition(currentTabName);
    }
    
    // Save current tab to localStorage
    saveCurrentTab(name);
    
    // Update UI
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    if (btn) btn.classList.add('active');
    
    // Restore scroll position for new tab
    restoreTabScrollPosition(name);
    
    // Load messages if switching to messages tab
    if (name === 'messages') {
        loadConversationHistory();
    }
}

async function loadLastVisitedTab() {
    try {
        let lastTab = localStorage.getItem('userCurrentTab') || 'membership';
        
        // Force members to reservation tab, non-members to membership tab
        const isMember = localStorage.getItem('membershipStatus') === 'active';
        if (isMember && lastTab === 'membership') {
            lastTab = 'reservation';
        }
        if (!isMember && lastTab === 'reservation') {
            lastTab = 'membership';
        }
        
        // Find the button and switch
        const tabButtons = document.querySelectorAll('.tab-btn');
        let targetBtn = null;
        
        for (let i = 0; i < tabButtons.length; i++) {
            const btn = tabButtons[i];
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes(lastTab)) {
                targetBtn = btn;
                break;
            }
        }
        
        if (targetBtn) {
            switchTab(lastTab, targetBtn);
        } else {
            // Fallback to membership tab
            const defaultBtn = tabButtons[0];
            if (defaultBtn) {
                switchTab('membership', defaultBtn);
            }
        }
        console.log('✅ Restored tab:', lastTab);
    } catch (error) {
        console.error('Error loading last tab:', error);
        // Fallback to membership tab
        const defaultBtn = document.querySelector('.tab-btn');
        if (defaultBtn) switchTab('membership', defaultBtn);
    }
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
            response = await apiFetch(`${API_URL}/messages/followup/${existingConversationId}`, {
                method: 'POST',
                body: JSON.stringify({ message: text })
            });
        } else {
            response = await apiFetch(`${API_URL}/messages/submit`, {
                method: 'POST',
                body: JSON.stringify({ 
                    userId: localStorage.getItem('userId'), 
                    userName: localStorage.getItem('userName') || 'Member', 
                    message: text, 
                    concernType: 'general' 
                })
            });
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
    
    const quickReplies = document.getElementById('quickReplies');
    if (quickReplies) quickReplies.style.display = 'none';
    
    addMsg(text, 'sent');
    
    try {
        let response;
        const existingConversationId = localStorage.getItem('currentConversationId');
        const isValidObjectId = existingConversationId && /^[0-9a-fA-F]{24}$/.test(existingConversationId);
        
        if (isValidObjectId) {
            response = await apiFetch(`${API_URL}/messages/followup/${existingConversationId}`, {
                method: 'POST',
                body: JSON.stringify({ message: text })
            });
        } else {
            response = await apiFetch(`${API_URL}/messages/submit`, {
                method: 'POST',
                body: JSON.stringify({ 
                    userId: localStorage.getItem('userId'), 
                    userName: localStorage.getItem('userName') || 'Member', 
                    message: text, 
                    concernType: 'general' 
                })
            });
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
    
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    
    try {
        const response = await apiFetch(`${API_URL}/messages/user/${userId}`);
        
        if (response.ok) {
            const conversations = await response.json();
            if (conversations.length > 0) {
                const latest = conversations[0];
                if (!currentConversationId && latest._id) {
                    currentConversationId = latest._id;
                    localStorage.setItem('currentConversationId', currentConversationId);
                }
            }
        }
    } catch (error) {
        console.error('Error checking for messages:', error);
    }
}


async function sendQuickReply(text) {
    if (!checkSession()) return;
    
    const quickReplies = document.getElementById('quickReplies');
    if (quickReplies) quickReplies.style.display = 'none';
    
    addMsg(text, 'sent');
    
    try {
        let response;
        const existingConversationId = localStorage.getItem('currentConversationId');
        const isValidObjectId = existingConversationId && /^[0-9a-fA-F]{24}$/.test(existingConversationId);
        
        if (isValidObjectId) {
            response = await apiFetch(`${API_URL}/messages/followup/${existingConversationId}`, {
                method: 'POST',
                body: JSON.stringify({ message: text })
            });
        } else {
            response = await apiFetch(`${API_URL}/messages/submit`, {
                method: 'POST',
                body: JSON.stringify({ 
                    userId: localStorage.getItem('userId'), 
                    userName: localStorage.getItem('userName') || 'Member', 
                    message: text, 
                    concernType: 'general' 
                })
            });
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

// ========== INSERT IMAGE UPLOAD FUNCTIONS HERE ==========
// Image upload and preview variables
let pendingImageFile = null;
let pendingImagePreview = null;

// Handle image selection for receipt upload
function uploadReceiptImage(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        input.value = '';
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image too large. Max 5MB.', 'error');
        input.value = '';
        return;
    }
    
    pendingImageFile = file;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        pendingImagePreview = e.target.result;
        showImagePreviewInChat(pendingImagePreview, file.name);
    };
    reader.readAsDataURL(file);
    input.value = '';
}

function showImagePreviewInChat(previewUrl, filename) {
    const chatBody = document.getElementById('chatBody');
    const existingPreview = document.querySelector('.image-preview-container');
    if (existingPreview) existingPreview.remove();
    
    const previewContainer = document.createElement('div');
    previewContainer.className = 'image-preview-container msg-row';
    previewContainer.innerHTML = `
        <img src="${previewUrl}" class="image-preview">
        <span class="image-preview-filename">${escapeHtml(filename)}</span>
        <button class="remove-image-preview" onclick="removeImagePreview()">✕</button>
    `;
    chatBody.appendChild(previewContainer);
    chatBody.scrollTop = chatBody.scrollHeight;
}

function removeImagePreview() {
    pendingImageFile = null;
    pendingImagePreview = null;
    const preview = document.querySelector('.image-preview-container');
    if (preview) preview.remove();
}

function addImageToChat(imageUrl, type, isHistory = false) {
    const chatBody = document.getElementById('chatBody');
    const row = document.createElement('div');
    row.className = `msg-row ${type === 'sent' ? 'right' : ''}`;
    
    if (type === 'received') {
        row.innerHTML = `
            <div class="user-avatar">👤</div>
            <div class="msg-bubble received image-message" onclick="viewFullImage('${imageUrl}')">
                <img src="${imageUrl}" alt="Receipt image">
            </div>
        `;
    } else {
        row.innerHTML = `
            <div class="msg-bubble sent image-message" onclick="viewFullImage('${imageUrl}')">
                <img src="${imageUrl}" alt="Receipt image">
            </div>
            <div class="avatar-right">👤</div>
        `;
    }
    
    const previewContainer = document.querySelector('.image-preview-container');
    if (previewContainer) previewContainer.remove();
    
    chatBody.appendChild(row);
    if (!isHistory) chatBody.scrollTop = chatBody.scrollHeight;
}

function viewFullImage(imageUrl) {
    const modal = document.createElement('div');
    modal.className = 'image-viewer-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);display:flex;justify-content:center;align-items:center;z-index:20000;cursor:pointer;';
    modal.innerHTML = `
        <button style="position:absolute;top:20px;right:30px;color:white;font-size:40px;background:none;border:none;cursor:pointer;" onclick="this.parentElement.remove()">&times;</button>
        <img src="${imageUrl}" style="max-width:90%;max-height:90%;object-fit:contain;border-radius:8px;">
    `;
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
}

async function sendImageMessage() {
    if (!pendingImageFile) {
        showToast('No image selected', 'error');
        return;
    }
    if (!checkSession()) return;
    
    addImageToChat(pendingImagePreview, 'sent');
    
    const formData = new FormData();
    formData.append('image', pendingImageFile);
    formData.append('userId', localStorage.getItem('userId'));
    formData.append('userName', localStorage.getItem('userName') || 'Member');
    
    const existingConversationId = localStorage.getItem('currentConversationId');
    const isValidObjectId = existingConversationId && /^[0-9a-fA-F]{24}$/.test(existingConversationId);
    if (isValidObjectId) formData.append('conversationId', existingConversationId);
    
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'flex';
    document.getElementById('processingMsg').textContent = 'Uploading receipt image...';
    
    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/messages/upload-image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
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
            showToast('Receipt image sent!', 'success');
            if (result.conversationId) localStorage.setItem('currentConversationId', result.conversationId);
            pendingImageFile = null;
            pendingImagePreview = null;
            removeImagePreview();
        } else {
            showToast(result.message || 'Failed to send image', 'error');
            const lastRow = document.querySelector('.msg-row:last-child');
            if (lastRow && lastRow.querySelector('.image-message')) lastRow.remove();
        }
    } catch (error) {
        console.error('Error uploading image:', error);
        showToast('Error uploading image. Please try again.', 'error');
    } finally {
        overlay.style.display = 'none';
    }
}

async function sendTextMessage(text) {
    addMsg(text, 'sent');
    
    try {
        let response;
        const existingConversationId = localStorage.getItem('currentConversationId');
        const isValidObjectId = existingConversationId && /^[0-9a-fA-F]{24}$/.test(existingConversationId);
        
        if (isValidObjectId) {
            response = await apiFetch(`${API_URL}/messages/followup/${existingConversationId}`, {
                method: 'POST',
                body: JSON.stringify({ message: text })
            });
        } else {
            response = await apiFetch(`${API_URL}/messages/submit`, {
                method: 'POST',
                body: JSON.stringify({ 
                    userId: localStorage.getItem('userId'), 
                    userName: localStorage.getItem('userName') || 'Member', 
                    message: text, 
                    concernType: 'general' 
                })
            });
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

// Override sendMessage to handle images
async function sendMessage() {
    if (!checkSession()) return;
    
    const input = document.getElementById('msgInput');
    const text = input.value.trim();
    
    if (pendingImageFile && !text) {
        await sendImageMessage();
        return;
    }
    
    if (text && pendingImageFile) {
        await sendTextMessage(text);
        await sendImageMessage();
        input.value = '';
        return;
    }
    
    if (text) {
        await sendTextMessage(text);
        input.value = '';
    }
}


async function loadConversationHistory() {
    if (!checkSession()) return;
    
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    
    try {
        const response = await apiFetch(`${API_URL}/messages/user/${userId}`);
        
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
                            row.innerHTML = `<div class="user-avatar">👤</div><div class="msg-bubble received">${escapeHtml(conv.message)}</div>`;
                        } else {
                            row.innerHTML = `<div class="msg-bubble sent">${escapeHtml(conv.message)}</div><div class="avatar-right">👤</div>`;
                        }
                        chatBody.appendChild(row);
                    });
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


// Add this function - it's called from the reservation payment button
async function submitReservationPayment() {
    if (!checkSession()) return;
    
    // Get personal details
    const firstName = document.getElementById('resFirstName').value.trim();
    const lastName = document.getElementById('resLastName').value.trim();
    const email = document.getElementById('resEmail').value.trim();
    const phone = document.getElementById('resPhone').value.trim();
    
    // Get payment details from modern form
    const activeMethod = document.querySelector('#reservationPayment .pm-tab.active');
    let paymentMethod = 'BDO';
    
    if (activeMethod) {
        const methodText = activeMethod.innerText.trim();
        if (methodText.includes('BDO')) paymentMethod = 'BDO';
        else if (methodText.includes('Metrobank')) paymentMethod = 'Metrobank';
        else if (methodText.includes('BPI')) paymentMethod = 'BPI';
        else paymentMethod = 'BDO';
    }
    
    const accountNumber = document.getElementById('resPaymentAccount').value.trim();
    const expiryInput = document.getElementById('resExpiry');
    const expiry = expiryInput ? expiryInput.value.trim() : '';
    const cvc = document.getElementById('resCardCvc') ? document.getElementById('resCardCvc').value.trim() : '';
    
    // Validate personal details
    if (!firstName || !lastName) {
        showToast('Please enter your first and last name', 'error');
        return;
    }
    
    if (!email) {
        showToast('Please enter your email address', 'error');
        return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }
    
    if (!phone) {
        showToast('Please enter your phone number', 'error');
        return;
    }
    
    const cleanPhone = phone.replace(/[\s-]/g, '');
    const phoneRegex = /^(09\d{9}|\+639\d{9})$/;
    if (!phoneRegex.test(cleanPhone)) {
        showToast('Please enter a valid 11-digit mobile number', 'error');
        return;
    }
    
    // Validate card payment
    if (!accountNumber) {
        showToast('Please enter your card number', 'error');
        return;
    }
    
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
    
    // Generate reference number
    const referenceNumber = `RES-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const data = {
        userId: localStorage.getItem('userId'),
        firstName: firstName,
        lastName: lastName,
        email: email,
        phone: cleanPhone,
        date: dynamicSelectedDate || selectedDate,
        timeSlot: dynamicSelectedTime || selectedTimeSlot,
        reservationType: selectedReservationTypeData?.name,
        paymentMethod: paymentMethod,
        accountNumber: cleanCard,
        referenceNumber: referenceNumber,
        amount: dynamicTotalPrice || 500,
        originalAmount: calculateOriginalPrice(),
        isMember: isUserMember(),
        memberDiscount: isUserMember() ? 0.2 : 0,
        cardExpiry: expiry,
        cardCvc: cvc
    };
    
    console.log('📤 Submitting reservation:', data);
    
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'flex';
    document.getElementById('processingMsg').textContent = 'Submitting your reservation...';
    
    try {
        const response = await apiFetch(`${API_URL}/reservations/apply`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        console.log('📥 Server response:', response.status, result);
        
        if (response.ok) {
            overlay.style.display = 'none';
            const memberText = isUserMember() ? ' (Member discount applied!)' : '';
            showToast(`Reservation submitted!${memberText} Admin will verify your payment.`, 'success');
            
            document.getElementById('receiptTracking').textContent = referenceNumber;
            document.getElementById('receiptName').textContent = firstName + ' ' + lastName;
            document.getElementById('receiptPopup').style.display = 'flex';
            
            // Reset form
            document.getElementById('reservationPayment').style.display = 'none';
            document.getElementById('reservationTypeSelect').value = '';
            document.getElementById('dynamicOptionsContainer').innerHTML = '';
            document.getElementById('dateTimeSelection').style.display = 'none';
            document.getElementById('priceDisplay').style.display = 'none';
            document.getElementById('submitReservationBtn').style.display = 'none';
            
            // Show the reservation card again
            const reservationCard = document.querySelector('#tab-reservation .reservation-card');
            if (reservationCard) reservationCard.style.display = 'block';
            
            // Reset payment form fields
            document.getElementById('resPaymentAccount').value = '';
            if (document.getElementById('resExpiry')) document.getElementById('resExpiry').value = '';
            if (document.getElementById('resCardCvc')) document.getElementById('resCardCvc').value = '';
            
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
        const selectedDateDisplay = document.getElementById('selectedDateDisplay');
        const selectedTimeDisplay = document.getElementById('selectedTimeDisplay');
        if (selectedDateDisplay) selectedDateDisplay.innerHTML = `Day of Reservation: <strong>${selectedDate}</strong>`;
        if (selectedTimeDisplay) selectedTimeDisplay.innerHTML = `Time of Reservation: <strong>${selectedTimeSlot}</strong>`;
        showToast(`Selected: ${selectedTimeSlot} on ${selectedDate}`, 'success');
    } else {
        alert('Please select a time slot');
    }
}

// ──────────────────────────────────────────────────────────────────
// Membership Functions
// ──────────────────────────────────────────────────────────────────

async function submitMembership(event) {
    if (event) event.preventDefault();
    if (!checkSession()) return;
    
    const firstName = document.getElementById('memFirstName').value.trim();
    const lastName = document.getElementById('memLastName').value.trim();
    const email = document.getElementById('memEmail').value.trim();
    const phone = document.getElementById('memPhone').value.trim();
    const gender = document.getElementById('memGender').value;
    const age = parseInt(document.getElementById('memAge').value) || 0;
    const address = document.getElementById('memAddress').value.trim();
    
    const activeMethod = document.querySelector('#membershipPayment .pm-tab.active');
    let paymentMethod = 'Card';
    if (activeMethod) {
        const methodText = activeMethod.innerText.trim();
        if (methodText.includes('BDO')) paymentMethod = 'BDO';
        else if (methodText.includes('Metrobank')) paymentMethod = 'Metrobank';     
        else if (methodText.includes('BPI')) paymentMethod = 'BPI';
        else paymentMethod = 'Card';
    }
    
    const accountNumber = document.getElementById('paymentAccount').value.trim();
    const expiryInput = document.querySelector('#membershipPayment input[placeholder="MM/YY"]');
    const expiry = expiryInput ? expiryInput.value.trim() : '';
    const cvc = document.getElementById('cardCvc') ? document.getElementById('cardCvc').value.trim() : '';
    
    const nameRegex = /^[A-Za-z\s\-']+$/;
    if (!firstName || !nameRegex.test(firstName)) {
        showToast('Please enter a valid first name.', 'error');
        return;
    }
    if (!lastName || !nameRegex.test(lastName)) {
        showToast('Please enter a valid last name.', 'error');
        return;
    }
    
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
    
    const cleanPhone = phone.replace(/[\s-]/g, '');
    if (!/^(09\d{9}|\+639\d{9})$/.test(cleanPhone)) {
        showToast('Please enter a valid 11-digit mobile number', 'error');
        return;
    }
    
    const referenceNumber = `MEM-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    const data = {
        userId: localStorage.getItem('userId'),
        firstName, lastName, email, phone: cleanPhone,
        gender, age, address,
        paymentMethod, accountNumber: cleanCard,
        referenceNumber, amount: 1000000,
        cardExpiry: expiry, cardCvc: cvc
    };
    
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'flex';
    document.getElementById('processingMsg').textContent = 'Submitting your membership application...';
    
    try {
        const response = await apiFetch(`${API_URL}/membership/apply`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            overlay.style.display = 'none';
            showToast('✅ Membership application submitted! Admin will verify your payment.', 'success');
            document.getElementById('receiptTracking').textContent = referenceNumber;
            document.getElementById('receiptName').textContent = firstName + ' ' + lastName;
            document.getElementById('membershipPayment').style.display = 'none';
            document.getElementById('receiptPopup').style.display = 'flex';
            
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
    const fName = document.getElementById('memFirstName').value.trim();
    const lName = document.getElementById('memLastName').value.trim();
    const gender = document.getElementById('memGender').value;
    const age = document.getElementById('memAge').value.trim();
    const email = document.getElementById('memEmail').value.trim();
    const address = document.getElementById('memAddress').value.trim();
    const phone = document.getElementById('memPhone').value.trim();

    const errorDiv = document.getElementById('memError');
    const showError = (msg) => {
        if (errorDiv) {
            errorDiv.textContent = '⚠ ' + msg;
            errorDiv.style.display = 'block';
            setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
        }
    };

    if (!fName || !lName || !gender || !age || !email || !address || !phone) {
        return showError('Please fill out all required personal details.');
    }
    if (isNaN(age) || parseInt(age) < 1) {
        return showError('Please enter a valid age.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return showError('Please enter a valid email address.');
    }
    const cleanPhone = phone.replace(/[\s-]/g, '');
    if (!/^(09\d{9}|\+639\d{9})$/.test(cleanPhone)) {
        return showError('Please enter a valid 11-digit mobile number.');
    }

    if (errorDiv) errorDiv.style.display = 'none';
    
    const personalDetailsCard = document.querySelector('#tab-membership .section-card');
    if (personalDetailsCard) personalDetailsCard.style.display = 'none';
    
    document.getElementById('membershipPayment').style.display = 'block';
    document.getElementById('membershipPayment').scrollIntoView({ behavior: 'smooth' });
}

async function checkMembershipStatus() {
    if (!checkSession()) return;
    
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    
    try {
        const response = await apiFetch(`${API_URL}/users/${userId}/membership-status`);
        
        if (response.ok) {
            const data = await response.json();
            const newStatus = data.membershipStatus;
            const previousStatus = currentMembershipStatus;
            currentMembershipStatus = newStatus;
            
            localStorage.setItem('membershipStatus', newStatus);
            displayUserName();
            
            if (previousStatus !== 'active' && newStatus === 'active') {
                const hasSeenApproval = localStorage.getItem('hasSeenMembershipApproval');
                if (!hasSeenApproval) {
                    showMembershipApprovedNotification();
                    localStorage.setItem('hasSeenMembershipApproval', 'true');
                }
                hideMembershipTab();
            }
            
            if (previousStatus === 'active' && newStatus !== 'active') {
                showToast('Your membership has been revoked. Please contact admin.', 'error');
                showMembershipTab();
                displayUserName();
                localStorage.removeItem('hasSeenMembershipApproval');
            }
            
            updateMembershipUI(newStatus);
        }
    } catch (error) {
        console.error('Error checking membership status:', error);
    }
}

function showMembershipApprovedNotification() {
    if (document.getElementById('membershipApprovedModal')) return;
    
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
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
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

function hideMembershipTab() {
    const membershipTab = document.querySelector('.tab-btn[onclick*="membership"]');
    if (membershipTab) membershipTab.style.display = 'none';
    
    const membershipContent = document.getElementById('tab-membership');
    if (membershipContent && membershipContent.classList.contains('active')) {
        const reservationTab = document.querySelector('.tab-btn[onclick*="reservation"]');
        if (reservationTab) reservationTab.click();
    }
}

function showMembershipTab() {
    const membershipTab = document.querySelector('.tab-btn[onclick*="membership"]');
    if (membershipTab) membershipTab.style.display = 'flex';
}

function updateMembershipUI(status) {
    const membershipTab = document.querySelector('.tab-btn[onclick*="membership"]');
    if (status === 'active') {
        if (membershipTab) membershipTab.style.display = 'none';
        addMemberBadge();
        showMemberWelcomeMessage();
    } else {
        if (membershipTab) membershipTab.style.display = 'flex';
    }
}

function addMemberBadge() {
    const portalHeader = document.querySelector('.portal-header');
    if (portalHeader && !document.querySelector('.member-badge-header')) {
        portalHeader.insertAdjacentHTML('beforeend', `
            <div class="member-badge-header" style="display: inline-block; background: linear-gradient(135deg, var(--gold), #f1d592); color: var(--deep-green); padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: 10px;">
                ⭐ ACTIVE MEMBER - 20% DISCOUNT ⭐
            </div>
        `);
    }
}

function showMemberWelcomeMessage() {
    const reservationCard = document.querySelector('#tab-reservation .reservation-card');
    if (reservationCard && !document.querySelector('.member-welcome')) {
        reservationCard.insertAdjacentHTML('afterbegin', `
            <div class="member-welcome" style="background: linear-gradient(135deg, var(--gold), #f1d592); color: var(--deep-green); padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                <strong>🏌️ Welcome, Member!</strong> You get 20% off on all reservations!
            </div>
        `);
    }
}

async function startMembershipStatusPolling() {
    if (membershipCheckInterval) clearInterval(membershipCheckInterval);
    await checkMembershipStatus();
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
    
    let displayName = '';
    if (firstName && lastName) displayName = `${firstName} ${lastName}`;
    else if (firstName) displayName = firstName;
    else displayName = username || 'Member';
    
    userNameSpan.textContent = displayName;
    
    if (membershipStatus === 'active') {
        userNameSpan.classList.add('member');
        const badge = document.createElement('span');
        badge.className = 'member-badge';
        badge.textContent = '⭐ MEMBER';
        userNameSpan.appendChild(badge);
    } else {
        userNameSpan.classList.remove('member');
    }
}

// ──────────────────────────────────────────────────────────────────
// Dynamic Reservation System
// ──────────────────────────────────────────────────────────────────

let availableReservationTypes = [];
let selectedReservationTypeData = null;
let dynamicSelectedDate = null;
let dynamicSelectedTime = null;
let dynamicCurrentMonth = new Date();
let dynamicTotalPrice = 0;

async function loadReservationTypes() {
    try {
        const response = await apiFetch(`${API_URL}/reservation-types/active`);
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
}

function renderDynamicOptions() {
    const container = document.getElementById('dynamicOptionsContainer');
    if (!container) return;
    
    let html = '<p class="sub-title">Select Options</p>';
    html += `<div class="option-group"><label>Rate Type</label><div style="background: var(--sage); padding: 10px; border-radius: 6px;"><strong>${getRateLabel()}</strong>${isUserMember() ? '<span style="color: #28a745; margin-left: 10px;">✓ 20% discount applied</span>' : '<span style="color: #856404; margin-left: 10px;">🔒 Member discount available with membership</span>'}</div></div>`;
    
    if (selectedReservationTypeData.options && selectedReservationTypeData.options.length > 0) {
        selectedReservationTypeData.options.forEach(option => {
            html += `<div class="option-group"><label>${option.optionName}</label><select id="opt_${option.optionName.replace(/\s/g, '_')}" onchange="calculateDynamicPrice()">`;
            option.optionValues.forEach(val => {
                const displayPrice = Math.round(val.price * getUserRateMultiplier());
                html += `<option value="${val.value}" data-price="${val.price}">${val.value} - ₱${displayPrice.toLocaleString()}${!isUserMember() && val.price > 0 ? ' (regular ₱' + val.price.toLocaleString() + ')' : ''}</option>`;
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
    if (selectedReservationTypeData.options) {
        selectedReservationTypeData.options.forEach(option => {
            const select = document.getElementById(`opt_${option.optionName.replace(/\s/g, '_')}`);
            if (select && select.selectedOptions[0]) {
                total += parseInt(select.selectedOptions[0].dataset.price) || 0;
            }
        });
    }
    dynamicTotalPrice = Math.round(total * getUserRateMultiplier());
    document.getElementById('totalPrice').textContent = dynamicTotalPrice.toLocaleString();
    document.getElementById('priceDisplay').style.display = 'block';
    document.getElementById('submitReservationBtn').style.display = 'block';
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
    
    document.getElementById('calendarMonthYear').textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(dynamicCurrentMonth);
    const grid = document.getElementById('dynamicCalendarGrid');
    grid.innerHTML = '';
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(day => { grid.innerHTML += `<div class="calendar-weekday">${day}</div>`; });
    for (let i = 0; i < firstDay; i++) { grid.innerHTML += `<div class="calendar-day disabled"></div>`; }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(year, month, d);
        const isPast = cellDate < today;
        const isSelected = dynamicSelectedDate === `${year}-${month + 1}-${d}`;
        let statusClass = 'available';
        if (isPast) statusClass = 'disabled';
        grid.innerHTML += `<div class="calendar-day ${statusClass} ${isSelected ? 'selected' : ''}" onclick="${!isPast ? `selectDynamicDate(${year}, ${month + 1}, ${d})` : ''}">${d}</div>`;
    }
    if (dynamicSelectedDate) renderDynamicTimeSlots();
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
        container.innerHTML = '<p style="color:#999; text-align:center;">No time slots available</p>';
        return;
    }
    container.innerHTML = '';
    timeSlots.forEach(slot => {
        const isFull = slot.booked >= slot.capacity;
        container.innerHTML += `<div class="time-slot ${dynamicSelectedTime === slot.time ? 'selected' : ''} ${isFull ? 'full' : ''}" onclick="${!isFull ? `selectDynamicTimeSlot('${slot.time}')` : ''}">${slot.time} ${isFull ? '(Full)' : `(${slot.capacity - slot.booked} slots left)`}</div>`;
    });
}

function selectDynamicTimeSlot(time) {
    dynamicSelectedTime = time;
    renderDynamicTimeSlots();
}

function confirmDynamicDateTime() {
    if (!dynamicSelectedDate) { showToast('Please select a date', 'error'); return; }
    if (!dynamicSelectedTime) { showToast('Please select a time slot', 'error'); return; }
    
    const displayDiv = document.getElementById('selectedDateTimeDisplay');
    if (displayDiv) displayDiv.innerHTML = `Selected: ${dynamicSelectedDate} at ${dynamicSelectedTime}`;
    
    const newDateDisplay = document.getElementById('selectedDateDisplayRes');
    const newTimeDisplay = document.getElementById('selectedTimeDisplayRes');
    if (newDateDisplay) newDateDisplay.innerHTML = dynamicSelectedDate;
    if (newTimeDisplay) newTimeDisplay.innerHTML = dynamicSelectedTime;
    
    const oldDateDisplay = document.getElementById('selectedDateDisplay');
    const oldTimeDisplay = document.getElementById('selectedTimeDisplay');
    if (oldDateDisplay) oldDateDisplay.innerHTML = `Day of Reservation: <strong>${dynamicSelectedDate}</strong>`;
    if (oldTimeDisplay) oldTimeDisplay.innerHTML = `Time of Reservation: <strong>${dynamicSelectedTime}</strong>`;
    
    closeDynamicCalendarPopup();
    showToast('Date and time confirmed!', 'success');
}

function changeCalendarMonth(delta) {
    dynamicCurrentMonth.setMonth(dynamicCurrentMonth.getMonth() + delta);
    renderDynamicCalendar();
}

async function submitDynamicReservation() {
    if (!checkSession()) return;
    if (!selectedReservationTypeData) { showToast('Please select a reservation type', 'error'); return; }
    if (!dynamicSelectedDate || !dynamicSelectedTime) { showToast('Please select a date and time first', 'error'); return; }
    
    const firstName = document.getElementById('resFirstName').value.trim();
    const lastName = document.getElementById('resLastName').value.trim();
    const email = document.getElementById('resEmail').value.trim();
    const phone = document.getElementById('resPhone').value.trim();
    
    if (!firstName || !lastName || !email || !phone) { showToast('Please fill in all personal details', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Please enter a valid email address', 'error'); return; }
    const cleanPhone = phone.replace(/[\s-]/g, '');
    if (!/^(09\d{9}|\+639\d{9})$/.test(cleanPhone)) { showToast('Please enter a valid 11-digit mobile number', 'error'); return; }
    
    const reservationCard = document.querySelector('#tab-reservation .reservation-card');
    if (reservationCard) reservationCard.style.display = 'none';
    
    const newDateDisplay = document.getElementById('selectedDateDisplayRes');
    const newTimeDisplay = document.getElementById('selectedTimeDisplayRes');
    if (newDateDisplay) newDateDisplay.innerHTML = dynamicSelectedDate;
    if (newTimeDisplay) newTimeDisplay.innerHTML = dynamicSelectedTime;
    
    const paymentSection = document.getElementById('reservationPayment');
    if (paymentSection) {
        paymentSection.style.display = 'block';
        paymentSection.scrollIntoView({ behavior: 'smooth' });
    }
}

async function submitDynamicReservationPayment() {
    if (!checkSession()) return;
    
    const firstName = document.getElementById('resFirstName').value.trim();
    const lastName = document.getElementById('resLastName').value.trim();
    const email = document.getElementById('resEmail').value.trim();
    const phone = document.getElementById('resPhone').value.trim();
    const paymentMethod = document.querySelector('#reservationPayment .method-btn.active')?.textContent || 'GCash';
    const accountNumber = document.getElementById('resPaymentAccount').value.trim();
    const referenceNumber = document.getElementById('resReferenceNumber').value.trim();
    
    if (!accountNumber) { showToast('Please enter your account number', 'error'); return; }
    if (!referenceNumber) { showToast('Please enter the reference/transaction ID', 'error'); return; }
    
    const data = {
        userId: localStorage.getItem('userId'),
        firstName, lastName, email, phone,
        date: dynamicSelectedDate, timeSlot: dynamicSelectedTime,
        reservationType: selectedReservationTypeData?.name,
        paymentMethod, accountNumber, referenceNumber,
        amount: dynamicTotalPrice, originalAmount: calculateOriginalPrice(),
        isMember: isUserMember(), memberDiscount: isUserMember() ? 0.2 : 0
    };
    
    const overlay = document.getElementById('processingOverlay');
    overlay.style.display = 'flex';
    document.getElementById('processingMsg').textContent = 'Submitting your reservation...';
    
    try {
        const response = await apiFetch(`${API_URL}/reservations/apply`, { method: 'POST', body: JSON.stringify(data) });
        const result = await response.json();
        
        if (response.ok) {
            overlay.style.display = 'none';
            const memberText = isUserMember() ? ' (Member discount applied!)' : '';
            showToast(`Reservation submitted!${memberText} Admin will verify your payment.`, 'success');
            document.getElementById('successMsg').innerHTML = `Reservation submitted.<br><br>Reservation ID: ${result.applicationId}<br><br>Amount: ₱${dynamicTotalPrice.toLocaleString()}${memberText}`;
            document.getElementById('successPopup').style.display = 'flex';
            document.getElementById('reservationPayment').style.display = 'none';
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
                total += parseInt(select.selectedOptions[0].dataset.price) || 0;
            }
        });
    }
    return total;
}

function showPaymentSection() {
    document.getElementById('membershipPopup').style.display = 'none';
    const personalDetailsCard = document.querySelector('#tab-membership .section-card');
    if (personalDetailsCard) personalDetailsCard.style.display = 'none';
    document.getElementById('membershipPayment').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function downloadReceiptImage() {
    const receiptContent = document.querySelector('#receiptPopup .popup-card');
    if (receiptContent) {
        html2canvas(receiptContent, { scale: 2, backgroundColor: "#ffffff", logging: false })
            .then(canvas => {
                const link = document.createElement('a');
                link.download = `ILISY_Receipt_${Date.now()}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
            }).catch(error => {
                console.error('Error generating receipt:', error);
                showToast('Error generating receipt', 'error');
            });
    }
}

function closeReceiptAndReset() {
    document.getElementById('receiptPopup').style.display = 'none';
    const personalDetailsCard = document.querySelector('#tab-membership .section-card');
    if (personalDetailsCard) personalDetailsCard.style.display = 'block';
    document.getElementById('membershipPayment').style.display = 'none';
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

function formatCardNumber(input) {
    let val = input.value.replace(/\D/g, '');
    val = val.replace(/(.{4})/g, '$1 ').trim();
    input.value = val;
}

function formatExpiry(input, event) {
    if (event.inputType === 'deleteContentBackward') return;
    let val = input.value.replace(/\D/g, '');
    if (val.length >= 2) {
        let month = val.substring(0, 2);
        if (parseInt(month) > 12) month = '12';
        if (parseInt(month) === 0) month = '01';
        let day = val.substring(2, 4);
        if (day.length === 2) {
            if (parseInt(day) > 31) day = '31';
            if (parseInt(day) === 0) day = '01';
        }
        input.value = month + '/' + day;
    } else {
        input.value = val;
    }
}

function pickMethod(btn) {
    document.querySelectorAll('.pm-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const method = btn.innerText.trim();
    const bankNameDisplay = document.getElementById('merchantBankName');
    const accountNoDisplay = document.getElementById('merchantAccountNumber');
    const inputLabel = document.getElementById('labelPaymentAccount');
    if (bankNameDisplay) bankNameDisplay.innerText = method;
    if (inputLabel) inputLabel.innerText = method + " Card number";
    if (method.includes("BDO")) accountNoDisplay.innerText = "4512 3456 7890 1234";
    else if (method.includes("Metrobank")) accountNoDisplay.innerText = "5123 9988 7766 5544";
    else if (method.includes("BPI")) accountNoDisplay.innerText = "4213 0011 2233 4455";
    const userAccountInput = document.getElementById('paymentAccount');
    if (userAccountInput) userAccountInput.value = "";
}

function pickReservationMethod(btn) {
    document.querySelectorAll('#reservationPayment .pm-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const method = btn.innerText.trim();
    const bankNameDisplay = document.getElementById('resMerchantBankName');
    const accountNoDisplay = document.getElementById('resMerchantAccountNumber');
    const inputLabel = document.getElementById('resLabelPaymentAccount');
    if (bankNameDisplay) bankNameDisplay.innerText = method;
    if (inputLabel) inputLabel.innerText = method + " Card number";
    if (method.includes("BDO")) accountNoDisplay.innerText = "4512 3456 7890 1234";
    else if (method.includes("Metrobank")) accountNoDisplay.innerText = "5123 9988 7766 5544";
    else if (method.includes("BPI")) accountNoDisplay.innerText = "4213 0011 2233 4455";
    const userAccountInput = document.getElementById('resPaymentAccount');
    if (userAccountInput) userAccountInput.value = "";
}

function formatReservationCardNumber(input) {
    let val = input.value.replace(/\D/g, '');
    val = val.replace(/(.{4})/g, '$1 ').trim();
    input.value = val;
}

function formatReservationExpiry(input, event) {
    if (event.inputType === 'deleteContentBackward') return;
    let val = input.value.replace(/\D/g, '');
    if (val.length >= 2) {
        let month = val.substring(0, 2);
        if (parseInt(month) > 12) month = '12';
        if (parseInt(month) === 0) month = '01';
        let day = val.substring(2, 4);
        if (day.length === 2) {
            if (parseInt(day) > 31) day = '31';
            if (parseInt(day) === 0) day = '01';
        }
        input.value = month + '/' + day;
    } else {
        input.value = val;
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

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkSession()) return;
    
    displayUserName();
    renderCalendars();
    loadConversationHistory();
    startPollingForResponses();
    loadReservationTypes();
    
    await startMembershipStatusPolling();
    
    const memFirstName = document.getElementById('memFirstName');
    const memLastName = document.getElementById('memLastName');
    
    function validateMemberName(input, errorSpanId, fieldName) {
        const nameValue = input.value.trim();
        const nameRegex = /^[A-Za-z\s\-']*$/;
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
        memFirstName.addEventListener('input', () => validateMemberName(memFirstName, 'memFirstNameError', 'First name'));
    }
    if (memLastName) {
        memLastName.addEventListener('input', () => validateMemberName(memLastName, 'memLastNameError', 'Last name'));
    }
    
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); });
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
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab && activeTab.id) {
            saveTabScrollPosition(activeTab.id.replace('tab-', ''));
        }
    });
    
    await loadLastVisitedTab();
});

// Window exports - add ALL functions that are called from HTML
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
window.submitReservation = submitReservation;  // ADD THIS - was missing
window.pickMethod = pickMethod;
window.selectTimeSlot = selectTimeSlot;
window.changeMonth = changeMonth;
window.confirmTimeSlot = confirmTimeSlot;
window.handleLogout = handleLogout;
window.switchTab = switchTab;
window.pickReservationMethod = pickReservationMethod;
window.formatReservationCardNumber = formatReservationCardNumber;
window.formatReservationExpiry = formatReservationExpiry;
window.submitReservationPayment = submitReservationPayment;
window.downloadReceiptImage = downloadReceiptImage;
window.closeReceiptAndReset = closeReceiptAndReset;
window.showPaymentSection = showPaymentSection;
window.closeMembershipApprovedModal = closeMembershipApprovedModal;
window.formatCardNumber = formatCardNumber;
window.formatExpiry = formatExpiry;
window.uploadReceiptImage = uploadReceiptImage;  // ADD THIS for image upload
window.viewFullImage = viewFullImage;  // ADD THIS for viewing images
window.removeImagePreview = removeImagePreview;  // ADD THIS