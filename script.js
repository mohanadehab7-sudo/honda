// ===================== SUPABASE CONFIG =====================
const SUPABASE_URL = 'https://nefhrnhnhypszioyezvt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lZmhybmhuaHlwc3ppb3llenZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDQ4ODksImV4cCI6MjA5MjcyMDg4OX0.LT3KlSBFgXJFj5fnov0K8WVPASd9Xb1k-dM1yHqgtGI';

let supabase;
try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error('Supabase library not loaded', e);
}

// ===================== STATE =====================
let currentUser = null;
let usersData = [];
let codesData = [];
let pendingMessageDeviceId = null;

// ===================== DOM REFS =====================
const loginScreen    = document.getElementById('loginScreen');
const mainApp        = document.getElementById('mainApp');
const loginForm      = document.getElementById('loginForm');
const loginError     = document.getElementById('loginError');
const loadingSpinner = document.getElementById('loadingSpinner');

// ===================== AUTH =====================
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    showLoading(true);
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) showError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        else { currentUser = data.user; showMainApp(); }
    } catch (err) {
        console.error(err);
        showError('حدث خطأ في تسجيل الدخول');
    }
    showLoading(false);
});

window.addEventListener('load', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) { currentUser = session.user; showMainApp(); }

    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') { currentUser = session.user; showMainApp(); }
        else if (event === 'SIGNED_OUT') {
            currentUser = null;
            loginScreen.style.display = 'flex';
            mainApp.style.display = 'none';
        }
    });
});

function showMainApp() {
    loginScreen.style.display = 'none';
    mainApp.style.display = 'block';
    const email = currentUser?.email || 'المدير';
    document.getElementById('welcomeUser').textContent = `مرحباً، ${email.split('@')[0]}`;
    loadDashboardData();
    loadUsersData();
    loadCodesData();
    loadSettings();
    initCodeGenerator();
    initRenewModal();
}

function showError(msg) {
    loginError.textContent = msg;
    loginError.style.display = 'block';
    setTimeout(() => loginError.style.display = 'none', 5000);
}

function showLoading(show) {
    loadingSpinner.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fas fa-check-circle' :
                 type === 'error'   ? 'fas fa-times-circle' :
                                      'fas fa-info-circle';
    toast.innerHTML = `<i class="${icon}"></i><span>${message}</span>`;
    document.getElementById('toastContainer').appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ===================== TABS =====================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tabName).classList.add('active');
        if (tabName === 'users')  loadUsersData();
        else if (tabName === 'codes') loadCodesData();
        else if (tabName === 'dashboard') loadDashboardData();
    });
});

// مستمعي فلاتر المستخدمين
document.getElementById('userFilter')?.addEventListener('change', applyUserFilter);
document.getElementById('userSearch')?.addEventListener('input', applyUserFilter);
document.getElementById('refreshUsersBtn')?.addEventListener('click', loadUsersData);
document.getElementById('msgAllFilteredBtn')?.addEventListener('click', () => openMsgModal('__BULK__'));

// ===================== DASHBOARD DATA =====================
async function loadDashboardData() {
    try {
        const { data: users } = await supabase.from('devices').select('*');
        const now = new Date();
        const totalUsers   = users?.length || 0;
        const activeUsers  = users?.filter(u => (now - new Date(u.last_seen)) < 24*60*60*1000).length || 0;
        const blockedUsers = users?.filter(u => u.status === 'blocked').length || 0;

        const { data: codes } = await supabase.from('activation_codes').select('is_used');
        const availableCodes = codes?.filter(c => !c.is_used).length || 0;

        document.getElementById('totalUsers').textContent    = totalUsers;
        document.getElementById('activeUsers').textContent   = activeUsers;
        document.getElementById('blockedUsers').textContent  = blockedUsers;
        document.getElementById('availableCodes').textContent = availableCodes;
    } catch (err) {
        console.error(err);
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

// ===================== USERS =====================
async function loadUsersData() {
    try {
        const { data, error } = await supabase
            .from('devices')
            .select('*')
            .order('registered_at', { ascending: true }); // الأقدم أولاً = رقم 1
        if (error) throw error;
        usersData = data || [];
        applyUserFilter();
    } catch (err) {
        console.error(err);
        showToast('خطأ في تحميل المستخدمين', 'error');
    }
}

function applyUserFilter() {
    const filter = document.getElementById('userFilter').value;
    const searchTerm = document.getElementById('userSearch')?.value?.toLowerCase().trim() || '';
    const now = new Date();
    const DAY  = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;

    let filtered = usersData;

    // تطبيق البحث النصي أولاً
    if (searchTerm) {
        filtered = filtered.filter(u => {
            const name  = (u.user_name || '').toLowerCase();
            const phone = (u.phone_number || '').toLowerCase();
            const id    = (u.device_id || '').toLowerCase();
            return name.includes(searchTerm) || phone.includes(searchTerm) || id.includes(searchTerm);
        });
    }

    switch (filter) {
        // ——— حسب التسجيل ———
        case 'new_today':
            filtered = usersData.filter(u => {
                if (!u.registered_at) return false;
                return (now - new Date(u.registered_at)) < DAY;
            });
            break;
        case 'new_week':
            filtered = usersData.filter(u => {
                if (!u.registered_at) return false;
                return (now - new Date(u.registered_at)) < WEEK;
            });
            break;
        case 'old':
            filtered = usersData.filter(u => {
                if (!u.registered_at) return true;
                return (now - new Date(u.registered_at)) >= WEEK;
            });
            break;
        // ——— حسب الحالة ———
        case 'active':
            filtered = usersData.filter(u => u.status === 'active');
            break;
        case 'blocked':
            filtered = usersData.filter(u => u.status === 'blocked');
            break;
        // ——— حسب الاشتراك ———
        case 'trial':
            // مستخدم تجريبي: عنده sub_ends_at لكن لم يستخدم كود بعد
            filtered = usersData.filter(u => {
                if (!u.subscription_ends_at) return false;
                const regDate = u.registered_at ? new Date(u.registered_at) : null;
                const endDate = new Date(u.subscription_ends_at);
                if (!regDate) return false;
                // الفرق بين التسجيل والانتهاء أقل من 36 ساعة = تجريبي
                return (endDate - regDate) < (36 * 60 * 60 * 1000);
            });
            break;
        case 'subscribed':
            // مشترك بكود: فترة أكثر من 36 ساعة
            filtered = usersData.filter(u => {
                if (!u.subscription_ends_at) return false;
                const regDate = u.registered_at ? new Date(u.registered_at) : null;
                const endDate = new Date(u.subscription_ends_at);
                if (!regDate) return true;
                return (endDate - regDate) >= (36 * 60 * 60 * 1000);
            });
            break;
        case 'expiring':
            filtered = usersData.filter(u => {
                if (!u.subscription_ends_at) return false;
                const diff = new Date(u.subscription_ends_at) - now;
                return diff > 0 && diff < 3 * DAY;
            });
            break;
        case 'lifetime':
            filtered = usersData.filter(u => !u.subscription_ends_at);
            break;
        default:
            filtered = usersData;
    }

    // تحديث عداد النتائج
    const countEl = document.getElementById('filteredCount');
    if (countEl) countEl.textContent = `(${filtered.length})`;

    displayUsers(filtered);
}

function formatRelative(dateStr) {
    if (!dateStr) return '-';
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff/60)} د`;
    if (diff < 86400) return `منذ ${Math.floor(diff/3600)} س`;
    return `منذ ${Math.floor(diff/86400)} يوم`;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' });
}

function formatSubEnd(dateStr) {
    if (!dateStr) return '<span class="status-badge active">مدى الحياة</span>';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = d - now;
    const dateFormatted = d.toLocaleDateString('ar-EG', { month:'short', day:'numeric', year:'2-digit' })
                        + ' ' + d.toLocaleTimeString('ar-EG', { hour:'2-digit', minute:'2-digit' });
    if (diff < 0) return `<span class="status-badge blocked">منتهي</span>`;
    if (diff < 24*60*60*1000) return `<span class="status-badge" style="background:#fff3e0;color:#e65100;">⚠️ ${dateFormatted}</span>`;
    return `<span style="font-size:11.5px; color:#444;">${dateFormatted}</span>`;
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:#aaa;"><i class="fas fa-inbox" style="font-size:28px;display:block;margin-bottom:8px;"></i>لا يوجد مستخدمون</td></tr>';
        return;
    }
    tbody.innerHTML = users.map((u, index) => {
        const mins = u.total_bot_minutes || 0;
        const hoursText = mins >= 60
            ? `${Math.floor(mins/60)}س ${mins%60}د`
            : `${mins}د`;
        const statusClass = u.status === 'active' ? 'active' : 'blocked';
        const statusText  = u.status === 'active' ? 'نشط' : 'محظور';
        const name    = u.user_name || 'مستخدم جديد';
        const phone   = u.phone_number || '-';
        const userNumber = index + 1;
        
        return `<tr>
            <td style="text-align:center; font-weight:700; color:var(--primary);">${userNumber}</td>
            <td style="font-weight:600; color:var(--dark);">${name}</td>
            <td style="color:var(--primary); font-weight:600; direction:ltr;">${phone}</td>
            <td style="font-family:monospace; font-size:11px; color:#666;" title="${u.device_id}">
                ${u.device_id ? u.device_id.substring(0, 16) + '...' : '-'}
            </td>
            <td>${formatRelative(u.last_start_at)}</td>
            <td>${formatRelative(u.last_seen)}</td>
            <td>${formatDate(u.registered_at)}</td>
            <td>${formatSubEnd(u.subscription_ends_at)}</td>
            <td><span class="status-badge" style="background:#eef2ff;color:#4338ca;">${hoursText}</span></td>
            <td><span class="status-badge" style="background:#fff7ed;color:#9a3412;">${u.cycle_count || 0}</span></td>
            <td><span class="status-badge" style="background:#fdf2f8;color:#9d174d;">${u.packet_count || 0}</span></td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td style="white-space:nowrap;">
                <!-- زر التجديد -->
                <button class="table-btn renew" onclick="openRenewModal('${u.device_id}')" title="تجديد الاشتراك">
                    <i class="fas fa-calendar-plus"></i>
                </button>
                
                <!-- زر الرسالة -->
                <button class="table-btn info" onclick="openMsgModal('${u.device_id}')" title="إرسال رسالة">
                    <i class="fas fa-comment-dots"></i>
                </button>

                <!-- زر الحظر/رفع الحظر -->
                ${u.status === 'active'
                    ? `<button class="table-btn block" onclick="blockUser('${u.device_id}')" title="حظر"><i class="fas fa-ban"></i></button>`
                    : `<button class="table-btn unblock" onclick="unblockUser('${u.device_id}')" title="رفع الحظر"><i class="fas fa-check"></i></button>`
                }
                
                <!-- زر الحذف -->
                <button class="table-btn delete" onclick="deleteUser('${u.device_id}')" title="حذف نهائي"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// Message Modal
function openMsgModal(deviceId) {
    pendingMessageDeviceId = deviceId;
    document.getElementById('msgText').value = '';
    document.getElementById('msgModal').style.display = 'flex';
    setTimeout(() => document.getElementById('msgText').focus(), 100);
}

function closeMsgModal() {
    document.getElementById('msgModal').style.display = 'none';
    pendingMessageDeviceId = null;
}

window.closeMsgModal = closeMsgModal;

window.confirmSendMessage = async function() {
    const msg = document.getElementById('msgText').value.trim();
    if (!msg || !pendingMessageDeviceId) return;

    try {
        if (pendingMessageDeviceId === '__BULK__') {
            // إرسال جماعي لكل المستخدمين في الجدول حالياً
            const rows = document.querySelectorAll('#usersTableBody tr');
            const deviceIds = [];
            rows.forEach(row => {
                const btn = row.querySelector('[onclick^="blockUser"], [onclick^="unblockUser"], [onclick^="openMsgModal"]');
                if (btn) {
                    const match = btn.getAttribute('onclick').match(/'([^']+)'/);
                    if (match) deviceIds.push(match[1]);
                }
            });

            if (deviceIds.length === 0) {
                showToast('لم يتم العثور على مستخدمين', 'error');
                closeMsgModal();
                return;
            }

            showLoading(true);
            let successCount = 0;
            // نرسل لكل مستخدم على حدة (Supabase ليس عنده bulk IN update بسهولة في هذا الإصدار)
            for (const deviceId of deviceIds) {
                try {
                    await supabase.from('devices')
                        .update({ message: msg })
                        .eq('device_id', deviceId);
                    successCount++;
                } catch (_) {}
            }
            showLoading(false);
            showToast(`✅ تم إرسال الرسالة لـ ${successCount} مستخدم`, 'success');
        } else {
            // إرسال فردي
            const { error } = await supabase.from('devices')
                .update({ message: msg })
                .eq('device_id', pendingMessageDeviceId);
            if (error) throw error;
            showToast('✅ تم إرسال الرسالة', 'success');
        }

        // إعادة عنوان المودال للوضع الأصلي
        document.querySelector('#msgModal .modal-box h3').innerHTML =
            '<i class="fas fa-comment-dots" style="color:var(--primary); margin-left:8px;"></i>رسالة مخصصة';
        closeMsgModal();
    } catch (err) {
        showLoading(false);
        showToast('خطأ في الإرسال', 'error');
    }
};

// Close modal on overlay click
document.getElementById('msgModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('msgModal')) closeMsgModal();
});

async function blockUser(deviceId) {
    if (!confirm('هل أنت متأكد من حظر هذا المستخدم؟')) return;
    try {
        const { error } = await supabase.from('devices')
            .update({ status: 'blocked', message: 'تم حظرك. للتواصل مع المطور: wa.me/201021102607' })
            .eq('device_id', deviceId);
        if (error) throw error;
        showToast('تم الحظر', 'success');
        loadUsersData(); loadDashboardData();
    } catch (err) { showToast('خطأ في الحظر', 'error'); }
}

async function unblockUser(deviceId) {
    try {
        const { error } = await supabase.from('devices')
            .update({ status: 'active', message: 'مرحباً بك مرة أخرى!' })
            .eq('device_id', deviceId);
        if (error) throw error;
        showToast('تم رفع الحظر', 'success');
        loadUsersData(); loadDashboardData();
    } catch (err) { showToast('خطأ', 'error'); }
}

async function deleteUser(deviceId) {
    if (!confirm('حذف نهائي؟ لا يمكن التراجع!')) return;
    try {
        const { error } = await supabase.from('devices').delete().eq('device_id', deviceId);
        if (error) throw error;
        showToast('تم الحذف', 'success');
        loadUsersData(); loadDashboardData();
    } catch (err) { showToast('خطأ في الحذف', 'error'); }
}

// Make functions global for onclick handlers
// ===================== RENEW SUBSCRIPTION =====================
let renewState = {
    deviceId: null,
    days: 180,          // الافتراضي 6 شهور
    isLifetime: false,
    currentSubEnd: null // تاريخ انتهاء الاشتراك الحالي
};

function openRenewModal(deviceId) {
    // أيجاد بيانات المستخدم
    const user = usersData.find(u => u.device_id === deviceId);
    if (!user) return;

    renewState.deviceId    = deviceId;
    renewState.isLifetime  = false;
    renewState.days        = 180;
    renewState.currentSubEnd = user.subscription_ends_at || null;

    // تحديث اسم المستخدم
    const nameEl = document.getElementById('renewUserName');
    if (nameEl) {
        const name = user.user_name || 'المستخدم';
        const subInfo = user.subscription_ends_at
            ? `اشتراكه الحالي ينتهي في: ${formatDate(user.subscription_ends_at)}`
            : 'ليس لديه اشتراك محدد';
        nameEl.innerHTML = `<strong style="color:var(--dark);">${name}</strong> — ${subInfo}`;
    }

    // إعادة ضبط الاختيار (6 شهور افتراضياً)
    document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
    const defaultBtn = document.querySelector('.renew-preset-btn[data-days="180"]');
    if (defaultBtn) defaultBtn.classList.add('active');

    // تفريغ الحقل المخصص
    const customInput = document.getElementById('renewCustomValue');
    if (customInput) customInput.value = '';

    updateRenewInfo();
    document.getElementById('renewModal').style.display = 'flex';
}

function updateRenewInfo() {
    const now  = new Date();
    let   base = now;

    // لو كان الاشتراك الحالي لم ينته بعد → التجديد يضاف عليه
    if (renewState.currentSubEnd) {
        const curEnd = new Date(renewState.currentSubEnd);
        if (curEnd > now) base = curEnd;
    }

    const infoEl = document.getElementById('renewInfoText');
    if (!infoEl) return;

    if (renewState.isLifetime) {
        infoEl.textContent = '♾️ سيكون اشتراكه مدى الحياة — لن ينتهي أبداً';
        const ri = document.getElementById('renewInfo');
        if (ri) {
            ri.style.background = '#f5f4ff';
            ri.style.borderColor = '#d5d0ff';
            ri.style.color = 'var(--primary)';
            ri.querySelector('i').style.color = 'var(--primary)';
        }
        return;
    }

    const newEnd = new Date(base.getTime() + renewState.days * 24 * 60 * 60 * 1000);
    const options = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
    const endStr  = newEnd.toLocaleDateString('ar-EG', options);

    const fromNow = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now
        ? `يضاف للاشتراك الحالي`
        : `يبدأ من اليوم`;

    infoEl.textContent = `• سينتهي في: ${endStr} (${fromNow})`;

    const ri = document.getElementById('renewInfo');
    if (ri) {
        ri.style.background = '#f0fdf4';
        ri.style.borderColor = '#a8e6c0';
        ri.style.color = '#1a7a3c';
        ri.querySelector('i').style.color = 'var(--success)';
    }
}

window.closeRenewModal = function() {
    document.getElementById('renewModal').style.display = 'none';
    renewState = { deviceId: null, days: 180, isLifetime: false, currentSubEnd: null };
};

window.confirmRenew = async function() {
    if (!renewState.deviceId) return;
    try {
        showLoading(true);
        const now  = new Date();
        let   base = now;

        if (renewState.currentSubEnd) {
            const curEnd = new Date(renewState.currentSubEnd);
            if (curEnd > now) base = curEnd;
        }

        let newEndStr = null;
        if (!renewState.isLifetime) {
            const newEnd = new Date(base.getTime() + renewState.days * 24 * 60 * 60 * 1000);
            newEndStr = newEnd.toISOString();
        }

        const { error } = await supabase.from('devices')
            .update({
                status: 'active',
                subscription_ends_at: newEndStr,
                message: renewState.isLifetime
                    ? '♾️ تم تجديد اشتراكك مدى الحياة. شكراً لثقتك!'
                    : `✅ تم تجديد اشتراكك لـ ${renewState.days >= 365 ? Math.round(renewState.days/365)+' سنة' : renewState.days >= 30 ? Math.round(renewState.days/30)+' شهر' : renewState.days+' يوم'}. شكراً لثقتك!`
            })
            .eq('device_id', renewState.deviceId);

        if (error) throw error;

        const label = renewState.isLifetime ? '♾️ مدى الحياة'
            : renewState.days >= 365 ? `${Math.round(renewState.days/365)} سنة`
            : renewState.days >= 30  ? `${Math.round(renewState.days/30)} شهر`
            : `${renewState.days} يوم`;

        showToast(`✅ تم تجديد الاشتراك لـ ${label}`, 'success');
        closeRenewModal();
        loadUsersData();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast('خطأ في التجديد', 'error');
    } finally {
        showLoading(false);
    }
};

// أحداث أزرار المدد السريعة
function initRenewModal() {
    document.querySelectorAll('.renew-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const days = parseInt(btn.dataset.days);
            if (days === 0) {
                renewState.isLifetime = true;
                renewState.days = 0;
            } else {
                renewState.isLifetime = false;
                renewState.days = days;
            }
            // مسح الحقل المخصص
            const ci = document.getElementById('renewCustomValue');
            if (ci) ci.value = '';
            updateRenewInfo();
        });
    });

    // الحقل المخصص
    const customInput = document.getElementById('renewCustomValue');
    const customUnit  = document.getElementById('renewCustomUnit');

    function onCustomChange() {
        const val  = parseInt(customInput?.value);
        if (!val || val < 1) return;
        // إلغاء تحديد أي زر جاهز
        document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
        const unit = customUnit?.value;
        let days;
        if (unit === 'days')   days = val;
        else if (unit === 'months') days = val * 30;
        else if (unit === 'years')  days = val * 365;
        renewState.days = days;
        renewState.isLifetime = false;
        updateRenewInfo();
    }

    customInput?.addEventListener('input',  onCustomChange);
    customUnit?.addEventListener('change',  onCustomChange);

    // إغلاق عند الضغط على الخلفية
    document.getElementById('renewModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('renewModal')) closeRenewModal();
    });
}

window.openRenewModal = openRenewModal;
window.blockUser   = blockUser;
window.unblockUser = unblockUser;
window.deleteUser  = deleteUser;
window.openMsgModal = openMsgModal;

// ===================== CODE GENERATOR STATE =====================
let generatorState = {
    type: 'preset',   // preset | custom | date | lifetime
    days: 30,         // عدد الأيام المحسوبة
    expiryDate: null  // تاريخ محدد
};

// تهيئة واجهة المولد
function initCodeGenerator() {
    // أزرار نوع المدة
    document.querySelectorAll('.dtype-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dtype-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const type = btn.dataset.type;
            generatorState.type = type;
            ['presetPanel','customPanel','datePanel','lifetimePanel'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            const panel = document.getElementById(type + 'Panel');
            if (panel) panel.style.display = 'block';
            if (type === 'lifetime') generatorState.days = null;
            updateSummary();
        });
    });

    // أزرار المدد الجاهزة
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            generatorState.days = parseInt(btn.dataset.days);
            updateSummary();
        });
    });

    // المدة المخصصة
    const customValue = document.getElementById('customValue');
    const customUnit  = document.getElementById('customUnit');
    function updateCustom() {
        const val  = parseInt(customValue?.value) || 1;
        const unit = customUnit?.value;
        let days;
        if (unit === 'days')   days = val;
        else if (unit === 'months') days = val * 30;
        else if (unit === 'years')  days = val * 365;
        generatorState.days = days;
        const unitLabel = unit === 'days' ? 'يوم' : unit === 'months' ? 'شهر' : 'سنة';
        const el = document.getElementById('customPreview');
        if (el) el.textContent = `= ${days} يوم (${val} ${unitLabel})`;
        updateSummary();
    }
    customValue?.addEventListener('input', updateCustom);
    customUnit?.addEventListener('change', updateCustom);

    // تاريخ الانتهاء
    // اضبط الحد الأدنى للتاريخ = الغد
    const expiryInput = document.getElementById('expiryDate');
    if (expiryInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        expiryInput.min = tomorrow.toISOString().split('T')[0];
        expiryInput.addEventListener('change', () => {
            generatorState.expiryDate = expiryInput.value;
            const d = new Date(expiryInput.value);
            const diff = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
            generatorState.days = diff;
            const preview = document.getElementById('datePreview');
            if (preview) preview.textContent = `ينتهي في ${d.toLocaleDateString('ar-EG', {year:'numeric',month:'long',day:'numeric'})} (بعد ${diff} يوم)`;
            updateSummary();
        });
    }

    // زر التوليد
    document.getElementById('generateCodesMainBtn')?.addEventListener('click', () => generateCodes());

    // فلتر الأكواد
    document.getElementById('codesFilter')?.addEventListener('change', applyCodesFilter);

    // زر نسخ المتاحة
    document.getElementById('copyAvailableBtn')?.addEventListener('click', copyAvailableCodes);

    updateSummary();
}

function updateSummary() {
    const count = parseInt(document.getElementById('codeCount')?.value) || 1;
    const type  = generatorState.type;
    let durationText;

    if (type === 'lifetime')  durationText = '♾️ مدى الحياة';
    else if (type === 'date') durationText = generatorState.expiryDate ? `حتى ${new Date(generatorState.expiryDate).toLocaleDateString('ar-EG')}` : 'اختر تاريخاً';
    else {
        const d = generatorState.days || 30;
        if (d >= 365 && d % 365 === 0) durationText = `${d/365} سنة`;
        else if (d >= 30 && d % 30 === 0) durationText = `${d/30} شهر`;
        else durationText = `${d} يوم`;
    }

    const text = document.getElementById('summaryText');
    if (text) text.textContent = `سيتم توليد ${count} كود ${count > 1 ? 'صالحة لـ' : 'صالح لـ'} ${durationText}`;
}

// تحكم في العدد
window.adjustCount = function(delta) {
    const input = document.getElementById('codeCount');
    if (!input) return;
    let val = parseInt(input.value) + delta;
    val = Math.max(1, Math.min(100, val));
    input.value = val;
    updateSummary();
};

window.setCount = function(n) {
    const input = document.getElementById('codeCount');
    if (input) { input.value = n; updateSummary(); }
};

document.getElementById('codeCount')?.addEventListener('input', updateSummary);

// ===================== CODES DATA =====================
async function loadCodesData() {
    try {
        const { data, error } = await supabase
            .from('activation_codes')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        codesData = data || [];
        applyCodesFilter();
    } catch (err) {
        console.error(err);
        showToast('خطأ في تحميل الأكواد', 'error');
    }
}

function applyCodesFilter() {
    const filter = document.getElementById('codesFilter')?.value || 'all';
    let filtered = codesData;
    if (filter === 'available') filtered = codesData.filter(c => !c.is_used);
    else if (filter === 'used')     filtered = codesData.filter(c => c.is_used);
    else if (filter === 'lifetime') filtered = codesData.filter(c => !c.duration_days);
    const countEl = document.getElementById('codesCount');
    if (countEl) countEl.textContent = `(${filtered.length})`;
    displayCodes(filtered);
}

function formatDurationBadge(days) {
    if (!days) return '<span class="duration-badge lifetime"><i class="fas fa-infinity"></i>مدى الحياة</span>';
    if (days <= 7)  return `<span class="duration-badge trial">⚡ ${days} يوم</span>`;
    if (days >= 365) {
        const years = (days/365).toFixed(1).replace('.0','');
        return `<span class="duration-badge year"><i class="fas fa-star"></i>${years} سنة</span>`;
    }
    if (days >= 30) {
        const months = Math.round(days/30);
        return `<span class="duration-badge month">🏆 ${months} شهر</span>`;
    }
    return `<span class="duration-badge trial">📅 ${days} يوم</span>`;
}

function displayCodes(codes) {
    const tbody = document.getElementById('codesTableBody');
    if (!codes || codes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#aaa;"><i class="fas fa-key" style="font-size:28px;opacity:0.3;display:block;margin-bottom:8px;"></i>لا توجد أكواد</td></tr>';
        return;
    }
    tbody.innerHTML = codes.map((c, i) => {
        const devShort = c.device_id ? c.device_id.substring(0, 10) + '…' : '-';
        return `<tr>
            <td style="text-align:center; font-weight:700; color:var(--text-muted);">${i+1}</td>
            <td>
                <div style="display:flex; align-items:center; gap:6px;">
                    <code style="font-size:12px;">${c.code}</code>
                    <button onclick="copyText('${c.code}')" style="border:none;background:none;cursor:pointer;color:var(--primary);padding:2px;" title="نسخ">
                        <i class="fas fa-copy" style="font-size:12px;"></i>
                    </button>
                </div>
            </td>
            <td>${formatDurationBadge(c.duration_days)}</td>
            <td><span class="status-badge ${c.is_used ? 'blocked' : 'active'}">${c.is_used ? 'مستخدم' : 'متاح'}</span></td>
            <td style="font-size:11px; color:#888;" title="${c.device_id || ''}">${devShort}</td>
            <td style="font-size:11.5px;">${formatDate(c.created_at)}</td>
            <td style="font-size:11.5px;">${formatDate(c.used_at)}</td>
            <td>
                ${!c.is_used
                    ? `<button class="table-btn delete" onclick="deleteCode('${c.code}')" title="حذف"><i class="fas fa-trash"></i></button>`
                    : '<span style="color:#ccc; font-size:11px;">—</span>'
                }
            </td>
        </tr>`;
    }).join('');
}

async function generateCodes() {
    try {
        showLoading(true);
        const count = Math.max(1, Math.min(100, parseInt(document.getElementById('codeCount')?.value) || 1));
        const type  = generatorState.type;

        let durationDays = null; // null = مدى الحياة
        if (type !== 'lifetime') {
            if (type === 'date' && generatorState.expiryDate) {
                durationDays = Math.ceil((new Date(generatorState.expiryDate) - new Date()) / (1000*60*60*24));
            } else {
                durationDays = generatorState.days || 30;
            }
            if (durationDays < 1) {
                showToast('التاريخ يجب أن يكون في المستقبل', 'error');
                showLoading(false);
                return;
            }
        }

        // توليد أكواد فريدة
        const codes = Array.from({ length: count }, (_, i) => ({
            code: 'WP-' + Date.now().toString(36).toUpperCase() +
                  '-' + i.toString(36).toUpperCase().padStart(2,'0') +
                  '-' + Math.random().toString(36).substring(2,5).toUpperCase(),
            duration_days: durationDays
        }));

        const { error } = await supabase.from('activation_codes').insert(codes);
        if (error) throw error;

        let successMsg = `✅ تم توليد ${count} كود`;
        if (type === 'lifetime')  successMsg += ' ♾️ مدى الحياة';
        else if (durationDays >= 365) successMsg += ` صالحة لـ ${(durationDays/365).toFixed(1).replace('.0','')} سنة`;
        else if (durationDays >= 30)  successMsg += ` صالحة لـ ${Math.round(durationDays/30)} شهر`;
        else successMsg += ` صالحة لـ ${durationDays} يوم`;

        showToast(successMsg, 'success');
        loadCodesData();
        loadDashboardData();
    } catch (err) {
        console.error(err);
        showToast('خطأ في توليد الأكواد', 'error');
    } finally {
        showLoading(false);
    }
}

// نسخ كود فردي
window.copyText = function(text) {
    navigator.clipboard.writeText(text).then(() => showToast('تم النسخ', 'success'));
};

// نسخ كل الأكواد المتاحة
function copyAvailableCodes() {
    const available = codesData.filter(c => !c.is_used).map(c => c.code);
    if (available.length === 0) { showToast('لا توجد أكواد متاحة', 'error'); return; }
    navigator.clipboard.writeText(available.join('\n')).then(() =>
        showToast(`تم نسخ ${available.length} كود`, 'success')
    );
}

async function deleteCode(code) {
    if (!confirm('حذف الكود؟')) return;
    try {
        const { error } = await supabase.from('activation_codes').delete().eq('code', code);
        if (error) throw error;
        showToast('تم حذف الكود', 'success');
        loadCodesData(); loadDashboardData();
    } catch (err) { showToast('خطأ', 'error'); }
}

window.deleteCode = deleteCode;

// ===================== SETTINGS =====================
async function loadSettings() {
    try {
        const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
        if (error) throw error;
        if (data) {
            document.getElementById('appStatus').value     = data.is_shutdown.toString();
            document.getElementById('globalMessage').value = data.global_message || '';
            const reqNew = document.getElementById('requireCodeNew');
            if (reqNew) reqNew.value = data.require_code_for_new ? 'true' : 'false';
        }
    } catch (err) { console.error(err); }
}

async function saveSettings() {
    try {
        showLoading(true);
        const isShutdown      = document.getElementById('appStatus').value === 'true';
        const globalMessage   = document.getElementById('globalMessage').value.trim();
        const reqNewEl        = document.getElementById('requireCodeNew');
        const requireCodeNew  = reqNewEl ? reqNewEl.value === 'true' : false;

        const { error } = await supabase.from('app_settings')
            .update({ is_shutdown: isShutdown, global_message: globalMessage, require_code_for_new: requireCodeNew })
            .eq('id', 1);
        if (error) throw error;
        showToast('✅ تم حفظ الإعدادات', 'success');
    } catch (err) {
        console.error(err);
        showToast('خطأ في الحفظ', 'error');
    } finally { showLoading(false); }
}

// ===================== QUICK ACTIONS =====================
document.getElementById('killSwitchBtn').addEventListener('click', async () => {
    if (!confirm('إيقاف التطبيق لجميع المستخدمين؟')) return;
    try {
        const { error } = await supabase.from('app_settings')
            .update({ is_shutdown: true, global_message: 'التطبيق مغلق مؤقتاً. يرجى التواصل مع المطور.' })
            .eq('id', 1);
        if (error) throw error;
        showToast('تم الإيقاف للجميع', 'success');
        loadSettings();
    } catch (err) { showToast('خطأ', 'error'); }
});

document.getElementById('activateAllBtn').addEventListener('click', async () => {
    try {
        const { error } = await supabase.from('app_settings')
            .update({ is_shutdown: false, global_message: 'مرحباً بك في WePlay Bot!' })
            .eq('id', 1);
        if (error) throw error;
        showToast('✅ تم التفعيل للجميع', 'success');
        loadSettings();
    } catch (err) { showToast('خطأ', 'error'); }
});

document.getElementById('generateCodesBtn').addEventListener('click', () => generateCodes(10));
document.getElementById('refreshDataBtn').addEventListener('click', () => {
    loadDashboardData(); loadUsersData(); loadCodesData();
    showToast('تم التحديث', 'info');
});

document.getElementById('generateSingleCodeBtn').addEventListener('click', () => generateCodes(1));
document.getElementById('generate10CodesBtn').addEventListener('click', () => generateCodes(10));
document.getElementById('refreshCodesBtn').addEventListener('click', loadCodesData);
document.getElementById('refreshUsersBtn').addEventListener('click', loadUsersData);
document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

// زر رسالة لكل المستخدمين في الفلتر الحالي
document.getElementById('msgAllFilteredBtn').addEventListener('click', () => {
    const filteredRows = document.querySelectorAll('#usersTableBody tr');
    const count = filteredRows.length;
    if (count === 0) { showToast('لا يوجد مستخدمون في الفلتر الحالي', 'error'); return; }
    
    // استخدام المودال نفسه مع تغيير العنوان
    document.querySelector('#msgModal .modal-box h3').innerHTML =
        `<i class="fas fa-bullhorn" style="color:var(--warning);margin-left:8px;"></i>رسالة لـ ${count} مستخدم`;
    document.getElementById('msgText').value = '';
    document.getElementById('msgModal').style.display = 'flex';
    pendingMessageDeviceId = '__BULK__'; // علامة للإرسال الجماعي
    setTimeout(() => document.getElementById('msgText').focus(), 100);
});

document.getElementById('userFilter').addEventListener('change', applyUserFilter);

document.getElementById('deleteAllCodesBtn').addEventListener('click', async () => {
    if (!confirm('حذف جميع الأكواد غير المستخدمة؟')) return;
    try {
        const { error } = await supabase.from('activation_codes').delete().eq('is_used', false);
        if (error) throw error;
        showToast('تم الحذف', 'success');
        loadCodesData(); loadDashboardData();
    } catch (err) { showToast('خطأ', 'error'); }
});

document.getElementById('resetAllUsersBtn').addEventListener('click', async () => {
    if (!confirm('تحذير: سيتم حذف جميع بيانات المستخدمين نهائياً!')) return;
    if (!confirm('هل أنت متأكد تماماً؟ لا يمكن التراجع!')) return;
    try {
        const { error } = await supabase.from('devices').delete().neq('device_id', 'PLACEHOLDER');
        if (error) throw error;
        showToast('تم إعادة التعيين', 'success');
        loadUsersData(); loadDashboardData();
    } catch (err) { showToast('خطأ', 'error'); }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (confirm('تسجيل الخروج؟')) {
        await supabase.auth.signOut();
    }
});

// ===================== AUTO REFRESH =====================
setInterval(() => {
    if (currentUser && mainApp.style.display !== 'none') {
        loadDashboardData();
    }
}, 60000);