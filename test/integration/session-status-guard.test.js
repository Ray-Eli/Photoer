// loadSession 中间件的纵深防御：Session 还在、但账号在库里已被封禁 / 注销时，
// 任何已登录请求都应被挡下（并顺手清掉该用户所有 Session）。
// 模拟"后台工具直接改库封号却没清 Session"的情况——直接 UPDATE users.status。
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const pool = require('../../src/lib/db');
const redis = require('../../src/lib/redis');
const { useCleanState } = require('../helpers/harness');
const { loggedInUser, sessionCookieFor } = require('../helpers/factory');

useCleanState();

describe('loadSession 账号状态纵深防御', () => {
  test('Session 有效但账号被封禁 -> 已登录请求返回 401，且该用户所有 Session 被清', async () => {
    const me = await loggedInUser({ email: 'guard-ban@example.com' });
    const other = await sessionCookieFor(me.userId); // 第二台设备

    // 封号前正常
    assert.equal((await request(app).get('/api/auth/me').set('Cookie', me.cookie)).status, 200);

    // 绕过所有业务路径，直接改库封号（不清 Session）
    await pool.query("UPDATE users SET status = 'banned', ban_reason = '测试' WHERE id = ?", [me.userId]);

    const res = await request(app).get('/api/auth/me').set('Cookie', me.cookie);
    assert.equal(res.status, 401);
    assert.equal(res.body.error, '请先登录');

    // 当前 + 另一台设备的 Session 都被清掉了
    assert.equal(await redis.exists(`session:${me.sessionId}`), 0);
    assert.equal(await redis.exists(`session:${other.sessionId}`), 0);
    assert.equal(await redis.exists(`user_sessions:${me.userId}`), 0);
  });

  test('Session 有效但账号已注销 -> 401', async () => {
    const me = await loggedInUser({ email: 'guard-del@example.com' });
    await pool.query(
      "UPDATE users SET status = 'deleted', deleted_at = NOW(), purge_after = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id = ?",
      [me.userId]
    );
    const res = await request(app).get('/api/auth/me').set('Cookie', me.cookie);
    assert.equal(res.status, 401);
    assert.equal(await redis.exists(`session:${me.sessionId}`), 0);
  });

  test('封号后响应会清除 sid Cookie', async () => {
    const me = await loggedInUser({ email: 'guard-cookie@example.com' });
    await pool.query("UPDATE users SET status = 'banned', ban_reason = 'x' WHERE id = ?", [me.userId]);
    const res = await request(app).get('/api/auth/me').set('Cookie', me.cookie);
    assert.ok((res.headers['set-cookie'] || []).some((c) => c.startsWith('sid=;')));
  });

  test('active 账号不受影响', async () => {
    const me = await loggedInUser({ email: 'guard-ok@example.com' });
    for (let i = 0; i < 3; i++) {
      assert.equal((await request(app).get('/api/auth/me').set('Cookie', me.cookie)).status, 200);
    }
  });

  test('封号解除后，用新登录拿到的 Session 又能正常用', async () => {
    const me = await loggedInUser({ email: 'guard-unban@example.com', password: 'passw0rd-abc' });
    await pool.query("UPDATE users SET status = 'banned', ban_reason = 'x' WHERE id = ?", [me.userId]);
    assert.equal((await request(app).get('/api/auth/me').set('Cookie', me.cookie)).status, 401);

    await pool.query("UPDATE users SET status = 'active', ban_reason = NULL WHERE id = ?", [me.userId]);
    const relogin = await request(app).post('/api/auth/login')
      .send({ account: 'guard-unban@example.com', password: 'passw0rd-abc', captchaToken: 'x' });
    assert.equal(relogin.status, 200);
    const newCookie = (relogin.headers['set-cookie'] || []).find((c) => c.startsWith('sid=')).split(';')[0];
    assert.equal((await request(app).get('/api/auth/me').set('Cookie', newCookie)).status, 200);
  });
});
