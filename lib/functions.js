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

// ─── 프로그램별 권한 미들웨어 ─────────────────────────────────────────────────
// minLevel: 1=조회, 2=등록/수정, 3=삭제포함
// admin 역할은 항상 최고 권한(3) 부여

function requireProgAuth(progId, minLevel) {
  if (minLevel === undefined) minLevel = 1;
  return async function(req, res, next) {
    // 1. 로그인 확인
    if (!req.session.user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
      }
      return res.redirect('/login');
    }
    if (req.session.user.mustChangePw) {
      return res.redirect('/change_password');
    }

    // 2. admin은 모든 권한 허용
    if (req.session.user.role === 'admin') {
      req.authLevel = 3;
      return next();
    }

    // 3. 프로그램 권한 테이블 확인
    try {
      const [rows] = await pool.query(
        'SELECT auth_level FROM t_prog_auth WHERE prog_id = ? AND emp_no = ? LIMIT 1',
        [progId, req.session.user.empNo]
      );
      if (rows.length === 0 || rows[0].auth_level < minLevel) {
        if (req.path.startsWith('/api/')) {
          return res.status(403).json({ success: false, message: '접근 권한이 없습니다.' });
        }
        return res.status(403).render('error', {
          message: `[${progId}] 프로그램에 대한 접근 권한이 없습니다.`,
          user: req.session.user
        });
      }
      req.authLevel = rows[0].auth_level;
      next();
    } catch (e) {
      if (req.path.startsWith('/api/')) {
        return res.status(500).json({ success: false, message: 'DB 오류가 발생했습니다.' });
      }
      next(e);
    }
  };
}

// 프로그램 마스터 목록 조회
async function getProgList() {
  const [rows] = await pool.query(
    `SELECT p.prog_id, p.prog_name, p.reg_date,
            COUNT(a.emp_no) AS auth_count
     FROM t_prog p
     LEFT JOIN t_prog_auth a ON a.prog_id = p.prog_id
     GROUP BY p.prog_id, p.prog_name, p.reg_date
     ORDER BY p.prog_id`
  );
  return rows;
}

// 프로그램 등록
async function addProg(progId, progName) {
  await pool.query(
    'INSERT INTO t_prog (prog_id, prog_name) VALUES (?, ?)',
    [progId, progName]
  );
}

// 프로그램 삭제 (권한도 함께 삭제)
async function deleteProg(progId) {
  await pool.query('DELETE FROM t_prog_auth WHERE prog_id = ?', [progId]);
  await pool.query('DELETE FROM t_prog WHERE prog_id = ?', [progId]);
}

// 프로그램 권한 목록 조회 (관리자용)
async function getProgAuthList(progId) {
  const [rows] = await pool.query(
    `SELECT p.emp_no, u.name, p.auth_level, p.reg_date
     FROM t_prog_auth p
     LEFT JOIN users u ON u.emp_no = p.emp_no
     WHERE p.prog_id = ?
     ORDER BY p.emp_no`,
    [progId]
  );
  return rows;
}

// 권한 부여/수정
async function setProgAuth(progId, empNo, authLevel) {
  await pool.query(
    `INSERT INTO t_prog_auth (prog_id, emp_no, auth_level)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE auth_level = VALUES(auth_level)`,
    [progId, empNo, authLevel]
  );
}

// 권한 삭제
async function deleteProgAuth(progId, empNo) {
  await pool.query(
    'DELETE FROM t_prog_auth WHERE prog_id = ? AND emp_no = ?',
    [progId, empNo]
  );
}

module.exports = {
  makePassword, checkPassword,
  getAllUsers, findUser, empNoExists,
  createUser, updateUser, deleteUserByEmpNo, updatePassword,
  requireAuth, requireAdmin, requireAdminApi,
  requireProgAuth,
  getProgList, addProg, deleteProg,
  getProgAuthList, setProgAuth, deleteProgAuth
};
