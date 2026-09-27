# برنامج المدونة — نسخة Render / الكمبيوتر / Android / iPhone

هذه النسخة مصممة لتستخدم **نفس رابط Render** من الكمبيوتر وAndroid وiPhone، مع Gmail وGoogle Drive عبر Google OAuth.

## رابطك الحالي
إذا كان رابط Render هو:

`https://modawana-app.onrender.com`

فاستخدمه على جميع الأجهزة.

## إعداد Google Cloud
أنشئ OAuth Client من نوع **Web application**.

### Authorized JavaScript origins
أضف:

`https://modawana-app.onrender.com`

وللتشغيل المحلي على الكمبيوتر فقط يمكن إضافة:

`http://localhost:8787`

### Authorized redirect URIs
اتركها **فارغة** في هذا الإصدار؛ تسجيل الدخول يستخدم Google Identity Services Token Client ولا يعتمد على redirect URI.

### APIs
فعّل في نفس مشروع Google Cloud:
- Gmail API
- Google Drive API

إذا كان OAuth Consent Screen في وضع Testing، أضف حساب Gmail المستخدم إلى Test users.

## داخل التطبيق
اذهب إلى الإعدادات، ضع OAuth Client ID، احفظه، ثم اضغط:

**ربط Gmail وGoogle Drive**

سيظهر عنوان الموقع الحالي داخل الإعدادات لتعرف بالضبط ما يجب وضعه في Authorized JavaScript origins.

## الأجهزة
- Windows: افتح رابط Render في Chrome/Edge.
- Android: افتح نفس رابط Render في Chrome ويمكن تثبيته على الشاشة الرئيسية.
- iPhone: افتح نفس الرابط في Safari ويمكن اختيار Add to Home Screen.

لا تحتاج XAMPP على أي جهاز، ولا تحتاج شراء Domain.
