# نشر «شفرة الوعي الرقمي» على Cloudflare

البنية على Cloudflare:

```
المتصفح ──► Cloudflare Worker (cloudflare/worker.ts)
               │  يمرّر كل الطلبات + Cron كل 30 دقيقة
               ▼
           Cloudflare Container (Dockerfile: الخادم + الواجهة المبنية)
               │                         │
               ▼                         ▼
     PostgreSQL على Neon        Cloudflare R2 (ملفات الدروس وأغلفة الدورات)
```

يعمل التطبيق داخل حاوية Cloudflare كما هو. قاعدة البيانات PostgreSQL على Neon لأن Cloudflare لا تستضيف PostgreSQL، والملفات على R2.

## المتطلبات (مرة واحدة)

1. **خطة Workers Paid** في حساب Cloudflare، لأن Containers تتطلبها (5$ شهريًا مع استخدام مضمَّن).
2. على جهازك: **Node.js 22** و**Docker Desktop** يعمل، لأن Wrangler يبني صورة الحاوية بـ Docker.

## الخطوة 1: تفعيل R2 وإنشاء الحاوية (bucket)

1. من لوحة Cloudflare افتحي **R2 Object Storage** واضغطي تفعيل (Enable).
2. أنشئي bucket باسم `shifra-files`، من اللوحة أو بالأمر `npx wrangler r2 bucket create shifra-files`.
3. من **R2 ← Manage API Tokens** أنشئي توكن بصلاحية **Object Read & Write** على `shifra-files` فقط. احتفظي بـ:
   - `Access Key ID`
   - `Secret Access Key`
   - رابط الـ endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

## الخطوة 2: قاعدة البيانات (Neon)

1. أنشئي حسابًا ومشروعًا على [neon.tech](https://neon.tech)، واختاري أقرب منطقة متاحة لكِ.
2. انسخي **Connection string** بالشكل:
   `postgresql://USER:PASSWORD@HOST/neondb?sslmode=require`

تُنشأ الجداول ويُحمَّل محتوى العوالم السبعة تلقائيًا عند أول تشغيل للحاوية.

## الخطوة 3: الإعداد والنشر

افتحي الطرفية (Terminal) داخل مجلد المشروع:

```bash
npm install
npx wrangler login
```

عدّلي قسم `vars` في `wrangler.jsonc`:
- `S3_ENDPOINT`: ضعي فيه رقم الحساب (Account ID).
- `PUBLIC_URL`: اتركيه مؤقتًا، وستعدّلينه بعد أول نشر.

أضيفي الأسرار. سيطلب كل أمر القيمة ولن تظهر على الشاشة:

```bash
npx wrangler secret put DATABASE_URL          # رابط Neon
npx wrangler secret put S3_ACCESS_KEY_ID      # من توكن R2
npx wrangler secret put S3_SECRET_ACCESS_KEY  # من توكن R2
openssl rand -hex 32 | npx wrangler secret put JWT_SECRET
openssl rand -hex 32 | npx wrangler secret put JOBS_TOKEN
```

> على Windows بدون `openssl`: نفّذي `npx wrangler secret put JWT_SECRET`، والصقي نصًا عشوائيًا طوله 64 حرفًا. افعلي الشيء نفسه مع `JOBS_TOKEN`.

ثم انشري:

```bash
npm run deploy
```

النشر الأول يستغرق عدة دقائق لأنه يبني الصورة ويرفعها. في النهاية يظهر رابط مثل:
`https://shifra-digital-awareness.<subdomain>.workers.dev`

**مهم:** ضعي هذا الرابط في `PUBLIC_URL` داخل `wrangler.jsonc`، ثم نفّذي `npm run deploy` مرة أخرى، لأن رموز QR في الشهادات تستخدمه.

## الخطوة 4: إنشاء حساب المعلمة

بما أن قاعدة البيانات على Neon، يمكنك إنشاء الحساب من جهازك مباشرة:

```bash
cd server
npm install
DATABASE_URL="رابط Neon" JWT_SECRET="أي-نص-عشوائي-طويل-32-حرفًا-على-الأقل" \
  npm run create-teacher -- --email teacher@school.sa --name "أ. الاسم" --school "اسم المدرسة"
```

تظهر كلمة مرور مؤقتة مرة واحدة، وستُطلب كلمة جديدة عند أول دخول. بعد ذلك تضيف المعلمة الطالبات من لوحتها.

## بعد النشر

- **السجلات**: `npm run tail`، أو من لوحة Cloudflare: **Workers ← Containers**.
- **التحديث**: عدّلي الكود ثم نفّذي `npm run deploy`.
- **نطاق خاص**: من إعدادات الـ Worker افتحي **Domains & Routes** وأضيفي نطاقك، ثم حدّثي `PUBLIC_URL` وأعيدي النشر.
- **الكمون**: تتوقف الحاوية بعد 20 دقيقة بلا طلبات، ويستغرق أول طلب بعد ذلك بضع ثوانٍ لتشغيلها. تتحكم في ذلك القيمة `sleepAfter` في `cloudflare/worker.ts`.
- **المهام المجدولة** (إشعارات فتح المراحل وقرب إغلاقها، وإنهاء المحاولات المنتهية، والتسليم التلقائي للاختبارات): تعمل كل 30 دقيقة عبر Cron، وكل دقيقة أثناء عمل الحاوية.
- **حماية البيانات**: تُحفظ بيانات الطالبات في Neon (المنطقة التي اخترتِها) وفي R2. راجعي متطلبات نظام حماية البيانات الشخصية وسياسة جهتك التعليمية بشأن موقع الاستضافة.
