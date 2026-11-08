/** One-time creation of the first teacher from environment variables (for hosts without a terminal, e.g. Vercel).
 *  Runs during the build. Only acts if the platform has NO teacher yet.
 *  BOOTSTRAP_TEACHER_EMAIL, BOOTSTRAP_TEACHER_PASSWORD (≥ 10 chars), BOOTSTRAP_TEACHER_NAME (optional).
 *  The password must be changed at first login; remove the variables afterwards. */
import bcrypt from 'bcryptjs';
import { pool, q1 } from './lib/core.js';

const email = process.env.BOOTSTRAP_TEACHER_EMAIL?.trim().toLowerCase();
const pwd = process.env.BOOTSTRAP_TEACHER_PASSWORD ?? '';
const name = process.env.BOOTSTRAP_TEACHER_NAME?.trim() || 'المعلمة';
if (email) {
  const any = await q1("SELECT 1 FROM users WHERE role='teacher' LIMIT 1");
  if (any) console.log('• bootstrap teacher: a teacher already exists — nothing to do (you can remove the BOOTSTRAP_* variables).');
  else if (!/^[^@\s]+@[^@\s]+$/.test(email) || pwd.length < 10) console.warn('⚠ bootstrap teacher: invalid email or password shorter than 10 characters — skipped.');
  else {
    const u = await q1(`INSERT INTO users(role, username, password_hash, full_name, must_change_password) VALUES ('teacher',$1,$2,$3,true) RETURNING id`, [email, await bcrypt.hash(pwd, 12), name]);
    await q1('INSERT INTO teacher_profiles(user_id, display_name) VALUES ($1,$2)', [u.id, name]);
    console.log(`✓ bootstrap teacher created: ${email} (password must be changed at first login)`);
  }
}
await pool.end();
