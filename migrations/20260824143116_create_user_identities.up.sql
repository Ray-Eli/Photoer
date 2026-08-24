-- Version: v1.0.0
-- 创建登录凭证表（当前有效）

CREATE TABLE user_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL COMMENT '关联 users.id',
  type VARCHAR(20) NOT NULL COMMENT 'email，v2增加phone',
  value VARCHAR(255) NOT NULL COMMENT '邮箱地址',
  verified_at DATETIME NOT NULL COMMENT '验证时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '绑定时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_type_value (type, value),
  KEY idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='当前有效的登录凭证';