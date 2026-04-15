const express = require('express');
const router = express.Router();
const { findUser, checkPassword } = require('../lib/functions');

// 루트 → 로그인 상태에 따라 이동
router.get('/', function(req, res) {
  var user = req.session.user;
  if (!user) return res.redirect('/login');
  if (user.mustChangePw) return res.redirect('/change_password');
  return res.redirect(user.role === 'admin' ? '/admin' : '/main');
});

// 로그인 페이지
router.get('/login', function(req, res) {
  var user = req.session.user;
  if (user) return res.redirect(user.role === 'admin' ? '/admin' : '/main');
  res.render('login', { error: '', empNo: '' });
});

// 로그인 처리
router.post('/login', async function(req, res) {
  var empNo = (req.body.empNo || '').trim();
  var password = req.body.password || '';

  if (!empNo || !password) {
    return res.render('login', { error: '사번과 비밀번호를 입력하세요.', empNo: empNo });
  }

  try {
    var found = await findUser(empNo);
    if (found && await checkPassword(password, found.password)) {
      req.session.regenerate(function(err) {
        req.session.user = {
          empNo: found.empNo,
          name: found.name,
          role: found.role,
          mustChangePw: !!found.mustChangePw
        };
        if (found.mustChangePw) return res.redirect('/change_password');
        return res.redirect(found.role === 'admin' ? '/admin' : '/main');
      });
      return;
    }
    res.render('login', { error: '사번 또는 비밀번호가 올바르지 않습니다.', empNo: empNo });
  } catch (e) {
    res.render('login', { error: 'DB 오류가 발생했습니다.', empNo: empNo });
  }
});

// 로그아웃
router.get('/logout', function(req, res) {
  req.session.destroy(function() {
    res.redirect('/login');
  });
});

module.exports = router;
