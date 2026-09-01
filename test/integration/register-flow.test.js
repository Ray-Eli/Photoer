// 多步流程集成测试样例：注册两步（发起 -> 输验证码）。
// 核心目的：验证"测试代码从 Redis 读验证码"这条链路能跑通，为第二阶段铺路。
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const pool = require('../../src/lib/db');
const { resetAll, closeConnections } = require('../helpers/reset');
const { getRegistrationCode } = require('../helpers/codes');

beforeEach(resetAll);
after(closeConnections);

test('注册两步流程：发起 -> 从 Redis 取验证码 -> 校验 -> 建号并种 Cookie', async () => {
  const email = 'reg-flow@example.com';

  // 第一步：发起注册，拿到中间态 token
  const start = await request(app).post('/api/auth/register').send({
    email,
    nickname: '测试昵称',
    password: 'passw0rd-abc',
    captchaToken: 'x', // captcha 打桩恒通过
  });
  assert.equal(start.status, 200);
  assert.ok(start.body.token, '第一步应返回 token');

  // 关键机制：验证码从 Redis 读，不走邮件
  const code = await getRegistrationCode(start.body.token);
  assert.match(code, /^\d{6}$/, '应能从 Redis 读到 6 位验证码');

  // 第二步：提交验证码
  const verify = await request(app).post('/api/auth/register/verify').send({
    token: start.body.token,
    code,
  });
  assert.equal(verify.status, 201);
  assert.equal(verify.body.user.nickname, '测试昵称');

  // 种下了 session cookie
  const setCookie = verify.headers['set-cookie'] || [];
  assert.ok(setCookie.some((c) => c.startsWith('sid=')), '应种下 sid Cookie');

  // 库里确实落了一条用户
  const [rows] = await pool.query(
    'SELECT u.nickname, i.value AS email FROM users u JOIN user_identities i ON i.user_id = u.id'
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, email);
});

test('beforeEach 清理生效：上一个用例建的用户不残留', async () => {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM users');
  assert.equal(rows[0].n, 0);
});
