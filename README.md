# برنامج المدونة — Gmail + Google Drive OAuth

هذه النسخة تستخدم **Google OAuth Client ID واحدًا** لـ Gmail وGoogle Drive.
لا يوجد Gmail App Password ولا تخزين لكلمة مرور Google.

## التشغيل

```bash
npm install
npm start
```

ثم افتح:

`http://localhost:8787`

## إعداد Google Cloud

1. أنشئ OAuth Client من نوع **Web application**.
2. أضف Authorized JavaScript origin:

`http://localhost:8787`

3. فعّل:
- Gmail API
- Google Drive API

4. اضبط OAuth consent screen وأضف حساب الاختبار إذا كان التطبيق في وضع Testing.
5. من داخل التطبيق: **الإعدادات → Google OAuth Client ID → حفظ Client ID → ربط Gmail وGoogle Drive**.

النطاقات المستخدمة:
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/drive`

بعد الموافقة يستطيع التطبيق إرسال Gmail، قراءة البريد والمرفقات، ورفع/قراءة/البحث في Google Drive بنفس جلسة Google.
