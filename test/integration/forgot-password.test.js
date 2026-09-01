// POST /api/auth/forgot-password          第一步：发码
// POST /api/auth/forgot-password/verify   第二步：只校验码，标记 verified
// POST /api/auth/forgot-password/reset    第三步：设新密码 -> 踢所有设备 -> 自动登录
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const pool = require('../../src/lib/db');
const redis = require('../../src/lib/redis');
const { useCleanState } = require('../helpers/harness');
const { createUser, sessionCookieFor, DEFAULT_PASSWORD } = require('../helpers/factory');
const { getResetPasswordCode } = require('../helpers/codes');

useCleanState();

// 走到"第二步已验证"的状态，返回 token
async function reachVerified(email) {
  const start = await request(app).post('/api/auth/forgot-password').send({ email, captchaToken: 'x' });
  const token = start.body.token;
  const code = await getResetPasswordCode(token);
  const v = await request(app).post('/api/auth/forgot-password/verify').send({ token, code });
  assert.equal(v.status, 200);
  return token;
}

describe('POST /api/auth/forgot-password', () => {
  test('已注册邮箱 -> 200 + token', async () => {
    await createUser({ email: 'fp@example.com' });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'fp@example.com', captchaToken: 'x' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  test('邮箱格式非法 -> 400', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'bad', captchaToken: 'x' });
    assert.equal(res.status, 400);
  });

  test('不泄露账号存在性：未注册邮箱与已注册邮箱响应完全一致', async () => {
    await createUser({ email: 'has@example.com' });
    const yes = await request(app).post('/api/auth/forgot-password').send({ email: 'has@example.com', captchaToken: 'x' });
    const no = await request(app).post('/api/auth/forgot-password').send({ email: 'none@example.com', captchaToken: 'x' });
    assert.equal(yes.status, no.status);
    assert.deepEqual(Object.keys(yes.body).sort(), Object.keys(no.body).sort());
  });
});

describe('POST /api/auth/forgot-password/verify', () => {
  test('正确验证码 -> 200 + 回传同一个 token', async () => {
    await createUser({ email: 'fpv@example.com' });
    const start = await request(app).post('/api/auth/forgot-password').send({ email: 'fpv@example.com', captchaToken: 'x' });
    const code = await getResetPasswordCode(start.body.token);
    const res = await request(app).post('/api/auth/forgot-password/verify').send({ token: start.body.token, code });
    assert.equal(res.status, 200);
    assert.equal(res.body.token, start.body.token);
  });

  test('验证码错误 -> 400', async () => {
    await createUser({ email: 'fpv2@example.com' });
    const start = await request(app).post('/api/auth/forgot-password').send({ email: 'fpv2@example.com', captchaToken: 'x' });
    const res = await request(app).post('/api/auth/forgot-password/verify').send({ token: start.body.token, code: '000000' });
    assert.equal(res.status, 400);
  });

  test('token/code 缺失 -> 400', async () => {
    const res = await request(app).post('/api/auth/forgot-password/verify').send({ token: 'x' });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/auth/forgot-password/reset', () => {
  test('完整三步 -> 200 + 密码更新 + 旧 Session 全踢 + 自动登录新 Session', async () => {
    const u = await createUser({ email: 'fpr@example.com' });
    const { sessionId: oldSid } = await sessionCookieFor(u.userId); // 旧设备

    const token = await reachVerified('fpr@example.com');
    const res = await request(app).post('/api/auth/forgot-password/reset')
      .send({ token, newPassword: 'brand-new-pass-9' });

    assert.equal(res.status, 200);
    assert.equal(res.body.message, '密码重置成功');
    assert.ok((res.headers['set-cookie'] || []).some((c) => c.startsWith('sid=')));

    // 旧 session 已被销毁
    assert.equal(await redis.exists(`session:${oldSid}`), 0);

    // 新密码可登录、旧密码不可
    const withNew = await request(app).post('/api/auth/login')
      .send({ account: 'fpr@example.com', password: 'brand-new-pass-9', captchaToken: 'x' });
    assert.equal(withNew.status, 200);
    const withOld = await request(app).post('/api/auth/login')
      .send({ account: 'fpr@example.com', password: DEFAULT_PASSWORD, captchaToken: 'x' });
    assert.equal(withOld.status, 401);
  });

  test('token 一次性：reset 成功后同一 token 再用 -> 400', async () => {
    await createUser({ email: 'fpreuse@example.com' });
    const token = await reachVerified('fpreuse@example.com');
    const first = await request(app).post('/api/auth/forgot-password/reset').send({ token, newPassword: 'first-new-pass-1' });
    assert.equal(first.status, 200);
    const replay = await request(app).post('/api/auth/forgot-password/reset').send({ token, newPassword: 'second-new-pass-2' });
    assert.equal(replay.status, 400);
  });

  test('未完成第二步（verified 未标记）就 reset -> 400', async () => {
    await createUser({ email: 'fpr2@example.com' });
    const start = await request(app).post('/api/auth/forgot-password').send({ email: 'fpr2@example.com', captchaToken: 'x' });
    const res = await request(app).post('/api/auth/forgot-password/reset')
      .send({ token: start.body.token, newPassword: 'whatever-12345' });
    assert.equal(res.status, 400);
  });

  test('新密码与旧密码相同 -> 400', async () => {
    await createUser({ email: 'fpr3@example.com' });
    const token = await reachVerified('fpr3@example.com');
    const res = await request(app).post('/api/auth/forgot-password/reset')
      .send({ token, newPassword: DEFAULT_PASSWORD });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /不能与旧密码相同/);
  });

  test('新密码少于 8 位 -> 400', async () => {
    await createUser({ email: 'fpr4@example.com' });
    const token = await reachVerified('fpr4@example.com');
    const res = await request(app).post('/api/auth/forgot-password/reset').send({ token, newPassword: 'short' });
    assert.equal(res.status, 400);
  });

  test('账号被封禁 -> 验证码通过后 reset 阶段返回 403 + reason，不改密码', async () => {
    await createUser({ email: 'fpban@example.com', status: 'banned', banReason: 'abuse' });
    const token = await reachVerified('fpban@example.com');
    const res = await request(app).post('/api/auth/forgot-password/reset')
      .send({ token, newPassword: 'brand-new-pass-9' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, '账号异常');
    assert.equal(res.body.reason, 'abuse');
  });

  test('账号已注销 -> reset 阶段返回 403 账号已注销', async () => {
    await createUser({ email: 'fpdel@example.com', status: 'deleted' });
    const token = await reachVerified('fpdel@example.com');
    const res = await request(app).post('/api/auth/forgot-password/reset')
      .send({ token, newPassword: 'brand-new-pass-9' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, '账号已注销');
  });
});
