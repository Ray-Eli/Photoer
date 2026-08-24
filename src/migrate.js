const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({
  path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env'
});

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

// 建立数据库连接（不用连接池，脚本执行完就退出）
async function connect() {
  return mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,  // 允许一个文件里有多条 SQL
  });
}

// 确保记录表存在
async function ensureMigrationTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at DATETIME NOT NULL,
      execution_time INT UNSIGNED NOT NULL COMMENT '耗时毫秒'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// 读取所有 up 文件，按文件名排序
function getAllMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.up.sql'))
    .map(f => f.replace('.up.sql', ''))
    .sort();
}

// 查询已执行的 migration
async function getExecuted(conn) {
  const [rows] = await conn.query(
    'SELECT filename FROM schema_migrations ORDER BY filename'
  );
  return rows.map(r => r.filename);
}

// 执行迁移
async function migrate() {
  const conn = await connect();
  try {
    await ensureMigrationTable(conn);

    const all = getAllMigrations();
    const executed = await getExecuted(conn);
    const pending = all.filter(name => !executed.includes(name));

    if (pending.length === 0) {
      console.log('没有待执行的迁移，数据库已是最新状态');
      return;
    }

    console.log(`发现 ${pending.length} 个待执行的迁移：`);
    pending.forEach(name => console.log(`  - ${name}`));
    console.log('');

    for (const name of pending) {
      const filePath = path.join(MIGRATIONS_DIR, `${name}.up.sql`);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`执行 ${name} ...`);
      const start = Date.now();

      try {
        await conn.beginTransaction();
        await conn.query(sql);
        await conn.query(
          'INSERT INTO schema_migrations (filename, executed_at, execution_time) VALUES (?, NOW(), ?)',
          [name, Date.now() - start]
        );
        await conn.commit();
        console.log(`  完成，耗时 ${Date.now() - start}ms\n`);
      } catch (err) {
        await conn.rollback();
        console.error(`  失败：${err.message}\n`);
        console.error('迁移中断，请修复后重试');
        process.exit(1);
      }
    }

    console.log('所有迁移执行完毕');
  } finally {
    await conn.end();
  }
}

// 回滚最后一个
async function rollback() {
  const conn = await connect();
  try {
    await ensureMigrationTable(conn);

    const [rows] = await conn.query(
      'SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1'
    );

    if (rows.length === 0) {
      console.log('没有可回滚的迁移');
      return;
    }

    const name = rows[0].filename;
    const filePath = path.join(MIGRATIONS_DIR, `${name}.down.sql`);

    if (!fs.existsSync(filePath)) {
      console.error(`找不到回滚文件：${name}.down.sql`);
      process.exit(1);
    }

    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`回滚 ${name} ...`);

    try {
      await conn.beginTransaction();
      await conn.query(sql);
      await conn.query('DELETE FROM schema_migrations WHERE filename = ?', [name]);
      await conn.commit();
      console.log('回滚完成');
    } catch (err) {
      await conn.rollback();
      console.error(`回滚失败：${err.message}`);
      process.exit(1);
    }
  } finally {
    await conn.end();
  }
}

// 查看状态
async function status() {
  const conn = await connect();
  try {
    await ensureMigrationTable(conn);

    const all = getAllMigrations();
    const executed = await getExecuted(conn);

    console.log(`数据库：${process.env.DB_NAME}`);
    console.log(`环境：${process.env.NODE_ENV || 'development'}\n`);

    if (all.length === 0) {
      console.log('还没有任何迁移文件');
      return;
    }

    all.forEach(name => {
      const mark = executed.includes(name) ? '[已执行]' : '[待执行]';
      console.log(`${mark} ${name}`);
    });

    const pending = all.filter(n => !executed.includes(n)).length;
    console.log(`\n共 ${all.length} 个，待执行 ${pending} 个`);
  } finally {
    await conn.end();
  }
}

// 根据命令行参数决定执行什么
const command = process.argv[2];

if (command === 'rollback') {
  rollback();
} else if (command === 'status') {
  status();
} else {
  migrate();
}