// إعدادات Supabase - يجب تحديث هذه القيم بمشروعك الخاص
const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';

// تهيئة Supabase (مع حماية من التكرار)
let supabase;
if (typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error('Supabase library not loaded');
}

// متغيرات عامة
let currentUser = null;
let usersData = [];
let codesData = [];

// عناصر DOM
const loginScreen = document.getElementById('loginScreen');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loadingSpinner = document.getElementById('loadingSpinner');

// تسجيل الدخول باستخدام Supabase Auth
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    showLoading(true);
    
    try {
        // تسجيل الدخول باستخدام Supabase Authentication
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) {
            showError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        } else {
            currentUser = data.user;
            showMainApp();
        }
    } catch (err) {
        console.error('خطأ في تسجيل الدخول:', err);
        showError('حدث خطأ في تسجيل الدخول');
    }
    
    showLoading(false);
});

// التحقق من حالة تسجيل الدخول عند تحميل الصفحة
window.addEventListener('load', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
        currentUser = session.user;
        showMainApp();
    }
    
    // الاستماع لتغييرات حالة المصادقة
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            showMainApp();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            loginScreen.style.display = 'flex';
            mainApp.style.display = 'none';
        }
    });
});

// عرض الواجهة الرئيسية
function showMainApp() {
    loginScreen.style.display = 'none';
    mainApp.style.display = 'block';
    document.getElementById('welcomeUser').textContent = `مرحباً، ${currentUser.email || 'المدير'}`;
    
    // تحميل البيانات الأولية
    loadDashboardData();
    loadUsersData();
    loadCodesData();
    loadSettings();
}

// عرض رسالة خطأ
function showError(message) {
    loginError.textContent = message;
    loginError.style.display = 'block';
    setTimeout(() => {
        loginError.style.display = 'none';
    }, 5000);
}

// عرض/إخفاء شاشة التحميل
function showLoading(show) {
    loadingSpinner.style.display = show ? 'flex' : 'none';
}

// عرض إشعار Toast
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fas fa-check-circle' : 
                 type === 'error' ? 'fas fa-exclamation-circle' : 
                 'fas fa-info-circle';
    
    toast.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    document.getElementById('toastContainer').appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// التبديل بين التبويبات
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;
        
        // إزالة الفئة النشطة من جميع التبويبات
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // تفعيل التبويب المحدد
        btn.classList.add('active');
        document.getElementById(tabName).classList.add('active');
        
        // تحديث البيانات حسب التبويب
        if (tabName === 'users') {
            loadUsersData();
        } else if (tabName === 'codes') {
            loadCodesData();
        } else if (tabName === 'dashboard') {
            loadDashboardData();
        }
    });
});

// تحميل بيانات الرئيسية
async function loadDashboardData() {
    try {
        // إحصائيات المستخدمين
        const { data: users } = await supabase
            .from('devices')
            .select('*');
        
        const totalUsers = users?.length || 0;
        const activeUsers = users?.filter(u => {
            const lastSeen = new Date(u.last_seen);
            const today = new Date();
            return (today - lastSeen) < 24 * 60 * 60 * 1000; // آخر 24 ساعة
        }).length || 0;
        const blockedUsers = users?.filter(u => u.status === 'blocked').length || 0;
        
        // إحصائيات الأكواد
        const { data: codes } = await supabase
            .from('activation_codes')
            .select('*');
        
        const availableCodes = codes?.filter(c => !c.is_used).length || 0;
        
        // تحديث الواجهة
        document.getElementById('totalUsers').textContent = totalUsers;
        document.getElementById('activeUsers').textContent = activeUsers;
        document.getElementById('blockedUsers').textContent = blockedUsers;
        document.getElementById('availableCodes').textContent = availableCodes;
        
    } catch (error) {
        console.error('خطأ في تحميل بيانات الرئيسية:', error);
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

// تحميل بيانات المستخدمين
async function loadUsersData() {
    try {
        const { data, error } = await supabase
            .from('devices')
            .select('*')
            .order('last_seen', { ascending: false });
        
        if (error) throw error;
        
        usersData = data || [];
        displayUsers(usersData);
        
    } catch (error) {
        console.error('خطأ في تحميل المستخدمين:', error);
        showToast('خطأ في تحميل المستخدمين', 'error');
    }
}

// عرض المستخدمين في الجدول
function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const row = document.createElement('tr');
        
        const lastSeen = new Date(user.last_seen);
        const now = new Date();
        const diffHours = Math.floor((now - lastSeen) / (1000 * 60 * 60));
        
        let lastSeenText;
        if (diffHours < 1) {
            lastSeenText = 'منذ دقائق';
        } else if (diffHours < 24) {
            lastSeenText = `منذ ${diffHours} ساعة`;
        } else {
            const diffDays = Math.floor(diffHours / 24);
            lastSeenText = `منذ ${diffDays} يوم`;
        }
        
        const statusClass = user.status === 'active' ? 'active' : 'blocked';
        const statusText = user.status === 'active' ? 'نشط' : 'محظور';
        
        row.innerHTML = `
            <td title="${user.device_id}">${user.device_id.substring(0, 20)}...</td>
            <td>${user.user_name || 'مستخدم جديد'}</td>
            <td>${lastSeenText}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                ${user.status === 'active' ? 
                    `<button class="table-btn block" onclick="blockUser('${user.device_id}')">حظر</button>` :
                    `<button class="table-btn unblock" onclick="unblockUser('${user.device_id}')">إلغاء حظر</button>`
                }
                <button class="table-btn delete" onclick="deleteUser('${user.device_id}')">حذف</button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// حظر مستخدم
async function blockUser(deviceId) {
    if (!confirm('هل أنت متأكد من حظر هذا المستخدم؟')) return;
    
    try {
        const { error } = await supabase
            .from('devices')
            .update({ 
                status: 'blocked',
                message: 'تم حظر هذا الجهاز. يرجى التواصل مع المطور للحصول على كود تفعيل'
            })
            .eq('device_id', deviceId);
        
        if (error) throw error;
        
        showToast('تم حظر المستخدم بنجاح', 'success');
        loadUsersData();
        loadDashboardData();
        
    } catch (error) {
        console.error('خطأ في حظر المستخدم:', error);
        showToast('خطأ في حظر المستخدم', 'error');
    }
}

// إلغاء حظر مستخدم
async function unblockUser(deviceId) {
    try {
        const { error } = await supabase
            .from('devices')
            .update({ 
                status: 'active',
                message: 'مرحباً بك مرة أخرى!'
            })
            .eq('device_id', deviceId);
        
        if (error) throw error;
        
        showToast('تم إلغاء حظر المستخدم بنجاح', 'success');
        loadUsersData();
        loadDashboardData();
        
    } catch (error) {
        console.error('خطأ في إلغاء حظر المستخدم:', error);
        showToast('خطأ في إلغاء حظر المستخدم', 'error');
    }
}

// حذف مستخدم
async function deleteUser(deviceId) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم نهائياً؟')) return;
    
    try {
        const { error } = await supabase
            .from('devices')
            .delete()
            .eq('device_id', deviceId);
        
        if (error) throw error;
        
        showToast('تم حذف المستخدم بنجاح', 'success');
        loadUsersData();
        loadDashboardData();
        
    } catch (error) {
        console.error('خطأ في حذف المستخدم:', error);
        showToast('خطأ في حذف المستخدم', 'error');
    }
}

// تحميل بيانات الأكواد
async function loadCodesData() {
    try {
        const { data, error } = await supabase
            .from('activation_codes')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        codesData = data || [];
        displayCodes(codesData);
        
    } catch (error) {
        console.error('خطأ في تحميل الأكواد:', error);
        showToast('خطأ في تحميل الأكواد', 'error');
    }
}

// عرض الأكواد في الجدول
function displayCodes(codes) {
    const tbody = document.getElementById('codesTableBody');
    tbody.innerHTML = '';
    
    codes.forEach(code => {
        const row = document.createElement('tr');
        
        const createdAt = new Date(code.created_at).toLocaleDateString('ar-EG');
        const usedAt = code.used_at ? new Date(code.used_at).toLocaleDateString('ar-EG') : '-';
        const deviceId = code.device_id ? code.device_id.substring(0, 15) + '...' : '-';
        
        row.innerHTML = `
            <td><code>${code.code}</code></td>
            <td>
                <span class="status-badge ${code.is_used ? 'blocked' : 'active'}">
                    ${code.is_used ? 'مستخدم' : 'متاح'}
                </span>
            </td>
            <td>${deviceId}</td>
            <td>${createdAt}</td>
            <td>${usedAt}</td>
            <td>
                ${!code.is_used ? 
                    `<button class="table-btn delete" onclick="deleteCode('${code.code}')">حذف</button>` :
                    '<span style="color: #999;">-</span>'
                }
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// توليد كود واحد
async function generateSingleCode() {
    await generateCodes(1);
}

// توليد 10 أكواد
async function generateMultipleCodes() {
    await generateCodes(10);
}

// توليد أكواد
async function generateCodes(count) {
    try {
        showLoading(true);
        
        const codes = [];
        for (let i = 0; i < count; i++) {
            const code = 'APP2024-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            codes.push({ code });
        }
        
        const { error } = await supabase
            .from('activation_codes')
            .insert(codes);
        
        if (error) throw error;
        
        showToast(`تم توليد ${count} كود بنجاح`, 'success');
        loadCodesData();
        loadDashboardData();
        
    } catch (error) {
        console.error('خطأ في توليد الأكواد:', error);
        showToast('خطأ في توليد الأكواد', 'error');
    } finally {
        showLoading(false);
    }
}

// حذف كود
async function deleteCode(code) {
    if (!confirm('هل أنت متأكد من حذف هذا الكود؟')) return;
    
    try {
        const { error } = await supabase
            .from('activation_codes')
            .delete()
            .eq('code', code);
        
        if (error) throw error;
        
        showToast('تم حذف الكود بنجاح', 'success');
        loadCodesData();
        loadDashboardData();
        
    } catch (error) {
        console.error('خطأ في حذف الكود:', error);
        showToast('خطأ في حذف الكود', 'error');
    }
}

// تحميل الإعدادات
async function loadSettings() {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('*')
            .single();
        
        if (error) throw error;
        
        if (data) {
            document.getElementById('appStatus').value = data.is_shutdown.toString();
            document.getElementById('globalMessage').value = data.global_message || '';
        }
        
    } catch (error) {
        console.error('خطأ في تحميل الإعدادات:', error);
    }
}

// حفظ الإعدادات
async function saveSettings() {
    try {
        const isShutdown = document.getElementById('appStatus').value === 'true';
        const globalMessage = document.getElementById('globalMessage').value;
        
        const { error } = await supabase
            .from('app_settings')
            .update({
                is_shutdown: isShutdown,
                global_message: globalMessage
            })
            .eq('id', 1);
        
        if (error) throw error;
        
        showToast('تم حفظ الإعدادات بنجاح', 'success');
        
    } catch (error) {
        console.error('خطأ في حفظ الإعدادات:', error);
        showToast('خطأ في حفظ الإعدادات', 'error');
    }
}

// الإجراءات السريعة
document.getElementById('killSwitchBtn').addEventListener('click', async () => {
    if (!confirm('هل أنت متأكد من إيقاف التطبيق لجميع المستخدمين؟')) return;
    
    try {
        const { error } = await supabase
            .from('app_settings')
            .update({
                is_shutdown: true,
                global_message: 'التطبيق يتطلب اشتراك الآن. يرجى التواصل مع المطور للحصول على كود تفعيل'
            })
            .eq('id', 1);
        
        if (error) throw error;
        
        showToast('تم إيقاف التطبيق لجميع المستخدمين', 'success');
        loadSettings();
        
    } catch (error) {
        console.error('خطأ في إيقاف التطبيق:', error);
        showToast('خطأ في إيقاف التطبيق', 'error');
    }
});

document.getElementById('activateAllBtn').addEventListener('click', async () => {
    try {
        const { error } = await supabase
            .from('app_settings')
            .update({
                is_shutdown: false,
                global_message: 'مرحباً بك في WePlay Bot'
            })
            .eq('id', 1);
        
        if (error) throw error;
        
        showToast('تم تفعيل التطبيق لجميع المستخدمين', 'success');
        loadSettings();
        
    } catch (error) {
        console.error('خطأ في تفعيل التطبيق:', error);
        showToast('خطأ في تفعيل التطبيق', 'error');
    }
});

document.getElementById('generateCodesBtn').addEventListener('click', () => {
    generateCodes(10);
});

document.getElementById('refreshDataBtn').addEventListener('click', () => {
    loadDashboardData();
    loadUsersData();
    loadCodesData();
    showToast('تم تحديث البيانات', 'info');
});

// أزرار الأكواد
document.getElementById('generateSingleCodeBtn').addEventListener('click', generateSingleCode);
document.getElementById('generate10CodesBtn').addEventListener('click', generateMultipleCodes);
document.getElementById('refreshCodesBtn').addEventListener('click', loadCodesData);

// أزرار المستخدمين
document.getElementById('refreshUsersBtn').addEventListener('click', loadUsersData);

// فلتر المستخدمين
document.getElementById('userFilter').addEventListener('change', (e) => {
    const filter = e.target.value;
    let filteredUsers = usersData;
    
    if (filter === 'active') {
        filteredUsers = usersData.filter(u => u.status === 'active');
    } else if (filter === 'blocked') {
        filteredUsers = usersData.filter(u => u.status === 'blocked');
    }
    
    displayUsers(filteredUsers);
});

// حفظ الإعدادات
document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

// تسجيل الخروج
document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        await supabase.auth.signOut();
        currentUser = null;
        loginScreen.style.display = 'flex';
        mainApp.style.display = 'none';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    }
});

// تحديث البيانات كل دقيقة
setInterval(() => {
    if (currentUser && mainApp.style.display !== 'none') {
        loadDashboardData();
    }
}, 60000);

// إنشاء الجداول المطلوبة عند التحميل - تم حذفها لأننا نستخدم Supabase Auth