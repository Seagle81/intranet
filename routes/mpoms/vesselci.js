'use strict';

const express = require('express');
const router = express.Router();
const db = require('../../config/mpoms_db');
const { requireProgAuth } = require('../../lib/functions');

const PROG_ID = 'prc_vesselci';

// ─── 페이지 ───────────────────────────────────────────────────────────────────

// 조회 권한(1) 이상이면 화면 진입 허용
router.get('/', requireProgAuth(PROG_ID, 1), function(req, res) {
  res.render('mpoms/vesselci', {
    user: req.session.user,
    authLevel: req.authLevel   // 화면에서 버튼 표시 제어에 활용
  });
});

// ─── API ─────────────────────────────────────────────────────────────────────

// 목록 조회 (조회권한 1 이상)
router.get('/api/list', requireProgAuth(PROG_ID, 1), async function(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT vessel_code, vessel_name_eng, country_code,
             line_code, call_sign, gross_tonnage
      FROM t_vessel_c
      ORDER BY vessel_code
    `);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.json({ success: false, message: '조회 오류: ' + e.message });
  }
});

// 단건 조회 (조회권한 1 이상)
router.get('/api/:code', requireProgAuth(PROG_ID, 1), async function(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT vessel_code, vessel_name_eng, vessel_name_kor,
              line_code, country_code, call_sign, ship_type,
              gross_tonnage, dwt, loa, beam, hatch_count,
              horsepower, draft, max_hatch, bay_to,
              row_from, row_to, rowd_from, rowd_to,
              tierh_from, tierh_to, tierd_from, tierd_to,
              crane_count, cntr_bulk_type,
              remark1, remark2, remark3
       FROM t_vessel_c WHERE vessel_code = ?`,
      [req.params.code.toUpperCase()]
    );
    if (rows.length === 0) return res.json({ success: false, message: '자료가 없습니다.' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.json({ success: false, message: '조회 오류: ' + e.message });
  }
});

// LINE코드 조회 (조회권한 1 이상)
router.get('/api/meta/line/:code', requireProgAuth(PROG_ID, 1), async function(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT line_code, line_name FROM t_line_c WHERE line_code = ?',
      [req.params.code.toUpperCase()]
    );
    if (rows.length === 0) return res.json({ success: false, message: 'LINE코드를 확인하십시오.' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 국가코드 조회 (조회권한 1 이상)
router.get('/api/meta/country/:code', requireProgAuth(PROG_ID, 1), async function(req, res) {
  try {
    const [rows] = await db.query(
      'SELECT country_code, country_name FROM t_country_c WHERE country_code = ?',
      [req.params.code.toUpperCase()]
    );
    if (rows.length === 0) return res.json({ success: false, message: '국가코드를 확인 하십시오.' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 등록 (등록/수정 권한 2 이상)
router.post('/api', requireProgAuth(PROG_ID, 2), async function(req, res) {
  try {
    const d = req.body;
    const now = getNow();
    const empNo = req.session.user.empNo;

    if (!d.vessel_code || !d.vessel_code.trim())
      return res.json({ success: false, message: '모선코드를 입력하십시오.' });
    if (!d.vessel_name_eng || !d.vessel_name_eng.trim())
      return res.json({ success: false, message: '모선명을 입력하십시오.' });
    if (!d.call_sign || !d.call_sign.trim())
      return res.json({ success: false, message: '호출부호를 입력하십시오.' });

    await db.query(`
      INSERT INTO t_vessel_c (
        vessel_code, vessel_name_eng, vessel_name_kor,
        line_code, country_code, call_sign, ship_type,
        gross_tonnage, dwt, loa, beam, hatch_count,
        horsepower, draft, max_hatch, bay_to,
        row_from, row_to, rowd_from, rowd_to,
        tierh_from, tierh_to, tierd_from, tierd_to,
        crane_count, cntr_bulk_type,
        remark1, remark2, remark3,
        input_program, input_user, input_datetime
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      buildValues(d, empNo, now)
    );
    res.json({ success: true, message: '등록되었습니다.' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.json({ success: false, message: '이미 등록된 모선코드입니다.' });
    res.json({ success: false, message: '입력오류입니다. ' + e.message });
  }
});

// 수정 (등록/수정 권한 2 이상)
router.put('/api/:code', requireProgAuth(PROG_ID, 2), async function(req, res) {
  try {
    const d = req.body;
    const now = getNow();
    const empNo = req.session.user.empNo;

    if (!d.vessel_name_eng || !d.vessel_name_eng.trim())
      return res.json({ success: false, message: '모선명을 입력하십시오.' });
    if (!d.call_sign || !d.call_sign.trim())
      return res.json({ success: false, message: '호출부호를 입력하십시오.' });

    const [result] = await db.query(`
      UPDATE t_vessel_c SET
        vessel_name_eng=?, vessel_name_kor=?,
        line_code=?, country_code=?, call_sign=?, ship_type=?,
        gross_tonnage=?, dwt=?, loa=?, beam=?, hatch_count=?,
        horsepower=?, draft=?, max_hatch=?, bay_to=?,
        row_from=?, row_to=?, rowd_from=?, rowd_to=?,
        tierh_from=?, tierh_to=?, tierd_from=?, tierd_to=?,
        crane_count=?, cntr_bulk_type=?,
        remark1=?, remark2=?, remark3=?,
        update_program=?, update_user=?, update_datetime=?
      WHERE vessel_code=?`,
      buildUpdateValues(d, empNo, now, req.params.code.toUpperCase())
    );
    if (result.affectedRows === 0)
      return res.json({ success: false, message: '수정할 자료가 없습니다.' });
    res.json({ success: true, message: '수정되었습니다.' });
  } catch (e) {
    res.json({ success: false, message: '수정오류입니다. ' + e.message });
  }
});

// 삭제 (삭제 권한 3 이상)
router.delete('/api/:code', requireProgAuth(PROG_ID, 3), async function(req, res) {
  try {
    const [result] = await db.query(
      'DELETE FROM t_vessel_c WHERE vessel_code = ?',
      [req.params.code.toUpperCase()]
    );
    if (result.affectedRows === 0)
      return res.json({ success: false, message: '삭제할 자료가 없습니다.' });
    res.json({ success: true, message: '삭제되었습니다.' });
  } catch (e) {
    res.json({ success: false, message: '삭제오류입니다. ' + e.message });
  }
});

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function getNow() {
  const d = new Date();
  const pad = (n, len) => String(n).padStart(len || 2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function parseNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function padZ(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v).padStart(2, '0');
}

function buildValues(d, empNo, now) {
  return [
    (d.vessel_code || '').toUpperCase().trim(),
    (d.vessel_name_eng || '').trim(),
    (d.vessel_name_kor || '').trim(),
    (d.line_code || '').toUpperCase().trim(),
    (d.country_code || '').toUpperCase().trim(),
    (d.call_sign || '').trim(),
    (d.ship_type || '').trim(),
    parseNum(d.gross_tonnage), parseNum(d.dwt),
    parseNum(d.loa), parseNum(d.beam),
    parseNum(d.hatch_count), parseNum(d.horsepower), parseNum(d.draft),
    (d.max_hatch || '').trim(), padZ(d.bay_to),
    padZ(d.row_from), padZ(d.row_to), padZ(d.rowd_from), padZ(d.rowd_to),
    padZ(d.tierh_from), padZ(d.tierh_to), padZ(d.tierd_from), padZ(d.tierd_to),
    (d.crane_count || '').trim(), (d.cntr_bulk_type || '').trim(),
    (d.remark1 || '').trim(), (d.remark2 || '').trim(), (d.remark3 || '').trim(),
    PROG_ID, empNo, now
  ];
}

function buildUpdateValues(d, empNo, now, code) {
  return [
    (d.vessel_name_eng || '').trim(),
    (d.vessel_name_kor || '').trim(),
    (d.line_code || '').toUpperCase().trim(),
    (d.country_code || '').toUpperCase().trim(),
    (d.call_sign || '').trim(),
    (d.ship_type || '').trim(),
    parseNum(d.gross_tonnage), parseNum(d.dwt),
    parseNum(d.loa), parseNum(d.beam),
    parseNum(d.hatch_count), parseNum(d.horsepower), parseNum(d.draft),
    (d.max_hatch || '').trim(), padZ(d.bay_to),
    padZ(d.row_from), padZ(d.row_to), padZ(d.rowd_from), padZ(d.rowd_to),
    padZ(d.tierh_from), padZ(d.tierh_to), padZ(d.tierd_from), padZ(d.tierd_to),
    (d.crane_count || '').trim(), (d.cntr_bulk_type || '').trim(),
    (d.remark1 || '').trim(), (d.remark2 || '').trim(), (d.remark3 || '').trim(),
    PROG_ID, empNo, now,
    code
  ];
}

module.exports = router;
