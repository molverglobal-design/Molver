# MOLVER - GitHub Pages Deploy

## الملفات المطلوبة

ارفع الملفات دي في Repository جديد على GitHub:

- `index.html`
- `styles.css`
- `app.js`
- `molver-logo.png`
- `google_apps_script.gs` فقط كمرجع، لا يتم تشغيله على GitHub Pages

## خطوات النشر المجاني

1. افتح GitHub واعمل Repository جديد باسم `molver-store`.
2. ارفع الملفات المطلوبة.
3. افتح Settings.
4. افتح Pages.
5. من Build and deployment اختار:
   - Source: Deploy from a branch
   - Branch: main
   - Folder: `/root`
6. اضغط Save.
7. بعد دقيقة هتلاقي رابط شغال مثل:
   `https://USERNAME.github.io/molver-store/`

## Google Sheets

بعد أي تعديل على `google_apps_script.gs`:

1. افتح Google Sheets.
2. Extensions > Apps Script.
3. انسخ محتوى `google_apps_script.gs`.
4. Deploy > Manage deployments.
5. Edit deployment.
6. Version: New version.
7. Deploy.
8. استخدم Web App URL داخل إعدادات الربط في البرنامج.

## ملاحظات مهمة

- GitHub Pages يستضيف الواجهة فقط.
- Google Sheets + Apps Script هو قاعدة البيانات المجانية.
- النسخ الاحتياطي موجود في:
  - تبويب `Backups` في Google Sheets.
  - نسخ يومية محلية داخل المتصفح لآخر 7 أيام.

