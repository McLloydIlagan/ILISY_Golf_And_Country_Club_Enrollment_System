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
    else if (id === 'manage_reservations') loadReservationTypes();
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
    loadPendingApplications();
    
    startAdminMessagePolling();
    
    document.querySelectorAll('.modal-overlay').forEach(o => {
        o.addEventListener('click', e => {
            if (e.target === o) o.classList.remove('show');
        });
    });
    
    const msgInput = document.getElementById('adminMsgInput');
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); adminSendMsg(); }
        });
    }
    
    window.addEventListener('beforeunload', () => {
        stopAdminMessagePolling();
    });
});

let currentValidateApplication = null;

async function openValidateModal(applicationId) {
    console.log('Opening validate modal for:', applicationId);
    
    const modal = document.getElementById('validatePaymentModal');
    const modalBody = document.getElementById('validateModalBody');
    
    // Show loading
    modalBody.innerHTML = '<div class="loading-spinner">Loading application details...</div>';
    modal.classList.add('show');
    
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/application/${applicationId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const app = await response.json();
            currentValidateApplication = app;
            renderValidateModalContent(app);
        } else {
            modalBody.innerHTML = '<div style="text-align:center; padding:40px; color:#dc3545;">❌ Failed to load application details</div>';
        }
    } catch (error) {
        console.error('Error loading application:', error);
        modalBody.innerHTML = '<div style="text-align:center; padding:40px; color:#dc3545;">❌ Connection error</div>';
    }
}

function renderValidateModalContent(app) {
    const modalBody = document.getElementById('validateModalBody');
    const isMembership = app.type === 'membership';
    
    modalBody.innerHTML = `
        <div class="app-detail-section">
            <h4>📋 Application Information</h4>
            <div class="detail-row">
                <span class="detail-label">Type:</span>
                <span class="detail-value">
                    <span class="status-badge status-pending">
                        ${isMembership ? '🏌️ Membership' : '📅 Reservation'}
                    </span>
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value"><span class="status-badge status-pending">Pending Verification</span></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Submitted:</span>
                <span class="detail-value">${new Date(app.createdAt).toLocaleString()}</span>
            </div>
        </div>
        
        <div class="app-detail-section">
            <h4>👤 Personal Details</h4>
            <div class="detail-row">
                <span class="detail-label">Name:</span>
                <span class="detail-value">${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Email:</span>
                <span class="detail-value">${escapeHtml(app.email)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Phone:</span>
                <span class="detail-value">${escapeHtml(app.phone)}</span>
            </div>
            ${app.details?.gender ? `
            <div class="detail-row">
                <span class="detail-label">Gender:</span>
                <span class="detail-value">${escapeHtml(app.details.gender)}</span>
            </div>
            ` : ''}
            ${app.details?.age ? `
            <div class="detail-row">
                <span class="detail-label">Age:</span>
                <span class="detail-value">${app.details.age}</span>
            </div>
            ` : ''}
        </div>
        
        <div class="payment-info-box">
            <h4>💰 Payment Details</h4>
            <div class="detail-row">
                <span class="detail-label">Payment Method:</span>
                <span class="detail-value"><strong>${escapeHtml(app.paymentMethod || 'N/A')}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Account Number:</span>
                <span class="detail-value">${escapeHtml(app.accountNumber || 'N/A')}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Reference Number:</span>
                <span class="detail-value highlight">
                    <div class="ref-number">${escapeHtml(app.referenceNumber || 'N/A')}</div>
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Amount:</span>
                <span class="detail-value"><strong>₱${(app.amount || 0).toLocaleString()}</strong></span>
            </div>
        </div>
        
        ${isMembership ? '' : `
        <div class="app-detail-section">
            <h4>⏰ Reservation Details</h4>
            <div class="detail-row">
                <span class="detail-label">Date:</span>
                <span class="detail-value">${app.details?.date ? new Date(app.details.date).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Time Slot:</span>
                <span class="detail-value">${escapeHtml(app.details?.timeSlot || 'N/A')}</span>
            </div>
        </div>
        `}
        
        <div class="admin-notes">
            <label>📝 Admin Notes (Optional)</label>
            <textarea id="adminNotesTextarea" placeholder="Add any notes about this verification..."></textarea>
        </div>
        
        <div class="modal-action-buttons">
            <button class="btn-verify" onclick="confirmVerifyPayment()">
                ✓ Verify & Approve
            </button>
            <button class="btn-reject-modal" onclick="confirmRejectPayment()">
                ✗ Reject Application
            </button>
        </div>
    `;
}

function closeValidateModal() {
    document.getElementById('validatePaymentModal').classList.remove('show');
    currentValidateApplication = null;
}

async function confirmVerifyPayment() {
    if (!currentValidateApplication) return;
    
    const token = getAuthToken();
    const notes = document.getElementById('adminNotesTextarea')?.value || '';
    
    // Show loading on buttons
    const verifyBtn = document.querySelector('.btn-verify');
    const originalText = verifyBtn.innerHTML;
    verifyBtn.innerHTML = '⏳ Processing...';
    verifyBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_URL}/admin/applications/${currentValidateApplication._id}/verify-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ adminNotes: notes })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        const result = await response.json();
        
        if (response.ok) {
            showToast(`✅ ${currentValidateApplication.type === 'membership' ? 'Membership' : 'Reservation'} verified and approved!`, 'success');
            closeValidateModal();
            // Refresh the page data
            loadPendingApplications();
            loadDashboardStats();
            if (typeof loadReservations === 'function') loadReservations();
            if (typeof loadUsers === 'function') loadUsers();
        } else {
            showToast(result.message || 'Verification failed', 'error');
        }
    } catch (error) {
        console.error('Error verifying:', error);
        showToast('Error processing verification', 'error');
    } finally {
        verifyBtn.innerHTML = originalText;
        verifyBtn.disabled = false;
    }
}

async function confirmRejectPayment() {
    if (!currentValidateApplication) return;
    
    const token = getAuthToken();
    const reason = prompt('Please enter the reason for rejection:');
    
    if (!reason) {
        showToast('Rejection reason is required', 'error');
        return;
    }
    
    const rejectBtn = document.querySelector('.btn-reject-modal');
    const originalText = rejectBtn.innerHTML;
    rejectBtn.innerHTML = '⏳ Processing...';
    rejectBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_URL}/admin/applications/${currentValidateApplication._id}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ rejectionReason: reason })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        const result = await response.json();
        
        if (response.ok) {
            showToast(`❌ Application rejected`, 'success');
            closeValidateModal();
            loadPendingApplications();
        } else {
            showToast(result.message || 'Rejection failed', 'error');
        }
    } catch (error) {
        console.error('Error rejecting:', error);
        showToast('Error processing rejection', 'error');
    } finally {
        rejectBtn.innerHTML = originalText;
        rejectBtn.disabled = false;
    }
}

// Add this to load pending applications for the admin dashboard
async function loadPendingApplications() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/pending-applications`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const applications = await response.json();
            updatePendingApplicationsTable(applications);
        }
    } catch (error) {
        console.error('Error loading pending applications:', error);
    }
}

function updatePendingApplicationsTable(applications) {
    // Find or create a table for pending applications
    let tableContainer = document.getElementById('pendingAppsContainer');
    
    if (!tableContainer) {
        // Create a new section in the dashboard or payments page
        const dashboardPage = document.getElementById('page-dashboard');
        if (dashboardPage) {
            const newSection = document.createElement('div');
            newSection.className = 'table-section';
            newSection.id = 'pendingAppsContainer';
            newSection.innerHTML = `
                <h3>⏳ Pending Payment Verifications</h3>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Name</th>
                            <th>Payment Method</th>
                            <th>Reference #</th>
                            <th>Amount</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="pendingAppsTableBody"></tbody>
                </table>
            `;
            dashboardPage.querySelector('.page-body').insertBefore(newSection, dashboardPage.querySelector('.dashboard-grid'));
            tableContainer = newSection;
        }
    }
    
    const tbody = document.getElementById('pendingAppsTableBody');
    if (!tbody) return;
    
    if (applications.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No pending applications</td></tr>';
        return;
    }
    
    tbody.innerHTML = applications.map(app => `
        <tr>
            <td><span class="badge-pending">${app.type === 'membership' ? '📋 Membership' : '📅 Reservation'}</span></td>
            <td>${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</td>
            <td>${escapeHtml(app.paymentMethod)}</td>
            <td><strong>${escapeHtml(app.referenceNumber)}</strong></td>
            <td>₱${(app.amount || 0).toLocaleString()}</td>
            <td>
                <button class="btn-verify" onclick="openValidateModal('${app._id}')">
                    🔍 Validate Payment
                </button>
            </td>
        </tr>
    `).join('');
}

// ──────────────────────────────────────────────────────────────────
// Reservation Type Management Functions
// ──────────────────────────────────────────────────────────────────

let currentEditTypeId = null;

async function loadReservationTypes() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/reservation-types/admin/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const types = await response.json();
            renderReservationCards(types);
        }
    } catch (error) {
        console.error('Error loading reservation types:', error);
        showToast('Error loading reservation types', 'error');
    }
}

function renderReservationCards(types) {
    const container = document.getElementById('reservationCards');
    if (!container) return;
    
    if (types.length === 0) {
        container.innerHTML = '<div class="empty-state">No reservation types yet. Click "Add New" to create one.</div>';
        return;
    }
    
    container.innerHTML = types.map(type => `
        <div class="reservation-card">
            <div class="card-header">
                <span class="icon">${type.icon || '🏌️'}</span>
                <div class="card-header-info">
                    <strong>${escapeHtml(type.name)}</strong>
                    <small>${type.category}</small>
                </div>
                <div class="status-toggle ${type.isActive ? 'active' : ''}" 
                     onclick="toggleReservationStatus('${type._id}', ${!type.isActive})"></div>
            </div>
            <div class="card-body">
                <p><strong>💰 Base Price:</strong> ₱${type.basePrice.toLocaleString()}</p>
                <p><strong>📝 Description:</strong> ${escapeHtml(type.description || 'No description')}</p>
                
                <div class="time-slots-list">
                    <h4>⏰ Time Slots & Capacity</h4>
                    ${type.timeSlots && type.timeSlots.length > 0 ? type.timeSlots.map((slot, index) => `
                        <div class="time-slot-item" data-slot-index="${index}">
                            <input type="text" value="${escapeHtml(slot.time)}" 
                                   onchange="updateTimeSlotField('${type._id}', ${index}, 'time', this.value)">
                            <input type="number" value="${slot.capacity}" 
                                   onchange="updateTimeSlotField('${type._id}', ${index}, 'capacity', parseInt(this.value))">
                            <div class="status-toggle ${slot.isAvailable ? 'active' : ''}" 
                                 onclick="toggleTimeSlotAvailability('${type._id}', ${index})"></div>
                            <button class="btn-delete-slot" onclick="deleteTimeSlot('${type._id}', ${index})">🗑️</button>
                        </div>
                    `).join('') : '<p style="font-size:12px; color:#999;">No time slots added yet</p>'}
                    <button class="btn-add-slot" onclick="openAddTimeSlotModal('${type._id}')">+ Add Time Slot</button>
                </div>
                
                <div class="card-actions">
                    <button class="btn-edit" onclick="openEditTypeModal('${type._id}')">✏️ Edit Type</button>
                    <button class="btn-remove" onclick="deleteReservationType('${type._id}')">🗑️ Delete Type</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function updateTimeSlotField(typeId, slotIndex, field, value) {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const updateData = {};
        updateData[field] = field === 'capacity' ? parseInt(value) : value;
        
        const response = await fetch(`${API_URL}/reservation-types/admin/${typeId}/time-slots/${slotIndex}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            showToast('Time slot updated', 'success');
        } else {
            showToast('Update failed', 'error');
            loadReservationTypes(); // Reload to revert
        }
    } catch (error) {
        console.error('Error updating time slot:', error);
        showToast('Error updating time slot', 'error');
    }
}

async function toggleTimeSlotAvailability(typeId, slotIndex) {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/reservation-types/admin/${typeId}/time-slots/${slotIndex}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ isAvailable: false })
        });
        
        if (response.ok) {
            loadReservationTypes();
        }
    } catch (error) {
        console.error('Error toggling time slot:', error);
    }
}

async function deleteTimeSlot(typeId, slotIndex) {
    if (!confirm('Are you sure you want to delete this time slot?')) return;
    
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/reservation-types/admin/${typeId}/time-slots/${slotIndex}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            showToast('Time slot deleted', 'success');
            loadReservationTypes();
        }
    } catch (error) {
        console.error('Error deleting time slot:', error);
        showToast('Error deleting time slot', 'error');
    }
}

async function toggleReservationStatus(typeId, newStatus) {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/reservation-types/admin/${typeId}/toggle`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            showToast(`Reservation type ${newStatus ? 'activated' : 'deactivated'}`, 'success');
            loadReservationTypes();
        }
    } catch (error) {
        console.error('Error toggling status:', error);
    }
}

function openAddReservationModal() {
    currentEditTypeId = null;
    document.getElementById('modalTitle').textContent = 'Add Reservation Type';
    document.getElementById('reservationForm').reset();
    document.getElementById('typeId').value = '';
    document.getElementById('typeTimeSlots').value = '';
    document.getElementById('reservationModal').classList.add('show');
}

async function openEditTypeModal(typeId) {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/reservation-types/admin/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const types = await response.json();
            const type = types.find(t => t._id === typeId);
            
            if (type) {
                currentEditTypeId = typeId;
                document.getElementById('modalTitle').textContent = 'Edit Reservation Type';
                document.getElementById('typeName').value = type.name;
                document.getElementById('typeCategory').value = type.category;
                document.getElementById('typeIcon').value = type.icon || '🏌️';
                document.getElementById('typeDescription').value = type.description || '';
                document.getElementById('typeBasePrice').value = type.basePrice;
                document.getElementById('typeId').value = typeId;
                document.getElementById('typeTimeSlots').value = '';
                document.getElementById('reservationModal').classList.add('show');
            }
        }
    } catch (error) {
        console.error('Error loading type for edit:', error);
    }
}

function closeReservationModal() {
    document.getElementById('reservationModal').classList.remove('show');
    currentEditTypeId = null;
}

function openAddTimeSlotModal(typeId) {
    document.getElementById('slotTypeId').value = typeId;
    document.getElementById('slotTime').value = '';
    document.getElementById('slotCapacity').value = '10';
    document.getElementById('timeSlotModal').classList.add('show');
}

function closeTimeSlotModal() {
    document.getElementById('timeSlotModal').classList.remove('show');
}

async function saveReservationType(event) {
    event.preventDefault();
    
    const token = getAuthToken();
    if (!token) return;
    
    const typeId = document.getElementById('typeId').value;
    const timeSlotsValue = document.getElementById('typeTimeSlots').value;
    const defaultCapacity = parseInt(document.getElementById('typeCapacity').value) || 10;
    
    let timeSlots = [];
    if (timeSlotsValue) {
        timeSlots = timeSlotsValue.split(',').map(t => t.trim()).filter(t => t).map(time => ({
            time: time,
            capacity: defaultCapacity,
            booked: 0,
            isAvailable: true
        }));
    }
    
    const data = {
        name: document.getElementById('typeName').value,
        category: document.getElementById('typeCategory').value,
        icon: document.getElementById('typeIcon').value || '🏌️',
        description: document.getElementById('typeDescription').value,
        basePrice: parseInt(document.getElementById('typeBasePrice').value),
        timeSlots: timeSlots
    };
    
    const url = typeId ? 
        `${API_URL}/reservation-types/admin/${typeId}` : 
        `${API_URL}/reservation-types/admin/create`;
    
    const method = typeId ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showToast(typeId ? 'Reservation type updated' : 'Reservation type created', 'success');
            closeReservationModal();
            loadReservationTypes();
        } else {
            const error = await response.json();
            showToast(error.message || 'Operation failed', 'error');
        }
    } catch (error) {
        console.error('Error saving reservation type:', error);
        showToast('Error saving reservation type', 'error');
    }
}

async function addTimeSlot(event) {
    event.preventDefault();
    
    const token = getAuthToken();
    if (!token) return;
    
    const typeId = document.getElementById('slotTypeId').value;
    const data = {
        time: document.getElementById('slotTime').value,
        capacity: parseInt(document.getElementById('slotCapacity').value)
    };
    
    try {
        const response = await fetch(`${API_URL}/reservation-types/admin/${typeId}/time-slots`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showToast('Time slot added', 'success');
            closeTimeSlotModal();
            loadReservationTypes();
        }
    } catch (error) {
        console.error('Error adding time slot:', error);
        showToast('Error adding time slot', 'error');
    }
}

async function deleteReservationType(typeId) {
    if (!confirm('Are you sure you want to delete this reservation type? This action cannot be undone.')) return;
    
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/reservation-types/admin/${typeId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            showToast('Reservation type deleted', 'success');
            loadReservationTypes();
        }
    } catch (error) {
        console.error('Error deleting reservation type:', error);
        showToast('Error deleting reservation type', 'error');
    }
}

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