/** File storage: local disk in development / Docker, S3-compatible object storage (Cloudflare R2, AWS S3…)
 *  when S3_BUCKET is set. On Vercel object storage is required (no persistent disk, 4.5 MB body limit),
 *  so uploads go browser → storage via presigned URLs, and downloads redirect to short-lived signed URLs. */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './core.js';

const bucket = process.env.S3_BUCKET;
const s3 = bucket
  ? new S3Client({
      region: process.env.S3_REGION || 'auto',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1', // only for local S3 emulators
      endpoint: process.env.S3_ENDPOINT || undefined, // R2: https://<ACCOUNT_ID>.r2.cloudflarestorage.com ; AWS: leave empty
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  : null;
const localDir = path.resolve(config.storageDir, 'uploads');
if (!s3) { try { fs.mkdirSync(localDir, { recursive: true }); } catch { /* read-only FS (e.g. serverless without S3) */ } }

export const storageKind = s3 ? 's3' : 'disk';
export const isServerless = !!process.env.VERCEL;
/** Origins the browser must be allowed to talk to (CSP), e.g. https://<acct>.r2.cloudflarestorage.com and its bucket subdomain. */
export function storageOrigins(): string[] {
  if (!s3) return [];
  const ep = process.env.S3_ENDPOINT;
  if (!ep) return ['https://*.amazonaws.com'];
  const u = new URL(ep);
  return [u.origin, `${u.protocol}//*.${u.host}`];
}

/** Moves a validated temp file into permanent storage under `key`. */
export async function putFile(key: string, tmpPath: string, mime: string) {
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.createReadStream(tmpPath), ContentType: mime, ContentLength: fs.statSync(tmpPath).size }));
    fs.rmSync(tmpPath, { force: true });
  } else {
    fs.renameSync(tmpPath, path.join(localDir, key));
  }
}

export async function deleteFile(key: string) {
  if (s3) await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
  else fs.rmSync(path.join(localDir, key), { force: true });
}

// ---------------------------------------------------------- direct uploads
export const directUploads = () => !!s3;
export async function presignUpload(key: string, mime: string, size: number) {
  return getSignedUrl(s3!, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mime, ContentLength: size }), { expiresIn: 900 });
}
/** Size + first bytes of an uploaded object (for signature checks), or null if missing. */
export async function inspectObject(key: string): Promise<{ size: number; head: Buffer } | null> {
  try {
    const h = await s3!.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const g = await s3!.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: 'bytes=0-15' }));
    const head = Buffer.from(await g.Body!.transformToByteArray());
    return { size: Number(h.ContentLength ?? 0), head };
  } catch { return null; }
}

// --------------------------------------------------------------- download
/** Sends a stored file. Disk: streamed (Range supported). Object storage: 302 to a 5-minute signed URL
 *  (keeps large videos/PDFs off the API — required on Vercel). Authorization is done by the caller. */
export async function sendFile(res: Response, key: string, opts: { range?: string; mime: string; disposition: string }): Promise<boolean> {
  if (!s3) {
    const full = path.join(localDir, path.basename(key));
    if (!fs.existsSync(full)) return false;
    res.setHeader('Content-Type', opts.mime);
    res.setHeader('Content-Disposition', opts.disposition);
    res.sendFile(full);
    return true;
  }
  if (process.env.S3_PROXY_DOWNLOADS === '1') return proxyFromS3(res, key, opts);
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentType: opts.mime, ResponseContentDisposition: opts.disposition }), { expiresIn: 300 });
  res.setHeader('Cache-Control', 'private, no-store');
  res.redirect(302, url);
  return true;
}

async function proxyFromS3(res: Response, key: string, opts: { range?: string; mime: string; disposition: string }) {
  try {
    const out = await s3!.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: opts.range }));
    res.setHeader('Content-Type', opts.mime);
    res.setHeader('Content-Disposition', opts.disposition);
    res.setHeader('Accept-Ranges', 'bytes');
    if (out.ContentLength !== undefined) res.setHeader('Content-Length', String(out.ContentLength));
    if (out.ContentRange) { res.status(206); res.setHeader('Content-Range', out.ContentRange); }
    (out.Body as Readable).pipe(res);
    return true;
  } catch (e: any) {
    if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) return false;
    if (e?.$metadata?.httpStatusCode === 416) { res.status(416).end(); return true; }
    throw e;
  }
}
