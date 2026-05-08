const API_URL = 'https://ilisy-golf-and-country-club-enrollment.onrender.com/api';

// ──────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────

let tableReservationTypes = [];
let lastMessageIds = new Map();
let notifiedMessageIds = new Map();
let audioContextAllowed = false;
let allAvailabilityData = [];

function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}
const debouncedFilterReservations = debounce(filterReservationsTable, 250);
const debouncedFilterAvailability = debounce(filterAvailabilityCards, 250);

function getAuthToken() {
    return localStorage.getItem('authToken');
}

async function apiFetch(url, options = {}) {
    const token = getAuthToken();
    
    if (!token) {
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
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1500);
            throw new Error('Unauthorized');
        }
        
        return response;
    } catch (error) {
        throw error;
    }
}

function saveScrollPosition(pageId) {
    const pageElement = document.getElementById(`page-${pageId}`);
    if (pageElement) {
        const scrollY = pageElement.scrollTop || window.scrollY;
        localStorage.setItem(`scroll_${pageId}`, scrollY);
    }
}

function restoreScrollPosition(pageId) {
    const savedScroll = localStorage.getItem(`scroll_${pageId}`);
    if (savedScroll) {
        const pageElement = document.getElementById(`page-${pageId}`);
        if (pageElement) {
            pageElement.scrollTop = parseInt(savedScroll);
        }
        setTimeout(() => {
            window.scrollTo(0, parseInt(savedScroll));
        }, 100);
    }
}

function saveCurrentPage(pageId) {
    localStorage.setItem('adminCurrentPage', pageId);
}

function loadLastVisitedPage() {
    const lastPage = localStorage.getItem('adminCurrentPage');
    const validPages = ['dashboard', 'reservations', 'accounts', 'payments', 'messages', 'manage_reservations'];
    
    if (lastPage && validPages.includes(lastPage) && document.getElementById(`page-${lastPage}`)) {
        console.log('Restoring page:', lastPage);
        showPage(lastPage);
    } else {
        console.log('No saved page, showing dashboard');
        showPage('dashboard');
    }
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

function scrollToBottom() {
    const msgBody = document.getElementById('msgBody');
    if (msgBody) {
        setTimeout(() => {
            msgBody.scrollTop = msgBody.scrollHeight;
        }, 100);
    }
}

// View full image in modal (for admin)
function viewFullImage(imageUrl) {
    const safeUrl = escapeHtml(imageUrl);
    const modal = document.createElement('div');
    modal.className = 'image-viewer-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 20000;
        cursor: pointer;
    `;
    
    modal.innerHTML = `
        <button class="image-viewer-close" style="
            position: absolute;
            top: 20px;
            right: 30px;
            color: white;
            font-size: 40px;
            font-weight: bold;
            cursor: pointer;
            background: none;
            border: none;
            z-index: 20001;
        ">&times;</button>
        <img src="${safeUrl}" alt="Full size image" style="
            max-width: 90%;
            max-height: 90%;
            object-fit: contain;
            border-radius: 8px;
        ">
    `;
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    const closeHandler = function(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', closeHandler);
        }
    };
    document.addEventListener('keydown', closeHandler);
    
    const closeBtn = modal.querySelector('.image-viewer-close');
    closeBtn.addEventListener('click', function() {
        modal.remove();
        document.removeEventListener('keydown', closeHandler);
    });
    
    document.body.appendChild(modal);
}

// ──────────────────────────────────────────────────────────────────
// Navigation
// ──────────────────────────────────────────────────────────────────

function showPage(id) {
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id) {
        const currentPageId = activePage.id.replace('page-', '');
        saveScrollPosition(currentPageId);
    }
    
    saveCurrentPage(id);
    
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const page = document.getElementById('page-' + id);
    if (page) page.classList.add('active');
    
    const map = { dashboard: 0, reservations: 1, accounts: 2, payments: 3, messages: 4, manage_reservations: 5 };
    const items = document.querySelectorAll('.nav-item');
    if (map[id] !== undefined && items[map[id]]) {
        items[map[id]].classList.add('active');
    }
    
    if (id !== 'messages') stopAdminMessagePolling();

    if (id === 'dashboard') {
        loadDashboardStats();
        loadFinancialReport();
        loadPendingApplications();
    }
    else if (id === 'accounts') loadUsers();
    else if (id === 'payments') loadPayments();
    else if (id === 'messages') {
        loadMessages();
        startAdminMessagePolling();
    }
    else if (id === 'reservations') {
        loadReservations();
        loadAvailabilityDashboard();
    }
    else if (id === 'manage_reservations') loadReservationTypes();
    
    restoreScrollPosition(id);
}

window.addEventListener('beforeunload', () => {
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id) {
        const currentPageId = activePage.id.replace('page-', '');
        saveScrollPosition(currentPageId);
    }
});

// ──────────────────────────────────────────────────────────────────
// Dashboard Functions
// ──────────────────────────────────────────────────────────────────

async function loadDashboardStats() {
    try {
        const response = await apiFetch(`${API_URL}/admin/dashboard`);
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
// Dynamic Financial Report
// ──────────────────────────────────────────────────────────────────

async function loadFinancialReport() {
    try {
        const response = await apiFetch(`${API_URL}/admin/payments`);
        if (!response.ok) return;
        const payments = await response.json();

        // ── Chart ──────────────────────────────────────────────
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        const months = [];
        const membershipData = [];
        const reservationData = [];

        for (let i = 5; i >= 0; i--) {
            const date = new Date(currentYear, currentMonth - i, 1);
            months.push(date.toLocaleDateString('en-US', { month: 'short' }));
            let membershipTotal = 0;
            let reservationTotal = 0;
            payments.forEach(payment => {
                const paymentDate = new Date(payment.createdAt);
                if (payment.paymentStatus === 'completed' &&
                    paymentDate.getMonth() === date.getMonth() &&
                    paymentDate.getFullYear() === date.getFullYear()) {
                    if (payment.transactionType === 'membership') membershipTotal += payment.amount;
                    else if (payment.transactionType === 'reservation') reservationTotal += payment.amount;
                }
            });
            membershipData.push(membershipTotal);
            reservationData.push(reservationTotal);
        }

        renderFinancialChart(months, membershipData, reservationData);

        const totalIncome = payments
            .filter(p => p.paymentStatus === 'completed')
            .reduce((sum, p) => sum + p.amount, 0);
        const incomeElement = document.querySelector('.stat-card.highlighted .stat-num');
        if (incomeElement) incomeElement.textContent = `₱${totalIncome.toLocaleString()}`;

        // ── Monthly summary title ──────────────────────────────
        const completedPayments = payments.filter(p => p.paymentStatus === 'completed');
        let currentMonthIncome = 0;
        let previousMonthIncome = 0;
        completedPayments.forEach(payment => {
            const paymentDate = new Date(payment.createdAt);
            if (paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear) {
                currentMonthIncome += payment.amount;
            } else if (
                (currentMonth > 0 && paymentDate.getMonth() === currentMonth - 1 && paymentDate.getFullYear() === currentYear) ||
                (currentMonth === 0 && paymentDate.getMonth() === 11 && paymentDate.getFullYear() === currentYear - 1)
            ) {
                previousMonthIncome += payment.amount;
            }
        });
        const percentageChange = previousMonthIncome > 0
            ? ((currentMonthIncome - previousMonthIncome) / previousMonthIncome) * 100
            : 0;
        const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const chartHeader = document.getElementById('financialReportTitle');
        if (chartHeader) {
            chartHeader.innerHTML = `${monthName} Financial Report
                <span style="font-size: 11px; color: ${percentageChange >= 0 ? '#4caf50' : '#dc3545'}; margin-left: 10px;">
                    ${percentageChange >= 0 ? '↑' : '↓'} ${Math.abs(percentageChange).toFixed(1)}% vs last month
                </span>`;
        }
    } catch (error) {
        const chartContainer = document.getElementById('financialChart');
        if (chartContainer) {
            chartContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc3545;">❌ Failed to load financial data</div>';
        }
    }
}

function renderFinancialChart(months, membershipData, reservationData) {
    const chartContainer = document.getElementById('financialChart');
    if (!chartContainer) return;
    
    const maxValue = Math.max(...membershipData, ...reservationData, 1000);
    const maxHeight = 150;
    
    let barsHtml = '';
    
    for (let i = 0; i < months.length; i++) {
        const membershipHeight = (membershipData[i] / maxValue) * maxHeight;
        const reservationHeight = (reservationData[i] / maxValue) * maxHeight;
        
        barsHtml += `
            <div class="bar-group" style="flex-direction: column; align-items: center; flex: 1;">
                <div style="display: flex; gap: 8px; align-items: flex-end; height: ${maxHeight}px;">
                    <div class="bar red" style="height: ${Math.max(membershipHeight, 5)}px; width: 35px; background: var(--booked); border-radius: 4px 4px 0 0;" title="Membership: ₱${membershipData[i].toLocaleString()}"></div>
                    <div class="bar green" style="height: ${Math.max(reservationHeight, 5)}px; width: 35px; background: var(--olive); border-radius: 4px 4px 0 0;" title="Reservation: ₱${reservationData[i].toLocaleString()}"></div>
                </div>
                <div style="font-size: 11px; margin-top: 8px; color: #666; text-align: center;">${months[i]}</div>
            </div>
        `;
    }
    
    const totalMembership = membershipData.reduce((a, b) => a + b, 0);
    const totalReservation = reservationData.reduce((a, b) => a + b, 0);
    const grandTotal = totalMembership + totalReservation;
    
    chartContainer.innerHTML = `
        <div style="display: flex; justify-content: center; gap: 30px; margin-bottom: 15px;">
            <div style="font-size: 12px;">
                <span style="display: inline-block; width: 12px; height: 12px; background: var(--booked); border-radius: 2px; margin-right: 5px;"></span>
                Membership Revenue
            </div>
            <div style="font-size: 12px;">
                <span style="display: inline-block; width: 12px; height: 12px; background: var(--olive); border-radius: 2px; margin-right: 5px;"></span>
                Reservation Revenue
            </div>
        </div>
        <div class="chart-bars" style="display: flex; justify-content: space-around; align-items: flex-end; gap: 20px; padding: 10px; min-height: 200px;">
            ${barsHtml}
        </div>
        <div style="margin-top: 20px; text-align: center; font-size: 13px; color: #555; padding-top: 15px; border-top: 1px solid #ddd;">
            Total Revenue (Last 6 Months): <strong style="color: var(--deep-green);">₱${grandTotal.toLocaleString()}</strong>
        </div>
    `;
}

// ──────────────────────────────────────────────────────────────────
// Admin Dynamic Calendar Functions
// ──────────────────────────────────────────────────────────────────

let adminCurrentMonth = new Date();
let adminReservationsData = [];
let adminCalendarData = [];
let currentCalendarFilter = 'all';
let calendarReservationTypes = [];

function populateCalendarFilter() {
    const filterSelect = document.getElementById('calendarTypeFilter');
    if (!filterSelect) return;
    
    let optionsHtml = '<option value="all">📌 All Reservations</option>';
    optionsHtml += '<option value="membership">🏌️ Membership Applications</option>';
    optionsHtml += '<option disabled style="background: #eee;">──────────</option>';
    
    // Group by category
    const categoryMap = new Map();
    calendarReservationTypes.forEach(type => {
        if (!categoryMap.has(type.category)) {
            categoryMap.set(type.category, []);
        }
        categoryMap.get(type.category).push(type);
    });
    
    const categoryInfo = {
        golf: { icon: '⛳', name: 'Golf' },
        amenities: { icon: '🍽️', name: 'Amenities' },
        events: { icon: '🎉', name: 'Events' },
        accommodation: { icon: '🏨', name: 'Accommodation' },
        premium: { icon: '✨', name: 'Premium' }
    };
    
    for (const [category, types] of categoryMap) {
        const info = categoryInfo[category] || { icon: '📌', name: category };
        // Category option - using name_ prefix
        optionsHtml += `<option value="name_${info.name}" style="font-weight: bold; background: #f0f0f0;">${info.icon} ${info.name} (All)</option>`;
        
        types.forEach(type => {
            if (type.isActive) {
                // Individual type option - using name_ prefix with the actual name
                optionsHtml += `<option value="name_${type.name}" style="padding-left: 20px;">  ${type.icon || '📌'} ${type.name}</option>`;
            }
        });
        optionsHtml += '<option disabled style="background: #eee;">──────────</option>';
    }
    
    filterSelect.innerHTML = optionsHtml;
}

async function loadAdminCalendar() {
    const token = getAuthToken();
    if (!token) return;
    
    const filterSelect = document.getElementById('calendarTypeFilter');
    let selectedFilter = filterSelect ? filterSelect.value : 'all';
    
    let filterType = 'all';
    let filterValue = '';
    
    // IMPORTANT: Updated filter detection logic
    if (selectedFilter === 'membership') {
        filterType = 'membership';
    } else if (selectedFilter === 'all') {
        filterType = 'all';
    } else if (selectedFilter.startsWith('name_')) {
        // This handles both categories and individual types
        filterType = 'type_name';
        filterValue = decodeURIComponent(selectedFilter.replace('name_', ''));
    } else if (selectedFilter.startsWith('cat_')) {
        filterType = 'category';
        filterValue = selectedFilter.replace('cat_', '');
    }
    
    console.log('🔍 Loading calendar with filter:', { filterType, filterValue, selectedFilter });
    
    try {
        const year = adminCurrentMonth.getFullYear();
        const month = adminCurrentMonth.getMonth() + 1;
        
        const url = `${API_URL}/admin/reservations/calendar?year=${year}&month=${month}&filterType=${filterType}&filterValue=${encodeURIComponent(filterValue)}`;
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            adminCalendarData = await response.json();
            console.log('📊 Calendar data loaded:', adminCalendarData.length, 'records');
            
            // Debug: Log what items were found
            if (filterValue) {
                const uniqueTypes = [...new Set(adminCalendarData.map(item => item.reservationTypeName))];
                console.log('🎯 Filtered types found:', uniqueTypes);
            }
        } else {
            adminCalendarData = [];
        }
    } catch (error) {
        console.error('Error loading calendar:', error);
        adminCalendarData = [];
    }
    
    renderAdminCalendar();
}

function renderAdminCalendar() {
    const year = adminCurrentMonth.getFullYear();
    const month = adminCurrentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const monthYearSpan = document.getElementById('adminCalendarMonthYear');
    if (monthYearSpan) {
        monthYearSpan.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(adminCurrentMonth);
    }
    
    const filterSelect = document.getElementById('calendarTypeFilter');
    const selectedFilterText = filterSelect ? filterSelect.options[filterSelect.selectedIndex]?.text || 'All' : 'All';
    
    const grid = document.getElementById('adminCalGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    weekdays.forEach(day => {
        grid.innerHTML += `<div style="font-size:10px;color:#888;text-align:center;font-weight:bold;">${day}</div>`;
    });
    
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="res-day empty"></div>`;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(year, month, d);
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = cellDate.toDateString() === today.toDateString();
        
        // Count reservations for this day
        const dayReservations = adminCalendarData.filter(res => {
            const resDate = new Date(res.date);
            return resDate.getFullYear() === year && 
                   resDate.getMonth() === month && 
                   resDate.getDate() === d;
        });
        
        const bookedCount = dayReservations.length;
        
        // Determine color based on bookings
        let statusClass = 'available';
        if (bookedCount > 0) {
            statusClass = 'booked';
        }
        
        const todayClass = isToday ? 'today' : '';
        
        // Build tooltip
        let tooltipText = `Available for ${selectedFilterText}`;
        if (bookedCount > 0) {
            const typeNames = [...new Set(dayReservations.map(r => r.reservationTypeName || 'Reservation'))];
            tooltipText = `${bookedCount} booking(s): ${typeNames.join(', ')}`;
        }
        
        // IMPORTANT: Make ALL days clickable, even booked ones
        grid.innerHTML += `
            <div class="res-day ${statusClass} ${todayClass}" 
                 data-date="${dateKey}"
                 data-booked="${bookedCount}"
                 title="${escapeHtml(tooltipText)}"
                 style="cursor: pointer;"
                 onclick="openAdminDayDetails('${dateKey}')">
                ${d}
                ${bookedCount > 0 ? `<span style="font-size:8px; position:absolute; bottom:2px; right:2px;">${bookedCount}</span>` : ''}
            </div>
        `;
    }
}

function changeAdminMonth(delta) {
    adminCurrentMonth.setMonth(adminCurrentMonth.getMonth() + delta);
    loadAdminCalendar();
}

async function openAdminDayDetails(dateKey) {
    console.log('Opening details for date:', dateKey);
    
    // Parse the date correctly
    const [year, month, day] = dateKey.split('-');
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    const modalDate = document.getElementById('resDetailDate');
    if (modalDate) modalDate.textContent = formattedDate;
    
    const token = getAuthToken();
    if (!token) return;
    
    const modalBody = document.querySelector('#resDetailModal .res-detail-body');
    if (!modalBody) return;
    
    // Show loading state
    modalBody.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <div class="loading-spinner"></div> Loading reservations...
        </div>
        <div style="text-align:right; margin-top:16px;">
            <button class="btn-cancel-modal" style="padding:8px 22px;" onclick="closeModal('resDetailModal')">Close</button>
        </div>
    `;
    
    try {
        // Create proper date range
        const startDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        endDate.setHours(23, 59, 59, 999);
        
        // Fetch reservations for this specific date range
        const response = await fetch(`${API_URL}/admin/reservations/by-date/${dateKey}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            let reservations = await response.json();
            console.log('Reservations for date:', reservations);
            
            if (!reservations || reservations.length === 0) {
                modalBody.innerHTML = `
                    <div style="text-align:center; padding:40px; color:#888;">
                        No reservations for ${formattedDate}.
                    </div>
                    <div style="text-align:right; margin-top:16px;">
                        <button class="btn-cancel-modal" style="padding:8px 22px;" onclick="closeModal('resDetailModal')">Close</button>
                    </div>
                `;
                return;
            }
            
            // Build HTML for each reservation
            let slotsHtml = `
                <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #ddd;">
                    <strong>Total Reservations: ${reservations.length}</strong>
                </div>
            `;
            
            reservations.forEach((res, index) => {
                const reservationType = res.reservationTypeName || res.reservationType || res.type || 'Reservation';
                const statusClass = res.status === 'confirmed' || res.status === 'approved' ? 'status-confirmed' : 'status-pending';
                const statusText = res.status === 'confirmed' || res.status === 'approved' ? '✓ Confirmed' : '⏳ Pending';
                
                slotsHtml += `
                    <div style="background: ${index % 2 === 0 ? '#f9f9f9' : 'white'}; border: 1px solid #eee; border-radius: 8px; margin-bottom: 12px; padding: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <div style="background: var(--olive); color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">
                                🕐 ${escapeHtml(res.timeSlot || 'N/A')}
                            </div>
                            <div>
                                <span class="status-badge ${statusClass}">${statusText}</span>
                            </div>
                        </div>
                        <div style="margin-bottom: 10px;">
                            <div><strong>👤 Guest:</strong> ${escapeHtml(res.firstName || '')} ${escapeHtml(res.lastName || '')}</div>
                            <div><strong>📞 Phone:</strong> ${escapeHtml(res.phone || 'N/A')}</div>
                            <div><strong>📧 Email:</strong> ${escapeHtml(res.email || 'N/A')}</div>
                        </div>
                        <div>
                            <div><strong>🏷️ Type:</strong> <span style="background: var(--sage); padding: 2px 8px; border-radius: 12px;">${escapeHtml(reservationType)}</span></div>
                            <div><strong>💰 Amount:</strong> <strong>₱${(res.amount || 0).toLocaleString()}</strong></div>
                        </div>
                    </div>
                `;
            });
            
            slotsHtml += `
                <div style="text-align:right; margin-top: 16px;">
                    <button class="btn-cancel-modal" style="padding:8px 22px;" onclick="closeModal('resDetailModal')">Close</button>
                </div>
            `;
            
            modalBody.innerHTML = slotsHtml;
        } else {
            modalBody.innerHTML = `
                <div style="text-align:center; padding:40px; color:#dc3545;">
                    Failed to load reservations.
                </div>
                <div style="text-align:right; margin-top:16px;">
                    <button class="btn-cancel-modal" style="padding:8px 22px;" onclick="closeModal('resDetailModal')">Close</button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading day reservations:', error);
        modalBody.innerHTML = `
            <div style="text-align:center; padding:40px; color:#dc3545;">
                Error loading reservations: ${error.message}
            </div>
            <div style="text-align:right; margin-top:16px;">
                <button class="btn-cancel-modal" style="padding:8px 22px;" onclick="closeModal('resDetailModal')">Close</button>
            </div>
        `;
    }
    
    // Show the modal
    const modal = document.getElementById('resDetailModal');
    if (modal) modal.classList.add('show');
}

// ──────────────────────────────────────────────────────────────────
// Users Management
// ──────────────────────────────────────────────────────────────────

async function loadUsers() {
    try {
        const response = await apiFetch(`${API_URL}/admin/users`);
        
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
                        <button class="btn-remove" onclick="showRemoveModal('${user._id}')">archive</button>
                        ${user.membershipStatus === 'active' ? 
                            `<button class="btn-revoke" onclick="revokeMembership('${user._id}')" style="background: #9c403d; color: white; padding: 4px 12px; border: none; border-radius: 3px; cursor: pointer; margin-left: 5px;">Revoke</button>` 
                            : ''}
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
                showToast('User archived successfully', 'success');
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
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">No payments found</td></tr>';
                return;
            }

            payments.forEach(payment => {
                const row = tbody.insertRow();
                const isRefunded = payment.paymentStatus === 'refunded';
                const statusColors = {
                    completed: '#28a745', pending: '#856404', refunded: '#9c403d',
                    failed: '#dc3545', processing: '#0d6efd'
                };
                const statusColor = statusColors[payment.paymentStatus] || '#666';

                // Mask account number — show only last 4 digits
                const rawAcct = payment.accountNumber || '';
                const maskedAcct = rawAcct.length > 4
                    ? '••••' + rawAcct.slice(-4)
                    : rawAcct || '—';

                row.innerHTML = `
                    <td>${escapeHtml(payment.firstName || '')}</td>
                    <td>${escapeHtml(payment.lastName || '')}</td>
                    <td>${escapeHtml(payment.paymentMethod || '')}</td>
                    <td style="font-family:monospace;">${escapeHtml(maskedAcct)}</td>
                    <td>₱${(payment.amount || 0).toLocaleString()}</td>
                    <td>${payment.processedAt ? new Date(payment.processedAt).toLocaleDateString() : payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : 'Pending'}</td>
                    <td><span class="badge ${payment.transactionType === 'membership' ? 'badge-active' : 'badge-none'}">${escapeHtml(payment.transactionType || 'N/A')}</span></td>
                    <td>
                        <span style="background:${statusColor}; color:white; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:bold;">${payment.paymentStatus || 'pending'}</span>
                        ${isRefunded && payment.refundReason ? `<br><small style="color:#888; font-size:10px; display:block; margin-top:3px;">📝 ${escapeHtml(payment.refundReason)}</small>` : ''}
                    </td>
                    <td><button class="btn-refund" onclick="showRefundModal('${payment._id}', '${escapeHtml(payment.firstName)} ${escapeHtml(payment.lastName)}')" ${isRefunded ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>Refund</button></td>
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
    document.getElementById('refundReasonTitle').textContent = `Make a refund for ${currentRefundName}`;
    const textarea = document.getElementById('refundReasonText');
    if (textarea) textarea.value = '';
    document.getElementById('refundReasonsModal').classList.add('show');
}

async function processRefund() {
    if (!currentPaymentId) return;

    const textarea = document.getElementById('refundReasonText');
    const reason = textarea ? textarea.value.trim() : '';

    if (!reason) {
        showToast('Please enter a reason for the refund.', 'error');
        return;
    }

    const token = getAuthToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/admin/payments/${currentPaymentId}/refund`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ refundReason: reason })
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
        if (textarea) textarea.value = '';
        currentPaymentId = null;
    }
}

// ──────────────────────────────────────────────────────────────────
// Reservations Management
// ──────────────────────────────────────────────────────────────────

let allReservations = [];
let filteredReservations = [];
let currentReservationPage = 1;
const reservationsPerPage = 10;

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
            allReservations = await response.json();
            console.log('Loaded reservations:', allReservations.length);
            filterReservationsTable();
        } else {
            const error = await response.json();
            console.error('Error response:', error);
            const tbody = document.getElementById('reservationAppTbody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#dc3545;">Error loading reservations</td></tr>';
            }
        }
    } catch (error) {
        console.error('Error loading reservations:', error);
        const tbody = document.getElementById('reservationAppTbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#dc3545;">Error loading reservations</td></tr>';
        }
    }
}

function filterReservationsTable() {
    const searchInput = document.getElementById('reservationSearchInput');
    const statusFilter = document.getElementById('reservationStatusFilter');
    const typeFilter = document.getElementById('reservationTypeFilter');
    const dateFrom = document.getElementById('reservationDateFrom');
    const dateTo = document.getElementById('reservationDateTo');
    
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
    const statusFilterValue = statusFilter ? statusFilter.value : 'all';
    let typeFilterValue = typeFilter ? typeFilter.value : 'all';
    const fromDate = dateFrom && dateFrom.value ? new Date(dateFrom.value) : null;
    const toDate = dateTo && dateTo.value ? new Date(dateTo.value + 'T23:59:59') : null;
    
    console.log('Filtering reservations. Total:', allReservations.length);
    
    filteredReservations = allReservations.filter(app => {
        const fullName = `${app.firstName} ${app.lastName}`.toLowerCase();
        const email = (app.email || '').toLowerCase();
        const phone = (app.phone || '').toLowerCase();
        const matchesSearch = fullName.includes(searchQuery) || 
                              email.includes(searchQuery) || 
                              phone.includes(searchQuery);
        
        let matchesStatus = true;
        if (statusFilterValue !== 'all') {
            matchesStatus = app.status === statusFilterValue;
        }
        
        let matchesType = true;
        if (typeFilterValue !== 'all') {
            if (typeFilterValue === 'membership') {
                matchesType = app.type === 'membership';
            } else if (typeFilterValue === 'reservation') {
                matchesType = app.type === 'reservation';
            } else if (typeFilterValue.startsWith('cat_')) {
                const category = typeFilterValue.replace('cat_', '');
                const appCategory = app.category || app.details?.category || '';
                matchesType = appCategory.toLowerCase() === category.toLowerCase();
            } else if (typeFilterValue.startsWith('type_')) {
                const typeId = typeFilterValue.replace('type_', '');
                const appTypeId = app.reservationTypeId || app.details?.reservationTypeId || '';
                matchesType = appTypeId === typeId;
            } else {
                matchesType = app.type === typeFilterValue;
            }
        }

        let matchesDate = true;
        if (fromDate || toDate) {
            const appDate = app.details?.date ? new Date(app.details.date) : null;
            if (appDate) {
                if (fromDate && appDate < fromDate) matchesDate = false;
                if (toDate && appDate > toDate) matchesDate = false;
            } else {
                // If no date on record and a date filter is active, exclude it
                matchesDate = false;
            }
        }
        
        return matchesSearch && matchesStatus && matchesType && matchesDate;
    });
    
    console.log('Filtered reservations:', filteredReservations.length);
    
    currentReservationPage = 1;
    renderReservationsTable();
    updateResultsCount();
}

function resetReservationFilters() {
    const searchInput = document.getElementById('reservationSearchInput');
    const statusFilter = document.getElementById('reservationStatusFilter');
    const typeFilter = document.getElementById('reservationTypeFilter');
    const dateFrom = document.getElementById('reservationDateFrom');
    const dateTo = document.getElementById('reservationDateTo');
    
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = 'all';
    if (typeFilter) typeFilter.value = 'all';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    
    filterReservationsTable();
}

function updateResultsCount() {
    const countDiv = document.getElementById('resultsCount');
    if (countDiv) {
        const total = filteredReservations.length;
        const start = (currentReservationPage - 1) * reservationsPerPage + 1;
        const end = Math.min(currentReservationPage * reservationsPerPage, total);
        
        if (total > 0) {
            countDiv.innerHTML = `Showing ${start} - ${end} of ${total} reservation${total !== 1 ? 's' : ''}`;
        } else {
            countDiv.innerHTML = 'No reservations found';
        }
    }
}

function renderReservationsTable() {
    const tbody = document.getElementById('reservationAppTbody');
    if (!tbody) {
        console.error('reservationAppTbody not found');
        return;
    }

    const startIndex = (currentReservationPage - 1) * reservationsPerPage;
    const endIndex = startIndex + reservationsPerPage;
    const pageReservations = filteredReservations.slice(startIndex, endIndex);

    if (pageReservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 40px;">📋 No reservation applications found</td></tr>';
        const paginationDiv = document.getElementById('reservationPagination');
        if (paginationDiv) paginationDiv.innerHTML = '';
        updateResultsCount();
        return;
    }

    // Group by status for accordion display
    const groups = {};
    const statusOrder = ['pending', 'processing', 'approved', 'confirmed', 'rejected', 'cancelled'];
    const statusLabels = {
        pending: { label: '⏳ Pending', color: '#856404', bg: '#fff8e1' },
        processing: { label: '⏳ Processing', color: '#0d6efd', bg: '#e8f0fe' },
        approved: { label: '✓ Approved', color: '#155724', bg: '#e8f5e9' },
        confirmed: { label: '✓ Confirmed', color: '#155724', bg: '#e8f5e9' },
        rejected: { label: '✗ Rejected', color: '#721c24', bg: '#fdecea' },
        cancelled: { label: '❌ Cancelled', color: '#721c24', bg: '#fdecea' }
    };

    pageReservations.forEach(app => {
        const s = app.status || 'pending';
        if (!groups[s]) groups[s] = [];
        groups[s].push(app);
    });

    let html = '';
    statusOrder.forEach(status => {
        if (!groups[status] || groups[status].length === 0) return;
        const info = statusLabels[status] || { label: status, color: '#333', bg: '#f5f5f5' };
        const groupId = `resGroup_${status}`;

        html += `
            <tr class="res-accordion-header" onclick="toggleResGroup('${groupId}')"
                style="background:${info.bg}; cursor:pointer; user-select:none;">
                <td colspan="7" style="padding:10px 16px; font-weight:600; font-size:13px; color:${info.color};">
                    <span id="${groupId}_chevron" style="display:inline-block;transition:transform .2s;margin-right:6px;">▶</span>
                    ${info.label}
                    <span style="background:${info.color};color:#fff;border-radius:10px;padding:1px 8px;font-size:11px;margin-left:8px;">${groups[status].length}</span>
                </td>
            </tr>
            <tbody id="${groupId}" style="display:none;">
        `;

        groups[status].forEach(app => {
            let displayType = '';
            if (app.type === 'membership') {
                displayType = '🏌️ Membership';
            } else if (app.reservationTypeName) {
                displayType = `📅 ${app.reservationTypeName}`;
            } else if (app.details && app.details.reservationType) {
                displayType = `📅 ${app.details.reservationType}`;
            } else {
                displayType = '📅 Reservation';
            }

            const displayDate = app.details?.date ? new Date(app.details.date).toLocaleDateString() : 'N/A';
            const displayTime = app.details?.timeSlot || 'N/A';

            html += `
                <tr>
                    <td>
                        <strong>${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</strong><br>
                        <small style="color:#666;">${escapeHtml(app.email || '')}</small>
                    </td>
                    <td>${displayDate}</td>
                    <td>${escapeHtml(displayTime)}</td>
                    <td><span class="badge" style="background:var(--sage);">${displayType}</span></td>
                    <td><strong>₱${(app.amount || 0).toLocaleString()}</strong></td>
                    <td><span class="status-badge ${status === 'pending' || status === 'processing' ? 'status-pending' : status === 'rejected' || status === 'cancelled' ? 'status-rejected' : 'status-confirmed'}">${info.label}</span></td>
                    <td>
                        ${status === 'pending' || status === 'processing' ? `
                            <button class="action-btn btn-approve" onclick="approveReservation('${app._id}')" style="margin-right:5px;">Approve</button>
                            <button class="btn-remove" onclick="rejectReservation('${app._id}')">Reject</button><br>
                        ` : ''}
                        <button class="btn-view-details" onclick="viewReservationDetails('${app._id}')" style="background:var(--sage-dark);color:#333;padding:4px 12px;border:none;border-radius:3px;font-size:12px;cursor:pointer;margin-top:5px;">📋 Details</button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody>`;
    });

    tbody.innerHTML = html;

    // Auto-expand pending and processing groups
    ['pending', 'processing'].forEach(status => {
        if (groups[status] && groups[status].length > 0) {
            const el = document.getElementById(`resGroup_${status}`);
            const chevron = document.getElementById(`resGroup_${status}_chevron`);
            if (el) el.style.display = '';
            if (chevron) chevron.style.transform = 'rotate(90deg)';
        }
    });

    renderReservationPagination();
    updateResultsCount();
}

function toggleResGroup(groupId) {
    const el = document.getElementById(groupId);
    const chevron = document.getElementById(`${groupId}_chevron`);
    if (!el) return;
    const isHidden = el.style.display === 'none' || el.style.display === '';
    el.style.display = isHidden ? '' : 'none';
    if (chevron) chevron.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
}

function renderReservationPagination() {
    const paginationDiv = document.getElementById('reservationPagination');
    if (!paginationDiv) return;
    
    const totalPages = Math.ceil(filteredReservations.length / reservationsPerPage);
    
    if (totalPages <= 1) {
        paginationDiv.innerHTML = '';
        return;
    }
    
    let paginationHtml = '';
    paginationHtml += `<button class="pagination-btn" onclick="changeReservationPage(${currentReservationPage - 1})" ${currentReservationPage === 1 ? 'disabled' : ''}>◀ Prev</button>`;
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentReservationPage - 2 && i <= currentReservationPage + 2)) {
            paginationHtml += `<button class="pagination-btn ${i === currentReservationPage ? 'active' : ''}" onclick="changeReservationPage(${i})">${i}</button>`;
        } else if (i === currentReservationPage - 3 || i === currentReservationPage + 3) {
            paginationHtml += `<span class="pagination-dots">...</span>`;
        }
    }
    
    paginationHtml += `<button class="pagination-btn" onclick="changeReservationPage(${currentReservationPage + 1})" ${currentReservationPage === totalPages ? 'disabled' : ''}>Next ▶</button>`;
    
    paginationDiv.innerHTML = paginationHtml;
}

function changeReservationPage(page) {
    const totalPages = Math.ceil(filteredReservations.length / reservationsPerPage);
    if (page < 1 || page > totalPages) return;
    currentReservationPage = page;
    renderReservationsTable();
}

async function viewReservationDetails(appId) {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/application/${appId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const app = await response.json();
            const isFromReservation = app.source === 'reservation' || !app.paymentMethod;
            const modalId = `reservationDetailModal_${Date.now()}`;
            
            const modalHtml = `
                <div class="modal-overlay show" id="${modalId}" style="display:flex;">
                    <div class="validate-modal" style="max-width: 550px;">
                        <div class="validate-modal-header">
                            <h3>📋 ${app.type === 'membership' ? 'Membership' : 'Reservation'} Details</h3>
                            <button class="close-modal-btn" data-modal-id="${modalId}">&times;</button>
                        </div>
                        <div class="validate-modal-body">
                            <div class="app-detail-section">
                                <h4>👤 Customer Information</h4>
                                <div class="detail-row"><span class="detail-label">Name:</span><span class="detail-value">${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</span></div>
                                <div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${escapeHtml(app.email)}</span></div>
                                <div class="detail-row"><span class="detail-label">Phone:</span><span class="detail-value">${escapeHtml(app.phone)}</span></div>
                            </div>
                            <div class="app-detail-section">
                                <h4>📅 ${app.type === 'membership' ? 'Membership' : 'Reservation'} Details</h4>
                                ${app.details?.date ? `
                                <div class="detail-row"><span class="detail-label">Date:</span><span class="detail-value">${new Date(app.details.date).toLocaleDateString()}</span></div>
                                ` : ''}
                                ${app.details?.timeSlot ? `
                                <div class="detail-row"><span class="detail-label">Time Slot:</span><span class="detail-value">${escapeHtml(app.details.timeSlot)}</span></div>
                                ` : ''}
                                <div class="detail-row">
    <span class="detail-label">Type:</span>
    <span class="detail-value">
        ${app.type === 'membership' ? '🏌️ Membership' : `📅 ${app.reservationTypeName || app.details?.reservationType || 'Reservation'}`}
    </span>
</div>
                                <div class="detail-row"><span class="detail-label">Amount:</span><span class="detail-value"><strong>₱${(app.amount || 0).toLocaleString()}</strong></span></div>
                                <div class="detail-row"><span class="detail-label">Status:</span><span class="detail-value"><span class="status-badge ${app.status === 'pending' ? 'status-pending' : app.status === 'rejected' ? 'status-rejected' : 'status-confirmed'}">${app.status || 'N/A'}</span></span></div>
                            </div>
                            ${!isFromReservation ? `
                            <div class="app-detail-section">
                                <h4>💰 Payment Information</h4>
                                <div class="detail-row"><span class="detail-label">Method:</span><span class="detail-value">${escapeHtml(app.paymentMethod || 'N/A')}</span></div>
                                <div class="detail-row"><span class="detail-label">Account #:</span><span class="detail-value">${escapeHtml(app.accountNumber || 'N/A')}</span></div>
                                <div class="detail-row"><span class="detail-label">Reference #:</span><span class="detail-value highlight">${escapeHtml(app.referenceNumber || 'N/A')}</span></div>
                            </div>
                            ` : ''}
                            <div class="modal-action-buttons" style="margin-top: 20px;">
                                ${app.status === 'pending' || app.status === 'rejected' ? `
                                    <button class="btn-verify" onclick="approveReservation('${app._id}'); closeModalById('${modalId}');">✓ Approve</button>
                                    <button class="btn-reject-modal" onclick="rejectReservation('${app._id}'); closeModalById('${modalId}');">✗ Reject</button>
                                ` : `
                                    <button class="btn-cancel-modal" onclick="closeModalById('${modalId}')" style="width: 100%;">Close</button>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            const existingModal = document.getElementById(modalId);
            if (existingModal) existingModal.remove();
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            const closeBtn = document.querySelector(`[data-modal-id="${modalId}"]`);
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    closeModalById(modalId);
                });
            }
            
            const modal = document.getElementById(modalId);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModalById(modalId);
            });
        }
    } catch (error) {
        console.error('Error viewing details:', error);
        showToast('Error loading details', 'error');
    }
}

function closeModalById(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
        setTimeout(() => {
            if (modal && modal.parentNode) {
                modal.remove();
            }
        }, 300);
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
            loadAdminCalendar();
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
    
    const reason = prompt('Enter rejection reason (optional):');
    
    try {
        const response = await fetch(`${API_URL}/admin/reservations/${appId}/reject`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rejectionReason: reason || 'No reason provided' })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            showToast('Reservation rejected', 'success');
            loadReservations();
            loadAdminCalendar();
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

function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const audioContext = new AudioContext();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.1;
            
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.2);
            oscillator.stop(audioContext.currentTime + 0.2);
            
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
        }
    } catch(e) {
        console.log('🔔 New message notification');
    }
}

async function loadMessages() {
    console.log('📩 Loading messages...');
    
    const token = getAuthToken();
    if (!token) {
        console.error('❌ Cannot load messages: No auth token');
        return;
    }
    
    try {
        const response = await apiFetch(`${API_URL}/admin/messages`);
        
        if (response.ok) {
            const messages = await response.json();
            console.log(`✅ Loaded ${messages.length} messages`);
            
            const msgSidebar = document.getElementById('msgSidebar');
            if (msgSidebar) {
                const currentActiveUserId = document.querySelector('.msg-contact.active')?.getAttribute('data-user-id');
                
                msgSidebar.innerHTML = '';
                
                if (messages.length === 0) {
                    msgSidebar.innerHTML = '<div style="padding:20px; text-align:center; color:#ccc;">No messages found</div>';
                    return;
                }
                
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
                    contactDiv.setAttribute('data-conversation-id', msg._id);
                    contactDiv.onclick = () => selectContact(contactDiv, msg);

                    const isPending = msg.status === 'pending';
                    // userId may be populated object or string
                    const userObj = msg.userId && typeof msg.userId === 'object' ? msg.userId : null;
                    const isBlocked = userObj ? !!userObj.isBlocked : false;
                    const userIdStr = userObj ? userObj._id : msg.userId;

                    contactDiv.innerHTML = `
                        <div class="contact-avatar">👤</div>
                        <div style="flex:1;min-width:0;">
                            <div class="msg-contact-name">${escapeHtml(msg.userName || 'User')}</div>
                            <div style="font-size:11px;color:#ccc;">${escapeHtml(msg.concernType || 'general')}</div>
                        </div>
                        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                            <div class="msg-contact-dot ${isPending ? 'online' : ''}"></div>
                            ${isBlocked
                                ? `<span title="Unblock user" onclick="event.stopPropagation();openBlockUserModal('${userIdStr}','${escapeHtml(msg.userName || 'User')}',true)" style="font-size:10px;background:#9c403d;color:#fff;border-radius:8px;padding:1px 6px;cursor:pointer;">🚫 Blocked</span>`
                                : `<span title="Block user" onclick="event.stopPropagation();openBlockUserModal('${userIdStr}','${escapeHtml(msg.userName || 'User')}',false)" style="font-size:10px;background:rgba(255,255,255,.12);color:#ccc;border-radius:8px;padding:1px 6px;cursor:pointer;">⚙️</span>`
                            }
                        </div>
                    `;
                    msgSidebar.appendChild(contactDiv);
                    
                    if (currentActiveUserId === msg.userId) {
                        newActiveContact = contactDiv;
                    }
                });
                
                if (newActiveContact && currentMessage) {
                    newActiveContact.classList.add('active');
                    await refreshCurrentConversation();
                }
            }
        }
    } catch (error) {
        console.error('❌ Error loading messages:', error);
    }
}

async function checkAdminStatus() {
    const token = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');

    if (!token) return false;
    
    try {
        const response = await apiFetch(`${API_URL}/admin/dashboard`);
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function refreshCurrentConversation() {
    if (!currentMessage) return;
    
    try {
        const response = await apiFetch(`${API_URL}/admin/messages`);
        
        if (response.ok) {
            const messages = await response.json();
            const updatedMessage = messages.find(m => m.userId === currentUserId);
            
            if (updatedMessage) {
                const conversation = updatedMessage.conversation || [];
                
                if (conversation.length > 0) {
                    const lastMessage = conversation[conversation.length - 1];
                    const lastMessageId = `${lastMessage.timestamp}_${lastMessage.message || lastMessage.imageUrl || ''}`;
                    const lastShown = localStorage.getItem(`admin_last_shown_${updatedMessage._id}`);
                    
                    if (lastMessage.sender === 'user' && lastShown !== lastMessageId) {
                        if (lastShown) {
                            playNotificationSound();
                            showToast(`📩 New message from ${escapeHtml(updatedMessage.userName)}: "${(lastMessage.message || '📎 Sent an image').substring(0, 50)}..."`, 'info');
                        }
                        localStorage.setItem(`admin_last_shown_${updatedMessage._id}`, lastMessageId);
                    }
                }
                
                currentMessage = updatedMessage;
                
                const msgBody = document.getElementById('msgBody');
                const wasAutoScrolling = msgBody.scrollHeight - msgBody.scrollTop <= msgBody.clientHeight + 100;
                
                msgBody.innerHTML = '';
                
                if (updatedMessage.conversation && updatedMessage.conversation.length > 0) {
                    updatedMessage.conversation.forEach(conv => {
                        const row = document.createElement('div');
                        row.className = `msg-row-wrap ${conv.sender === 'admin' ? 'sent' : ''}`;
                        
                        if (conv.imageUrl) {
                            const safeUrl = escapeHtml(conv.imageUrl);
                            if (conv.sender === 'user') {
                                row.innerHTML = `
                                    <div class="chat-avatar">👤</div>
                                    <div class="chat-bubble bubble-received image-message" onclick="viewFullImage('${safeUrl}')">
                                        <img src="${safeUrl}" alt="Receipt image">
                                    </div>
                                `;
                            } else {
                                row.innerHTML = `
                                    <div class="chat-bubble bubble-sent image-message" onclick="viewFullImage('${safeUrl}')">
                                        <img src="${safeUrl}" alt="Receipt image">
                                    </div>
                                    <div class="chat-avatar">👤</div>
                                `;
                            }
                        } else {
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
                        }
                        msgBody.appendChild(row);
                    });
                } else {
                    if (updatedMessage.imageUrl) {
                        const row = document.createElement('div');
                        row.className = 'msg-row-wrap';
                        const safeUrl = escapeHtml(updatedMessage.imageUrl);
                        row.innerHTML = `
                            <div class="chat-avatar">👤</div>
                            <div class="chat-bubble bubble-received image-message" onclick="viewFullImage('${safeUrl}')">
                                <img src="${safeUrl}" alt="Receipt image">
                            </div>
                        `;
                        msgBody.appendChild(row);
                    } else {
                        msgBody.innerHTML = `<div class="chat-bubble bubble-received">${escapeHtml(updatedMessage.message || 'No message')}</div>`;
                    }
                }
                
                if (wasAutoScrolling) {
                    scrollToBottom();
                }
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
            if (conv.imageUrl) {
                const safeUrl = escapeHtml(conv.imageUrl);
                if (conv.sender === 'user') {
                    row.innerHTML = `
                        <div class="chat-avatar">👤</div>
                        <div class="chat-bubble bubble-received image-message" onclick="viewFullImage('${safeUrl}')">
                            <img src="${safeUrl}" alt="Receipt image">
                        </div>
                    `;
                } else {
                    row.innerHTML = `
                        <div class="chat-bubble bubble-sent image-message" onclick="viewFullImage('${safeUrl}')">
                            <img src="${safeUrl}" alt="Receipt image">
                        </div>
                        <div class="chat-avatar">👤</div>
                    `;
                }
            } else if (conv.sender === 'user') {
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
    
    scrollToBottom();
    
    if (message.conversation && message.conversation.length > 0) {
        const lastMessage = message.conversation[message.conversation.length - 1];
        if (lastMessage.sender === 'user') {
            const lastMessageId = `${lastMessage.timestamp}_${lastMessage.message}`;
            localStorage.setItem(`admin_last_shown_${message._id}`, lastMessageId);
        }
    }
    
    const dot = element.querySelector('.msg-contact-dot');
    if (dot) dot.classList.remove('online');
}

async function adminSendMsg() {
    if (!currentMessage) {
        showToast('Please select a conversation first', 'error');
        return;
    }
    
    const input = document.getElementById('adminMsgInput');
    const text = input.value.trim();
    if (!text) return;
    
    const sendBtn = document.querySelector('.send-btn');
    sendBtn.disabled = true;
    
    try {
        const response = await apiFetch(`${API_URL}/admin/messages/${currentMessage._id}/respond`, {
            method: 'POST',
            body: JSON.stringify({ response: text })
        });
        
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
            scrollToBottom();
            
            if (!currentMessage.conversation) currentMessage.conversation = [];
            currentMessage.conversation.push({ sender: 'admin', message: text, timestamp: new Date() });
            currentMessage.status = 'acknowledged';
            
            showToast('Response sent', 'success');
            
            const lastMessageId = `${new Date().getTime()}_${text}`;
            localStorage.setItem(`admin_last_shown_${currentMessage._id}`, lastMessageId);
            
            setTimeout(() => loadMessages(), 500);
        } else {
            const error = await response.json();
            showToast(error.message || 'Failed to send', 'error');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showToast('Error sending message', 'error');
    } finally {
        sendBtn.disabled = false;
    }
}

let adminVisibilityHandler = null;

function startAdminMessagePolling() {
    if (adminPollingInterval) clearInterval(adminPollingInterval);
    if (adminVisibilityHandler) document.removeEventListener('visibilitychange', adminVisibilityHandler);
    
    adminVisibilityHandler = () => {
        if (!document.hidden) loadMessages();
    };
    document.addEventListener('visibilitychange', adminVisibilityHandler);
    
    adminPollingInterval = setInterval(() => {
        if (!document.hidden) {
            loadMessages();
        }
    }, 5000);
}

function stopAdminMessagePolling() {
    if (adminPollingInterval) {
        clearInterval(adminPollingInterval);
        adminPollingInterval = null;
    }
    if (adminVisibilityHandler) {
        document.removeEventListener('visibilitychange', adminVisibilityHandler);
        adminVisibilityHandler = null;
    }
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
// Payment Verification Modal Functions
// ──────────────────────────────────────────────────────────────────

let currentValidateApplication = null;

async function openValidateModal(applicationId) {
    console.log('Opening validate modal for:', applicationId);
    
    const modal = document.getElementById('validatePaymentModal');
    const modalBody = document.getElementById('validateModalBody');
    
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
    
    // Determine the display type
    let typeDisplay = '';
    if (isMembership) {
        typeDisplay = '🏌️ Membership';
    } else {
        // Show specific reservation type if available
        if (app.reservationTypeName) {
            typeDisplay = `📅 ${app.reservationTypeName}`;
        } else if (app.details?.reservationType) {
            typeDisplay = `📅 ${app.details.reservationType}`;
        } else {
            typeDisplay = '📅 Reservation';
        }
    }
    
    // Then use typeDisplay in the HTML
    modalBody.innerHTML = `
        <div class="app-detail-section">
            <h4>📋 Application Information</h4>
            <div class="detail-row">
                <span class="detail-label">Type:</span>
                <span class="detail-value">
                    <span class="status-badge status-pending">
                        ${typeDisplay}
                    </span>
                </span>
            </div>            <div class="detail-row">
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
                <span class="detail-label">Transact Ref:</span>
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
            <label>📝 Admin Notes <span style="color:#856404;font-size:11px;">(required to reject)</span></label>
            <textarea id="adminNotesTextarea" placeholder="Add notes about this verification. Required if rejecting."></textarea>
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
            loadPendingApplications();
            loadDashboardStats();
            loadReservations();
            loadUsers();
            loadAdminCalendar();
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

    // Use the admin notes textarea — it's already in the modal
    const notesTextarea = document.getElementById('adminNotesTextarea');
    const reason = notesTextarea ? notesTextarea.value.trim() : '';

    if (!reason) {
        showToast('Please enter a reason in the Admin Notes field before rejecting.', 'error');
        if (notesTextarea) {
            notesTextarea.focus();
            notesTextarea.style.border = '2px solid #dc3545';
            setTimeout(() => { notesTextarea.style.border = ''; }, 2500);
        }
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
            loadAdminCalendar();
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
    const tbody = document.getElementById('pendingAppsTableBody');
    if (!tbody) return;
    
    if (applications.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No pending applications</td></tr>';
        const badge = document.getElementById('pendingCountBadge');
        if (badge) badge.textContent = '0';
        return;
    }

    const badge = document.getElementById('pendingCountBadge');
    if (badge) badge.textContent = applications.length;

    tbody.innerHTML = applications.map(app => `
        <tr>
            <td><span class="badge-pending">${app.type === 'membership' ? '📋 Membership' : '📅 Reservation'}</span></td>
            <td>${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</td>
            <td>${escapeHtml(app.email)}</td>
            <td>${escapeHtml(app.paymentMethod)}</td>
            <td><strong>${escapeHtml(app.referenceNumber)}</strong></td>
            <td>₱${(app.amount || 0).toLocaleString()}</td>
            <td>${new Date(app.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="btn-verify" onclick="openValidateModal('${app._id}')">
                    🔍 Validate Payment
                </button>
            </td>
        </tr>
    `).join('');

    // Auto-expand accordion if there are pending items
    openDashboardAccordionIfNeeded();
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
    // Keep tableReservationTypes in sync so openEditTypeModal always has fresh data
    tableReservationTypes = types;

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
            loadReservationTypes();
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
        const slot = document.querySelector(`.time-slot-item[data-slot-index="${slotIndex}"] .status-toggle`);
        const newStatus = slot ? !slot.classList.contains('active') : false;
        
        const response = await fetch(`${API_URL}/reservation-types/admin/${typeId}/time-slots/${slotIndex}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ isAvailable: newStatus })
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
    // Use already-loaded in-memory data instead of re-fetching the full list
    const type = tableReservationTypes.find(t => t._id === typeId);
    
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
    } else {
        showToast('Could not find reservation type. Please refresh.', 'error');
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

// ──────────────────────────────────────────────────────────────────
// Event Listeners & Initialization
// ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Admin portal loading...');
    
    const token = getAuthToken();
    const userId = localStorage.getItem('userId');
    const loginTime = localStorage.getItem('loginTime');
    
    if (!token || !userId) {
        showToast('Session expired. Please login again.', 'error');
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 1500);
        return;
    }
    
    if (loginTime) {
        const hoursSinceLogin = (Date.now() - parseInt(loginTime)) / (1000 * 60 * 60);
        if (hoursSinceLogin >= 24) {
            localStorage.clear();
            showToast('Session expired. Please login again.', 'error');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1500);
            return;
        }
    }
    
    const isAdmin = await checkAdminStatus();
    if (!isAdmin) {
        console.error('❌ User is not an admin or token is invalid');
        showToast('Admin access required. Redirecting...', 'error');
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 2000);
        return;
    }
    
    adminCurrentMonth = new Date();
    
    loadReservationTypesForFilters().then(() => {
        const lastPage = localStorage.getItem('adminCurrentPage');
        if (lastPage === 'reservations') {
            loadAdminCalendar();
        }
    });
    
    startAdminMessagePolling();
    
    // Auto-refresh dashboard pending applications every 30 seconds
    setInterval(() => {
        const activePage = document.querySelector('.page.active');
        if (activePage && activePage.id === 'page-dashboard') {
            loadPendingApplications();
            loadDashboardStats();
        }
    }, 30000);
    
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
        if (adminPollingInterval) clearInterval(adminPollingInterval);
    });
    
    loadLastVisitedPage();
});

async function loadReservationTypesForFilters() {
    try {
        const response = await apiFetch(`${API_URL}/reservation-types/admin/all`);
        
        if (response.ok) {
            const types = await response.json();
            calendarReservationTypes = types;
            tableReservationTypes = types;
            
            populateCalendarFilter();
            populateTableTypeFilter();
        }
    } catch (error) {
        console.error('Error loading reservation types for filters:', error);
    }
}

function populateTableTypeFilter() {
    const filterSelect = document.getElementById('reservationTypeFilter');
    if (!filterSelect) return;
    
    const currentValue = filterSelect.value;
    
    let optionsHtml = '<option value="all">📌 All Types</option>';
    optionsHtml += '<option value="membership">🏌️ Membership</option>';
    optionsHtml += '<option value="reservation">📅 Reservation</option>';
    optionsHtml += '<option disabled style="background: #eee;">──────────</option>';
    
    const uniqueCategories = [...new Set(tableReservationTypes.map(type => type.category))];
    
    const categoryIcons = {
        golf: '⛳',
        amenities: '🍽️',
        events: '🎉',
        accommodation: '🏨',
        premium: '✨'
    };
    
    const categoryNames = {
        golf: 'Golf',
        amenities: 'Amenities',
        events: 'Events',
        accommodation: 'Accommodation',
        premium: 'Premium'
    };
    
    uniqueCategories.forEach(category => {
        const icon = categoryIcons[category] || '📌';
        const displayName = categoryNames[category] || category.charAt(0).toUpperCase() + category.slice(1);
        optionsHtml += `<option value="cat_${category}">${icon} ${displayName} (All)</option>`;
    });
    
    if (tableReservationTypes.length > 0) {
        optionsHtml += '<option disabled style="background: #eee;">──────────</option>';
        
        tableReservationTypes.forEach(type => {
            if (type.isActive) {
                optionsHtml += `<option value="type_${type._id}">  ${type.icon || '📌'} ${type.name}</option>`;
            }
        });
    }
    
    filterSelect.innerHTML = optionsHtml;
    
    if (currentValue && filterSelect.querySelector(`option[value="${currentValue}"]`)) {
        filterSelect.value = currentValue;
    }
}

async function revokeMembership(userId) {
    const reason = prompt('Enter reason for revoking membership (optional):');
    
    const token = getAuthToken();
    if (!token) return;
    
    showToast('Revoking membership...', 'info');
    
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}/revoke-membership`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ reason: reason || 'No reason provided' })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            const result = await response.json();
            showToast(`Membership revoked successfully! Previous status: ${result.previousStatus}`, 'success');
            loadUsers();
            loadDashboardStats();
        } else {
            const error = await response.json();
            showToast(error.message || 'Revoke failed', 'error');
        }
    } catch (error) {
        console.error('Error revoking membership:', error);
        showToast('Error revoking membership', 'error');
    }
}

// ──────────────────────────────────────────────────────────────────
// User Block / Unblock
// ──────────────────────────────────────────────────────────────────

let blockTargetUserId = null;
let blockTargetUserName = '';

function openBlockUserModal(userId, userName, isBlocked) {
    if (isBlocked) {
        // Unblock immediately — no reason needed
        unblockUser(userId, userName);
        return;
    }
    blockTargetUserId = userId;
    blockTargetUserName = userName;
    document.getElementById('blockUserTitle').textContent = `Block ${escapeHtml(userName)}`;
    document.getElementById('blockUserSubtitle').textContent = `${escapeHtml(userName)} will no longer be able to send messages to admin.`;
    const textarea = document.getElementById('blockReasonText');
    if (textarea) textarea.value = '';
    document.getElementById('blockUserModal').classList.add('show');
}

async function confirmBlockUser() {
    if (!blockTargetUserId) return;

    const textarea = document.getElementById('blockReasonText');
    const reason = textarea ? textarea.value.trim() : '';

    if (!reason) {
        showToast('Please enter a reason for blocking.', 'error');
        return;
    }

    const token = getAuthToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/admin/users/${blockTargetUserId}/block`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ reason })
        });

        if (response.ok) {
            showToast(`${blockTargetUserName} has been blocked from messaging.`, 'success');
            closeModal('blockUserModal');
            loadMessages();
        } else {
            const err = await response.json();
            showToast(err.message || 'Block failed', 'error');
        }
    } catch (error) {
        console.error('Block error:', error);
        showToast('Error blocking user', 'error');
    } finally {
        blockTargetUserId = null;
        blockTargetUserName = '';
    }
}

async function unblockUser(userId, userName) {
    const token = getAuthToken();
    if (!token) return;

    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}/unblock`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            showToast(`${userName} has been unblocked.`, 'success');
            loadMessages();
        } else {
            const err = await response.json();
            showToast(err.message || 'Unblock failed', 'error');
        }
    } catch (error) {
        console.error('Unblock error:', error);
        showToast('Error unblocking user', 'error');
    }
}

function toggleDashboardAccordion() {
    const body = document.getElementById('dashboardAccordionBody');
    const chevron = document.getElementById('dashboardAccordionChevron');
    if (!body) return;
    const isOpen = body.style.maxHeight !== '0px' && body.style.maxHeight !== '';
    if (isOpen) {
        body.style.maxHeight = '0';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    } else {
        body.style.maxHeight = body.scrollHeight + 'px';
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
}

// Auto-open accordion when pending count > 0
function openDashboardAccordionIfNeeded() {
    const badge = document.getElementById('pendingCountBadge');
    const count = badge ? parseInt(badge.textContent) || 0 : 0;
    const body = document.getElementById('dashboardAccordionBody');
    if (body && count > 0 && (body.style.maxHeight === '0px' || body.style.maxHeight === '')) {
        toggleDashboardAccordion();
    }
}

async function loadAvailabilityDashboard() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        // Fetch types and bookings in parallel
        const [typesResponse, bookingsResponse] = await Promise.all([
            fetch(`${API_URL}/reservation-types/admin/all`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`${API_URL}/admin/reservations/calendar?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}&filterType=all`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);
        
        if (!typesResponse.ok) throw new Error('Failed to fetch reservation types');
        const reservationTypes = await typesResponse.json();
        
        let bookings = [];
        if (bookingsResponse.ok) {
            bookings = await bookingsResponse.json();
        }
        
        // Calculate availability for each type
        const availabilityData = reservationTypes.map(type => {
            const timeSlots = type.timeSlots || [];
            const slotAvailability = timeSlots.map(slot => {
                // Count approved/confirmed bookings for this type and time slot
                const bookingsForSlot = bookings.filter(booking => 
                    (booking.reservationTypeId === type._id || booking.reservationTypeName === type.name) && 
                    booking.timeSlot === slot.time &&
                    booking.status !== 'cancelled' &&
                    booking.status !== 'rejected'
                );
                
                const usedCapacity = bookingsForSlot.length;
                const remainingCapacity = Math.max(0, slot.capacity - usedCapacity);
                const percentageUsed = slot.capacity > 0 ? (usedCapacity / slot.capacity) * 100 : 0;
                
                let statusClass = 'available';
                if (remainingCapacity === 0) statusClass = 'full';
                else if (percentageUsed > 70) statusClass = 'limited';
                
                return {
                    time: slot.time,
                    capacity: slot.capacity,
                    usedCapacity: usedCapacity,
                    remainingCapacity: remainingCapacity,
                    percentageUsed: Math.min(100, percentageUsed),
                    statusClass: statusClass,
                    isAvailable: remainingCapacity > 0 && slot.isAvailable !== false
                };
            });
            
            const totalCapacity = timeSlots.reduce((sum, slot) => sum + slot.capacity, 0);
            const totalUsed = slotAvailability.reduce((sum, slot) => sum + slot.usedCapacity, 0);
            const totalRemaining = slotAvailability.reduce((sum, slot) => sum + slot.remainingCapacity, 0);
            
            return {
                id: type._id,
                name: type.name,
                category: type.category,
                icon: type.icon || getCategoryIcon(type.category),
                isActive: type.isActive,
                basePrice: type.basePrice,
                timeSlots: slotAvailability,
                totalCapacity: totalCapacity,
                totalUsed: totalUsed,
                totalRemaining: totalRemaining,
                overallPercentage: totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0
            };
        });
        
        renderAvailabilityDashboard(availabilityData);
        updateSummaryStats(availabilityData);
        allAvailabilityData = availabilityData;
        const countEl = document.getElementById('availabilityResultsCount');
        if (countEl) countEl.textContent = `${availabilityData.length} type${availabilityData.length !== 1 ? 's' : ''}`;
        
    } catch (error) {
        console.error('Error loading availability dashboard:', error);
        showToast('Error loading availability data', 'error');
        
        // Fallback to mock data for testing
        const mockData = getMockAvailabilityData();
        renderAvailabilityDashboard(mockData);
        allAvailabilityData = mockData;
        updateSummaryStats(mockData);
        const countElFallback = document.getElementById('availabilityResultsCount');
        if (countElFallback) countElFallback.textContent = `${mockData.length} type${mockData.length !== 1 ? 's' : ''}`;
    }
}

function getCategoryIcon(category) {
    const icons = {
        golf: '⛳',
        amenities: '🍽️',
        events: '🎉',
        accommodation: '🏨',
        premium: '✨'
    };
    return icons[category] || '📌';
}

function updateSummaryStats(availabilityData) {
    const activeTypes = availabilityData.filter(t => t.isActive);
    const totalCapacity = activeTypes.reduce((sum, t) => sum + t.totalCapacity, 0);
    const totalBooked = activeTypes.reduce((sum, t) => sum + t.totalUsed, 0);
    const totalAvailable = activeTypes.reduce((sum, t) => sum + t.totalRemaining, 0);
    
    document.getElementById('totalTypesCount').textContent = activeTypes.length;
    document.getElementById('totalCapacityCount').textContent = totalCapacity.toLocaleString();
    document.getElementById('totalBookedCount').textContent = totalBooked.toLocaleString();
    document.getElementById('totalAvailableCount').textContent = totalAvailable.toLocaleString();
}

function renderAvailabilityDashboard(availabilityData) {
    const container = document.getElementById('availabilityCardsContainer');
    if (!container) return;

    if (!availabilityData || availabilityData.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 60px;">
                <div style="font-size: 48px; margin-bottom: 20px;">📊</div>
                <h3>No Reservation Types Found</h3>
                <p>Create reservation types in the "Manage Reservations" tab first.</p>
                <button class="btn-olive" onclick="showPage('manage_reservations')" style="margin-top: 20px;">
                    + Go to Manage Reservations
                </button>
            </div>
        `;
        return;
    }

    const getProgressClass = (percentage) => {
        if (percentage >= 90) return 'danger';
        if (percentage >= 70) return 'warning';
        return '';
    };

    // Preserve which accordions are open across re-renders (filter changes)
    const openIds = new Set(
        [...container.querySelectorAll('.accordion-body.open')]
            .map(el => el.dataset.id)
    );

    container.innerHTML = availabilityData.map((type, index) => {
        const isOpen = openIds.has(type.id) || (openIds.size === 0 && index === 0);
        const overallPct = type.overallPercentage.toFixed(1);
        const overallClass = getProgressClass(type.overallPercentage);

        // Pill shown in the header when collapsed
        const headerPill = type.totalRemaining === 0
            ? `<span class="slot-status full" style="font-size:11px;">🔴 FULL</span>`
            : type.totalRemaining / (type.totalCapacity || 1) <= 0.3
                ? `<span class="slot-status limited" style="font-size:11px;">⚠️ LIMITED</span>`
                : `<span class="slot-status available" style="font-size:11px;">✅ AVAILABLE</span>`;

        return `
            <div class="accordion-item" id="acc-${type.id}">
                <button class="accordion-header" onclick="toggleAccordion('${type.id}')" aria-expanded="${isOpen}">
                    <div class="card-header-left">
                        <div class="card-icon">${type.icon}</div>
                        <div class="card-title">
                            <h3>${escapeHtml(type.name)}</h3>
                            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-top:4px;">
                                <span class="category-badge">${type.category}</span>
                                ${!type.isActive ? '<span class="inactive-badge">Inactive</span>' : ''}
                                ${headerPill}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:20px; flex-shrink:0;">
                        <div class="stat-badge">
                            <div class="stat-value">₱${type.basePrice.toLocaleString()}</div>
                            <div class="stat-label">Base Price</div>
                        </div>
                        <div class="stat-badge">
                            <div class="stat-value">${type.totalRemaining} / ${type.totalCapacity}</div>
                            <div class="stat-label">Available</div>
                        </div>
                        <div class="stat-badge" style="min-width:60px; text-align:center;">
                            <div class="stat-value">${overallPct}%</div>
                            <div class="stat-label">Occupancy</div>
                        </div>
                        <span class="accordion-chevron ${isOpen ? 'open' : ''}">▼</span>
                    </div>
                </button>

                <div class="accordion-body ${isOpen ? 'open' : ''}" data-id="${type.id}">
                    <div class="card-body-availability">
                        ${type.timeSlots.length === 0 ? `
                            <div style="text-align:center; padding:30px; color:#999;">No time slots configured.</div>
                        ` : type.timeSlots.map(slot => `
                            <div class="time-slot-card">
                                <div class="time-slot-header">
                                    <span class="slot-time">🕐 ${escapeHtml(slot.time)}</span>
                                    <span class="slot-status ${slot.statusClass}">
                                        ${slot.statusClass === 'full' ? '🔴 FULL' : slot.statusClass === 'limited' ? '⚠️ LIMITED' : '✅ AVAILABLE'}
                                    </span>
                                </div>

                                <div class="progress-bar-container">
                                    <div class="progress-bar-fill ${getProgressClass(slot.percentageUsed)}"
                                         style="width: ${slot.percentageUsed}%;"></div>
                                </div>

                                <div class="slot-capacity-details">
                                    <div class="capacity-numbers">
                                        <span>📊 ${slot.usedCapacity} / ${slot.capacity} booked</span>
                                        <span>✅ ${slot.remainingCapacity} available</span>
                                    </div>
                                    <div>${slot.percentageUsed.toFixed(1)}% full</div>
                                </div>

                                <div style="margin-top:10px; font-size:11px; color:#888; display:flex; gap:15px; flex-wrap:wrap;">
                                    <span>📊 Total Capacity: <strong>${slot.capacity}</strong></span>
                                    <span>🎟️ Used: <strong style="color:${slot.usedCapacity > 0 ? '#dc3545' : '#28a745'}">${slot.usedCapacity}</strong></span>
                                    <span>✨ Remaining: <strong style="color:#28a745">${slot.remainingCapacity}</strong></span>
                                </div>
                            </div>
                        `).join('')}

                        <div class="summary-bar">
                            <div class="summary-item">
                                <div class="summary-label">Total Slots</div>
                                <div class="summary-value">${type.totalCapacity}</div>
                            </div>
                            <div class="summary-item">
                                <div class="summary-label">Booked</div>
                                <div class="summary-value" style="color:#dc3545;">${type.totalUsed}</div>
                            </div>
                            <div class="summary-item">
                                <div class="summary-label">Available</div>
                                <div class="summary-value" style="color:#28a745;">${type.totalRemaining}</div>
                            </div>
                            <div class="summary-item">
                                <div class="summary-label">Occupancy</div>
                                <div class="summary-value">${overallPct}%</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function toggleAccordion(id) {
    const body = document.querySelector(`.accordion-body[data-id="${id}"]`);
    const header = document.querySelector(`#acc-${id} .accordion-header`);
    const chevron = document.querySelector(`#acc-${id} .accordion-chevron`);
    if (!body) return;

    const isOpen = body.classList.contains('open');
    body.classList.toggle('open', !isOpen);
    if (header) header.setAttribute('aria-expanded', String(!isOpen));
    if (chevron) chevron.classList.toggle('open', !isOpen);
}

// ──────────────────────────────────────────────────────────────────
// Availability Cards Filtering
// ──────────────────────────────────────────────────────────────────

function filterAvailabilityCards() {
    const searchInput = document.getElementById('availabilitySearchInput');
    const categoryFilter = document.getElementById('availabilityCategoryFilter');
    const statusFilter = document.getElementById('availabilityStatusFilter');
    const activeFilter = document.getElementById('availabilityActiveFilter');

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const category = categoryFilter ? categoryFilter.value : 'all';
    const status = statusFilter ? statusFilter.value : 'all';
    const activeVal = activeFilter ? activeFilter.value : 'all';

    const filtered = allAvailabilityData.filter(type => {
        // Name search
        if (query && !type.name.toLowerCase().includes(query)) return false;

        // Category
        if (category !== 'all' && type.category !== category) return false;

        // Active/Inactive
        if (activeVal === 'active' && !type.isActive) return false;
        if (activeVal === 'inactive' && type.isActive) return false;

        // Availability status
        if (status !== 'all') {
            const pct = type.overallPercentage;
            const remaining = type.totalRemaining;
            const capacity = type.totalCapacity;
            const remainingPct = capacity > 0 ? (remaining / capacity) * 100 : 0;

            if (status === 'full' && remaining > 0) return false;
            if (status === 'available' && remaining === 0) return false;
            if (status === 'limited' && !(remaining > 0 && remainingPct <= 30)) return false;
        }

        return true;
    });

    renderAvailabilityDashboard(filtered);

    const countEl = document.getElementById('availabilityResultsCount');
    if (countEl) {
        const total = allAvailabilityData.length;
        countEl.textContent = filtered.length === total
            ? `${total} type${total !== 1 ? 's' : ''}`
            : `${filtered.length} of ${total} type${total !== 1 ? 's' : ''}`;
    }
}

function resetAvailabilityFilters() {
    const searchInput = document.getElementById('availabilitySearchInput');
    const categoryFilter = document.getElementById('availabilityCategoryFilter');
    const statusFilter = document.getElementById('availabilityStatusFilter');
    const activeFilter = document.getElementById('availabilityActiveFilter');

    if (searchInput) searchInput.value = '';
    if (categoryFilter) categoryFilter.value = 'all';
    if (statusFilter) statusFilter.value = 'all';
    if (activeFilter) activeFilter.value = 'all';

    renderAvailabilityDashboard(allAvailabilityData);

    const countEl = document.getElementById('availabilityResultsCount');
    if (countEl) {
        const total = allAvailabilityData.length;
        countEl.textContent = `${total} type${total !== 1 ? 's' : ''}`;
    }
}

// Mock data for testing when API fails
function getMockAvailabilityData() {
    return [
        {
            id: 'mock1',
            name: 'Swimming Pool',
            category: 'amenities',
            icon: '🏊',
            isActive: true,
            basePrice: 500,
            timeSlots: [
                { time: '6:00 AM - 8:00 AM', capacity: 3, usedCapacity: 2, remainingCapacity: 1, percentageUsed: 66.7, statusClass: 'limited', isAvailable: true },
                { time: '8:00 AM - 10:00 AM', capacity: 3, usedCapacity: 1, remainingCapacity: 2, percentageUsed: 33.3, statusClass: 'available', isAvailable: true },
                { time: '10:00 AM - 12:00 PM', capacity: 3, usedCapacity: 3, remainingCapacity: 0, percentageUsed: 100, statusClass: 'full', isAvailable: false },
                { time: '1:00 PM - 3:00 PM', capacity: 3, usedCapacity: 0, remainingCapacity: 3, percentageUsed: 0, statusClass: 'available', isAvailable: true },
                { time: '3:00 PM - 5:00 PM', capacity: 3, usedCapacity: 2, remainingCapacity: 1, percentageUsed: 66.7, statusClass: 'limited', isAvailable: true },
                { time: '5:00 PM - 7:00 PM', capacity: 4, usedCapacity: 4, remainingCapacity: 0, percentageUsed: 100, statusClass: 'full', isAvailable: false },
                { time: '7:00 PM - 9:00 PM', capacity: 4, usedCapacity: 1, remainingCapacity: 3, percentageUsed: 25, statusClass: 'available', isAvailable: true }
            ],
            totalCapacity: 23,
            totalUsed: 13,
            totalRemaining: 10,
            overallPercentage: 56.5
        },
        {
            id: 'mock2',
            name: 'Tee Time (9 Holes)',
            category: 'golf',
            icon: '⛳',
            isActive: true,
            basePrice: 2000,
            timeSlots: [
                { time: '6:00 AM', capacity: 5, usedCapacity: 4, remainingCapacity: 1, percentageUsed: 80, statusClass: 'limited', isAvailable: true },
                { time: '7:00 AM', capacity: 5, usedCapacity: 5, remainingCapacity: 0, percentageUsed: 100, statusClass: 'full', isAvailable: false },
                { time: '8:00 AM', capacity: 5, usedCapacity: 3, remainingCapacity: 2, percentageUsed: 60, statusClass: 'available', isAvailable: true },
                { time: '9:00 AM', capacity: 5, usedCapacity: 5, remainingCapacity: 0, percentageUsed: 100, statusClass: 'full', isAvailable: false },
                { time: '10:00 AM', capacity: 5, usedCapacity: 2, remainingCapacity: 3, percentageUsed: 40, statusClass: 'available', isAvailable: true },
                { time: '11:00 AM', capacity: 5, usedCapacity: 1, remainingCapacity: 4, percentageUsed: 20, statusClass: 'available', isAvailable: true }
            ],
            totalCapacity: 30,
            totalUsed: 20,
            totalRemaining: 10,
            overallPercentage: 66.7
        },
        {
            id: 'mock3',
            name: 'Spa & Massage',
            category: 'amenities',
            icon: '💆',
            isActive: true,
            basePrice: 1500,
            timeSlots: [
                { time: '9:00 AM', capacity: 2, usedCapacity: 1, remainingCapacity: 1, percentageUsed: 50, statusClass: 'available', isAvailable: true },
                { time: '10:00 AM', capacity: 2, usedCapacity: 2, remainingCapacity: 0, percentageUsed: 100, statusClass: 'full', isAvailable: false },
                { time: '11:00 AM', capacity: 2, usedCapacity: 0, remainingCapacity: 2, percentageUsed: 0, statusClass: 'available', isAvailable: true },
                { time: '1:00 PM', capacity: 2, usedCapacity: 2, remainingCapacity: 0, percentageUsed: 100, statusClass: 'full', isAvailable: false },
                { time: '2:00 PM', capacity: 2, usedCapacity: 1, remainingCapacity: 1, percentageUsed: 50, statusClass: 'available', isAvailable: true },
                { time: '3:00 PM', capacity: 2, usedCapacity: 2, remainingCapacity: 0, percentageUsed: 100, statusClass: 'full', isAvailable: false }
            ],
            totalCapacity: 12,
            totalUsed: 8,
            totalRemaining: 4,
            overallPercentage: 66.7
        },
        {
            id: 'mock4',
            name: 'Driving Range',
            category: 'golf',
            icon: '🏌️',
            isActive: true,
            basePrice: 800,
            timeSlots: [
                { time: '7:00 AM', capacity: 10, usedCapacity: 7, remainingCapacity: 3, percentageUsed: 70, statusClass: 'limited', isAvailable: true },
                { time: '8:00 AM', capacity: 10, usedCapacity: 8, remainingCapacity: 2, percentageUsed: 80, statusClass: 'limited', isAvailable: true },
                { time: '9:00 AM', capacity: 10, usedCapacity: 9, remainingCapacity: 1, percentageUsed: 90, statusClass: 'warning', isAvailable: true },
                { time: '10:00 AM', capacity: 10, usedCapacity: 10, remainingCapacity: 0, percentageUsed: 100, statusClass: 'full', isAvailable: false },
                { time: '11:00 AM', capacity: 10, usedCapacity: 6, remainingCapacity: 4, percentageUsed: 60, statusClass: 'available', isAvailable: true }
            ],
            totalCapacity: 50,
            totalUsed: 40,
            totalRemaining: 10,
            overallPercentage: 80
        }
    ];
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
window.loadPayments = loadPayments;
window.loadUsers = loadUsers;
window.loadDashboardStats = loadDashboardStats;
window.loadReservations = loadReservations;
window.loadMessages = loadMessages;
window.openValidateModal = openValidateModal;
window.confirmVerifyPayment = confirmVerifyPayment;
window.confirmRejectPayment = confirmRejectPayment;
window.closeValidateModal = closeValidateModal;
window.loadPendingApplications = loadPendingApplications;
window.loadReservationTypes = loadReservationTypes;
window.openAddReservationModal = openAddReservationModal;
window.closeReservationModal = closeReservationModal;
window.saveReservationType = saveReservationType;
window.openEditTypeModal = openEditTypeModal;
window.openAddTimeSlotModal = openAddTimeSlotModal;
window.closeTimeSlotModal = closeTimeSlotModal;
window.addTimeSlot = addTimeSlot;
window.deleteReservationType = deleteReservationType;
window.toggleReservationStatus = toggleReservationStatus;
window.updateTimeSlotField = updateTimeSlotField;
window.toggleTimeSlotAvailability = toggleTimeSlotAvailability;
window.deleteTimeSlot = deleteTimeSlot;
window.changeAdminMonth = changeAdminMonth;
window.openAdminDayDetails = openAdminDayDetails;
window.revokeMembership = revokeMembership;
window.scrollToBottom = scrollToBottom;
window.openBlockUserModal = openBlockUserModal;
window.confirmBlockUser = confirmBlockUser;
window.unblockUser = unblockUser;
window.toggleResGroup = toggleResGroup;
window.toggleDashboardAccordion = toggleDashboardAccordion;