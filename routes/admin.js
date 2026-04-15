const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../lib/functions');

router.get('/admin', requireAdmin, function(req, res) {
  res.render('admin', { user: req.session.user });
});

module.exports = router;
