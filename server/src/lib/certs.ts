import crypto from 'node:crypto';
import { type Tx, randToken, notify, config } from './core.js';

const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(n: number) {
  return Array.from(crypto.randomBytes(n), (b) => ALPH[b % ALPH.length]).join('');
}
export function makeSerial(kind: 'stage' | 'journey' | 'course', ref: string | number = '') {
  const p = kind === 'stage' ? `S${ref}` : kind === 'journey' ? 'AMB' : 'C';
  return `DAQ-${p}-${new Date().getUTCFullYear()}-${code(8)}`;
}
export const verifyUrl = (serial: string, token: string) => `${config.publicUrl}/verify/${serial}?t=${token}`;

interface Issue {
  kind: 'stage' | 'journey' | 'course';
  studentId: string; studentName: string; title: string;
  stageId?: number; courseId?: string; instructor?: string; hours?: number; score?: number;
}

/** Issues a certificate once per achievement. Returns the new row or null if one already existed. */
export async function issueCertificate(c: Tx, i: Issue) {
  const conflict =
    i.kind === 'stage' ? "(student_id, stage_id) WHERE kind = 'stage'"
    : i.kind === 'course' ? "(student_id, course_id) WHERE kind = 'course'"
    : "(student_id) WHERE kind = 'journey'";
  const { rows } = await c.query(
    `INSERT INTO certificates(serial, verify_token, kind, student_id, stage_id, course_id, title, student_name, instructor_name, hours, score_pct)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT ${conflict} DO NOTHING RETURNING *`,
    [makeSerial(i.kind, i.stageId ?? ''), randToken(12), i.kind, i.studentId, i.stageId ?? null, i.courseId ?? null,
     i.title, i.studentName, i.instructor ?? null, i.hours ?? null, i.score ?? null]);
  const cert = rows[0] ?? null;
  if (cert) {
    await notify([i.studentId], {
      kind: 'certificate', title: 'أصبحت شهادتك متاحة 🎓',
      body: i.kind === 'journey' ? 'مبروك! حصلتِ على شهادة «سفيرة الوعي الرقمي»' : `شهادة: ${i.title}`,
      link: `/student/certificates/${cert.id}`, dedupe: `cert:${cert.id}`,
    }, c);
  }
  return cert;
}
