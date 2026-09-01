// 简单集成测试样例：未登录访问 /api/auth/me 应返回 401。
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const { resetAll, closeConnections } = require('../helpers/reset');

beforeEach(resetAll);
after(closeConnections);

test('GET /api/auth/me 未登录 -> 401', async () => {
  const res = await request(app).get('/api/auth/me');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, '请先登录');
});

test('GET /api/auth/me 带无效 sid Cookie -> 401，且响应里清除该 Cookie', async () => {
  const res = await request(app)
    .get('/api/auth/me')
    .set('Cookie', 'sid=totally-not-a-real-session');
  assert.equal(res.status, 401);

  const setCookie = res.headers['set-cookie'] || [];
  assert.ok(
    setCookie.some((c) => c.startsWith('sid=;')),
    '中间件应下发一个过期的 sid 来清除无效 Cookie'
  );
});
