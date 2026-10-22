import pool from '../config/db.js';

export const Notification = {
  async create({ userId, reportId, event, message }) {
    // RETURNING * hands back the new row, so no second SELECT round trip is needed.
    const [result] = await pool.query(
      'INSERT INTO notifications (user_id, report_id, event, message) VALUES (?, ?, ?, ?) RETURNING *',
      [userId, reportId, event, message]
    );
    return result.rows[0];
  },
  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM notifications WHERE id = ?', [id]);
    return rows[0];
  },
  async listByUser(userId, { unreadOnly = false, page = 1, limit = 20 } = {}) {
    let query = 'SELECT n.*, r.report_reference, r.title as report_title FROM notifications n LEFT JOIN reports r ON n.report_id = r.id WHERE n.user_id = ?';
    const params = [userId];
    if (unreadOnly) { query += ' AND n.is_read = false'; }
    query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));
    // The page and the count do not depend on each other, so they run side by side.
    const [[rows], [[{ total }]]] = await Promise.all([
      pool.query(query, params),
      pool.query('SELECT COUNT(*)::int as total FROM notifications WHERE user_id = ?' + (unreadOnly ? ' AND is_read = false' : ''), [userId])
    ]);
    return { rows, total, page: Number(page), limit: Number(limit) };
  },
  async markRead(id, userId) {
    // One statement: the user_id condition is the ownership check (someone else's
    // notification matches no row, so the caller gets "not found"), and COALESCE keeps
    // the original read time when it is marked again.
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = true, read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ? RETURNING *',
      [id, userId]
    );
    return result.rows[0] || null;
  },
  async markAllRead(userId) {
    await pool.query('UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = ? AND is_read = false', [userId]);
    return { success: true };
  },
  async unreadCount(userId) {
    const [[{ count }]] = await pool.query('SELECT COUNT(*)::int as count FROM notifications WHERE user_id = ? AND is_read = false', [userId]);
    return count;
  }
};
