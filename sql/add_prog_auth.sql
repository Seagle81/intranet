-- ============================================================
-- 프로그램별 사용자 권한 테이블
-- ============================================================
-- auth_level:
--   1 = 조회만 가능
--   2 = 조회 + 등록/수정 가능
--   3 = 조회 + 등록/수정 + 삭제 가능 (관리자급)
-- ============================================================
CREATE TABLE IF NOT EXISTS `t_prog_auth` (
  `id`          INT           NOT NULL AUTO_INCREMENT,
  `prog_id`     VARCHAR(30)   NOT NULL  COMMENT '프로그램 ID (ex: prc_vesselci)',
  `emp_no`      VARCHAR(20)   NOT NULL  COMMENT '사번 (users.emp_no 참조)',
  `auth_level`  TINYINT       NOT NULL DEFAULT 1 COMMENT '권한레벨: 1=조회, 2=등록/수정, 3=삭제포함',
  `reg_date`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '등록일시',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prog_emp` (`prog_id`, `emp_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='프로그램별 사용자 권한';

-- 예시 데이터 (admin 계정에 모든 권한 부여)
-- INSERT INTO t_prog_auth (prog_id, emp_no, auth_level) VALUES ('prc_vesselci', '0001', 3);
