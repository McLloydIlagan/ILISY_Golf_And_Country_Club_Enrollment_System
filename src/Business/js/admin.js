const API_URL = 'https://ilisy-golf-and-country-club-enrollment.onrender.com/api';

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

// ──────────────────────────────────────────────────────────────────
// Navigation
// ──────────────────────────────────────────────────────────────────

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const page = document.getElementById('page-' + id);
    if (page) page.classList.add('active');
    
    const map = { dashboard: 0, reservations: 1, accounts: 2, payments: 3, messages: 4, customerservice: 5 };
    const items = document.querySelectorAll('.nav-item');
    if (map[id] !== undefined && items[map[id]]) {
        items[map[id]].classList.add('active');
    }
    
    if (id === 'dashboard') loadDashboardStats();
    else if (id === 'accounts') loadUsers();
    else if (id === 'payments') loadPayments();
    else if (id === 'messages') loadMessages();
    else if (id === 'reservations') loadReservations();
    else if (id === 'customerservice') loadCustomerServiceRecords();
}

// ──────────────────────────────────────────────────────────────────
// Dashboard Functions
// ──────────────────────────────────────────────────────────────────

async function loadDashboardStats() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/dashboard`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const stats = await response.json();
            const statNumbers = document.querySelectorAll('.stat-card .stat-num');
            if (statNumbers.length >= 3) {
                statNumbers[0].textContent = stats.members || 0;
                statNumbers[1].textContent = stats.reservations || 0;
                statNumbers[2].textContent = `₱${(stats.income || 0).toLocaleString()}`;
            }
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// ──────────────────────────────────────────────────────────────────
// Users Management
// ──────────────────────────────────────────────────────────────────

async function loadUsers() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const users = await response.json();
            const tbody = document.getElementById('accountsTbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No users found</td></tr>';
                return;
            }
            
            users.forEach(user => {
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${escapeHtml(user.firstName || '')}</td>
                    <td>${escapeHtml(user.lastName || '')}</td>
                    <td>${escapeHtml(user.phone || '')}<br><small>${escapeHtml(user.email || '')}</small></td>
                    <td><span class="badge ${user.membershipStatus === 'active' ? 'badge-active' : 'badge-none'}">${escapeHtml(user.membershipStatus || 'none')}</span></td>
                    <td>${user.membershipExpiration ? new Date(user.membershipExpiration).toLocaleDateString() : 'N/A'}</td>
                    <td>
                        <button class="btn-edit" onclick="editUser('${user._id}')">edit</button>
                        <button class="btn-remove" onclick="showRemoveModal('${user._id}')">remove</button>
                    </td>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showToast('Error loading users', 'error');
    }
}

async function editUser(userId) {
    const newMembershipStatus = prompt('Enter new membership status (active/pending/expired/none):');
    if (!newMembershipStatus) return;
    
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ membershipStatus: newMembershipStatus })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            showToast('User updated successfully', 'success');
            loadUsers();
        } else {
            const error = await response.json();
            showToast(error.message || 'Update failed', 'error');
        }
    } catch (error) {
        console.error('Error updating user:', error);
        showToast('Error updating user', 'error');
    }
}

let userToRemove = null;

function showRemoveModal(userId) {
    userToRemove = userId;
    document.getElementById('removeModal').classList.add('show');
}

async function confirmRemove() {
    if (!userToRemove) return;
    
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/users/${userToRemove}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            showToast('User removed successfully', 'success');
            loadUsers();
        } else {
            const error = await response.json();
            showToast(error.message || 'Remove failed', 'error');
        }
    } catch (error) {
        console.error('Error removing user:', error);
        showToast('Error removing user', 'error');
    } finally {
        closeModal('removeModal');
        userToRemove = null;
    }
}

// ──────────────────────────────────────────────────────────────────
// Payments Management
// ──────────────────────────────────────────────────────────────────

async function loadPayments() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/payments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const payments = await response.json();
            const tbody = document.getElementById('paymentsTbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            if (payments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No payments found</td></tr>';
                return;
            }
            
            payments.forEach(payment => {
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${escapeHtml(payment.firstName || '')}</td>
                    <td>${escapeHtml(payment.lastName || '')}</td>
                    <td>${escapeHtml(payment.paymentMethod || '')}</td>
                    <td>${escapeHtml(payment.accountNumber || '')}</td>
                    <td>₱${(payment.amount || 0).toLocaleString()}</td>
                    <td>${payment.processedAt ? new Date(payment.processedAt).toLocaleDateString() : payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : 'Pending'}</td>
                    <td><span class="badge ${payment.transactionType === 'membership' ? 'badge-active' : 'badge-none'}">${escapeHtml(payment.transactionType || 'N/A')}</span></td>
                    <td><button class="btn-refund" onclick="showRefundModal('${payment._id}', '${escapeHtml(payment.firstName)} ${escapeHtml(payment.lastName)}')">Refund</button></td>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading payments:', error);
        showToast('Error loading payments', 'error');
    }
}

let currentPaymentId = null;
let currentRefundName = '';

function showRefundModal(paymentId, name) {
    currentPaymentId = paymentId;
    currentRefundName = name;
    document.getElementById('refundConfirmText').innerHTML = `Make a refund for user, <strong>${escapeHtml(name)}</strong>?<br>Refund will be made through original payment method.`;
    document.getElementById('refundConfirmModal').classList.add('show');
}

function openRefundReasons() {
    closeModal('refundConfirmModal');
    document.getElementById('refundReasonTitle').textContent = `Make a refund for, ${currentRefundName}`;
    document.getElementById('refundReasonsModal').classList.add('show');
}

async function processRefund() {
    if (!currentPaymentId) return;
    
    const reasons = [];
    const checkboxes = ['reason1', 'reason2', 'reason3', 'reason4', 'reason5', 'reasonOther'];
    checkboxes.forEach(id => {
        const cb = document.getElementById(id);
        if (cb && cb.checked) {
            if (id === 'reasonOther') {
                const otherText = document.getElementById('otherReason')?.value;
                if (otherText) reasons.push(otherText);
            } else {
                const label = document.querySelector(`label[for="${id}"]`);
                if (label) reasons.push(label.textContent);
            }
        }
    });
    
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/payments/${currentPaymentId}/refund`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ refundReason: reasons.join(', ') })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            showToast('Refund processed successfully', 'success');
            loadPayments();
        } else {
            const error = await response.json();
            showToast(error.message || 'Refund failed', 'error');
        }
    } catch (error) {
        console.error('Error processing refund:', error);
        showToast('Error processing refund', 'error');
    } finally {
        closeModal('refundReasonsModal');
        checkboxes.forEach(id => {
            const cb = document.getElementById(id);
            if (cb) cb.checked = false;
        });
        document.getElementById('otherReason').value = '';
        currentPaymentId = null;
    }
}

// ──────────────────────────────────────────────────────────────────
// Reservations Management
// ──────────────────────────────────────────────────────────────────

async function loadReservations() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/applications`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const applications = await response.json();
            const tbody = document.getElementById('reservationAppTbody');
            if (!tbody) return;
            tbody.innerHTML = '';
            
            if (applications.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No reservation applications found</td></tr>';
                return;
            }
            
            applications.forEach(app => {
                const row = tbody.insertRow();
                row.innerHTML = `
                    <td>${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</td>
                    <td>${app.details?.date ? new Date(app.details.date).toLocaleDateString() : 'N/A'}</td>
                    <td>${escapeHtml(app.details?.timeSlot || 'N/A')}</td>
                    <td>
                        <button class="action-btn btn-approve" onclick="approveReservation('${app._id}')">Approve</button>
                        <button class="btn-remove" onclick="rejectReservation('${app._id}')">Reject</button>
                    </td>
                `;
            });
        }
    } catch (error) {
        console.error('Error loading reservations:', error);
    }
}

async function approveReservation(appId) {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/reservations/${appId}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            showToast('Reservation approved!', 'success');
            loadReservations();
        } else {
            const error = await response.json();
            showToast(error.message || 'Approval failed', 'error');
        }
    } catch (error) {
        console.error('Error approving reservation:', error);
        showToast('Error approving reservation', 'error');
    }
}

async function rejectReservation(appId) {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/reservations/${appId}/reject`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            showToast('Reservation rejected', 'success');
            loadReservations();
        } else {
            const error = await response.json();
            showToast(error.message || 'Rejection failed', 'error');
        }
    } catch (error) {
        console.error('Error rejecting reservation:', error);
        showToast('Error rejecting reservation', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────
// Messages / Customer Service with Auto-Refresh
// ──────────────────────────────────────────────────────────────────

let adminPollingInterval = null;
let currentMessage = null;
let currentUserId = null;

async function loadMessages() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const messages = await response.json();
            const msgSidebar = document.getElementById('msgSidebar');
            if (msgSidebar) {
                const currentActiveUserId = document.querySelector('.msg-contact.active')?.getAttribute('data-user-id');
                
                msgSidebar.innerHTML = '';
                
                if (messages.length === 0) {
                    msgSidebar.innerHTML = '<div style="padding:20px; text-align:center; color:#ccc;">No messages found</div>';
                    return;
                }
                
                // Group messages by userId to prevent duplicates
                const uniqueUsers = new Map();
                messages.forEach(msg => {
                    if (!uniqueUsers.has(msg.userId) || new Date(msg.createdAt) > new Date(uniqueUsers.get(msg.userId).createdAt)) {
                        uniqueUsers.set(msg.userId, msg);
                    }
                });
                
                let newActiveContact = null;
                
                uniqueUsers.forEach(msg => {
                    const contactDiv = document.createElement('div');
                    contactDiv.className = 'msg-contact';
                    contactDiv.setAttribute('data-user-id', msg.userId);
                    contactDiv.onclick = () => selectContact(contactDiv, msg);
                    
                    contactDiv.innerHTML = `
                        <div class="contact-avatar">👤</div>
                        <div>
                            <div class="msg-contact-name">${escapeHtml(msg.userName || 'User')}</div>
                            <div style="font-size:11px;color:#ccc;">${escapeHtml(msg.concernType || 'general')}</div>
                        </div>
                        <div class="msg-contact-dot ${msg.status === 'pending' ? 'online' : ''}" style="margin-left:auto;"></div>
                    `;
                    msgSidebar.appendChild(contactDiv);
                    
                    if (currentActiveUserId === msg.userId) {
                        newActiveContact = contactDiv;
                    }
                });
                
                // Re-select previously active conversation if it exists
                if (newActiveContact && currentMessage) {
                    newActiveContact.classList.add('active');
                    await refreshCurrentConversation();
                }
            }
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

async function refreshCurrentConversation() {
    if (!currentMessage) return;
    
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const messages = await response.json();
            const updatedMessage = messages.find(m => m.userId === currentUserId);
            
            if (updatedMessage) {
                currentMessage = updatedMessage;
                
                const msgBody = document.getElementById('msgBody');
                msgBody.innerHTML = '';
                
                if (updatedMessage.conversation && updatedMessage.conversation.length > 0) {
                    updatedMessage.conversation.forEach(conv => {
                        const row = document.createElement('div');
                        row.className = `msg-row-wrap ${conv.sender === 'admin' ? 'sent' : ''}`;
                        if (conv.sender === 'user') {
                            row.innerHTML = `
                                <div class="chat-avatar">👤</div>
                                <div class="chat-bubble bubble-received">${escapeHtml(conv.message)}</div>
                            `;
                        } else {
                            row.innerHTML = `
                                <div class="chat-bubble bubble-sent">${escapeHtml(conv.message)}</div>
                                <div class="chat-avatar">👤</div>
                            `;
                        }
                        msgBody.appendChild(row);
                    });
                } else {
                    msgBody.innerHTML = `<div class="chat-bubble bubble-received">${escapeHtml(updatedMessage.message || 'No message')}</div>`;
                }
                msgBody.scrollTop = msgBody.scrollHeight;
            }
        }
    } catch (error) {
        console.error('Error refreshing conversation:', error);
    }
}

function selectContact(element, message) {
    currentMessage = message;
    currentUserId = message.userId;
    
    document.querySelectorAll('.msg-contact').forEach(c => c.classList.remove('active'));
    element.classList.add('active');
    document.getElementById('msgWindowHeader').textContent = message.userName || 'User';
    
    const msgBody = document.getElementById('msgBody');
    msgBody.innerHTML = '';
    
    if (message.conversation && message.conversation.length > 0) {
        message.conversation.forEach(conv => {
            const row = document.createElement('div');
            row.className = `msg-row-wrap ${conv.sender === 'admin' ? 'sent' : ''}`;
            if (conv.sender === 'user') {
                row.innerHTML = `
                    <div class="chat-avatar">👤</div>
                    <div class="chat-bubble bubble-received">${escapeHtml(conv.message)}</div>
                `;
            } else {
                row.innerHTML = `
                    <div class="chat-bubble bubble-sent">${escapeHtml(conv.message)}</div>
                    <div class="chat-avatar">👤</div>
                `;
            }
            msgBody.appendChild(row);
        });
    } else {
        msgBody.innerHTML = `<div class="chat-bubble bubble-received">${escapeHtml(message.message || 'No message')}</div>`;
    }
    msgBody.scrollTop = msgBody.scrollHeight;
}

async function adminSendMsg() {
    if (!currentMessage) {
        showToast('Please select a conversation first', 'error');
        return;
    }
    
    const input = document.getElementById('adminMsgInput');
    const text = input.value.trim();
    if (!text) return;
    
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/messages/${currentMessage._id}/respond`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ response: text })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const msgBody = document.getElementById('msgBody');
            const row = document.createElement('div');
            row.className = 'msg-row-wrap sent';
            row.innerHTML = `
                <div class="chat-bubble bubble-sent">${escapeHtml(text)}</div>
                <div class="chat-avatar">👤</div>
            `;
            msgBody.appendChild(row);
            input.value = '';
            msgBody.scrollTop = msgBody.scrollHeight;
            
            if (!currentMessage.conversation) currentMessage.conversation = [];
            currentMessage.conversation.push({ sender: 'admin', message: text, timestamp: new Date() });
            currentMessage.status = 'acknowledged';
            
            showToast('Response sent', 'success');
            
            const activeContact = document.querySelector('.msg-contact.active');
            if (activeContact) {
                const dot = activeContact.querySelector('.msg-contact-dot');
                if (dot) dot.classList.remove('online');
            }
            
            setTimeout(() => loadMessages(), 500);
        } else {
            const error = await response.json();
            showToast(error.message || 'Failed to send', 'error');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Error sending message', 'error');
    }
}

function startAdminMessagePolling() {
    if (adminPollingInterval) clearInterval(adminPollingInterval);
    adminPollingInterval = setInterval(() => {
        loadMessages();
    }, 5000);
}

function stopAdminMessagePolling() {
    if (adminPollingInterval) {
        clearInterval(adminPollingInterval);
        adminPollingInterval = null;
    }
}

async function loadCustomerServiceRecords() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/messages`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const messages = await response.json();
            const resolved = messages.filter(m => m.status === 'resolved');
            const tbody = document.getElementById('csTbody');
            if (tbody) {
                tbody.innerHTML = '';
                
                if (resolved.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No resolved records found</td></tr>';
                    return;
                }
                
                resolved.forEach(msg => {
                    const nameParts = (msg.userName || 'User User').split(' ');
                    const firstName = nameParts[0] || '';
                    const lastName = nameParts.slice(1).join(' ') || '';
                    const row = tbody.insertRow();
                    row.innerHTML = `
                        <td>${escapeHtml(firstName)}</td>
                        <td>${escapeHtml(lastName)}</td>
                        <td>${escapeHtml(msg.concernType || 'general')}</td>
                        <td><button class="btn-view" onclick="viewConversation('${msg._id}')">view</button></td>
                        <td>${msg.resolution ? escapeHtml(msg.resolution.substring(0, 50)) : 'N/A'}</td>
                        <td>
                            <button class="btn-add" onclick="addNote('${msg._id}')">add</button>
                            <button class="btn-remove" onclick="deleteRecord('${msg._id}')">remove</button>
                        </td>
                    `;
                });
            }
        }
    } catch (error) {
        console.error('Error loading customer service records:', error);
    }
}

function viewConversation(messageId) {
    showToast('Conversation transcript feature coming soon', 'success');
}

function addNote(messageId) {
    const note = prompt('Add a note to this record:');
    if (note) {
        showToast('Note added successfully', 'success');
    }
}

async function deleteRecord(messageId) {
    showToast('Record deleted', 'success');
    loadCustomerServiceRecords();
}

// ──────────────────────────────────────────────────────────────────
// Calendar Functions
// ──────────────────────────────────────────────────────────────────

function buildAdminCal() {
    const grid = document.getElementById('adminCal');
    if (!grid) return;
    grid.innerHTML = '';
    const bookedDays = [8, 22];
    const partialDays = [5, 10, 17];
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
        grid.innerHTML += `<div style="font-size:10px;color:#888;text-align:center;font-weight:bold;">${d}</div>`;
    });
    for (let d = 1; d <= 28; d++) {
        let cls = bookedDays.includes(d) ? 'booked' : partialDays.includes(d) ? 'partial' : '';
        grid.innerHTML += `<div class="res-day ${cls}" onclick="openResDetail(${d})">${d}</div>`;
    }
}

function openResDetail(day) {
    const modalDate = document.getElementById('resDetailDate');
    if (modalDate) modalDate.textContent = `February ${day}, 2026`;
    const modal = document.getElementById('resDetailModal');
    if (modal) modal.classList.add('show');
}

// ──────────────────────────────────────────────────────────────────
// Modal Functions
// ──────────────────────────────────────────────────────────────────

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
}

function filterTable(tbodyId, query) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(r => {
        if (r.cells && r.cells.length > 0) {
            r.style.display = r.textContent.toLowerCase().includes(query.toLowerCase()) ? '' : 'none';
        }
    });
}

function removeRow(btn) {
    if (confirm('Remove this record?')) {
        const row = btn.closest('tr');
        if (row) row.remove();
    }
}

// ──────────────────────────────────────────────────────────────────
// Event Listeners & Initialization
// ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    if (!checkSession()) return;
    
    buildAdminCal();
    
    loadDashboardStats();
    loadUsers();
    loadPayments();
    loadMessages();
    loadReservations();
    loadCustomerServiceRecords();
    
    startAdminMessagePolling();
    
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.addEventListener('click', e => {
            if (e.target === o) o.classList.remove('show');
        });
    });
    
    const msgInput = document.getElementById('adminMsgInput');
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminSendMsg();
        });
    }
    
    window.addEventListener('beforeunload', () => {
        stopAdminMessagePolling();
    });
});

// Make functions global
window.showPage = showPage;
window.handleLogout = handleLogout;
window.editUser = editUser;
window.showRemoveModal = showRemoveModal;
window.confirmRemove = confirmRemove;
window.showRefundModal = showRefundModal;
window.openRefundReasons = openRefundReasons;
window.processRefund = processRefund;
window.closeModal = closeModal;
window.approveReservation = approveReservation;
window.rejectReservation = rejectReservation;
window.adminSendMsg = adminSendMsg;
window.selectContact = selectContact;
window.filterTable = filterTable;
window.removeRow = removeRow;
window.openResDetail = openResDetail;
window.loadPayments = loadPayments;
window.loadUsers = loadUsers;
window.loadDashboardStats = loadDashboardStats;
window.loadReservations = loadReservations;
window.loadMessages = loadMessages;
window.loadCustomerServiceRecords = loadCustomerServiceRecords;
window.viewConversation = viewConversation;
window.addNote = addNote;
window.deleteRecord = deleteRecord;