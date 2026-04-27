const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const db = require('../../config/db');
const { requireAdminApi } = require('../../lib/functions');

db.execute(`
  CREATE TABLE IF NOT EXISTS survey (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    meal_date  DATE NOT NULL,
    response   ENUM('good','neutral','bad') NOT NULL,
    created_at DATETIME DEFAULT NOW()
  )
`).catch(function(e) { console.error('survey 테이블 생성 오류:', e.message); });

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
  next();
}

// POST / - 투표
router.post('/', requireLogin, async function(req, res) {
  var response = req.body.response;
  if (!['good', 'neutral', 'bad'].includes(response)) {
    return res.status(400).json({ error: '올바른 응답이 아닙니다.' });
  }
  try {
    await db.execute('INSERT INTO survey (meal_date, response) VALUES (CURDATE(), ?)', [response]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'DB 오류가 발생했습니다.' });
  }
});

// GET /stats - 일별 통계 (관리자)
router.get('/stats', requireAdminApi, async function(req, res) {
  var from = req.query.from || null;
  var to   = req.query.to   || null;
  try {
    var sql = `
      SELECT
        DATE_FORMAT(meal_date, '%Y-%m-%d') AS date,
        SUM(response = 'good')    AS good,
        SUM(response = 'neutral') AS neutral,
        SUM(response = 'bad')     AS bad,
        COUNT(*)                  AS total
      FROM survey
    `;
    var params = [];
    if (from && to)  { sql += ' WHERE meal_date BETWEEN ? AND ?'; params = [from, to]; }
    else if (from)   { sql += ' WHERE meal_date >= ?'; params = [from]; }
    else if (to)     { sql += ' WHERE meal_date <= ?'; params = [to]; }
    sql += ' GROUP BY meal_date ORDER BY meal_date DESC';
    var [rows] = await db.execute(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'DB 오류가 발생했습니다.' });
  }
});

// GET /export - 엑셀 다운로드 (관리자)
router.get('/export', requireAdminApi, async function(req, res) {
  var from = req.query.from || null;
  var to   = req.query.to   || null;
  try {
    var sql = `
      SELECT
        DATE_FORMAT(meal_date, '%Y-%m-%d') AS '날짜',
        SUM(response = 'good')    AS '좋아요(😊)',
        SUM(response = 'neutral') AS '보통이에요(😐)',
        SUM(response = 'bad')     AS '별로에요(😤)',
        COUNT(*)                  AS '총응답수'
      FROM survey
    `;
    var params = [];
    if (from && to)  { sql += ' WHERE meal_date BETWEEN ? AND ?'; params = [from, to]; }
    else if (from)   { sql += ' WHERE meal_date >= ?'; params = [from]; }
    else if (to)     { sql += ' WHERE meal_date <= ?'; params = [to]; }
    sql += ' GROUP BY meal_date ORDER BY meal_date ASC';

    var [rows] = await db.execute(sql, params);
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, '식사만족도');
    var buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    var fname = encodeURIComponent('식사만족도조사' + (from ? '_' + from : '') + (to ? '~' + to : '') + '.xlsx');
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + fname);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Excel 생성에 실패했습니다.' });
  }
});

module.exports = router;
