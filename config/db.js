const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: '10.55.9.3',
  user: 'intra',
  password: 'qnenrkdb_intra',
  database: 'intra',
  charset: 'utf8',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;
