'use strict';

const express = require('express');
const router = express.Router();
const { requireProgAuth, requireAdmin } = require('../../lib/functions');
const { getClub } = require('../../lib/clubFunctions');

const auth = requireProgAuth('prc_club', 1);

router.get('/', auth, async function(req, res, next) {
  try {
    res.render('club/list', { user: req.session.user });
  } catch (e) { next(e); }
});

router.get('/found', auth, function(req, res) {
  res.render('club/found', { user: req.session.user });
});

router.get('/report', requireAdmin, function(req, res) {
  res.render('club/report', { user: req.session.user });
});

router.get('/:id', auth, async function(req, res, next) {
  try {
    var club = await getClub(parseInt(req.params.id));
    if (!club) return res.status(404).render('error', { message: '동호회를 찾을 수 없습니다.', user: req.session.user });
    res.render('club/detail', { user: req.session.user, club, authLevel: req.authLevel });
  } catch (e) { next(e); }
});

module.exports = router;
