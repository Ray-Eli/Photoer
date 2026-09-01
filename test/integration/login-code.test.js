// POST /api/auth/login/code          验证码登录第一步：发码
// POST /api/auth/login/code/verify   验证码登录第二步：校验 -> 直接登录（跳过密码）
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const { useCleanState } = require('../helpers/harness');
const { createUser } = require('../helpers/factory');
const { getLoginCode } = require('../helpers/codes');

useCleanState();

describe('POST /api/auth/login/code', () => {
  test('已注册邮箱 -> 200 + token', async () => {
    await createUser({ email: 'lc@example.com' });
    const res = await request(app).post('/api/auth/login/code').send({ email: 'lc@example.com', captchaToken: 'x' });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, '验证码已发送');
    assert.ok(res.body.token);
  });

  test('邮箱格式非法 -> 400', async () => {
    const res = await request(app).post('/api/auth/login/code').send({ email: 'bad', captchaToken: 'x' });
    assert.equal(res.status, 400);
  });

  test('不泄露账号存在性：未注册邮箱与已注册邮箱响应完全一致', async () => {
    await createUser({ email: 'exists@example.com' });
    const yes = await request(app).post('/api/auth/login/code').send({ email: 'exists@example.com', captchaToken: 'x' });
    const no = await request(app).post('/api/auth/login/code').send({ email: 'ghost@example.com', captchaToken: 'x' });
    assert.equal(yes.status, no.status);
    assert.equal(yes.body.message, no.body.message);
    assert.deepEqual(Object.keys(yes.body).sort(), Object.keys(no.body).sort());
  });
});

describe('POST /api/auth/login/code/verify', () => {
  async function requestCode(email) {
    const res = await request(app).post('/api/auth/login/code').send({ email, captchaToken: 'x' });
    return res.body.token;
  }

  test('正确验证码 -> 200 + 种 sid，不需要密码', async () => {
    const u = await createUser({ email: 'lcv@example.com' });
    const token = await requestCode('lcv@example.com');
    const code = await getLoginCode(token);

    const res = await request(app).post('/api/auth/login/code/verify').send({ token, code });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, u.username);
    assert.ok((res.headers['set-cookie'] || []).some((c) => c.startsWith('sid=')));
  });

  test('token/code 缺失 -> 400', async () => {
    const res = await request(app).post('/api/auth/login/code/verify').send({ token: 'x' });
    assert.equal(res.status, 400);
  });

  test('验证码错误 -> 400', async () => {
    await createUser({ email: 'lcv2@example.com' });
    const token = await requestCode('lcv2@example.com');
    const res = await request(app).post('/api/auth/login/code/verify').send({ token, code: '000000' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /验证码错误/);
  });

  test('不泄露账号存在性：未注册邮箱即便验证码"正确"也返回 400 验证码错误', async () => {
    const token = await requestCode('nobody@example.com');
    const code = await getLoginCode(token); // 未注册也会存一个 code
    const res = await request(app).post('/api/auth/login/code/verify').send({ token, code });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /验证码错误/);
  });

  test('验证码正确但账号被封禁 -> 403 + reason（校验通过后才检查状态）', async () => {
    await createUser({ email: 'lcban@example.com', status: 'banned', banReason: '风控' });
    const token = await requestCode('lcban@example.com');
    const code = await getLoginCode(token);
    const res = await request(app).post('/api/auth/login/code/verify').send({ token, code });
    assert.equal(res.status, 403);
    assert.equal(res.body.reason, '风控');
  });

  test('验证码正确但账号已注销 -> 403 账号已注销', async () => {
    await createUser({ email: 'lcdel@example.com', status: 'deleted' });
    const token = await requestCode('lcdel@example.com');
    const code = await getLoginCode(token);
    const res = await request(app).post('/api/auth/login/code/verify').send({ token, code });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, '账号已注销');
  });
});
