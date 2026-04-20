const express = require('express');
const router = express.Router();
const { requireAdminApi, getAllUsers, empNoExists, createUser, findUser, updateUser, deleteUserByEmpNo } = require('../../lib/functions');

router.use(requireAdminApi);

// GET - 목록
router.get('/', async function(req, res) {
  try {
    var users = await getAllUsers();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: 'DB 오류가 발생했습니다.' });
  }
});

// POST - 추가
router.post('/', async function(req, res) {
  var name     = (req.body.name     || '').trim();
  var empNo    = (req.body.empNo    || '').trim();
  var phone    = (req.body.phone    || '').trim();
  var deptName = (req.body.deptName || '').trim() || null;
  var position = (req.body.position || '').trim() || null;
  var costType = (req.body.costType || '운영').trim();

  if (!name || !empNo || !phone) {
    return res.status(400).json({ error: '이름, 사번, 연락처는 필수입니다.' });
  }
  try {
    if (await empNoExists(empNo)) {
      return res.status(409).json({ error: '이미 존재하는 사번입니다.' });
    }
    await createUser(name, empNo, phone, 'user', empNo, true, deptName, position, costType);
    res.json({ success: true, message: name + ' 사용자가 추가되었습니다. (초기 비밀번호: 사번)' });
  } catch (e) {
    res.status(500).json({ error: '사용자 추가에 실패했습니다.' });
  }
});

// PUT - 수정
router.put('/', async function(req, res) {
  var empNo    = (req.body.empNo    || '').trim();
  var name     = (req.body.name     || '').trim();
  var phone    = (req.body.phone    || '').trim();
  var role     = (req.body.role     || '').trim();
  var deptName = req.body.deptName !== undefined ? (req.body.deptName || '').trim() : undefined;
  var position = req.body.position !== undefined ? (req.body.position || '').trim() : undefined;
  var costType = (req.body.costType || '').trim() || undefined;

  if (!empNo) return res.status(400).json({ error: '사번이 필요합니다.' });
  try {
    if (!await findUser(empNo)) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    await updateUser(empNo, name, phone, role, deptName, position, costType);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '수정에 실패했습니다.' });
  }
});

// DELETE - 삭제
router.delete('/', async function(req, res) {
  var empNo = (req.body.empNo || '').trim();

  if (!empNo) return res.status(400).json({ error: '사번이 필요합니다.' });
  if (empNo === '0000') return res.status(400).json({ error: '관리자 계정은 삭제할 수 없습니다.' });
  try {
    if (!await findUser(empNo)) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    await deleteUserByEmpNo(empNo);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: '삭제에 실패했습니다.' });
  }
});

module.exports = router;
