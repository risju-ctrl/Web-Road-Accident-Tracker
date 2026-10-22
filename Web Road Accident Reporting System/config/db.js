// Postgres (Supabase) connection pool, wrapped in the small part of the mysql2
// interface this app uses, so the ~50 existing `pool.query(sql, params)` call sites
// did not have to change:
//   - `?` placeholders in the SQL are rewritten to `$1`, `$2`, ...
//   - a SELECT resolves to [rows, fields]
//   - an INSERT/UPDATE/DELETE resolves to [{ insertId, affectedRows }, fields]
//   - MySQL error codes are preserved for the handlers that already switch on them
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const useUrl = Boolean(process.env.DATABASE_URL);
const pool = new pg.Pool({
  // Supabase presents a certificate node does not know, so certificate checking is off.
  // The connection is still encrypted.
  ssl: { rejectUnauthorized: false },
  max: 10,
  // Opening a connection to a remote database costs several round trips (TCP, TLS,
  // login), seconds on a long-distance link. node-postgres closes idle connections
  // after 10 s by default, which made the first request after a short pause as slow
  // as a cold start. Keep them for 5 min; the heartbeat below keeps a couple warm.
  idleTimeoutMillis: 5 * 60 * 1000,
  // Do not hang forever when the database is unreachable.
  connectionTimeoutMillis: 15000,
  // TCP keep-alive stops routers and the pooler from silently dropping a quiet socket.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // No session time zone is set here on purpose. MySQL ran with timezone=SYSTEM
  // (Asia/Manila) and the summaries group reports by day and month in SQL, so the
  // database's default time zone for this role is set to Asia/Manila instead: the
  // connection pooler silently ignores a startup `options` parameter, and issuing
  // `set time zone` from a pool 'connect' handler races the query the pool hands out.
  // See the `set_app_timezone_to_manila` migration in the Supabase project.
  ...(useUrl
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'accident_reporting'
      })
});

// An idle client dropping its connection emits an error event; without a listener that
// would take the whole server down.
pool.on('error', (err) => console.error('database pool error:', err.message));

// MySQL codes are kept because models/Report.js retries on ER_DUP_ENTRY and
// middleware/errorHandler.js maps both codes to HTTP responses.
const SQLSTATE_TO_MYSQL = {
  23505: 'ER_DUP_ENTRY',
  23503: 'ER_NO_REFERENCED_ROW_2'
};

// Replaces each `?` with `$1`, `$2`, ... in the order it appears.
function toNumberedParams(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

async function query(sql, params = []) {
  let text = toNumberedParams(sql);
  // node-postgres cannot report the id of an inserted row, so the statement is asked
  // for it. Every insert in this app inserts a single row.
  if (/^\s*insert\b/i.test(text) && !/\breturning\b/i.test(text)) text += ' returning id';

  try {
    const result = await pool.query(text, params);
    if (result.command === 'SELECT') return [result.rows, result.fields];
    // `rows` holds whatever a RETURNING clause produced, so a write can hand back the
    // row it touched without a second SELECT (one fewer round trip).
    return [{ insertId: result.rows[0] ? result.rows[0].id : null, affectedRows: result.rowCount, rows: result.rows }, result.fields];
  } catch (err) {
    if (SQLSTATE_TO_MYSQL[err.code]) err.code = SQLSTATE_TO_MYSQL[err.code];
    throw err;
  }
}

// Opens a few connections up front and keeps them used, so a request never has to wait
// for a new connection. Call once when the server starts. The timer is unref'd so it
// never keeps a script or test process alive.
const HOT_CONNECTIONS = Math.max(1, Number(process.env.DB_WARM_CONNECTIONS) || 4);
const HEARTBEAT_MS = 30 * 1000;
let heartbeat = null;

async function ping() {
  // Concurrent queries need separate clients, so this touches HOT_CONNECTIONS of them.
  // 4 covers the widest fan-out in the app (3 parallel queries on the report page).
  await Promise.all(Array.from({ length: HOT_CONNECTIONS }, () => pool.query('select 1')));
}

async function warm() {
  const started = Date.now();
  try {
    await ping();
    console.log(`database warm: ${HOT_CONNECTIONS} connection(s) ready in ${Date.now() - started} ms`);
  } catch (err) {
    console.error('database warm-up failed:', err.message);
  }
  if (!heartbeat) {
    heartbeat = setInterval(() => ping().catch((err) => console.error('database heartbeat failed:', err.message)), HEARTBEAT_MS);
    heartbeat.unref();
  }
}

export default {
  query,
  warm,
  end: () => {
    if (heartbeat) clearInterval(heartbeat);
    return pool.end();
  }
};
