const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../lib/functions');

router.get('/prog_auth', requireAdmin, function(req, res) {
  res.render('progAuth', { user: req.session.user });
});

module.exports = router;
