const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: 'intranet_secret_key_please_change',
  resave: false,
  saveUninitialized: false,
  name: 'intranet_session',
  cookie: { httpOnly: true }
}));

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/admin'));
app.use('/', require('./routes/main'));
app.use('/', require('./routes/setup'));
app.use('/', require('./routes/changePw'));
app.use('/api/users', require('./routes/api/users'));
app.use('/api/reset_password', require('./routes/api/resetPw'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('서버 실행 중: http://localhost:' + PORT);
});
