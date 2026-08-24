-- Version: v1.0.0
-- 创建用户名变更历史表，同时承担冷却期判断

CREATE TABLE username_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL COMMENT '曾使用此名的用户',
  username VARCHAR(20) NOT NULL COMMENT '历史用户名',
  released_at DATETIME NOT NULL COMMENT '释放时间',
  locked_forever TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否永久锁定',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_username (username),
  KEY idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户名变更历史';