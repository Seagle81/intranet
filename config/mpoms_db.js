const mysql = require('mysql2/promise');

// mpoms DB 설정 - 실제 환경에 맞게 수정
const pool = mysql.createPool({
  host: '10.55.9.3',
  port: 3306,
  user: 'intra',
  password: 'qnenrkdb_intra',
  database: 'intra',
  charset: 'utf8mb4',
  timezone: '+09:00',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;
