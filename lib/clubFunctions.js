'use strict';

const pool = require('../config/db');

function calcSupportMonth(dateStr) {
  var d = new Date(dateStr);
  if (d.getDate() >= 23) d.setMonth(d.getMonth() + 1);
  return String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0');
}

async function getClubList() {
  const [rows] = await pool.query(`
    SELECT c.id, c.club_name, c.description, c.status, c.found_date,
           COUNT(m.id) AS member_count,
           u.name AS president_name
    FROM t_club c
    LEFT JOIN t_club_member m ON m.club_id = c.id AND m.status = 'active'
    LEFT JOIN users u ON u.emp_no = c.president_emp_no
    WHERE c.status = 'active'
    GROUP BY c.id, c.club_name, c.description, c.status, c.found_date, u.name
    ORDER BY c.club_name
  `);
  return rows;
}

async function getClub(clubId) {
  const [rows] = await pool.query(`
    SELECT c.*, u.name AS president_name, u2.name AS secretary_name
    FROM t_club c
    LEFT JOIN users u  ON u.emp_no  = c.president_emp_no
    LEFT JOIN users u2 ON u2.emp_no = c.secretary_emp_no
    WHERE c.id = ?
  `, [clubId]);
  return rows[0] || null;
}

async function getClubMembers(clubId) {
  const [rows] = await pool.query(`
    SELECT m.id, m.emp_no, m.role, m.join_date, m.support_month, m.support_paid,
           u.name, u.dept_name, u.position
    FROM t_club_member m
    JOIN users u ON u.emp_no = m.emp_no
    WHERE m.club_id = ? AND m.status = 'active'
    ORDER BY m.role DESC, m.join_date ASC
  `, [clubId]);
  return rows;
}

async function getClubNotices(clubId) {
  const [rows] = await pool.query(`
    SELECT n.id, n.title, n.content, n.reg_date, u.name AS author_name
    FROM t_club_notice n
    JOIN users u ON u.emp_no = n.emp_no
    WHERE n.club_id = ?
    ORDER BY n.reg_date DESC
  `, [clubId]);
  return rows;
}

async function getMyMemberships(empNo) {
  const [rows] = await pool.query(`
    SELECT m.club_id, m.join_date, m.support_month, m.support_paid, m.role,
           c.club_name
    FROM t_club_member m
    JOIN t_club c ON c.id = m.club_id AND c.status = 'active'
    WHERE m.emp_no = ? AND m.status = 'active'
    ORDER BY m.join_date ASC
  `, [empNo]);
  return rows;
}

async function submitFoundApply(clubName, description, rulesFile, applicantEmpNo, founders) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      'INSERT INTO t_club_found_apply (club_name, description, rules_file, applicant_emp_no) VALUES (?, ?, ?, ?)',
      [clubName, description, rulesFile, applicantEmpNo]
    );
    const foundApplyId = result.insertId;
    for (var empNo of founders) {
      await conn.query(
        'INSERT INTO t_club_found_member (found_apply_id, emp_no) VALUES (?, ?)',
        [foundApplyId, empNo]
      );
    }
    await conn.commit();
    return foundApplyId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function getFoundApplyList() {
  const [rows] = await pool.query(`
    SELECT f.id, f.club_name, f.description, f.rules_file,
           f.applicant_emp_no, f.status, f.processed_by,
           f.processed_date, f.reject_reason, f.reg_date,
           u.name AS applicant_name,
           (SELECT GROUP_CONCAT(u2.name ORDER BY fm.id SEPARATOR ', ')
            FROM t_club_found_member fm
            JOIN users u2 ON u2.emp_no = fm.emp_no
            WHERE fm.found_apply_id = f.id) AS founder_names
    FROM t_club_found_apply f
    JOIN users u ON u.emp_no = f.applicant_emp_no
    ORDER BY f.reg_date DESC
  `);
  return rows;
}

async function approveFoundApply(foundApplyId, adminEmpNo) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[apply]] = await conn.query(
      "SELECT * FROM t_club_found_apply WHERE id = ? AND status = 'pending'",
      [foundApplyId]
    );
    if (!apply) throw new Error('신청 정보를 찾을 수 없거나 이미 처리되었습니다.');

    const [founders] = await conn.query(
      'SELECT emp_no FROM t_club_found_member WHERE found_apply_id = ?',
      [foundApplyId]
    );
    const today = new Date().toISOString().slice(0, 10);

    const [clubResult] = await conn.query(
      `INSERT INTO t_club (club_name, description, rules_file, status, president_emp_no, found_apply_id, found_date)
       VALUES (?, ?, ?, 'active', ?, ?, ?)`,
      [apply.club_name, apply.description, apply.rules_file, apply.applicant_emp_no, foundApplyId, today]
    );
    const clubId = clubResult.insertId;

    var allMembers = founders.map(function(f) { return f.emp_no; });
    if (!allMembers.includes(apply.applicant_emp_no)) allMembers.unshift(apply.applicant_emp_no);

    var suppMonth = calcSupportMonth(today);
    for (var empNo of allMembers) {
      var role = (empNo === apply.applicant_emp_no) ? 'president' : 'member';
      await conn.query(
        'INSERT INTO t_club_member (club_id, emp_no, role, join_date, support_month) VALUES (?, ?, ?, ?, ?)',
        [clubId, empNo, role, today, suppMonth]
      );
    }

    await conn.query(
      "UPDATE t_club_found_apply SET status = 'approved', processed_by = ?, processed_date = NOW() WHERE id = ?",
      [adminEmpNo, foundApplyId]
    );
    await conn.commit();
    return clubId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function rejectFoundApply(foundApplyId, adminEmpNo, reason) {
  const [result] = await pool.query(
    "UPDATE t_club_found_apply SET status = 'rejected', processed_by = ?, processed_date = NOW(), reject_reason = ? WHERE id = ? AND status = 'pending'",
    [adminEmpNo, reason, foundApplyId]
  );
  if (!result.affectedRows) throw new Error('신청 정보를 찾을 수 없거나 이미 처리되었습니다.');
}

async function submitJoinApply(clubId, empNo) {
  const [existing] = await pool.query(
    "SELECT id FROM t_club_member WHERE club_id = ? AND emp_no = ? AND status = 'active'",
    [clubId, empNo]
  );
  if (existing.length) throw new Error('이미 가입된 동호회입니다.');

  const [pending] = await pool.query(
    "SELECT id FROM t_club_join_apply WHERE club_id = ? AND emp_no = ? AND status = 'pending'",
    [clubId, empNo]
  );
  if (pending.length) throw new Error('이미 가입 신청 중입니다.');

  await pool.query(
    'INSERT INTO t_club_join_apply (club_id, emp_no) VALUES (?, ?)',
    [clubId, empNo]
  );
}

async function getJoinApplyList(clubId) {
  const [rows] = await pool.query(`
    SELECT a.id, a.emp_no, a.apply_date, a.status,
           u.name, u.dept_name, u.position
    FROM t_club_join_apply a
    JOIN users u ON u.emp_no = a.emp_no
    WHERE a.club_id = ? AND a.status = 'pending'
    ORDER BY a.apply_date ASC
  `, [clubId]);
  return rows;
}

async function approveJoinApply(applyId, presidentEmpNo) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[apply]] = await conn.query(
      "SELECT * FROM t_club_join_apply WHERE id = ? AND status = 'pending'",
      [applyId]
    );
    if (!apply) throw new Error('신청을 찾을 수 없거나 이미 처리되었습니다.');

    const today = new Date().toISOString().slice(0, 10);
    const suppMonth = calcSupportMonth(today);

    await conn.query(
      'INSERT INTO t_club_member (club_id, emp_no, role, join_date, support_month) VALUES (?, ?, ?, ?, ?)',
      [apply.club_id, apply.emp_no, 'member', today, suppMonth]
    );
    await conn.query(
      "UPDATE t_club_join_apply SET status = 'approved', processed_by = ?, processed_date = NOW() WHERE id = ?",
      [presidentEmpNo, applyId]
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function rejectJoinApply(applyId, presidentEmpNo, reason) {
  const [result] = await pool.query(
    "UPDATE t_club_join_apply SET status = 'rejected', processed_by = ?, processed_date = NOW(), reject_reason = ? WHERE id = ? AND status = 'pending'",
    [presidentEmpNo, reason, applyId]
  );
  if (!result.affectedRows) throw new Error('신청을 찾을 수 없거나 이미 처리되었습니다.');
}

async function leaveClub(clubId, empNo) {
  const [result] = await pool.query(
    "UPDATE t_club_member SET status = 'left', leave_date = CURDATE() WHERE club_id = ? AND emp_no = ? AND status = 'active'",
    [clubId, empNo]
  );
  if (!result.affectedRows) throw new Error('가입된 동호회가 아닙니다.');
}

async function addNotice(clubId, empNo, title, content) {
  await pool.query(
    'INSERT INTO t_club_notice (club_id, emp_no, title, content) VALUES (?, ?, ?, ?)',
    [clubId, empNo, title, content]
  );
}

async function getClubReport() {
  const [members] = await pool.query(`
    SELECT m.emp_no, m.club_id, m.join_date, m.support_month, m.support_paid,
           c.club_name, u.name, u.dept_name, u.position, u.cost_type
    FROM t_club_member m
    JOIN t_club c  ON c.id = m.club_id AND c.status = 'active'
    JOIN users  u  ON u.emp_no = m.emp_no
    WHERE m.status = 'active'
    ORDER BY u.cost_type, u.emp_no, m.join_date ASC
  `);

  var empMap = {};
  for (var row of members) {
    if (!empMap[row.emp_no]) empMap[row.emp_no] = [];
    empMap[row.emp_no].push(row);
  }

  return members.map(function(row) {
    var myClubs = empMap[row.emp_no];
    var idx = myClubs.findIndex(function(c) { return c.club_id === row.club_id; });
    return Object.assign({}, row, {
      monthly_fee:  idx < 2 ? 30000 : 0,
      support_amt:  (idx < 2 && !row.support_paid) ? 100000 : 0,
      join_date:    row.join_date instanceof Date
                      ? row.join_date.toISOString().slice(0, 10)
                      : row.join_date,
    });
  });
}

async function adminCreateClub(clubName, description, foundDate, members) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    var presidentEmpNo = null;
    var secretaryEmpNo = null;
    members.forEach(function(m) {
      if (m.role === 'president') presidentEmpNo = m.emp_no;
      if (m.role === 'secretary') secretaryEmpNo = m.emp_no;
    });

    const [result] = await conn.query(
      `INSERT INTO t_club (club_name, description, status, president_emp_no, secretary_emp_no, found_date)
       VALUES (?, ?, 'active', ?, ?, ?)`,
      [clubName, description || '', presidentEmpNo, secretaryEmpNo, foundDate || null]
    );
    const clubId = result.insertId;

    for (var m of members) {
      var joinDate = m.join_date || new Date().toISOString().slice(0, 10);
      var suppMonth = calcSupportMonth(joinDate);
      await conn.query(
        'INSERT IGNORE INTO t_club_member (club_id, emp_no, role, join_date, support_month) VALUES (?, ?, ?, ?, ?)',
        [clubId, m.emp_no, m.role || 'member', joinDate, suppMonth]
      );
    }

    await conn.commit();
    return clubId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = {
  calcSupportMonth,
  getClubList,
  getClub,
  getClubMembers,
  getClubNotices,
  getMyMemberships,
  submitFoundApply,
  getFoundApplyList,
  approveFoundApply,
  rejectFoundApply,
  submitJoinApply,
  getJoinApplyList,
  approveJoinApply,
  rejectJoinApply,
  leaveClub,
  addNotice,
  getClubReport,
  adminCreateClub,
};
