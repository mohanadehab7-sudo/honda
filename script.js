// تكوين Supabase - يجب تحديث هذه القيم بمشروعك الخاص
const SUPABASE_CONFIG = {
    url: 'https://nefhrnhnhypszioyezvt.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lZmhybmhuaHlwc3ppb3llenZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxNDQ4ODksImV4cCI6MjA5MjcyMDg4OX0.LT3KlSBFgXJFj5fnov0K8WVPASd9Xb1k-dM1yHqgtGI'
};

let supabaseClient;
try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
    } else {
        throw new Error('Supabase library not found');
    }
} catch (error) {
    console.error('Supabase initialization failed:', error);
}

let currentUser = null;
let usersData = [];
let codesData = [];

const elements = {
    loginScreen: null,
    mainApp: null,
    loginForm: null,
    loginError: null,
    loadingSpinner: null
};

document.addEventListener('DOMContentLoaded', function() {
    elements.loginScreen = document.getElementById('loginScreen');
    elements.mainApp = document.getElementById('mainApp');
    elements.loginForm = document.getElementById('loginForm');
    elements.loginError = document.getElementById('loginError');
    elements.loadingSpinner = document.getElementById('loadingSpinner');
    
    if (elements.loginForm) {
        elements.loginForm.addEventListener('submit', handleLogin);
    }
    
    checkAuthState();
});

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!supabaseClient) {
        showError('خطأ في الاتصال بالخدمة');
        return;
    }
    
    showLoading(true);
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
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
}

async function checkAuthState() {
    if (!supabaseClient) return;
    
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            showMainApp();
        }
        
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                currentUser = session.user;
                showMainApp();
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                showLoginScreen();
            }
        });
    } catch (error) {
        console.error('خطأ في التحقق من المصادقة:', error);
    }
}

function showMainApp() {
    if (elements.loginScreen) elements.loginScreen.style.display = 'none';
    if (elements.mainApp) elements.mainApp.style.display = 'block';
    
    const welcomeUser = document.getElementById('welcomeUser');
    if (welcomeUser && currentUser) {
        welcomeUser.textContent = `مرحباً، ${currentUser.email || 'المدير'}`;
    }
    
    loadDashboardData();
    loadUsersData();
    loadCodesData();
    loadSettings();
    setupEventListeners();
}

function showLoginScreen() {
    if (elements.loginScreen) elements.loginScreen.style.display = 'flex';
    if (elements.mainApp) elements.mainApp.style.display = 'none';
    
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    if (username) username.value = '';
    if (password) password.value = '';
}

function showError(message) {
    if (elements.loginError) {
        elements.loginError.textContent = message;
        elements.loginError.style.display = 'block';
        setTimeout(() => {
            elements.loginError.style.display = 'none';
        }, 5000);
    }
}

function showLoading(show) {
    if (elements.loadingSpinner) {
        elements.loadingSpinner.style.display = show ? 'flex' : 'none';
    }
}

async function loadDashboardData() {
    if (!supabaseClient) return;
    
    try {
        const { data: users } = await supabaseClient
            .from('devices')
            .select('*');
        
        const totalUsers = users?.length || 0;
        const activeUsers = users?.filter(u => {
            const lastSeen = new Date(u.last_seen);
            const today = new Date();
            return (today - lastSeen) < 24 * 60 * 60 * 1000;
        }).length || 0;
        const blockedUsers = users?.filter(u => u.status === 'blocked').length || 0;
        
        const { data: codes } = await supabaseClient
            .from('activation_codes')
            .select('*');
        
        const availableCodes = codes?.filter(c => !c.is_used).length || 0;
        
        updateElement('totalUsers', totalUsers);
        updateElement('activeUsers', activeUsers);
        updateElement('blockedUsers', blockedUsers);
        updateElement('availableCodes', availableCodes);
        
    } catch (error) {
        console.error('خطأ في تحميل بيانات الرئيسية:', error);
        showToast('خطأ في تحميل البيانات', 'error');
    }
}

async function loadUsersData() {
    try {
        const { data, error } = await supabaseClient
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

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
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

async function blockUser(deviceId) {
    if (!confirm('هل أنت متأكد من حظر هذا المستخدم؟')) return;
    
    try {
        const { error } = await supabaseClient
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

async function unblockUser(deviceId) {
    try {
        const { error } = await supabaseClient
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

async function deleteUser(deviceId) {
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم نهائياً؟')) return;
    
    try {
        const { error } = await supabaseClient
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

async function loadCodesData() {
    try {
        const { data, error } = await supabaseClient
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

function displayCodes(codes) {
    const tbody = document.getElementById('codesTableBody');
    if (!tbody) return;
    
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

async function generateCodes(count) {
    try {
        showLoading(true);
        
        const codes = [];
        for (let i = 0; i < count; i++) {
            const code = 'APP2024-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            codes.push({ code });
        }
        
        const { error } = await supabaseClient
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

async function deleteCode(code) {
    if (!confirm('هل أنت متأكد من حذف هذا الكود؟')) return;
    
    try {
        const { error } = await supabaseClient
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

async function loadSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('app_settings')
            .select('*')
            .single();
        
        if (error) throw error;
        
        if (data) {
            const appStatus = document.getElementById('appStatus');
            const globalMessage = document.getElementById('globalMessage');
            
            if (appStatus) appStatus.value = data.is_shutdown.toString();
            if (globalMessage) globalMessage.value = data.global_message || '';
        }
        
    } catch (error) {
        console.error('خطأ في تحميل الإعدادات:', error);
    }
}

async function saveSettings() {
    try {
        const appStatus = document.getElementById('appStatus');
        const globalMessage = document.getElementById('globalMessage');
        
        const isShutdown = appStatus ? appStatus.value === 'true' : false;
        const message = globalMessage ? globalMessage.value : '';
        
        const { error } = await supabaseClient
            .from('app_settings')
            .update({
                is_shutdown: isShutdown,
                global_message: message
            })
            .eq('id', 1);
        
        if (error) throw error;
        
        showToast('تم حفظ الإعدادات بنجاح', 'success');
        
    } catch (error) {
        console.error('خطأ في حفظ الإعدادات:', error);
        showToast('خطأ في حفظ الإعدادات', 'error');
    }
}

function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const tabContent = document.getElementById(tabName);
            if (tabContent) tabContent.classList.add('active');
            
            if (tabName === 'users') {
                loadUsersData();
            } else if (tabName === 'codes') {
                loadCodesData();
            } else if (tabName === 'dashboard') {
                loadDashboardData();
            }
        });
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
                if (supabaseClient) {
                    await supabaseClient.auth.signOut();
                }
                showLoginScreen();
            }
        });
    }

    const killSwitchBtn = document.getElementById('killSwitchBtn');
    if (killSwitchBtn) {
        killSwitchBtn.addEventListener('click', async () => {
            if (!confirm('هل أنت متأكد من إيقاف التطبيق لجميع المستخدمين؟')) return;
            
            try {
                const { error } = await supabaseClient
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
    }

    const activateAllBtn = document.getElementById('activateAllBtn');
    if (activateAllBtn) {
        activateAllBtn.addEventListener('click', async () => {
            try {
                const { error } = await supabaseClient
                    .from('app_settings')
                    .update({
                        is_shutdown: false,
                        global_message: 'مرحباً بك في التطبيق'
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
    }

    const generateCodesBtn = document.getElementById('generateCodesBtn');
    if (generateCodesBtn) {
        generateCodesBtn.addEventListener('click', () => generateCodes(10));
    }

    const refreshDataBtn = document.getElementById('refreshDataBtn');
    if (refreshDataBtn) {
        refreshDataBtn.addEventListener('click', () => {
            loadDashboardData();
            loadUsersData();
            loadCodesData();
            showToast('تم تحديث البيانات', 'info');
        });
    }

    const generateSingleCodeBtn = document.getElementById('generateSingleCodeBtn');
    if (generateSingleCodeBtn) {
        generateSingleCodeBtn.addEventListener('click', () => generateCodes(1));
    }

    const generate10CodesBtn = document.getElementById('generate10CodesBtn');
    if (generate10CodesBtn) {
        generate10CodesBtn.addEventListener('click', () => generateCodes(10));
    }

    const refreshCodesBtn = document.getElementById('refreshCodesBtn');
    if (refreshCodesBtn) {
        refreshCodesBtn.addEventListener('click', loadCodesData);
    }

    const refreshUsersBtn = document.getElementById('refreshUsersBtn');
    if (refreshUsersBtn) {
        refreshUsersBtn.addEventListener('click', loadUsersData);
    }

    const userFilter = document.getElementById('userFilter');
    if (userFilter) {
        userFilter.addEventListener('change', (e) => {
            const filter = e.target.value;
            let filteredUsers = usersData;
            
            if (filter === 'active') {
                filteredUsers = usersData.filter(u => u.status === 'active');
            } else if (filter === 'blocked') {
                filteredUsers = usersData.filter(u => u.status === 'blocked');
            }
            
            displayUsers(filteredUsers);
        });
    }

    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }
}

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
    
    const container = document.getElementById('toastContainer');
    if (container) {
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
}

setInterval(() => {
    if (currentUser && elements.mainApp && elements.mainApp.style.display !== 'none') {
        loadDashboardData();
    }
}, 60000);