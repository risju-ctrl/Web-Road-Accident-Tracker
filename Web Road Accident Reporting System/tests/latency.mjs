// Measures how long one round trip to the database takes. Run: node tests/latency.mjs
// Under ~40 ms: region is fine. 150 ms or more: the Supabase project is far from you.
import pool from '../config/db.js';
const t = [];
for (let i = 0; i < 6; i++) {
  const s = performance.now();
  await pool.query('select 1');
  t.push(performance.now() - s);
}
console.log('first query (includes connecting):', t[0].toFixed(0), 'ms');
console.log('next queries:', t.slice(1).map((x) => x.toFixed(0) + ' ms').join(', '));
await pool.end();
