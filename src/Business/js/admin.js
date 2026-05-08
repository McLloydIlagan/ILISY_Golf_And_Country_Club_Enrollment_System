const API_URL = 'https://ilisy-golf-and-country-club-enrollment.onrender.com/api';

// ──────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────

let tableReservationTypes = [];
let lastMessageIds = new Map();
let notifiedMessageIds = new Map();
let audioContextAllowed = false;

function getAuthToken() {
    const token = localStorage.getItem('authToken');
    console.log('🔑 Getting auth token:', token ? 'Token exists (length: ' + token.length + ')' : 'No token');
    return token;
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
    
    console.log(`📡 API Request: ${options.method || 'GET'} ${url}`);
    
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
        console.log(`📡 Response status: ${response.status} for ${url}`);
        
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
        <img src="${imageUrl}" alt="Full size image" style="
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
        loadMonthlySummary();
    }
    else if (id === 'accounts') loadUsers();
    else if (id === 'payments') loadPayments();
    else if (id === 'messages') {
        loadMessages();
        startAdminMessagePolling();
    }
    else if (id === 'reservations') loadReservations();
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
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await apiFetch(`${API_URL}/admin/payments`);
        
        if (response.ok) {
            const payments = await response.json();
            
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            const months = [];
            const membershipData = [];
            const reservationData = [];
            
            for (let i = 5; i >= 0; i--) {
                const date = new Date(currentYear, currentMonth - i, 1);
                const monthName = date.toLocaleDateString('en-US', { month: 'short' });
                months.push(monthName);
                
                let membershipTotal = 0;
                let reservationTotal = 0;
                
                payments.forEach(payment => {
                    const paymentDate = new Date(payment.createdAt);
                    if (payment.paymentStatus === 'completed' &&
                        paymentDate.getMonth() === date.getMonth() && 
                        paymentDate.getFullYear() === date.getFullYear()) {
                        if (payment.transactionType === 'membership') {
                            membershipTotal += payment.amount;
                        } else if (payment.transactionType === 'reservation') {
                            reservationTotal += payment.amount;
                        }
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
            if (incomeElement) {
                incomeElement.textContent = `₱${totalIncome.toLocaleString()}`;
            }
        }
    } catch (error) {
        console.error('Error loading financial report:', error);
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

async function loadMonthlySummary() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
        const response = await apiFetch(`${API_URL}/admin/payments`);
        
        if (response.ok) {
            const payments = await response.json();
            const completedPayments = payments.filter(p => p.paymentStatus === 'completed');
            
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            let currentMonthIncome = 0;
            let previousMonthIncome = 0;
            let percentageChange = 0;
            
            completedPayments.forEach(payment => {
                const paymentDate = new Date(payment.createdAt);
                if (paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear) {
                    currentMonthIncome += payment.amount;
                } else if (paymentDate.getMonth() === currentMonth - 1 && paymentDate.getFullYear() === currentYear) {
                    previousMonthIncome += payment.amount;
                } else if (currentMonth === 0 && paymentDate.getMonth() === 11 && paymentDate.getFullYear() === currentYear - 1) {
                    previousMonthIncome += payment.amount;
                }
            });
            
            if (previousMonthIncome > 0) {
                percentageChange = ((currentMonthIncome - previousMonthIncome) / previousMonthIncome) * 100;
            }
            
            const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const chartHeader = document.getElementById('financialReportTitle');
            if (chartHeader) {
                chartHeader.innerHTML = `${monthName} Financial Report 
                    <span style="font-size: 11px; color: ${percentageChange >= 0 ? '#4caf50' : '#dc3545'}; margin-left: 10px;">
                        ${percentageChange >= 0 ? '↑' : '↓'} ${Math.abs(percentageChange).toFixed(1)}% vs last month
                    </span>`;
            }
        }
    } catch (error) {
        console.error('Error loading monthly summary:', error);
    }
}

// ──────────────────────────────────────────────────────────────────
// Admin Dynamic Calendar Functions
// ──────────────────────────────────────────────────────────────────

let adminCurrentMonth = new Date();
let adminReservationsData = [];
let adminCalendarData = [];
let currentCalendarFilter = 'all';
let calendarReservationTypes = [];

async function loadCalendarReservationTypes() {
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
            calendarReservationTypes = types;
            populateCalendarFilter();
        }
    } catch (error) {
        console.error('Error loading reservation types for calendar:', error);
    }
}

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
    
    // Category icons and names
    const categoryInfo = {
        golf: { icon: '⛳', name: 'Golf / Tee Time' },
        amenities: { icon: '🍽️', name: 'Amenities' },
        events: { icon: '🎉', name: 'Events' },
        accommodation: { icon: '🏨', name: 'Accommodation' },
        premium: { icon: '✨', name: 'Premium' }
    };
    
    for (const [category, types] of categoryMap) {
        const info = categoryInfo[category] || { icon: '📌', name: category };
        optionsHtml += `<option value="cat_${category}" style="font-weight: bold; background: #f0f0f0;">${info.icon} ${info.name} (All)</option>`;
        types.forEach(type => {
            if (type.isActive) {
                optionsHtml += `<option value="type_${type._id}" style="padding-left: 20px;">  ${type.icon || '📌'} ${type.name}</option>`;
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
    let selectedTypeName = '';
    
    if (selectedFilter === 'membership') {
        filterType = 'membership';
    } else if (selectedFilter === 'all') {
        filterType = 'all';
    } else if (selectedFilter.startsWith('cat_')) {
        filterType = 'category';
        filterValue = selectedFilter.replace('cat_', '');
    } else if (selectedFilter.startsWith('type_')) {
        filterType = 'type_id';
        filterValue = selectedFilter.replace('type_', '');
        
        // Also get the type name for better matching
        const selectedType = calendarReservationTypes.find(t => t._id === filterValue);
        if (selectedType) {
            selectedTypeName = selectedType.name;
        }
    }
    
    console.log('Loading calendar with filter:', { filterType, filterValue, selectedTypeName });
    
    try {
        const year = adminCurrentMonth.getFullYear();
        const month = adminCurrentMonth.getMonth() + 1;
        
        // Pass both ID and name for better matching
        let url = `${API_URL}/admin/reservations/calendar?year=${year}&month=${month}&filterType=${filterType}&filterValue=${encodeURIComponent(filterValue)}`;
        if (selectedTypeName) {
            url += `&typeName=${encodeURIComponent(selectedTypeName)}`;
        }
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            adminCalendarData = await response.json();
            console.log('Calendar data loaded:', adminCalendarData.length, 'records for filter:', selectedFilter);
            console.log('Sample:', adminCalendarData.slice(0, 3));
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
    const selectedFilterValue = filterSelect ? filterSelect.value : 'all';
    const selectedFilterText = filterSelect ? filterSelect.options[filterSelect.selectedIndex]?.text || 'All Reservations' : 'All Reservations';
    
    // Determine if we're filtering by a specific type
    const isSpecificType = selectedFilterValue.startsWith('type_');
    const isCategoryFilter = selectedFilterValue.startsWith('cat_');
    const isMembershipFilter = selectedFilterValue === 'membership';
    
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
        
        // Filter reservations for this specific day based on current filter
        let dayReservations = adminCalendarData.filter(res => {
            const resDate = new Date(res.date);
            const dateMatches = resDate.getFullYear() === year && 
                               resDate.getMonth() === month && 
                               resDate.getDate() === d;
            
            if (!dateMatches) return false;
            
            // Apply filter logic
            if (isSpecificType) {
                // For specific type filter, match by reservationTypeName
                const typeId = selectedFilterValue.replace('type_', '');
                const selectedType = calendarReservationTypes.find(t => t._id === typeId);
                if (selectedType) {
                    return res.reservationTypeName === selectedType.name ||
                           (res.reservationType || '').toLowerCase() === selectedType.name.toLowerCase();
                }
                return false;
            } else if (isCategoryFilter) {
                // For category filter
                const category = selectedFilterValue.replace('cat_', '');
                return (res.category || '').toLowerCase() === category.toLowerCase() ||
                       (res.reservationTypeName || '').toLowerCase().includes(category.toLowerCase());
            } else if (isMembershipFilter) {
                return res.type === 'membership';
            }
            
            // Default: show all reservations
            return true;
        });
        
        const bookedCount = dayReservations.length;
        
        // Determine status class based on bookings
        let statusClass = 'available';
        let tooltipDetails = '';
        
        if (bookedCount === 0) {
            statusClass = 'available';
            tooltipDetails = `Available for ${selectedFilterText}`;
        } else if (bookedCount === 1) {
            statusClass = 'booked';
            const res = dayReservations[0];
            const typeName = res.reservationTypeName || res.type || 'Reservation';
            tooltipDetails = `${bookedCount} booking: ${typeName} - ${res.firstName} ${res.lastName}`;
        } else {
            statusClass = 'booked';
            const typeNames = [...new Set(dayReservations.map(r => r.reservationTypeName || r.type || 'Reservation'))];
            tooltipDetails = `${bookedCount} bookings: ${typeNames.join(', ')}`;
        }
        
        const todayClass = isToday ? 'today' : '';
        
        grid.innerHTML += `
            <div class="res-day ${statusClass} ${todayClass}" 
                 data-date="${dateKey}"
                 data-booked="${bookedCount}"
                 data-info="${escapeHtml(tooltipDetails)}"
                 title="${escapeHtml(tooltipDetails)}"
                 onclick="openAdminDayDetails('${dateKey}')">
                ${d}
                ${bookedCount > 0 ? `<span style="font-size:8px; position:absolute; bottom:2px; right:2px;">${bookedCount}</span>` : ''}
            </div>
        `;
    }
    
    // Update legend to show what colors mean
    const legendRow = document.querySelector('.legend-row');
    if (legendRow) {
        let filterSpecificText = '';
        if (isSpecificType) {
            const typeId = selectedFilterValue.replace('type_', '');
            const selectedType = calendarReservationTypes.find(t => t._id === typeId);
            if (selectedType) {
                filterSpecificText = ` - Showing: ${selectedType.icon || '📌'} ${selectedType.name}`;
            }
        } else if (isCategoryFilter) {
            const category = selectedFilterValue.replace('cat_', '');
            filterSpecificText = ` - Category: ${category}`;
        } else if (isMembershipFilter) {
            filterSpecificText = ` - Membership Applications`;
        }
        
        // Update the calendar title or add a subtitle
        const calendarTitle = document.querySelector('.res-cal-header span');
        if (calendarTitle && filterSpecificText) {
            // Don't override, just log
        }
    }
}

function changeAdminMonth(delta) {
    adminCurrentMonth.setMonth(adminCurrentMonth.getMonth() + delta);
    loadAdminCalendar();
}

async function openAdminDayDetails(dateKey) {
    const [year, month, day] = dateKey.split('-');
    const dateObj = new Date(year, month - 1, day);
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
    
    const currentFilter = document.getElementById('calendarTypeFilter')?.value || 'all';
    
    modalBody.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <div class="loading-spinner" style="display:inline-block;"></div> Loading reservations...
        </div>
        <div style="text-align:right; margin-top:16px;">
            <button class="btn-cancel-modal" style="padding:8px 22px;" onclick="closeModal('resDetailModal')">Close</button>
        </div>
    `;
    
    try {
        const response = await fetch(`${API_URL}/admin/reservations/by-date/${dateKey}?filter=${currentFilter}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        if (response.ok) {
            let reservations = await response.json();
            
            if (currentFilter !== 'all' && currentFilter !== 'membership') {
                reservations = reservations.filter(res => {
                    const resType = (res.reservationType || res.type || 'golf').toLowerCase();
                    return resType === currentFilter.toLowerCase() ||
                           (currentFilter === 'reservation' && (resType === 'golf' || resType === 'tee time'));
                });
            }
            
            if (reservations.length === 0) {
                modalBody.innerHTML = `
                    <div style="text-align:center; padding:40px; color:#888;">
                        No ${currentFilter !== 'all' ? currentFilter : ''} reservations for this day.
                    </div>
                    <div style="text-align:right; margin-top:16px;">
                        <button class="btn-cancel-modal" style="padding:8px 22px;" onclick="closeModal('resDetailModal')">Close</button>
                    </div>
                `;
                return;
            }
            
            let slotsHtml = `
                <div class="res-detail-header-info" style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #ddd;">
                    <strong>Total ${currentFilter !== 'all' ? currentFilter + ' ' : ''}Reservations: ${reservations.length}</strong>
                </div>
            `;
            
            reservations.forEach((res, index) => {
                const reservationType = res.reservationType || res.type || 'N/A';
                const statusClass = res.status === 'confirmed' ? 'status-confirmed' : 'status-pending';
                const statusText = res.status === 'confirmed' ? '✓ Confirmed' : '⏳ Pending';
                
                slotsHtml += `
                    <div class="reservation-detail-card" style="background: ${index % 2 === 0 ? '#f9f9f9' : 'white'}; border: 1px solid #eee; border-radius: 8px; margin-bottom: 12px; padding: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <div class="res-slot-time" style="background: var(--olive); color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">
                                🕐 ${escapeHtml(res.timeSlot || 'N/A')}
                            </div>
                            <div>
                                <span class="status-badge ${statusClass}">${statusText}</span>
                            </div>
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 10px;">
                            <div><strong>👤 Guest:</strong> ${escapeHtml(res.firstName || '')} ${escapeHtml(res.lastName || '')}</div>
                            <div><strong>📞 Phone:</strong> ${escapeHtml(res.phone || 'N/A')}</div>
                            <div><strong>📧 Email:</strong> ${escapeHtml(res.email || 'N/A')}</div>
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 15px;">
                            <div><strong>🏷️ Type:</strong> <span class="detail-badge">${escapeHtml(reservationType)}</span></div>
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
                Error loading reservations.
            </div>
            <div style="text-align:right; margin-top:16px;">
                <button class="btn-cancel-modal" style="padding:8px 22px;" onclick="closeModal('resDetailModal')">Close</button>
            </div>
        `;
    }
    
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
                        <button class="btn-remove" onclick="showRemoveModal('${user._id}')">remove</button>
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
                const isRefunded = payment.paymentStatus === 'refunded';
                const statusColors = {
                    completed: '#28a745', pending: '#856404', refunded: '#9c403d',
                    failed: '#dc3545', processing: '#0d6efd'
                };
                const statusColor = statusColors[payment.paymentStatus] || '#666';
                row.innerHTML = `
                    <td>${escapeHtml(payment.firstName || '')}</td>
                    <td>${escapeHtml(payment.lastName || '')}</td>
                    <td>${escapeHtml(payment.paymentMethod || '')}</td>
                    <td>${escapeHtml(payment.accountNumber || '')}</td>
                    <td>₱${(payment.amount || 0).toLocaleString()}</td>
                    <td>${payment.processedAt ? new Date(payment.processedAt).toLocaleDateString() : payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : 'Pending'}</td>
                    <td><span class="badge ${payment.transactionType === 'membership' ? 'badge-active' : 'badge-none'}">${escapeHtml(payment.transactionType || 'N/A')}</span></td>
                    <td>
                        <span style="background:${statusColor}; color:white; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:bold;">${payment.paymentStatus || 'pending'}</span>
                        ${isRefunded && payment.refundReason ? `<br><small style="color:#aaa; font-size:10px;">${escapeHtml(payment.refundReason)}</small>` : ''}
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
    
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
    const statusFilterValue = statusFilter ? statusFilter.value : 'all';
    let typeFilterValue = typeFilter ? typeFilter.value : 'all';
    
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
        
        return matchesSearch && matchesStatus && matchesType;
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
    
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = 'all';
    if (typeFilter) typeFilter.value = 'all';
    
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
    
    tbody.innerHTML = pageReservations.map(app => {
        let statusClass = 'status-pending';
        let statusText = '⏳ Pending';
        
        if (app.status === 'approved') {
            statusClass = 'status-confirmed';
            statusText = '✓ Approved';
        } else if (app.status === 'confirmed') {
            statusClass = 'status-confirmed';
            statusText = '✓ Confirmed';
        } else if (app.status === 'rejected') {
            statusClass = 'status-rejected';
            statusText = '✗ Rejected';
        } else if (app.status === 'cancelled') {
            statusClass = 'status-rejected';
            statusText = '❌ Cancelled';
        } else if (app.status === 'processing') {
            statusClass = 'status-pending';
            statusText = '⏳ Processing';
        }
        
        const displayDate = app.details?.date ? new Date(app.details.date).toLocaleDateString() : 'N/A';
        const displayTime = app.details?.timeSlot || 'N/A';
        let displayType = '';
if (app.type === 'membership') {
    displayType = '🏌️ Membership';
} else {
    // Show specific reservation type if available
    if (app.reservationTypeName) {
        displayType = `📅 ${app.reservationTypeName}`;
    } else if (app.details && app.details.reservationType) {
        displayType = `📅 ${app.details.reservationType}`;
    } else {
        displayType = '📅 Reservation';
    }
}
        
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(app.firstName)} ${escapeHtml(app.lastName)}</strong><br>
                    <small style="color:#666;">${escapeHtml(app.email || '')}</small>
                </td>
                <td>${displayDate}</td>
                <td>${escapeHtml(displayTime)}</td>
                <td><span class="badge" style="background:var(--sage);">${displayType}</span></td>
                <td><strong>₱${(app.amount || 0).toLocaleString()}</strong></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    ${app.status === 'pending' || app.status === 'processing' ? `
                        <button class="action-btn btn-approve" onclick="approveReservation('${app._id}')" style="margin-right: 5px;">Approve</button>
                        <button class="btn-remove" onclick="rejectReservation('${app._id}')">Reject</button>
                        <br>
                    ` : ''}
                    <button class="btn-view-details" onclick="viewReservationDetails('${app._id}')" style="background: var(--sage-dark); color:#333; padding:4px 12px; border:none; border-radius:3px; font-size:12px; cursor:pointer; margin-top: 5px;">📋 Details</button>
                </td>
            </tr>
        `;
    }).join('');
    
    renderReservationPagination();
    updateResultsCount();
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
                    
                    contactDiv.innerHTML = `
                        <div class="contact-avatar">👤</div>
                        <div>
                            <div class="msg-contact-name">${escapeHtml(msg.userName || 'User')}</div>
                            <div style="font-size:11px;color:#ccc;">${escapeHtml(msg.concernType || 'general')}</div>
                        </div>
                        <div class="msg-contact-dot ${isPending ? 'online' : ''}" style="margin-left:auto;"></div>
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
    console.log('🔍 Checking admin status...');
    
    const token = localStorage.getItem('authToken');
    const userId = localStorage.getItem('userId');
    const isAdmin = localStorage.getItem('isAdmin');
    
    console.log('  Token:', token ? `Present (${token.substring(0, 20)}...)` : 'MISSING');
    console.log('  UserId:', userId);
    console.log('  isAdmin from localStorage:', isAdmin);
    
    if (!token) {
        console.error('❌ No token found! User needs to login again.');
        return false;
    }
    
    try {
        const response = await apiFetch(`${API_URL}/admin/dashboard`);
        if (response.ok) {
            console.log('✅ Admin access verified!');
            return true;
        } else {
            console.error('❌ Admin access FAILED with status:', response.status);
            return false;
        }
    } catch (error) {
        console.error('❌ Admin check error:', error);
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
                            if (conv.sender === 'user') {
                                row.innerHTML = `
                                    <div class="chat-avatar">👤</div>
                                    <div class="chat-bubble bubble-received image-message" onclick="viewFullImage('${conv.imageUrl}')">
                                        <img src="${conv.imageUrl}" alt="Receipt image">
                                    </div>
                                `;
                            } else {
                                row.innerHTML = `
                                    <div class="chat-bubble bubble-sent image-message" onclick="viewFullImage('${conv.imageUrl}')">
                                        <img src="${conv.imageUrl}" alt="Receipt image">
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
                        row.innerHTML = `
                            <div class="chat-avatar">👤</div>
                            <div class="chat-bubble bubble-received image-message" onclick="viewFullImage('${updatedMessage.imageUrl}')">
                                <img src="${updatedMessage.imageUrl}" alt="Receipt image">
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

function startAdminMessagePolling() {
    if (adminPollingInterval) clearInterval(adminPollingInterval);
    
    adminPollingInterval = setInterval(() => {
        if (!document.hidden) {
            loadMessages();
        }
    }, 5000);
    
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            loadMessages();
        }
    });
}

function stopAdminMessagePolling() {
    if (adminPollingInterval) {
        clearInterval(adminPollingInterval);
        adminPollingInterval = null;
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
        return;
    }
    
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
    
    loadFinancialReport();
    loadMonthlySummary();
    
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

async function verifyAdminAccess() {
    try {
        const response = await apiFetch(`${API_URL}/admin/dashboard`);
        if (!response.ok) {
            throw new Error('Not authorized');
        }
        return true;
    } catch (error) {
        console.error('Admin verification failed:', error);
        showToast('You do not have admin access. Redirecting...', 'error');
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 2000);
        return false;
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