-- إعداد قاعدة البيانات لـ WePlay Bot Admin Panel
-- قم بتشغيل هذا الكود في Supabase SQL Editor

-- 1. إنشاء جدول أكواد التفعيل (إذا لم يكن موجوداً)
CREATE TABLE IF NOT EXISTS activation_codes (
    code TEXT PRIMARY KEY,
    device_id TEXT,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE SET NULL
);

-- 2. إنشاء فهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_activation_codes_is_used ON activation_codes(is_used);
CREATE INDEX IF NOT EXISTS idx_activation_codes_device_id ON activation_codes(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);

-- 3. إضافة بعض أكواد التفعيل للاختبار (اختياري)
INSERT INTO activation_codes (code) VALUES 
('WP2024-TEST001'),
('WP2024-TEST002'),
('WP2024-TEST003'),
('WP2024-TEST004'),
('WP2024-TEST005')
ON CONFLICT (code) DO NOTHING;

-- 4. تحديث إعدادات التطبيق (إذا لم تكن موجودة)
INSERT INTO app_settings (id, is_shutdown, global_message) 
VALUES (1, false, 'مرحباً بك في WePlay Bot')
ON CONFLICT (id) DO UPDATE SET
    global_message = EXCLUDED.global_message;

-- 5. إنشاء دالة لتوليد أكواد تلقائية (اختياري)
CREATE OR REPLACE FUNCTION generate_activation_codes(count_codes INTEGER)
RETURNS TABLE(generated_code TEXT) AS $$
DECLARE
    i INTEGER;
    new_code TEXT;
BEGIN
    FOR i IN 1..count_codes LOOP
        new_code := 'WP2024-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8));
        
        -- التأكد من عدم تكرار الكود
        WHILE EXISTS (SELECT 1 FROM activation_codes WHERE code = new_code) LOOP
            new_code := 'WP2024-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 8));
        END LOOP;
        
        INSERT INTO activation_codes (code) VALUES (new_code);
        generated_code := new_code;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. إنشاء دالة للإحصائيات السريعة
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_users', (SELECT COUNT(*) FROM devices),
        'active_users', (SELECT COUNT(*) FROM devices WHERE last_seen > NOW() - INTERVAL '24 hours'),
        'blocked_users', (SELECT COUNT(*) FROM devices WHERE status = 'blocked'),
        'available_codes', (SELECT COUNT(*) FROM activation_codes WHERE is_used = false),
        'used_codes', (SELECT COUNT(*) FROM activation_codes WHERE is_used = true),
        'total_codes', (SELECT COUNT(*) FROM activation_codes)
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 7. إنشاء trigger لتحديث used_at عند استخدام الكود
CREATE OR REPLACE FUNCTION update_code_used_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_used = true AND OLD.is_used = false THEN
        NEW.used_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_update_code_used_at
    BEFORE UPDATE ON activation_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_code_used_at();

-- 8. إنشاء view للمستخدمين النشطين
CREATE OR REPLACE VIEW active_users_view AS
SELECT 
    device_id,
    user_name,
    status,
    last_seen,
    message,
    CASE 
        WHEN last_seen > NOW() - INTERVAL '5 minutes' THEN 'أونلاين الآن'
        WHEN last_seen > NOW() - INTERVAL '1 hour' THEN 'نشط خلال الساعة'
        WHEN last_seen > NOW() - INTERVAL '24 hours' THEN 'نشط اليوم'
        ELSE 'غير نشط'
    END as activity_status,
    EXTRACT(EPOCH FROM (NOW() - last_seen))/3600 as hours_since_last_seen
FROM devices
ORDER BY last_seen DESC;

-- 9. إنشاء view لإحصائيات الأكواد
CREATE OR REPLACE VIEW codes_stats_view AS
SELECT 
    DATE_TRUNC('day', created_at) as day,
    COUNT(*) as codes_created,
    COUNT(CASE WHEN is_used THEN 1 END) as codes_used,
    COUNT(CASE WHEN NOT is_used THEN 1 END) as codes_available
FROM activation_codes
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

-- تم الانتهاء من إعداد قاعدة البيانات!

-- ========================================
-- إعداد المصادقة (Authentication)
-- ========================================

-- بعد تشغيل الكود أعلاه، اذهب لـ Authentication في Supabase Dashboard:

-- 1. اذهب لـ Authentication > Users
-- 2. اضغط "Add user" 
-- 3. أدخل البيانات التالية:
--    Email: weplay@admin.com
--    Password: WePlay2024!
--    Email Confirm: true (مؤكد)

-- أو يمكنك إنشاء المستخدم برمجياً:
-- في JavaScript Console أو من التطبيق:
-- 
-- await supabase.auth.admin.createUser({
--   email: 'weplay@admin.com',
--   password: 'WePlay2024!',
--   email_confirm: true
-- })

-- بيانات تسجيل الدخول:
-- البريد الإلكتروني: weplay@admin.com
-- كلمة المرور: WePlay2024!