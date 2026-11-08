import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { ah, q, q1, COOKIE, signSession, config, HttpError, requireAuth, audit, bad } from '../lib/core.js';

export const auth = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}|${String(req.body?.username ?? '').toLowerCase()}`,
  message: { error: 'محاولات كثيرة لتسجيل الدخول. حاولي مرة أخرى بعد 15 دقيقة.' },
});

const cookieOpts = () => ({ httpOnly: true, sameSite: 'strict' as const, secure: config.isProd, path: '/', maxAge: 8 * 3600 * 1000 });

// A fixed dummy hash so that unknown usernames take the same time as wrong passwords
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

auth.post('/login', loginLimiter, ah(async (req, res) => {
  const body = z.object({
    role: z.enum(['teacher', 'student']),
    username: z.string().trim().min(1).max(120),
    password: z.string().min(1).max(200),
  }).parse(req.body);
  const u = await q1('SELECT * FROM users WHERE lower(username)=lower($1)', [body.username]);
  const ok = await bcrypt.compare(body.password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok || u.role !== body.role) throw new HttpError(401, 'بيانات الدخول غير صحيحة');
  if (!u.is_active) throw new HttpError(403, 'هذا الحساب معطّل. تواصلي مع المعلمة.');
  await q('UPDATE users SET last_login_at=now() WHERE id=$1', [u.id]);
  res.cookie(COOKIE, signSession(u), cookieOpts());
  res.json({ user: { id: u.id, role: u.role, name: u.full_name, mustChangePassword: u.must_change_password } });
}));

auth.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

auth.get('/me', ah(async (req, res) => {
  if (!req.user) return res.json({ user: null });
  const u = await q1(
    `SELECT u.id, u.role, u.full_name AS name, u.username, u.must_change_password AS "mustChangePassword", u.is_demo AS "isDemo",
            sp.student_code AS "studentCode", cl.level::text AS level, cl.grade, cl.section, tp.school_name AS "schoolName"
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id=u.id
     LEFT JOIN classes cl ON cl.id=sp.class_id
     LEFT JOIN teacher_profiles tp ON tp.user_id=u.id
     WHERE u.id=$1`, [req.user.id]);
  const unread = await q1<{ n: number }>('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ user: { ...u, unread: unread?.n ?? 0 } });
}));

auth.post('/change-password', requireAuth(), ah(async (req, res) => {
  const { current, next } = z.object({ current: z.string().min(1), next: z.string().min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف').max(200) }).parse(req.body);
  const u = await q1('SELECT * FROM users WHERE id=$1', [req.user!.id]);
  if (!(await bcrypt.compare(current, u.password_hash))) throw bad('كلمة المرور الحالية غير صحيحة');
  if (current === next) throw bad('اختاري كلمة مرور مختلفة عن الحالية');
  const hash = await bcrypt.hash(next, 12);
  const [nu] = await q('UPDATE users SET password_hash=$1, must_change_password=false, token_version=token_version+1 WHERE id=$2 RETURNING *', [hash, u.id]);
  await audit(u.id, 'password.change', 'user', u.id, {}, req.ip);
  res.cookie(COOKIE, signSession(nu), cookieOpts()); // keep this session, invalidate others
  res.json({ ok: true });
}));
