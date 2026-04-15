'use strict';

const express = require('express');
const router = express.Router();
const { requireAdminApi, getProgAuthList, setProgAuth, deleteProgAuth, getAllUsers } = require('../../lib/functions');

// 특정 프로그램의 권한 목록 조회 (admin 전용)
router.get('/:progId', requireAdminApi, async function(req, res) {
  try {
    const list = await getProgAuthList(req.params.progId);
    res.json({ success: true, data: list });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 권한 부여/수정 (admin 전용)
router.post('/', requireAdminApi, async function(req, res) {
  try {
    const { progId, empNo, authLevel } = req.body;
    if (!progId || !empNo || !authLevel)
      return res.json({ success: false, message: '필수 항목이 누락되었습니다.' });
    const level = parseInt(authLevel, 10);
    if (![1, 2, 3].includes(level))
      return res.json({ success: false, message: '권한레벨은 1, 2, 3 중 하나여야 합니다.' });
    await setProgAuth(progId, empNo, level);
    res.json({ success: true, message: '권한이 설정되었습니다.' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 권한 삭제 (admin 전용)
router.delete('/:progId/:empNo', requireAdminApi, async function(req, res) {
  try {
    await deleteProgAuth(req.params.progId, req.params.empNo);
    res.json({ success: true, message: '권한이 삭제되었습니다.' });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

// 전체 사용자 목록 (권한 부여 시 선택용, admin 전용)
router.get('/users/all', requireAdminApi, async function(req, res) {
  try {
    const list = await getAllUsers();
    res.json({ success: true, data: list });
  } catch (e) {
    res.json({ success: false, message: e.message });
  }
});

module.exports = router;
