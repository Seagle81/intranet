const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// ─── 비밀번호 ──────────────────────────────────────────────────────────────────

function makePassword(plain) {
  return bcrypt.hash(plain, 10);
}

function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ─── 사용자 조회 ──────────────────────────────────────────────────────────────

async function getAllUsers() {
  const [rows] = await pool.query(
    'SELECT name, emp_no AS empNo, phone, role FROM users ORDER BY id ASC'
  );
  return rows;
}

async function findUser(empNo) {
  const [rows] = await pool.query(
    'SELECT name, emp_no AS empNo, phone, role, password, must_change_password AS mustChangePw FROM users WHERE emp_no = ? LIMIT 1',
    [empNo]
  );
  return rows[0] || null;
}

async function empNoExists(empNo) {
  const [rows] = await pool.query(
    'SELECT id FROM users WHERE emp_no = ? LIMIT 1',
    [empNo]
  );
  return rows.length > 0;
}

// ─── 사용자 추가/수정/삭제 ────────────────────────────────────────────────────

async function createUser(name, empNo, phone, role, password, mustChange) {
  if (mustChange === undefined) mustChange = true;
  var hash = await makePassword(password);
  return pool.query(
    'INSERT INTO users (name, emp_no, phone, role, password, must_change_password) VALUES (?, ?, ?, ?, ?, ?)',
    [name, empNo, phone, role, hash, mustChange ? 1 : 0]
  );
}

async function updateUser(empNo, name, phone, role) {
  var parts = [];
  var vals = [];
  if (name)  { parts.push('name = ?');  vals.push(name); }
  if (phone) { parts.push('phone = ?'); vals.push(phone); }
  if (role === 'admin' || role === 'user') { parts.push('role = ?'); vals.push(role); }
  if (!parts.length) return;
  vals.push(empNo);
  return pool.query('UPDATE users SET ' + parts.join(', ') + ' WHERE emp_no = ?', vals);
}

async function deleteUserByEmpNo(empNo) {
  return pool.query('DELETE FROM users WHERE emp_no = ?', [empNo]);
}

async function updatePassword(empNo, newPassword, mustChange) {
  if (mustChange === undefined) mustChange = false;
  var hash = await makePassword(newPassword);
  return pool.query(
    'UPDATE users SET password = ?, must_change_password = ? WHERE emp_no = ?',
    [hash, mustChange ? 1 : 0, empNo]
  );
}

// ─── 인증 미들웨어 (페이지용) ─────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.mustChangePw) {
    var script = req.path || '';
    if (script.indexOf('change_password') === -1 && script.indexOf('logout') === -1) {
      return res.redirect('/change_password');
    }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'admin') return res.redirect('/main');
  if (req.session.user.mustChangePw) return res.redirect('/change_password');
  next();
}

// ─── 인증 미들웨어 (API용 - JSON 응답) ────────────────────────────────────────

function requireAdminApi(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: '권한이 없습니다.' });
  next();
}

module.exports = {
  makePassword, checkPassword,
  getAllUsers, findUser, empNoExists,
  createUser, updateUser, deleteUserByEmpNo, updatePassword,
  requireAuth, requireAdmin, requireAdminApi
};
