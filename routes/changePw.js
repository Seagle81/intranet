const express = require('express');
const router = express.Router();
const { requireAuth, findUser, checkPassword, updatePassword } = require('../lib/functions');

router.get('/change_password', requireAuth, function(req, res) {
  res.render('change_password', { user: req.session.user, error: '' });
});

router.post('/change_password', requireAuth, async function(req, res) {
  var user = req.session.user;
  var current = req.body.current || '';
  var newPw   = req.body.newPw   || '';
  var confirm = req.body.confirm || '';

  function render(error) {
    return res.render('change_password', { user: user, error: error });
  }

  if (!current || !newPw || !confirm) return render('모든 항목을 입력하세요.');
  if (newPw !== confirm)             return render('새 비밀번호와 확인이 일치하지 않습니다.');
  if (newPw.length < 4)             return render('비밀번호는 4자 이상이어야 합니다.');
  if (newPw === user.empNo)         return render('사번과 동일한 비밀번호는 사용할 수 없습니다.');

  try {
    var found = await findUser(user.empNo);
    if (!found || !(await checkPassword(current, found.password))) {
      return render('현재 비밀번호가 올바르지 않습니다.');
    }
    await updatePassword(user.empNo, newPw, false);
    req.session.user.mustChangePw = false;
    return res.redirect(user.role === 'admin' ? '/admin' : '/main');
  } catch (e) {
    return render('비밀번호 변경에 실패했습니다.');
  }
});

module.exports = router;
