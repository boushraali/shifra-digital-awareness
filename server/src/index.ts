import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, configErrors, authenticate, requireAuth, errorHandler, HttpError } from './lib/core.js';
import { migrate } from './migrate.js';
import crypto from 'node:crypto';
import { startScheduler, runJobs } from './lib/jobs.js';
import { storageKind, storageOrigins, isServerless } from './lib/storage.js';
import { INDEX_HTML } from './generated/indexHtml.js';
import { auth } from './routes/auth.js';
import { journey } from './routes/journey.js';
import { learn } from './routes/learn.js';
import { common } from './routes/common.js';
import { students } from './routes/teacher/students.js';
import { stages } from './routes/teacher/stages.js';
import { courses } from './routes/teacher/courses.js';
import { assessments } from './routes/teacher/assessments.js';
import { reports } from './routes/teacher/reports.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:', ...storageOrigins()], mediaSrc: ["'self'", 'blob:', ...storageOrigins()],
        connectSrc: ["'self'", ...storageOrigins()],
        frameSrc: ["'self'", 'https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com', ...storageOrigins()],
        styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  // Misconfigured deployment → explain instead of crashing (names of missing variables only, never values)
  if (configErrors.length) {
    console.error('[config] missing/invalid environment variables:', configErrors.join(', '));
    app.use((req, res) => {
      if (req.path.startsWith('/api')) return res.status(503).json({ error: 'المنصة غير مهيأة بعد', missing: configErrors });
      res.status(503).type('html').send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>إعداد المنصة غير مكتمل</title>
<body style="font-family:system-ui;max-width:640px;margin:10vh auto;padding:0 20px;line-height:1.8;color:#1e1b4b">
<h1>إعداد المنصة غير مكتمل</h1><p>المتغيرات التالية مفقودة أو غير صالحة في إعدادات الاستضافة (Vercel ← Settings ← Environment Variables):</p>
<ul>${configErrors.map((e) => `<li><code>${e}</code></li>`).join('')}</ul><p>أضيفيها ثم أعيدي النشر (Deployments ← Redeploy).</p>
<p dir="ltr" style="color:#64748b">Platform not configured. Missing: ${configErrors.join(', ')}</p></body></html>`);
    });
    return app;
  }
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // CSRF defence-in-depth: SameSite=Strict cookie + require a custom header on state-changing requests
  // (a cross-site form cannot set custom headers without a CORS preflight, which we never allow).
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'shifra')
      return next(new HttpError(403, 'طلب غير صالح'));
    next();
  });
  app.use('/api', authenticate);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Scheduled jobs endpoint: Vercel Cron (GET + "Authorization: Bearer $CRON_SECRET")
  // or Cloudflare Cron (POST + "x-jobs-token: $JOBS_TOKEN").
  const safeEq = (a: string, b: string) => !!a && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  app.all('/api/internal/run-jobs', async (req, res, next) => {
    const ok = (req.method === 'GET' && safeEq(`Bearer ${process.env.CRON_SECRET ?? ''}`, req.get('authorization') ?? '') && !!process.env.CRON_SECRET)
      || (req.method === 'POST' && safeEq(process.env.JOBS_TOKEN ?? '', req.get('x-jobs-token') ?? ''));
    if (!ok) return next(new HttpError(404, 'المسار غير موجود'));
    try { await runJobs(); res.json({ ok: true }); } catch (e) { next(e); }
  });
  // Serverless: no background timer, so piggy-back the jobs on traffic (at most once a minute per instance).
  if (isServerless) {
    let last = 0;
    app.use('/api', (_req, _res, next) => {
      if (Date.now() - last > 60_000) {
        last = Date.now();
        import('@vercel/functions').then(({ waitUntil }) => waitUntil(runJobs().catch((e) => console.error('[jobs]', e)))).catch(() => {});
      }
      next();
    });
  }
  app.use('/api/auth', auth);
  app.use('/api/journey', journey);
  app.use('/api/learn', learn);
  app.use('/api', common);

  const teacher = express.Router();
  teacher.use(requireAuth('teacher'));      // every /api/teacher route is teacher-only, checked on the server
  teacher.use('/students', students);
  teacher.use('/stages', stages);
  teacher.use('/courses', courses);
  teacher.use('/assessments', assessments);
  teacher.use('/', reports);
  app.use('/api/teacher', teacher);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'المسار غير موجود')));

  // Serve the built web app (production)
  const here = (() => { try { return path.dirname(fileURLToPath(import.meta.url)); } catch { return path.join(process.cwd(), 'src'); } })();
  const dist = path.resolve(here, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else if (INDEX_HTML) {
    // Vercel: static assets come from the CDN (public/), the function only answers SPA routes
    app.get(/^\/(?!api).*/, (_req, res) => res.type('html').setHeader('Cache-Control', 'no-cache').send(INDEX_HTML));
  }
  app.use(errorHandler);
  return app;
}

const app = buildApp();
/** Vercel's Express integration uses this default export (one Vercel Function). */
export default app;

const isMain = (() => { try { return !!process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); } catch { return false; } })();
if (isMain) migrate().then(() => {
  const server = app.listen(config.port, '0.0.0.0', () => console.log(`✓ شفرة الوعي الرقمي API on :${config.port} (storage: ${storageKind})`));
  const timer = startScheduler();
  // Cloudflare sends SIGTERM before stopping a container (sleep, deploy, host move)
  process.on('SIGTERM', () => { clearInterval(timer); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10_000).unref(); });
}).catch((e) => { console.error(e); process.exit(1); });
