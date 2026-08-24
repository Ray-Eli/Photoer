-- Version: v1.0.0
-- 创建用户主表

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '内部主键，不对外暴露',
  public_id CHAR(21) NOT NULL COMMENT 'NanoID，对外标识',
  username VARCHAR(50) NOT NULL COMMENT '登录名与URL标识，应用层限制3-20字符',
  nickname VARCHAR(30) NOT NULL COMMENT '显示名，不唯一',
  password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt哈希',
  avatar_path VARCHAR(255) DEFAULT NULL COMMENT 'OSS路径，不含域名',
  status VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT 'active/banned/deleted',
  banned_until DATETIME DEFAULT NULL COMMENT 'NULL表示永久封禁',
  ban_reason VARCHAR(255) DEFAULT NULL COMMENT '封禁原因',
  username_customized TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否改过默认用户名',
  last_active_at DATETIME DEFAULT NULL COMMENT '最后活跃时间',
  deleted_at DATETIME DEFAULT NULL COMMENT '注销时间',
  purge_after DATETIME DEFAULT NULL COMMENT '释放username与邮箱的时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_public_id (public_id),
  UNIQUE KEY uk_username (username),
  KEY idx_status (status),
  KEY idx_purge_after (purge_after)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户主表';