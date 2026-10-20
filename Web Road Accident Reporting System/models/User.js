import pool from '../config/db.js';
import bcrypt from 'bcryptjs';

export const User = {
  async findByEmail(email) {
    // Case-insensitive so an address registered in any case still logs in.
    const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email]);
    return rows[0];
  },
  async findById(id) {
    const [rows] = await pool.query('SELECT id, name, email, role, phone, is_active, created_at FROM users WHERE id = ?', [id]);
    return rows[0];
  },
  async create({ name, email, password, role = 'reporter', phone = null }) {
    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role, phone) VALUES (?, ?, ?, ?, ?)',
      [name, email, password_hash, role, phone]
    );
    return this.findById(result.insertId);
  },
  async list(filters = {}) {
    let query = 'SELECT id, name, email, role, phone, is_active, created_at FROM users WHERE 1=1';
    const params = [];
    if (filters.role) {
      query += ' AND role = ?';
      params.push(filters.role);
    }
    if (filters.is_active !== undefined) {
      query += ' AND is_active = ?';
      params.push(filters.is_active);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    return rows;
  },
  async update(id, data) {
    const fields = [];
    const params = [];
    if (data.name) { fields.push('name = ?'); params.push(data.name); }
    if (data.email) { fields.push('email = ?'); params.push(data.email); }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone); }
    if (data.is_active !== undefined) { fields.push('is_active = ?'); params.push(data.is_active); }
    if (data.role) { fields.push('role = ?'); params.push(data.role); }
    if (data.password) {
      const password_hash = await bcrypt.hash(data.password, 10);
      fields.push('password_hash = ?');
      params.push(password_hash);
    }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  },
  // Active officers with the position they last shared and how many cases they carry.
  async listForDispatch() {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.latitude, u.longitude, u.location_updated_at, u.on_duty,
              (SELECT COUNT(*)::int FROM reports r
                WHERE r.assigned_to = u.id AND r.status IN ('assigned', 'in_progress')) AS open_cases
       FROM users u
       WHERE u.role = 'traffic_officer' AND u.is_active = true`
    );
    return rows;
  },
  async getLocation(id) {
    const [rows] = await pool.query(
      'SELECT latitude, longitude, location_updated_at, on_duty FROM users WHERE id = ?', [id]
    );
    return rows[0];
  },
  // Only the fields that were sent change, so toggling duty does not wipe the position.
  async setLocation(id, { latitude, longitude, on_duty }) {
    const fields = [];
    const params = [];
    if (latitude !== undefined && longitude !== undefined) {
      fields.push('latitude = ?', 'longitude = ?', 'location_updated_at = NOW()');
      params.push(latitude, longitude);
    }
    if (on_duty !== undefined) { fields.push('on_duty = ?'); params.push(on_duty); }
    if (fields.length === 0) return this.getLocation(id);
    params.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getLocation(id);
  },
  async remove(id) {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  },
  async verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
  }
};
