const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { createUser } = require('../lib/functions');

router.get('/setup', async function(req, res) {
  var errors = [];

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      name                 VARCHAR(50)  NOT NULL,
      emp_no               VARCHAR(20)  NOT NULL UNIQUE,
      phone                VARCHAR(20)  NOT NULL,
      role                 ENUM('admin','user') NOT NULL DEFAULT 'user',
      password             VARCHAR(255) NOT NULL,
      must_change_password TINYINT(1)   NOT NULL DEFAULT 1,
      created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8`);
  } catch (e) {
    errors.push('테이블 생성 실패: ' + e.message);
  }

  if (!errors.length) {
    try {
      var [cols] = await pool.query("SHOW COLUMNS FROM users LIKE 'must_change_password'");
      if (!cols.length) {
        await pool.query("ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 1");
        await pool.query("UPDATE users SET must_change_password = 0 WHERE role = 'admin'");
      }
    } catch (e) {
      errors.push('컬럼 추가 실패: ' + e.message);
    }
  }

  if (!errors.length) {
    try {
      var [check] = await pool.query("SELECT id FROM users WHERE emp_no = '0000' LIMIT 1");
      if (!check.length) {
        await createUser('관리자', '0000', '000-0000-0000', 'admin', '0000', false);
      }
    } catch (e) {
      errors.push('관리자 계정 생성 실패: ' + e.message);
    }
  }

  res.render('setup', { errors: errors });
});

module.exports = router;
