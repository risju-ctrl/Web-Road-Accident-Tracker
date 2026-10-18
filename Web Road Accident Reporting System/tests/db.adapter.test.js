// Tests the pg adapter in config/db.js against the real Postgres server. It is
// skipped when DATABASE_URL is not set, so local MySQL work and `npm test` still pass.
//
// The test writes one accident_categories row and deletes it again: that is the
// cheapest way to prove insertId, affectedRows and the unique-violation translation
// against a real server. It leaves a gap in the id sequence, nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/db.js';

const skip = process.env.DATABASE_URL ? false : 'DATABASE_URL is not set — the adapter talks to Postgres';

test('pg adapter keeps the mysql2 contract', { skip }, async () => {
  let createdId = null;
  try {
    // 1. Placeholders are rewritten in order, not by regex index.
    const [sum] = await pool.query('select (? + ?)::int as total', [1, 2]);
    assert.equal(sum[0].total, 3);

    // 2. Inserts report insertId, and the row is really there.
    const [ins] = await pool.query(
      'insert into accident_categories (name, description) values (?, ?)',
      ['adapter-test', 'created by tests/db.adapter.test.js']
    );
    createdId = ins.insertId;
    assert.equal(typeof ins.insertId, 'number');
    const [found] = await pool.query('select name from accident_categories where id = ?', [ins.insertId]);
    assert.equal(found[0].name, 'adapter-test');

    // 3. Updates report affectedRows, including zero when nothing matched.
    const [upd] = await pool.query('update accident_categories set description = ? where id = ?', ['changed', ins.insertId]);
    assert.equal(upd.affectedRows, 1);
    const [none] = await pool.query('update accident_categories set description = ? where id = ?', ['x', -1]);
    assert.equal(none.affectedRows, 0);

    // 4. A unique violation arrives as the MySQL code the app already retries on.
    const dup = await pool.query('insert into users (name, email, password_hash, role) values (?, ?, ?, ?)', [
      'dup', 'admin@local.test', 'x', 'reporter'
    ]).then(() => null, (err) => err);
    assert.equal(dup && dup.code, 'ER_DUP_ENTRY');

    // 5. Aggregates are strings unless cast. COUNT is cast because MySQL returned it as
    // a number; SUM is left alone because MySQL returned it as a DECIMAL string too.
    const [uncast] = await pool.query('select count(*) as total from users');
    assert.equal(typeof uncast[0].total, 'string');
    const [cast] = await pool.query('select count(*)::int as total from users');
    assert.equal(typeof cast[0].total, 'number');

    // 6. Boolean columns come back as JS booleans, not 1/0.
    const [active] = await pool.query('select is_active from users where id = ?', [1]);
    assert.equal(active[0].is_active, true);
  } finally {
    if (createdId !== null) await pool.query('delete from accident_categories where id = ?', [createdId]);
    await pool.end();
  }
});
