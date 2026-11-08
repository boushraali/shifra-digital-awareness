import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, authenticate, requireAuth, errorHandler, HttpError } from './lib/core.js';
import { migrate } from './migrate.js';
import crypto from 'node:crypto';
import { startScheduler, runJobs } from './lib/jobs.js';
import { storageKind } from './lib/storage.js';
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
        defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'],
        frameSrc: ['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com'],
        styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
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
  // Triggered by the Cloudflare Cron Trigger (the container may be asleep between requests).
  app.post('/api/internal/run-jobs', async (req, res, next) => {
    const want = process.env.JOBS_TOKEN ?? '';
    const got = req.get('x-jobs-token') ?? '';
    if (!want || want.length !== got.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got))) return next(new HttpError(404, 'المسار غير موجود'));
    try { await runJobs(); res.json({ ok: true }); } catch (e) { next(e); }
  });
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
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(here, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await migrate();
  const server = buildApp().listen(config.port, '0.0.0.0', () => console.log(`✓ شفرة الوعي الرقمي API on :${config.port} (storage: ${storageKind})`));
  const timer = startScheduler();
  // Cloudflare sends SIGTERM before stopping a container (sleep, deploy, host move)
  process.on('SIGTERM', () => { clearInterval(timer); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10_000).unref(); });
}
