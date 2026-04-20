'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { requireProgAuth, requireAdminApi } = require('../../lib/functions');
const cf = require('../../lib/clubFunctions');

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, '../../public/uploads/club'));
  },
  filename: function(req, file, cb) {
    var ext = path.extname(file.originalname);
    cb(null, Date.now() + '_' + req.session.user.empNo + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('PDF 파일만 업로드 가능합니다.'));
  }
});

const auth = requireProgAuth('prc_club', 1);
const auth2 = requireProgAuth('prc_club', 2);

// ── 관리자 직접 등록 ──────────────────────────────────────────────────────────

router.post('/admin/create', requireAdminApi, async function(req, res) {
  try {
    var { club_name, description, found_date } = req.body;
    var members = req.body.members || [];
    if (typeof members === 'string') { try { members = JSON.parse(members); } catch(e) { members = []; } }

    if (!club_name) return res.json({ success: false, message: '동호회명을 입력하세요.' });
    if (!members.length) return res.json({ success: false, message: '회원을 1명 이상 추가하세요.' });
    if (!members.some(function(m) { return m.role === 'president'; }))
      return res.json({ success: false, message: '회장(역할)을 지정하세요.' });

    var clubId = await cf.adminCreateClub(club_name.trim(), description || '', found_date || null, members);
    res.json({ success: true, message: '동호회가 등록되었습니다.', clubId });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ── 목록/정보 ────────────────────────────────────────────────────────────────

router.get('/list', auth, async function(req, res) {
  try {
    res.json({ success: true, data: await cf.getClubList() });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.get('/found/pending', requireAdminApi, async function(req, res) {
  try {
    res.json({ success: true, data: await cf.getFoundApplyList() });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.get('/admin/report', requireAdminApi, async function(req, res) {
  try {
    res.json({ success: true, data: await cf.getClubReport() });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.get('/my/memberships', auth, async function(req, res) {
  try {
    res.json({ success: true, data: await cf.getMyMemberships(req.session.user.empNo) });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ── 개설 신청 ────────────────────────────────────────────────────────────────

router.post('/found', auth, upload.single('rules_file'), async function(req, res) {
  try {
    var { club_name, description } = req.body;
    var founders = req.body['founders[]'] || req.body.founders || [];
    if (typeof founders === 'string') founders = [founders];
    founders = founders.map(function(e) { return e.trim(); }).filter(Boolean);

    if (!club_name) return res.json({ success: false, message: '동호회명을 입력하세요.' });
    if (founders.length < 4) return res.json({ success: false, message: '발기인 4명을 모두 입력하세요.' });

    var rulesFile = req.file ? '/uploads/club/' + req.file.filename : null;
    await cf.submitFoundApply(club_name.trim(), description || '', rulesFile, req.session.user.empNo, founders);
    res.json({ success: true, message: '개설 신청이 접수되었습니다. 관리자 승인 후 동호회가 개설됩니다.' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/found/:id/approve', requireAdminApi, async function(req, res) {
  try {
    var clubId = await cf.approveFoundApply(parseInt(req.params.id), req.session.user.empNo);
    res.json({ success: true, message: '개설 신청이 승인되었습니다.', clubId });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/found/:id/reject', requireAdminApi, async function(req, res) {
  try {
    var { reason } = req.body;
    if (!reason) return res.json({ success: false, message: '반려 사유를 입력하세요.' });
    await cf.rejectFoundApply(parseInt(req.params.id), req.session.user.empNo, reason);
    res.json({ success: true, message: '개설 신청이 반려되었습니다.' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ── 가입 신청 ────────────────────────────────────────────────────────────────

router.post('/join', auth, async function(req, res) {
  try {
    var clubId = parseInt(req.body.clubId);
    if (!clubId) return res.json({ success: false, message: '동호회 ID가 필요합니다.' });
    await cf.submitJoinApply(clubId, req.session.user.empNo);
    res.json({ success: true, message: '가입 신청이 접수되었습니다. 회장 승인 후 가입됩니다.' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/join/:id/approve', auth, async function(req, res) {
  try {
    await cf.approveJoinApply(parseInt(req.params.id), req.session.user.empNo);
    res.json({ success: true, message: '가입이 승인되었습니다.' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

router.post('/join/:id/reject', auth, async function(req, res) {
  try {
    var { reason } = req.body;
    await cf.rejectJoinApply(parseInt(req.params.id), req.session.user.empNo, reason || '');
    res.json({ success: true, message: '가입 신청이 반려되었습니다.' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ── 탈퇴 ─────────────────────────────────────────────────────────────────────

router.post('/leave', auth, async function(req, res) {
  try {
    var clubId = parseInt(req.body.clubId);
    if (!clubId) return res.json({ success: false, message: '동호회 ID가 필요합니다.' });
    await cf.leaveClub(clubId, req.session.user.empNo);
    res.json({ success: true, message: '탈퇴가 처리되었습니다.' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ── 공지사항 등록 ─────────────────────────────────────────────────────────────

router.post('/:id/notice', auth2, async function(req, res) {
  try {
    var { title, content } = req.body;
    if (!title) return res.json({ success: false, message: '제목을 입력하세요.' });
    await cf.addNotice(parseInt(req.params.id), req.session.user.empNo, title, content || '');
    res.json({ success: true, message: '공지사항이 등록되었습니다.' });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ── 가입 신청 목록 (회장/총무/관리자) ────────────────────────────────────────

router.get('/:id/join/pending', auth, async function(req, res) {
  try {
    var clubId = parseInt(req.params.id);
    var empNo = req.session.user.empNo;
    if (req.session.user.role !== 'admin') {
      var dbPool = require('../../config/db');
      var [rows] = await dbPool.query(
        "SELECT id FROM t_club_member WHERE club_id = ? AND emp_no = ? AND role IN ('president','secretary') AND status = 'active'",
        [clubId, empNo]
      );
      if (!rows.length) return res.json({ success: false, message: '권한이 없습니다.' });
    }
    res.json({ success: true, data: await cf.getJoinApplyList(clubId) });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

// ── 사번으로 이름 조회 (개설 신청 폼용) ──────────────────────────────────────

router.get('/user/:empNo', auth, async function(req, res) {
  try {
    var dbPool = require('../../config/db');
    var [rows] = await dbPool.query('SELECT name FROM users WHERE emp_no = ? LIMIT 1', [req.params.empNo]);
    if (!rows.length) return res.json({ found: false });
    res.json({ found: true, name: rows[0].name });
  } catch (e) {
    res.json({ found: false });
  }
});

// ── 동호회 상세 ───────────────────────────────────────────────────────────────

router.get('/:id', auth, async function(req, res) {
  try {
    var clubId = parseInt(req.params.id);
    var [club, members, notices] = await Promise.all([
      cf.getClub(clubId),
      cf.getClubMembers(clubId),
      cf.getClubNotices(clubId),
    ]);
    if (!club) return res.json({ success: false, message: '동호회를 찾을 수 없습니다.' });
    res.json({ success: true, data: { club, members, notices } });
  } catch (e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;
