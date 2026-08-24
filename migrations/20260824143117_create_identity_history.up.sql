-- Version: v1.0.0
-- 创建登录凭证变更历史表

CREATE TABLE identity_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(20) NOT NULL,
  value VARCHAR(255) NOT NULL,
  bound_at DATETIME NOT NULL COMMENT '绑定时间',
  removed_at DATETIME NOT NULL COMMENT '解绑时间',
  reason VARCHAR(20) NOT NULL COMMENT 'changed / account_deleted',
  PRIMARY KEY (id),
  KEY idx_user_id (user_id),
  KEY idx_type_value (type, value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='登录凭证变更历史';