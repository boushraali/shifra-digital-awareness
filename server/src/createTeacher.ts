/** Creates a (production) teacher account.
 *  Usage: npm run create-teacher -- --email teacher@school.sa --name "أ. نورة" [--school "..."]
 *  A strong random password is generated and printed once; it is never stored in clear. */
import bcrypt from 'bcryptjs';
import { pool, q1, tempPassword } from './lib/core.js';
import { migrate } from './migrate.js';

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : undefined; };
const email = arg('email'); const name = arg('name'); const school = arg('school') ?? '';
if (!email || !name || !/^[^@\s]+@[^@\s]+$/.test(email)) { console.error('Usage: --email <email> --name <name> [--school <school>]'); process.exit(1); }

await migrate();
const pwd = tempPassword(14);
const u = await q1(`INSERT INTO users(role, username, password_hash, full_name, must_change_password) VALUES ('teacher',$1,$2,$3,true)
  ON CONFLICT (username) DO NOTHING RETURNING id`, [email.toLowerCase(), await bcrypt.hash(pwd, 12), name]);
if (!u) { console.error('A user with this email already exists.'); process.exit(1); }
await q1('INSERT INTO teacher_profiles(user_id, display_name, school_name) VALUES ($1,$2,$3)', [u.id, name, school]);
console.log(`✓ Teacher created\n  login: ${email.toLowerCase()}\n  temporary password: ${pwd}\n  (must be changed at first login)`);
await pool.end();
