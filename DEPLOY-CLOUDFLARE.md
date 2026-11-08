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
2. لا يلزم Docker عند النشر عبر GitHub، لأن Cloudflare يبني الصورة على خوادمه.

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

## الخطوة 3: الربط بـ GitHub والنشر (بدون Docker أو Terminal)

1. في لوحة Cloudflare افتحي **Workers & Pages**، ثم **Create**، ثم **Import a repository**، واختاري `boushraali/shifra-digital-awareness`.
2. اضبطي الإعدادات كالتالي:
   - Project name: `shifra-digital-awareness` (يجب أن يطابق الاسم في `wrangler.jsonc`)
   - Build command: اتركيه فارغًا
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`
3. اضغطي **Deploy**. يبني Cloudflare صورة الحاوية بنفسه، ويستغرق ذلك عدة دقائق في المرة الأولى.
4. بعد انتهاء النشر افتحي **Settings ← Variables and Secrets** وأضيفي القيم التالية:

| الاسم | النوع | القيمة |
|---|---|---|
| `PUBLIC_URL` | Text | رابط الموقع `https://shifra-digital-awareness.<subdomain>.workers.dev` |
| `S3_ENDPOINT` | Text | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `DATABASE_URL` | Secret | رابط Neon |
| `S3_ACCESS_KEY_ID` | Secret | من توكن R2 |
| `S3_SECRET_ACCESS_KEY` | Secret | من توكن R2 |
| `JWT_SECRET` | Secret | نص عشوائي طوله 64 حرفًا |
| `JOBS_TOKEN` | Secret | نص عشوائي آخر طوله 64 حرفًا |

5. من **Deployments** اختاري آخر بناء واضغطي **Retry build**، حتى تبدأ الحاوية بالقيم الجديدة.

بعد ذلك، أي تعديل يُرفع إلى فرع `main` في GitHub يُنشر تلقائيًا.

> بديل لمن يفضّل الطرفية: من مجلد المشروع نفّذي `npm install` ثم `npx wrangler login`، وأضيفي كل قيمة بالأمر `npx wrangler secret put NAME`، ثم `npm run deploy`. هذا الطريق يحتاج Docker Desktop.

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
