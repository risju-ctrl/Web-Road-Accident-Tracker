// Creates the three demo accounts with hashed passwords. Run: npm run seed
// Passwords come from SEED_*_PASSWORD in .env (min 8 chars); nothing is hard-coded.
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pool from '../config/db.js';

dotenv.config();

const accounts = [
  ['System Admin', 'admin@local.test', 'admin', '09170000000', process.env.SEED_ADMIN_PASSWORD],
  ['Traffic Officer', 'officer@local.test', 'traffic_officer', '09170000001', process.env.SEED_OFFICER_PASSWORD],
  ['Test Reporter', 'reporter@local.test', 'reporter', '09170000002', process.env.SEED_REPORTER_PASSWORD]
];

const missing = accounts.filter(([, , , , pw]) => !pw || pw.length < 8).map(([, email]) => email);
if (missing.length) {
  console.error(`Set SEED_ADMIN_PASSWORD, SEED_OFFICER_PASSWORD and SEED_REPORTER_PASSWORD in .env (8+ characters). Missing/short for: ${missing.join(', ')}`);
  process.exit(1);
}

for (const [name, email, role, phone, password] of accounts) {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, phone, is_active) VALUES (?, ?, ?, ?, ?, true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_active = true`,
    [name, email, hash, role, phone]
  );
  console.log(`Seeded ${role}: ${email}`);
}
await pool.end();
