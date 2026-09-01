// POST /api/auth/change-email          换绑第一步：验当前密码 + 提交新邮箱 -> 发码（需登录）
// POST /api/auth/change-email/verify   换绑第二步：校验 -> 事务替换凭证 + 归档旧邮箱（需登录）
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const pool = require('../../src/lib/db');
const redis = require('../../src/lib/redis');
const { useCleanState } = require('../helpers/harness');
const { loggedInUser, createUser, sessionCookieFor, DEFAULT_PASSWORD } = require('../helpers/factory');
const { getChangeEmailCode } = require('../helpers/codes');

useCleanState();

describe('POST /api/auth/change-email', () => {
  test('未登录 -> 401', async () => {
    const res = await request(app).post('/api/auth/change-email')
      .send({ password: DEFAULT_PASSWORD, newEmail: 'x@example.com', captchaToken: 'x' });
    assert.equal(res.status, 401);
  });

  test('已登录 + 正确密码 + 未占用新邮箱 -> 200 + token', async () => {
    const me = await loggedInUser({ email: 'ce-old@example.com' });
    const res = await request(app).post('/api/auth/change-email').set('Cookie', me.cookie)
      .send({ password: DEFAULT_PASSWORD, newEmail: 'ce-new@example.com', captchaToken: 'x' });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  test('当前密码错误 -> 400', async () => {
    const me = await loggedInUser({ email: 'ce2@example.com' });
    const res = await request(app).post('/api/auth/change-email').set('Cookie', me.cookie)
      .send({ password: 'WRONG', newEmail: 'ce2-new@example.com', captchaToken: 'x' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /密码错误/);
  });

  test('新邮箱格式非法 / 字段为空 -> 400', async () => {
    const me = await loggedInUser({ email: 'ce3@example.com' });
    const bad = await request(app).post('/api/auth/change-email').set('Cookie', me.cookie)
      .send({ password: DEFAULT_PASSWORD, newEmail: 'not-email', captchaToken: 'x' });
    const empty = await request(app).post('/api/auth/change-email').set('Cookie', me.cookie)
      .send({ password: DEFAULT_PASSWORD, captchaToken: 'x' });
    assert.equal(bad.status, 400);
    assert.equal(empty.status, 400);
  });

  test('不泄露账号存在性：新邮箱已被他人占用时，响应与未占用时一致', async () => {
    await createUser({ email: 'occupied@example.com' });
    const me = await loggedInUser({ email: 'ce4@example.com' });

    const taken = await request(app).post('/api/auth/change-email').set('Cookie', me.cookie)
      .send({ password: DEFAULT_PASSWORD, newEmail: 'occupied@example.com', captchaToken: 'x' });
    const free = await request(app).post('/api/auth/change-email').set('Cookie', me.cookie)
      .send({ password: DEFAULT_PASSWORD, newEmail: 'ce4-free@example.com', captchaToken: 'x' });

    assert.equal(taken.status, free.status);
    assert.equal(taken.body.message, free.body.message);
    assert.deepEqual(Object.keys(taken.body).sort(), Object.keys(free.body).sort());
  });
});

describe('POST /api/auth/change-email/verify', () => {
  async function startChange(cookie, newEmail) {
    const res = await request(app).post('/api/auth/change-email').set('Cookie', cookie)
      .send({ password: DEFAULT_PASSWORD, newEmail, captchaToken: 'x' });
    return res.body.token;
  }

  test('正确验证码 -> 200 换绑成功，凭证替换 + 旧邮箱进 identity_history', async () => {
    const me = await loggedInUser({ email: 'cev-old@example.com' });
    const token = await startChange(me.cookie, 'cev-new@example.com');
    const code = await getChangeEmailCode(token);

    const res = await request(app).post('/api/auth/change-email/verify').set('Cookie', me.cookie)
      .send({ token, code });
    assert.equal(res.status, 200);
    assert.equal(res.body.newEmail, 'cev-new@example.com');

    const [[cur]] = await pool.query('SELECT value FROM user_identities WHERE user_id = ?', [me.userId]);
    assert.equal(cur.value, 'cev-new@example.com');
    const [[hist]] = await pool.query(
      "SELECT value, reason FROM identity_history WHERE user_id = ?", [me.userId]);
    assert.equal(hist.value, 'cev-old@example.com');
    assert.equal(hist.reason, 'changed');
  });

  test('未登录 -> 401', async () => {
    const res = await request(app).post('/api/auth/change-email/verify').send({ token: 'x', code: 'y' });
    assert.equal(res.status, 401);
  });

  test('换绑后：新邮箱能登录，旧邮箱不能（凭证已替换）', async () => {
    const me = await loggedInUser({ email: 'swap-old@example.com' });
    const token = await startChange(me.cookie, 'swap-new@example.com');
    const code = await getChangeEmailCode(token);
    await request(app).post('/api/auth/change-email/verify').set('Cookie', me.cookie).send({ token, code });

    const withNew = await request(app).post('/api/auth/login')
      .send({ account: 'swap-new@example.com', password: DEFAULT_PASSWORD, captchaToken: 'x' });
    assert.equal(withNew.status, 200);

    const withOld = await request(app).post('/api/auth/login')
      .send({ account: 'swap-old@example.com', password: DEFAULT_PASSWORD, captchaToken: 'x' });
    assert.equal(withOld.status, 401);
  });

  test('验证码错误 -> 400', async () => {
    const me = await loggedInUser({ email: 'cev2@example.com' });
    const token = await startChange(me.cookie, 'cev2-new@example.com');
    const res = await request(app).post('/api/auth/change-email/verify').set('Cookie', me.cookie)
      .send({ token, code: '000000' });
    assert.equal(res.status, 400);
  });

  test('新邮箱已被占用的 token，verify 一律 400 验证码错误', async () => {
    await createUser({ email: 'occ2@example.com' });
    const me = await loggedInUser({ email: 'cev3@example.com' });
    const token = await startChange(me.cookie, 'occ2@example.com');
    const code = await getChangeEmailCode(token); // taken=1 时也会存 code
    const res = await request(app).post('/api/auth/change-email/verify').set('Cookie', me.cookie)
      .send({ token, code });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /验证码错误/);
  });

  test('换绑成功后不强制下线其他设备（auth-design 3.4）', async () => {
    const me = await loggedInUser({ email: 'cev-keep-old@example.com' });
    const other = await sessionCookieFor(me.userId);
    const token = await startChange(me.cookie, 'cev-keep-new@example.com');
    const code = await getChangeEmailCode(token);

    const res = await request(app).post('/api/auth/change-email/verify').set('Cookie', me.cookie).send({ token, code });
    assert.equal(res.status, 200);

    // 当前设备和另一台设备的 session 都还在
    assert.equal((await request(app).get('/api/auth/me').set('Cookie', me.cookie)).status, 200);
    assert.equal(await redis.exists(`session:${other.sessionId}`), 1);
  });

  test('用别人的 token 换绑（token.userId 与登录用户不符）-> 400', async () => {
    const alice = await loggedInUser({ email: 'alice@example.com' });
    const bob = await loggedInUser({ email: 'bob@example.com' });
    const aliceToken = await startChange(alice.cookie, 'alice-new@example.com');
    const code = await getChangeEmailCode(aliceToken);

    const res = await request(app).post('/api/auth/change-email/verify').set('Cookie', bob.cookie)
      .send({ token: aliceToken, code });
    assert.equal(res.status, 400);
  });
});
