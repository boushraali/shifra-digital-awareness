# نشر «شفرة الوعي الرقمي» على Vercel

```
المتصفح ──► Vercel
              ├─ CDN: ملفات الواجهة (React)
              └─ Vercel Function: الخادم (Express) + Cron يومي
                     │                      │
                     ▼                      ▼
          PostgreSQL على Neon     تخزين ملفات متوافق مع S3 (Cloudflare R2 أو AWS S3)
```

**لماذا التخزين الخارجي؟** في Vercel لا يوجد قرص دائم، وكل طلب أو استجابة محدود بـ 4.5 ميغابايت. لذلك:
- ترفع المعلمة ملفات الدروس من المتصفح مباشرة إلى التخزين، ثم يتحقق الخادم من نوع الملف الفعلي.
- تُفتح الملفات للطالبة عبر رابط موقّع صالح 5 دقائق، وذلك بعد التحقق من صلاحيتها.

## 1) قاعدة البيانات: Neon

الأسهل من داخل Vercel: **Storage ← Marketplace ← Neon**، ثم اربطيها بالمشروع. يضيف Vercel المتغير `DATABASE_URL` تلقائيًا.

أو أنشئي مشروعًا على neon.tech وانسخي رابط الاتصال **pooled**، وهو الذي يحتوي على `-pooler` في اسم المضيف.

## 2) تخزين الملفات: Cloudflare R2

1. في Cloudflare فعّلي **R2**، وأنشئي bucket باسم `shifra-files`.
2. **R2 ← Manage API Tokens**: أنشئي توكن بصلاحية Object Read & Write على هذا الـ bucket. احتفظي بـ Access Key ID وSecret Access Key وAccount ID.
3. **CORS** (مطلوب لرفع الملفات من المتصفح): افتحي الـ bucket، ثم Settings، ثم CORS Policy، والصقي التالي بعد وضع رابط موقعك:

```json
[
  {
    "AllowedOrigins": ["https://YOUR-PROJECT.vercel.app"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

يمكن استخدام AWS S3 بدلًا من R2: اتركي `S3_ENDPOINT` فارغًا، وضعي `S3_REGION`.

## 3) استيراد المشروع في Vercel

1. افتحي **vercel.com/new**، ثم Import، واختاري المستودع `boushraali/shifra-digital-awareness`.
2. **Root Directory**: اختاري `server` (مهم).
3. Framework Preset: يُكتشف تلقائيًا (Express). اتركي أوامر البناء كما هي، فهي معرّفة في `server/vercel.json`.
4. افتحي **Environment Variables** وأضيفي القيم التالية **قبل** الضغط على Deploy:

| المتغير | القيمة |
|---|---|
| `DATABASE_URL` | رابط Neon (يُضاف تلقائيًا إن ربطتِ Neon من Marketplace) |
| `JWT_SECRET` | نص عشوائي طوله 64 حرفًا |
| `CRON_SECRET` | نص عشوائي آخر |
| `PUBLIC_URL` | `https://YOUR-PROJECT.vercel.app`، ويُستخدم في رموز QR للشهادات |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | `shifra-files` |
| `S3_ACCESS_KEY_ID` | من توكن R2 |
| `S3_SECRET_ACCESS_KEY` | من توكن R2 |
| `BOOTSTRAP_TEACHER_EMAIL` | بريد المعلمة، لإنشاء أول حساب |
| `BOOTSTRAP_TEACHER_PASSWORD` | كلمة مرور مؤقتة لا تقل عن 10 أحرف، ويجب تغييرها عند أول دخول |
| `BOOTSTRAP_TEACHER_NAME` | اسم المعلمة (اختياري) |

5. اضغطي **Deploy**. أثناء البناء تُبنى الواجهة، وتُنشأ جداول قاعدة البيانات والعوالم السبعة، ويُنشأ حساب المعلمة.
6. إذا تغيّر رابط المشروع النهائي، حدّثي `PUBLIC_URL` وسياسة CORS، ثم أعيدي النشر من **Deployments ← Redeploy**.

بعد أول دخول للمعلمة احذفي متغيرات `BOOTSTRAP_*`.

## ملاحظات

- **المهام المجدولة** (إشعارات فتح المراحل وقرب إغلاقها، وإنهاء المحاولات، والتسليم التلقائي للاختبارات): يعمل Cron يوميًا، وتعمل المهام أيضًا تلقائيًا مع حركة الاستخدام بحد أقصى مرة كل دقيقة. فتح المراحل وإغلاقها نفسه فوري، لأن الخادم يحسبه من المواعيد في كل طلب.
- **التحديث**: كل تعديل يُرفع إلى فرع `main` يُنشر تلقائيًا.
- **الخطة**: خطة Hobby المجانية مخصصة للاستخدام الشخصي غير التجاري. راجعي شروط Vercel، أو استخدمي خطة Pro للاستخدام المؤسسي.
- **حماية البيانات**: بيانات الطالبات في Neon وR2 وفي المنطقة التي تختارينها لكل خدمة. راجعي متطلبات نظام حماية البيانات الشخصية وسياسة جهتك التعليمية.
