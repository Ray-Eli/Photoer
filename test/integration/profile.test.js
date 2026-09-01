// GET /api/auth/username/check   用户名可用性检查（供前端实时提示）
// PUT /api/auth/username         改用户名（冷却期/占用判断 + 滚动 365 天 2 次频率限制）
// PUT /api/auth/nickname         改昵称（滚动 14 天 2 次频率限制）
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const pool = require('../../src/lib/db');
const { useCleanState } = require('../helpers/harness');
const { loggedInUser, createUser } = require('../helpers/factory');

useCleanState();

describe('GET /api/auth/username/check', () => {
  test('未登录 -> 401', async () => {
    assert.equal((await request(app).get('/api/auth/username/check?username=foo')).status, 401);
  });

  test('全新的合法用户名 -> available: true', async () => {
    const me = await loggedInUser();
    const res = await request(app).get('/api/auth/username/check?username=brandnew01').set('Cookie', me.cookie);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { available: true });
  });

  test('与当前用户名相同（含大小写不敏感）-> available:false, reason:current', async () => {
    const me = await loggedInUser({ username: 'currentname' });
    const same = await request(app).get('/api/auth/username/check?username=currentname').set('Cookie', me.cookie);
    assert.deepEqual(same.body, { available: false, reason: 'current' });
    const cased = await request(app).get('/api/auth/username/check?username=CurrentName').set('Cookie', me.cookie);
    assert.deepEqual(cased.body, { available: false, reason: 'current' });
  });

  test('已被他人占用 -> available:false, reason:taken', async () => {
    await createUser({ username: 'occupied01' });
    const me = await loggedInUser();
    const res = await request(app).get('/api/auth/username/check?username=occupied01').set('Cookie', me.cookie);
    assert.deepEqual(res.body, { available: false, reason: 'taken' });
  });

  test('90 天冷却期内被他人释放的名字 -> reason:taken', async () => {
    const me = await loggedInUser();
    const other = await createUser({ username: 'user_o1' });
    await pool.query(
      `INSERT INTO username_history (user_id, username, released_at, locked_forever, created_at)
       VALUES (?, 'cooldownname', DATE_SUB(NOW(), INTERVAL 5 DAY), 0, DATE_SUB(NOW(), INTERVAL 5 DAY))`,
      [other.userId]
    );
    const res = await request(app).get('/api/auth/username/check?username=cooldownname').set('Cookie', me.cookie);
    assert.deepEqual(res.body, { available: false, reason: 'taken' });
  });

  test('格式不合法 / 保留词 -> available:false, reason:invalid', async () => {
    const me = await loggedInUser();
    for (const bad of ['ab', '123456', 'a-b', 'admin']) {
      const res = await request(app).get(`/api/auth/username/check?username=${bad}`).set('Cookie', me.cookie);
      assert.deepEqual(res.body, { available: false, reason: 'invalid' }, `${bad}`);
    }
  });

  test('限流：同 IP 1 分钟内超过 20 次 -> 429', async () => {
    const me = await loggedInUser();
    let got429 = false;
    for (let i = 0; i < 25; i++) {
      const r = await request(app).get(`/api/auth/username/check?username=name${i}abc`).set('Cookie', me.cookie);
      if (r.status === 429) { got429 = true; break; }
    }
    assert.ok(got429, '连续检查应在某次触发 429');
  });
});

describe('PUT /api/auth/username', () => {
  test('未登录 -> 401', async () => {
    assert.equal((await request(app).put('/api/auth/username').send({ username: 'whatever' })).status, 401);
  });

  test('提交与当前完全相同的用户名 -> 200 未做修改，不消耗次数、不写历史', async () => {
    const me = await loggedInUser({ username: 'user_keep01' });

    const noop = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'user_keep01' });
    assert.equal(noop.status, 200);
    assert.match(noop.body.message, /未做修改|一致/);
    assert.equal(noop.body.username, 'user_keep01');

    // 没有写 username_history
    const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM username_history WHERE user_id = ?', [me.userId]);
    assert.equal(n, 0);

    // 没消耗次数：之后还能正常改满 2 次
    const r1 = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'realchange1' });
    const r2 = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'realchange2' });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
  });

  test('大小写不同但视为相同 -> 同样是未做修改', async () => {
    const me = await loggedInUser({ username: 'MixedCase1' });
    const res = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'mixedcase1' });
    assert.equal(res.status, 200);
    assert.match(res.body.message, /未做修改|一致/);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM username_history WHERE user_id = ?', [me.userId]);
    assert.equal(n, 0);
  });

  test('合法且可用 -> 200，users.username 更新，写一条 username_history', async () => {
    const me = await loggedInUser({ username: 'user_aaa111' });
    const res = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'freshname' });
    assert.equal(res.status, 200);
    assert.equal(res.body.username, 'freshname');

    const [[u]] = await pool.query('SELECT username, username_customized FROM users WHERE id = ?', [me.userId]);
    assert.equal(u.username, 'freshname');
    assert.equal(u.username_customized, 1);
    const [[h]] = await pool.query('SELECT username FROM username_history WHERE user_id = ?', [me.userId]);
    assert.equal(h.username, 'user_aaa111', '旧用户名进历史表');
  });

  test('格式非法（保留字 / 纯数字 / 太短）-> 400', async () => {
    const me = await loggedInUser();
    for (const bad of ['admin', '123456', 'ab']) {
      const res = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: bad });
      assert.equal(res.status, 400, `${bad} 应被拒`);
    }
  });

  test('目标用户名已被他人占用 -> 400 不可用', async () => {
    await createUser({ username: 'takenname' });
    const me = await loggedInUser();
    const res = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'takenname' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /不可用/);
  });

  test('90 天冷却期内被他人释放的名字，别人不可用', async () => {
    const me = await loggedInUser();
    // 另一个用户曾用过 hotname，5 天前释放
    const other = await createUser({ username: 'user_other1' });
    await pool.query(
      `INSERT INTO username_history (user_id, username, released_at, locked_forever, created_at)
       VALUES (?, 'hotname', DATE_SUB(NOW(), INTERVAL 5 DAY), 0, DATE_SUB(NOW(), INTERVAL 5 DAY))`,
      [other.userId]
    );
    const res = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'hotname' });
    assert.equal(res.status, 400);
  });

  test('原主人可在冷却期内改回自己刚释放的旧名，但这次操作同样计入改名次数（ADR-007）', async () => {
    const me = await loggedInUser({ username: 'user_owner1' });
    const r1 = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'mypick' });
    assert.equal(r1.status, 200);
    // user_owner1 现在在 username_history 里，released_at = 刚才
    const r2 = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'user_owner1' });
    assert.equal(r2.status, 200, '原主人能改回');
    // 已经用掉 2 次，第 3 次被限
    const r3 = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'another1' });
    assert.equal(r3.status, 400);
  });

  test('频率限制：滚动 365 天内最多改 2 次，第 3 次 -> 400', async () => {
    const me = await loggedInUser({ username: 'user_seq000' });
    const r1 = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'nameone' });
    const r2 = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'nametwo' });
    const r3 = await request(app).put('/api/auth/username').set('Cookie', me.cookie).send({ username: 'namethree' });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 400);
    assert.match(r3.body.error, /次数已达上限/);
  });
});

describe('PUT /api/auth/nickname', () => {
  test('未登录 -> 401', async () => {
    assert.equal((await request(app).put('/api/auth/nickname').send({ nickname: 'x' })).status, 401);
  });

  test('合法 -> 200，users.nickname 更新，写一条 nickname_history', async () => {
    const me = await loggedInUser({ nickname: '旧名' });
    const res = await request(app).put('/api/auth/nickname').set('Cookie', me.cookie).send({ nickname: '  新名  ' });
    assert.equal(res.status, 200);
    assert.equal(res.body.nickname, '新名'); // 首尾空格被 trim

    const [[u]] = await pool.query('SELECT nickname FROM users WHERE id = ?', [me.userId]);
    assert.equal(u.nickname, '新名');
    const [[h]] = await pool.query(
      'SELECT old_nickname, new_nickname FROM nickname_history WHERE user_id = ?', [me.userId]);
    assert.equal(h.old_nickname, '旧名');
    assert.equal(h.new_nickname, '新名');
  });

  test('空 / 超 30 字 -> 400', async () => {
    const me = await loggedInUser();
    const empty = await request(app).put('/api/auth/nickname').set('Cookie', me.cookie).send({ nickname: '   ' });
    const long = await request(app).put('/api/auth/nickname').set('Cookie', me.cookie).send({ nickname: 'x'.repeat(31) });
    assert.equal(empty.status, 400);
    assert.equal(long.status, 400);
  });

  test('频率限制：滚动 14 天内最多改 2 次，第 3 次 -> 400', async () => {
    const me = await loggedInUser();
    const r1 = await request(app).put('/api/auth/nickname').set('Cookie', me.cookie).send({ nickname: 'n1' });
    const r2 = await request(app).put('/api/auth/nickname').set('Cookie', me.cookie).send({ nickname: 'n2' });
    const r3 = await request(app).put('/api/auth/nickname').set('Cookie', me.cookie).send({ nickname: 'n3' });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 400);
  });
});
