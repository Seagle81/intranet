const express = require('express');
const router = express.Router();
const { requireAdminApi, findUser, updatePassword } = require('../../lib/functions');

router.use(requireAdminApi);

router.post('/', async function(req, res) {
  var empNo = (req.body.empNo || '').trim();

  if (!empNo) return res.status(400).json({ error: '사번이 필요합니다.' });
  try {
    if (!await findUser(empNo)) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    await updatePassword(empNo, empNo, true);
    res.json({ success: true, message: '비밀번호가 사번으로 초기화되었습니다. 다음 로그인 시 비밀번호 변경이 필요합니다.' });
  } catch (e) {
    res.status(500).json({ error: '비밀번호 초기화에 실패했습니다.' });
  }
});

module.exports = router;
