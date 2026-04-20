'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const mpomsPool = require('../config/mpoms_db');
const { createUser } = require('../lib/functions');

router.get('/setup', async function(req, res) {
  var results = [];

  // ── 1. intra DB: users 테이블 ─────────────────────────────────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      name                 VARCHAR(50)  NOT NULL,
      emp_no               VARCHAR(20)  NOT NULL UNIQUE,
      phone                VARCHAR(20)  NOT NULL,
      role                 ENUM('admin','user') NOT NULL DEFAULT 'user',
      password             VARCHAR(255) NOT NULL,
      must_change_password TINYINT(1)   NOT NULL DEFAULT 1,
      created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8`);
    results.push({ ok: true, msg: '[intra] users 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[intra] users 테이블 생성 실패: ' + e.message });
  }

  // must_change_password 컬럼 누락 보정
  try {
    var [cols] = await pool.query("SHOW COLUMNS FROM users LIKE 'must_change_password'");
    if (!cols.length) {
      await pool.query("ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 1");
      await pool.query("UPDATE users SET must_change_password = 0 WHERE role = 'admin'");
      results.push({ ok: true, msg: '[intra] must_change_password 컬럼 추가 완료' });
    }
  } catch (e) {
    results.push({ ok: false, msg: '[intra] 컬럼 추가 실패: ' + e.message });
  }

  // 기본 관리자 계정 생성
  try {
    var [check] = await pool.query("SELECT id FROM users WHERE emp_no = '0000' LIMIT 1");
    if (!check.length) {
      await createUser('관리자', '0000', '000-0000-0000', 'admin', '0000', false);
      results.push({ ok: true, msg: '[intra] 관리자 계정(0000) 생성 완료' });
    } else {
      results.push({ ok: true, msg: '[intra] 관리자 계정 이미 존재' });
    }
  } catch (e) {
    results.push({ ok: false, msg: '[intra] 관리자 계정 생성 실패: ' + e.message });
  }

  // ── 2. intra DB: 프로그램 권한 테이블 ────────────────────────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS t_prog_auth (
      id          INT           NOT NULL AUTO_INCREMENT,
      prog_id     VARCHAR(30)   NOT NULL COMMENT '프로그램 ID',
      emp_no      VARCHAR(20)   NOT NULL COMMENT '사번',
      auth_level  TINYINT       NOT NULL DEFAULT 1 COMMENT '1=조회, 2=등록/수정, 3=삭제포함',
      reg_date    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_prog_emp (prog_id, emp_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='프로그램별 사용자 권한'`);
    results.push({ ok: true, msg: '[intra] t_prog_auth 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[intra] t_prog_auth 테이블 생성 실패: ' + e.message });
  }

  // ── 3. intra DB: 프로그램 마스터 테이블 ──────────────────────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS t_prog (
      prog_id    VARCHAR(30)   NOT NULL COMMENT '프로그램 ID (PK)',
      prog_name  VARCHAR(100)  NOT NULL COMMENT '프로그램명',
      reg_date   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (prog_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='프로그램 마스터'`);
    results.push({ ok: true, msg: '[intra] t_prog 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[intra] t_prog 테이블 생성 실패: ' + e.message });
  }

  // ── 4. intra DB: users 추가 컬럼 (동호회 기능) ───────────────────────────
  var userCols = [
    { col: 'dept_name', ddl: "ALTER TABLE users ADD COLUMN dept_name VARCHAR(50) DEFAULT NULL AFTER phone" },
    { col: 'position',  ddl: "ALTER TABLE users ADD COLUMN position  VARCHAR(20) DEFAULT NULL AFTER dept_name" },
    { col: 'cost_type', ddl: "ALTER TABLE users ADD COLUMN cost_type ENUM('운영','판관','자동차','운송') NOT NULL DEFAULT '운영' AFTER position" },
  ];
  for (var uc of userCols) {
    try {
      var [ucols] = await pool.query('SHOW COLUMNS FROM users LIKE ?', [uc.col]);
      if (!ucols.length) {
        await pool.query(uc.ddl);
        results.push({ ok: true, msg: '[intra] users.' + uc.col + ' 컬럼 추가 완료' });
      } else {
        results.push({ ok: true, msg: '[intra] users.' + uc.col + ' 이미 존재' });
      }
    } catch (e) {
      results.push({ ok: false, msg: '[intra] users.' + uc.col + ' 추가 실패: ' + e.message });
    }
  }

  // ── 5. intra DB: 동호회 마스터 ───────────────────────────────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS t_club (
      id               INT          AUTO_INCREMENT PRIMARY KEY,
      club_name        VARCHAR(50)  NOT NULL UNIQUE COMMENT '동호회명',
      description      TEXT                          COMMENT '설명',
      rules_file       VARCHAR(255) DEFAULT NULL     COMMENT '회칙 파일경로',
      status           ENUM('pending','active','disbanded') NOT NULL DEFAULT 'pending',
      president_emp_no VARCHAR(20)  DEFAULT NULL     COMMENT '회장 사번',
      secretary_emp_no VARCHAR(20)  DEFAULT NULL     COMMENT '총무 사번',
      found_apply_id   INT          DEFAULT NULL     COMMENT '개설신청 ID',
      found_date       DATE         DEFAULT NULL     COMMENT '개설일',
      reg_date         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='동호회'`);
    results.push({ ok: true, msg: '[intra] t_club 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[intra] t_club 테이블 생성 실패: ' + e.message });
  }

  // ── 6. intra DB: 동호회 회원 ─────────────────────────────────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS t_club_member (
      id            INT         AUTO_INCREMENT PRIMARY KEY,
      club_id       INT         NOT NULL COMMENT '동호회 ID',
      emp_no        VARCHAR(20) NOT NULL COMMENT '사번',
      role          ENUM('member','secretary','president') NOT NULL DEFAULT 'member',
      join_date     DATE        NOT NULL COMMENT '가입일',
      support_month VARCHAR(6)  DEFAULT NULL COMMENT '지원금 대상월 YYYYMM',
      support_paid  TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '지원금 지급 여부',
      leave_date    DATE        DEFAULT NULL COMMENT '탈퇴일',
      status        ENUM('active','left') NOT NULL DEFAULT 'active',
      UNIQUE KEY uq_club_emp (club_id, emp_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='동호회 회원'`);
    results.push({ ok: true, msg: '[intra] t_club_member 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[intra] t_club_member 테이블 생성 실패: ' + e.message });
  }

  // ── 7. intra DB: 동호회 가입 신청 ────────────────────────────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS t_club_join_apply (
      id              INT         AUTO_INCREMENT PRIMARY KEY,
      club_id         INT         NOT NULL COMMENT '동호회 ID',
      emp_no          VARCHAR(20) NOT NULL COMMENT '신청 사번',
      apply_date      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      processed_by    VARCHAR(20) DEFAULT NULL COMMENT '처리자 사번',
      processed_date  DATETIME    DEFAULT NULL,
      reject_reason   VARCHAR(200) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='동호회 가입 신청'`);
    results.push({ ok: true, msg: '[intra] t_club_join_apply 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[intra] t_club_join_apply 테이블 생성 실패: ' + e.message });
  }

  // ── 8. intra DB: 동호회 개설 신청 ────────────────────────────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS t_club_found_apply (
      id               INT         AUTO_INCREMENT PRIMARY KEY,
      club_name        VARCHAR(50) NOT NULL COMMENT '신청 동호회명',
      description      TEXT                 COMMENT '설명',
      rules_file       VARCHAR(255) DEFAULT NULL COMMENT '회칙 파일경로',
      applicant_emp_no VARCHAR(20) NOT NULL COMMENT '신청자 사번',
      status           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      processed_by     VARCHAR(20) DEFAULT NULL COMMENT '처리자 사번',
      processed_date   DATETIME    DEFAULT NULL,
      reject_reason    VARCHAR(200) DEFAULT NULL,
      reg_date         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='동호회 개설 신청'`);
    results.push({ ok: true, msg: '[intra] t_club_found_apply 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[intra] t_club_found_apply 테이블 생성 실패: ' + e.message });
  }

  // ── 9. intra DB: 동호회 개설 발기인 ──────────────────────────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS t_club_found_member (
      id              INT         AUTO_INCREMENT PRIMARY KEY,
      found_apply_id  INT         NOT NULL COMMENT '개설신청 ID',
      emp_no          VARCHAR(20) NOT NULL COMMENT '발기인 사번'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='동호회 개설 발기인'`);
    results.push({ ok: true, msg: '[intra] t_club_found_member 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[intra] t_club_found_member 테이블 생성 실패: ' + e.message });
  }

  // ── 10. intra DB: 동호회 공지사항 ────────────────────────────────────────
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS t_club_notice (
      id        INT          AUTO_INCREMENT PRIMARY KEY,
      club_id   INT          NOT NULL COMMENT '동호회 ID',
      title     VARCHAR(100) NOT NULL COMMENT '제목',
      content   TEXT                  COMMENT '내용',
      emp_no    VARCHAR(20)  NOT NULL COMMENT '작성자 사번',
      reg_date  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='동호회 공지사항'`);
    results.push({ ok: true, msg: '[intra] t_club_notice 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[intra] t_club_notice 테이블 생성 실패: ' + e.message });
  }

  // ── 11. mpoms DB: 모선코드 테이블 ────────────────────────────────────────
  try {
    await mpomsPool.query(`CREATE TABLE IF NOT EXISTS t_vessel_c (
      vessel_code      VARCHAR(4)    NOT NULL        COMMENT '모선코드 (PK)',
      vessel_name_eng  VARCHAR(100)  NOT NULL        COMMENT '모선명(영문)',
      vessel_name_kor  VARCHAR(100)  DEFAULT NULL    COMMENT '모선명(한글)',
      line_code        VARCHAR(3)    DEFAULT NULL    COMMENT 'LINE코드',
      country_code     VARCHAR(2)    DEFAULT NULL    COMMENT '국가코드',
      call_sign        VARCHAR(20)   DEFAULT NULL    COMMENT '호출부호',
      ship_type        VARCHAR(20)   DEFAULT NULL    COMMENT '선박유형',
      gross_tonnage    DECIMAL(12,0) DEFAULT NULL    COMMENT '총톤수',
      dwt              DECIMAL(12,0) DEFAULT NULL    COMMENT '재화중량톤',
      loa              DECIMAL(8,1)  DEFAULT NULL    COMMENT '전장(LOA)',
      beam             DECIMAL(8,1)  DEFAULT NULL    COMMENT '전폭',
      hatch_count      DECIMAL(8,0)  DEFAULT NULL    COMMENT '창구개수',
      horsepower       DECIMAL(10,1) DEFAULT NULL    COMMENT '일공마력수',
      draft            DECIMAL(6,1)  DEFAULT NULL    COMMENT '흘수기준',
      max_hatch        VARCHAR(5)    DEFAULT NULL    COMMENT '화물 MAX HATCH',
      bay_to           VARCHAR(3)    DEFAULT NULL    COMMENT '화물 MAX BAY',
      row_from         VARCHAR(3)    DEFAULT NULL    COMMENT '화물 ROW FROM',
      row_to           VARCHAR(3)    DEFAULT NULL    COMMENT '화물 ROW TO',
      rowd_from        VARCHAR(3)    DEFAULT NULL    COMMENT '화물 ROW DECK FROM',
      rowd_to          VARCHAR(3)    DEFAULT NULL    COMMENT '화물 ROW DECK TO',
      tierh_from       VARCHAR(3)    DEFAULT NULL    COMMENT 'TIER HOLD FROM',
      tierh_to         VARCHAR(3)    DEFAULT NULL    COMMENT 'TIER HOLD TO',
      tierd_from       VARCHAR(3)    DEFAULT NULL    COMMENT 'TIER DECK FROM',
      tierd_to         VARCHAR(3)    DEFAULT NULL    COMMENT 'TIER DECK TO',
      crane_count      VARCHAR(5)    DEFAULT NULL    COMMENT 'CRANE 수',
      cntr_bulk_type   VARCHAR(1)    DEFAULT NULL    COMMENT 'CNTR/BULK 구분',
      remark1          VARCHAR(100)  DEFAULT NULL,
      remark2          VARCHAR(100)  DEFAULT NULL,
      remark3          VARCHAR(100)  DEFAULT NULL,
      input_program    VARCHAR(30)   DEFAULT NULL,
      input_user       VARCHAR(20)   DEFAULT NULL,
      input_datetime   VARCHAR(12)   DEFAULT NULL,
      update_program   VARCHAR(30)   DEFAULT NULL,
      update_user      VARCHAR(20)   DEFAULT NULL,
      update_datetime  VARCHAR(12)   DEFAULT NULL,
      PRIMARY KEY (vessel_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='모선코드 마스터'`);
    results.push({ ok: true, msg: '[mpoms] t_vessel_c 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[mpoms] t_vessel_c 테이블 생성 실패: ' + e.message });
  }

  // ── 12. mpoms DB: LINE코드 테이블 ────────────────────────────────────────
  try {
    await mpomsPool.query(`CREATE TABLE IF NOT EXISTS t_line_c (
      line_code  VARCHAR(3)   NOT NULL  COMMENT 'LINE코드 (PK)',
      line_name  VARCHAR(50)  DEFAULT NULL COMMENT 'LINE명',
      PRIMARY KEY (line_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='LINE코드 마스터'`);
    results.push({ ok: true, msg: '[mpoms] t_line_c 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[mpoms] t_line_c 테이블 생성 실패: ' + e.message });
  }

  // ── 13. mpoms DB: 국가코드 테이블 ────────────────────────────────────────
  try {
    await mpomsPool.query(`CREATE TABLE IF NOT EXISTS t_country_c (
      country_code  VARCHAR(2)   NOT NULL  COMMENT '국가코드 (PK)',
      country_name  VARCHAR(50)  DEFAULT NULL COMMENT '국가명',
      PRIMARY KEY (country_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='국가코드 마스터'`);
    results.push({ ok: true, msg: '[mpoms] t_country_c 테이블 준비 완료' });
  } catch (e) {
    results.push({ ok: false, msg: '[mpoms] t_country_c 테이블 생성 실패: ' + e.message });
  }

  var hasError = results.some(r => !r.ok);
  res.render('setup', { results, hasError });
});

module.exports = router;
