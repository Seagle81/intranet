const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/functions');

router.get('/main', requireAuth, function(req, res) {
  if (req.session.user.role === 'admin') return res.redirect('/admin');
  res.render('main', { user: req.session.user });
});

module.exports = router;
