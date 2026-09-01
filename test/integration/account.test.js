// GET  /api/auth/me              当前登录用户信息
// POST /api/auth/logout          登出当前设备
// POST /api/auth/delete-account  注销账号（软删除 + 踢所有设备）
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const pool = require('../../src/lib/db');
const redis = require('../../src/lib/redis');
const { useCleanState } = require('../helpers/harness');
const { loggedInUser, sessionCookieFor, DEFAULT_PASSWORD } = require('../helpers/factory');

useCleanState();

describe('GET /api/auth/me', () => {
  test('未登录 -> 401 + 请先登录', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.error, '请先登录');
  });

  test('无效 sid -> 401，且响应清除该 Cookie（属性与种植时一致）', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'sid=nonexistent-session-xyz');
    assert.equal(res.status, 401);
    assert.ok((res.headers['set-cookie'] || []).some((c) => c.startsWith('sid=;')));
  });

  test('已登录 -> 200 + 只返回 publicId/username/nickname（不含内部 id）', async () => {
    const me = await loggedInUser({ email: 'me@example.com' });
    const res = await request(app).get('/api/auth/me').set('Cookie', me.cookie);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.user).sort(), ['nickname', 'publicId', 'username']);
    assert.equal(res.body.user.publicId, me.publicId);
  });
});

describe('POST /api/auth/logout', () => {
  test('已登录 -> 200，仅销毁当前 Session，其他设备不受影响', async () => {
    const me = await loggedInUser({ email: 'lo@example.com' });
    const other = await sessionCookieFor(me.userId); // 第二台设备

    const res = await request(app).post('/api/auth/logout').set('Cookie', me.cookie);
    assert.equal(res.status, 200);
    assert.equal(await redis.exists(`session:${me.sessionId}`), 0);
    assert.equal(await redis.exists(`session:${other.sessionId}`), 1, '另一台设备的 session 应保留');

    // 当前 cookie 已失效
    const after = await request(app).get('/api/auth/me').set('Cookie', me.cookie);
    assert.equal(after.status, 401);
  });

  test('未登录 -> 401', async () => {
    const res = await request(app).post('/api/auth/logout');
    assert.equal(res.status, 401);
  });
});

describe('POST /api/auth/delete-account', () => {
  test('正确密码 -> 200，软删除（status=deleted, purge_after≈+30d），所有设备被踢', async () => {
    const me = await loggedInUser({ email: 'del@example.com' });
    const other = await sessionCookieFor(me.userId);

    const res = await request(app).post('/api/auth/delete-account').set('Cookie', me.cookie)
      .send({ password: DEFAULT_PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, '账号已注销');

    const [[u]] = await pool.query('SELECT status, deleted_at, purge_after FROM users WHERE id = ?', [me.userId]);
    assert.equal(u.status, 'deleted');
    assert.ok(u.deleted_at);
    const daysOut = (new Date(u.purge_after) - Date.now()) / 86400000;
    assert.ok(daysOut > 29 && daysOut < 31, `purge_after 应约为 +30 天，实际 ${daysOut.toFixed(1)}`);

    assert.equal(await redis.exists(`session:${me.sessionId}`), 0);
    assert.equal(await redis.exists(`session:${other.sessionId}`), 0, '注销应踢掉所有设备');

    // 用户数据保留（凭证还在，30 天后才由清理脚本处理）
    const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM user_identities WHERE user_id = ?', [me.userId]);
    assert.equal(n, 1);
  });

  test('密码错误 -> 400，不注销', async () => {
    const me = await loggedInUser({ email: 'del2@example.com' });
    const res = await request(app).post('/api/auth/delete-account').set('Cookie', me.cookie)
      .send({ password: 'WRONG' });
    assert.equal(res.status, 400);
    const [[u]] = await pool.query('SELECT status FROM users WHERE id = ?', [me.userId]);
    assert.equal(u.status, 'active');
  });

  test('密码为空 -> 400', async () => {
    const me = await loggedInUser({ email: 'del3@example.com' });
    const res = await request(app).post('/api/auth/delete-account').set('Cookie', me.cookie).send({});
    assert.equal(res.status, 400);
  });

  test('未登录 -> 401', async () => {
    const res = await request(app).post('/api/auth/delete-account').send({ password: DEFAULT_PASSWORD });
    assert.equal(res.status, 401);
  });
});
