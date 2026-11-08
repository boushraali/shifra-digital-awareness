import 'dotenv/config';
import pg from 'pg';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import crypto from 'node:crypto';

// ------------------------------------------------------------------ config
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}
export const config = {
  databaseUrl: req('DATABASE_URL'),
  jwtSecret: req('JWT_SECRET'),
  port: Number(process.env.PORT || 4000),
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:5173',
  storageDir: process.env.STORAGE_DIR || './storage',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 50),
  isProd: process.env.NODE_ENV === 'production',
};
if (config.jwtSecret.length < 32 || config.jwtSecret.includes('CHANGE_ME')) {
  throw new Error('JWT_SECRET must be a random string of at least 32 characters');
}

// ---------------------------------------------------------------------- db
// pg returns numeric as string; parse to number for API convenience.
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 15 });

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}
export async function q1<T = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}
export type Tx = pg.PoolClient;
export async function tx<T>(fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

// ------------------------------------------------------------------ errors
export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export const bad = (m: string) => new HttpError(400, m);
export const forbidden = (m = 'غير مصرح لكِ بهذا الإجراء') => new HttpError(403, m);
export const notFound = (m = 'العنصر غير موجود') => new HttpError(404, m);

export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data);
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'البيانات المدخلة غير صحيحة', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err?.code === '23505') return res.status(409).json({ error: 'السجل موجود مسبقًا' });
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `حجم الملف يتجاوز ${config.maxUploadMb} ميغابايت` });
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم' });
}

// -------------------------------------------------------------------- auth
export type Role = 'teacher' | 'student';
export interface AuthUser { id: string; role: Role; name: string; }
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser } }
}
export const COOKIE = 'dq_session';

export function signSession(u: { id: string; role: Role; token_version: number }) {
  return jwt.sign({ sub: u.id, role: u.role, tv: u.token_version }, config.jwtSecret, { expiresIn: '8h' });
}

/** Loads the session from the httpOnly cookie and re-validates against the DB every request
 *  (so disabling an account or changing a password takes effect immediately). */
export const authenticate = ah(async (req, _res, next) => {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const p = jwt.verify(token, config.jwtSecret) as { sub: string; role: Role; tv: number };
    const u = await q1<{ id: string; role: Role; full_name: string; is_active: boolean; token_version: number }>(
      'SELECT id, role, full_name, is_active, token_version FROM users WHERE id=$1', [p.sub]);
    if (u && u.is_active && u.token_version === p.tv && u.role === p.role) req.user = { id: u.id, role: u.role, name: u.full_name };
  } catch { /* invalid/expired token → anonymous */ }
  next();
});

export const requireAuth = (role?: Role) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, 'يجب تسجيل الدخول أولًا'));
  if (role && req.user.role !== role) return next(forbidden());
  next();
};

// ---------------------------------------------------------- audit & notify
export async function audit(actor: string | null, action: string, entity: string, entityId: string | number | null, details: object = {}, ip?: string, c?: Tx) {
  const sql = 'INSERT INTO audit_logs(actor_id, action, entity, entity_id, details, ip) VALUES ($1,$2,$3,$4,$5,$6)';
  const params = [actor, action, entity, entityId === null ? null : String(entityId), JSON.stringify(details), ip ?? null];
  if (c) await c.query(sql, params); else await q(sql, params);
}

export async function notify(userIds: string[], n: { kind: string; title: string; body?: string; link?: string; dedupe?: string }, c?: Tx) {
  if (!userIds.length) return;
  const sql = `INSERT INTO notifications(user_id, kind, title, body, link, dedupe_key)
               SELECT unnest($1::uuid[]), $2, $3, $4, $5, $6
               ON CONFLICT (user_id, dedupe_key) DO NOTHING`;
  const params = [userIds, n.kind, n.title, n.body ?? '', n.link ?? null, n.dedupe ?? null];
  if (c) await c.query(sql, params); else await q(sql, params);
}

export async function teacherIds(c?: Tx): Promise<string[]> {
  const sql = "SELECT id FROM users WHERE role='teacher' AND is_active";
  const rows = c ? (await c.query(sql)).rows : await q(sql);
  return rows.map((r: any) => r.id);
}

// ------------------------------------------------------------------- misc
export const randToken = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url');
/** Human-friendly temporary password (no ambiguous characters). */
export function tempPassword(len = 10) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
export const levelLabel = (l: string) => (l === 'intermediate' ? 'المتوسطة' : 'الثانوية');
export const gradeLabel = (g: number) => ['الأول', 'الثاني', 'الثالث'][g - 1] ?? String(g);
