// 30 天清理任务：把已注销且超过冷却期的账号，释放其 username 和邮箱（auth-design.md 3.5 节）
//
// 【运维说明 —— 代码之外的依赖，务必记住】
// 本脚本不会自己定时运行，需要在服务器的宝塔面板 → 计划任务里配置为每日执行一次：
//   node src/scripts/purgeDeletedAccounts.js
// 这个配置只存在于服务器上，不在代码仓库里。服务器重装、迁移到新机器时，
// 必须记得手动重新配置这个计划任务，否则注销账号会一直堆积，永远不会被真正清理。
//
// 设计要点：
// - 每个用户独立开一个事务，互不影响，某个用户失败不会导致其他用户也回滚
// - 可重复执行：靠"user_identities 里还有没有这个用户的记录"来判断是否已经处理过
//   （处理完的最后一步就是删除这条记录），而不是靠 username 里有没有 "_deleted_" 这种
//   字符串特征——原用户名本身理论上就可能包含这几个字符，字符串判断不够可靠，
//   直接用"数据本身处理完了没有"更准确
// - 脚本执行完调用 process.exit()，因为它是被计划任务触发的一次性任务，不能一直挂着

require('../config/env');

const pool = require('../lib/db');
const { renameForPurge } = require('../lib/userRepository');

// 只挑出还有 user_identities 记录（说明还没处理过）、状态已注销、且已过冷却期的用户
async function findPendingUsers() {
  const [rows] = await pool.query(
    `SELECT DISTINCT u.id, u.username
     FROM users u
     INNER JOIN user_identities ui ON ui.user_id = u.id
     WHERE u.status = 'deleted' AND u.purge_after <= NOW()`
  );
  return rows;
}

async function purgeOneUser(user) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. 归档当前 username
    await conn.query(
      `INSERT INTO username_history (user_id, username, released_at, locked_forever, created_at)
       VALUES (?, ?, NOW(), 0, NOW())`,
      [user.id, user.username]
    );

    // 2. 改名为 {原名}_deleted_{id}，释放原用户名
    const purgedUsername = `${user.username}_deleted_${user.id}`;
    await renameForPurge(user.id, purgedUsername, conn);

    // 3. 归档登录凭证（邮箱等），reason = account_deleted
    const [identities] = await conn.query('SELECT * FROM user_identities WHERE user_id = ?', [user.id]);
    for (const identity of identities) {
      await conn.query(
        `INSERT INTO identity_history (user_id, type, value, bound_at, removed_at, reason)
         VALUES (?, ?, ?, ?, NOW(), 'account_deleted')`,
        [user.id, identity.type, identity.value, identity.verified_at]
      );
    }

    // 4. 删除当前凭证记录，释放邮箱
    await conn.query('DELETE FROM user_identities WHERE user_id = ?', [user.id]);

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function main() {
  const users = await findPendingUsers();
  console.log(`发现 ${users.length} 个待清理账号`);

  let successCount = 0;
  const failedIds = [];

  for (const user of users) {
    try {
      await purgeOneUser(user);
      successCount += 1;
      console.log(`  [成功] user_id=${user.id} username=${user.username}`);
    } catch (err) {
      failedIds.push(user.id);
      console.error(`  [失败] user_id=${user.id} username=${user.username}：${err.message}`);
    }
  }

  console.log('');
  console.log(`清理完成：成功 ${successCount} 个，失败 ${failedIds.length} 个`);
  if (failedIds.length > 0) {
    console.log(`失败的 userId：${failedIds.join(', ')}`);
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('清理任务异常终止：', err);
    await pool.end();
    process.exit(1);
  });
