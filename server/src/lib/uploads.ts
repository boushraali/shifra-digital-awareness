import multer from 'multer';

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import { config, bad, q1 } from './core.js';
import jwt from 'jsonwebtoken';
import { putFile, presignUpload, inspectObject, deleteFile } from './storage.js';

// uploads land in a temp dir, are validated, then moved to permanent storage (disk or R2)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shifra-up-'));

/** Allowed types: extension → [mime, magic-bytes check] */
const ALLOWED: Record<string, { mime: string; magic: (b: Buffer) => boolean }> = {
  pdf: { mime: 'application/pdf', magic: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: zip },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', magic: zip },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: zip },
  doc: { mime: 'application/msword', magic: ole },
  ppt: { mime: 'application/vnd.ms-powerpoint', magic: ole },
  png: { mime: 'image/png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  jpg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  jpeg: { mime: 'image/jpeg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  webp: { mime: 'image/webp', magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  gif: { mime: 'image/gif', magic: (b) => b.subarray(0, 3).toString() === 'GIF' },
  mp4: { mime: 'video/mp4', magic: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  webm: { mime: 'video/webm', magic: (b) => b.readUInt32BE(0) === 0x1a45dfa3 },
  zip: { mime: 'application/zip', magic: zip },
  txt: { mime: 'text/plain', magic: () => true },
  csv: { mime: 'text/csv', magic: () => true },
};
function zip(b: Buffer) { return b[0] === 0x50 && b[1] === 0x4b; }
function ole(b: Buffer) { return b.readUInt32BE(0) === 0xd0cf11e0; }

export const GROUPS = {
  lesson: ['pdf', 'docx', 'pptx', 'doc', 'ppt', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'zip', 'txt', 'xlsx'],
  cover: ['png', 'jpg', 'jpeg', 'webp'],
  import: ['csv', 'xlsx'],
} as const;

export const upload = multer({
  storage: multer.diskStorage({
    destination: tmpDir,
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
});

/** Validates extension, declared purpose and the file's real signature (without storing it). */
export function validateUpload(file: Express.Multer.File | undefined, purpose: keyof typeof GROUPS) {
  if (!file) throw bad('لم يتم إرفاق ملف');
  // multer exposes non-ASCII names as latin1; restore UTF-8 (Arabic file names)
  file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const ext = path.extname(file.originalname).slice(1).toLowerCase();
  const rule = ALLOWED[ext];
  const fail = (m: string) => { fs.rmSync(file.path, { force: true }); return bad(m); };
  if (!rule || !(GROUPS[purpose] as readonly string[]).includes(ext)) throw fail(`نوع الملف غير مسموح. الأنواع المسموحة: ${GROUPS[purpose].join(', ')}`);
  const fd = fs.openSync(file.path, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (!rule.magic(head)) throw fail('محتوى الملف لا يطابق امتداده');
  const name = file.originalname.replace(/[\\/\0]/g, '_').slice(0, 200);
  return { file, rule, name };
}

/** Validates, stores permanently and registers the file in `files`. */
export async function registerFile(f: Express.Multer.File | undefined, purpose: keyof typeof GROUPS, ownerId: string) {
  const { file, rule, name } = validateUpload(f, purpose);
  await putFile(path.basename(file.path), file.path, rule.mime);
  return q1('INSERT INTO files(owner_id, original_name, mime, size_bytes, storage_key, purpose) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, original_name, mime, size_bytes',
    [ownerId, name, rule.mime, file.size, path.basename(file.path), purpose]);
}

// ------------------------------------------- direct (browser → storage) uploads
/** Step 1: validate name/size/type and return a presigned PUT URL plus a signed ticket for step 2. */
export async function prepareDirectUpload(purpose: keyof typeof GROUPS, filename: string, size: number, ownerId: string) {
  const name = filename.replace(/[\\/\0]/g, '_').slice(0, 200);
  const ext = path.extname(name).slice(1).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule || !(GROUPS[purpose] as readonly string[]).includes(ext)) throw bad(`نوع الملف غير مسموح. الأنواع المسموحة: ${GROUPS[purpose].join(', ')}`);
  if (!Number.isFinite(size) || size <= 0) throw bad('الملف فارغ');
  if (size > config.maxUploadMb * 1024 * 1024) throw bad(`حجم الملف يتجاوز ${config.maxUploadMb} ميغابايت`);
  const key = crypto.randomUUID();
  const url = await presignUpload(key, rule.mime, size);
  const ticket = jwt.sign({ k: key, p: purpose, n: name, s: size, o: ownerId }, config.jwtSecret, { expiresIn: '20m' });
  return { url, method: 'PUT', headers: { 'Content-Type': rule.mime }, ticket };
}

/** Step 2: after the browser uploaded, verify size + real file signature, then register it. */
export async function completeDirectUpload(ticket: string, ownerId: string) {
  let t: { k: string; p: keyof typeof GROUPS; n: string; s: number; o: string };
  try { t = jwt.verify(ticket, config.jwtSecret) as any; } catch { throw bad('انتهت صلاحية الرفع، أعيدي المحاولة'); }
  if (t.o !== ownerId) throw bad('طلب رفع غير صالح');
  const rule = ALLOWED[path.extname(t.n).slice(1).toLowerCase()];
  const obj = await inspectObject(t.k);
  if (!obj) throw bad('لم يكتمل رفع الملف');
  if (obj.size !== t.s || !rule.magic(obj.head)) { await deleteFile(t.k); throw bad('محتوى الملف لا يطابق امتداده'); }
  return q1('INSERT INTO files(owner_id, original_name, mime, size_bytes, storage_key, purpose) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, original_name, mime, size_bytes',
    [ownerId, t.n, rule.mime, obj.size, t.k, t.p]);
}
