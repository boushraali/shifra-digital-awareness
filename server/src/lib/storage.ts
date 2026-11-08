/** File storage: local disk in development, Cloudflare R2 (S3-compatible API) in production.
 *  R2 is used automatically when S3_BUCKET is set. */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Response } from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from './core.js';

const bucket = process.env.S3_BUCKET;
const s3 = bucket
  ? new S3Client({
      region: 'auto',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1', // only for local S3 emulators
      endpoint: process.env.S3_ENDPOINT, // https://<ACCOUNT_ID>.r2.cloudflarestorage.com
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '' },
    })
  : null;
const localDir = path.resolve(config.storageDir, 'uploads');
if (!s3) fs.mkdirSync(localDir, { recursive: true });

export const storageKind = s3 ? 'r2' : 'disk';

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

/** Streams a stored file to the response, honouring HTTP Range (video seeking). Headers must be set by the caller. */
export async function sendFile(res: Response, key: string, range?: string): Promise<boolean> {
  if (!s3) {
    const full = path.join(localDir, path.basename(key));
    if (!fs.existsSync(full)) return false;
    res.sendFile(full);
    return true;
  }
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }));
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
