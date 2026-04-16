'use strict';

const express = require('express');
const router  = express.Router();
const {
  requireAdminApi,
  getProgList, addProg, deleteProg,
  getProgAuthList, setProgAuth, deleteProgAuth,
  getAllUsers
} = require('../../lib/functions');

// ── 프로그램 마스터 ────────────────────────────────────────────────────────────

// 프로그램 목록 조회
router.get('/progs', requireAdminApi, async function(req, res) {
  try {
    res.json({ success: true, data: await getProgList() });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 프로그램 등록
router.post('/progs', requireAdminApi, async function(req, res) {
  try {
    var { progId, progName } = req.body;
    if (!progId || !progName)
      return res.json({ success: false, message: '프로그램 ID와 프로그램명을 입력하세요.' });
    await addProg(progId.trim(), progName.trim());
    res.json({ success: true, message: '프로그램이 등록되었습니다.' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.json({ success: false, message: '이미 등록된 프로그램 ID입니다.' });
    res.json({ success: false, message: e.message });
  }
});

// 프로그램 삭제 (권한도 함께)
router.delete('/progs/:progId', requireAdminApi, async function(req, res) {
  try {
    await deleteProg(req.params.progId);
    res.json({ success: true, message: '프로그램이 삭제되었습니다.' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ── 사용자 목록 (권한 부여 선택용) ───────────────────────────────────────────

router.get('/users/all', requireAdminApi, async function(req, res) {
  try {
    res.json({ success: true, data: await getAllUsers() });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// ── 프로그램별 권한 ───────────────────────────────────────────────────────────

// 특정 프로그램 권한 목록 조회
router.get('/:progId', requireAdminApi, async function(req, res) {
  try {
    res.json({ success: true, data: await getProgAuthList(req.params.progId) });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 권한 부여/수정
router.post('/', requireAdminApi, async function(req, res) {
  try {
    var { progId, empNo, authLevel } = req.body;
    if (!progId || !empNo || !authLevel)
      return res.json({ success: false, message: '필수 항목이 누락되었습니다.' });
    var level = parseInt(authLevel, 10);
    if (![1, 2, 3].includes(level))
      return res.json({ success: false, message: '권한레벨은 1, 2, 3 중 하나여야 합니다.' });
    await setProgAuth(progId, empNo, level);
    res.json({ success: true, message: '권한이 설정되었습니다.' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 권한 삭제
router.delete('/:progId/:empNo', requireAdminApi, async function(req, res) {
  try {
    await deleteProgAuth(req.params.progId, req.params.empNo);
    res.json({ success: true, message: '권한이 삭제되었습니다.' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

module.exports = router;
