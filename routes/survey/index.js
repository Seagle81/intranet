const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../lib/functions');

router.get('/', requireAuth, function(req, res) {
  res.render('survey/index', { user: req.session.user });
});

router.get('/result', requireAdmin, function(req, res) {
  res.render('survey/result', { user: req.session.user });
});

module.exports = router;
