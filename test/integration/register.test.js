// POST /api/auth/register            注册第一步：发验证码
// POST /api/auth/register/verify     注册第二步：校验验证码 -> 建号 -> 自动登录
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const pool = require('../../src/lib/db');
const { useCleanState } = require('../helpers/harness');
const { createUser } = require('../helpers/factory');
const { getRegistrationCode } = require('../helpers/codes');

useCleanState();

const validBody = (over = {}) => ({
  email: 'newbie@example.com',
  nickname: '新用户',
  password: 'passw0rd-abc',
  captchaToken: 'x',
  ...over,
});

describe('POST /api/auth/register', () => {
  test('合法输入 -> 200 + 返回 token', async () => {
    const res = await request(app).post('/api/auth/register').send(validBody());
    assert.equal(res.status, 200);
    assert.equal(res.body.message, '验证码已发送');
    assert.match(res.body.token, /^[0-9a-z]{32}$/);
  });

  test('邮箱格式非法 -> 400', async () => {
    const res = await request(app).post('/api/auth/register').send(validBody({ email: 'not-an-email' }));
    assert.equal(res.status, 400);
    assert.equal(res.body.error, '邮箱格式不正确');
  });

  test('昵称为空 -> 400', async () => {
    const res = await request(app).post('/api/auth/register').send(validBody({ nickname: '   ' }));
    assert.equal(res.status, 400);
  });

  test('密码少于 8 位 -> 400', async () => {
    const res = await request(app).post('/api/auth/register').send(validBody({ password: 'short' }));
    assert.equal(res.status, 400);
    assert.match(res.body.error, /至少 8 位/);
  });

  test('不泄露账号存在性：邮箱已注册时，响应与全新邮箱完全一致', async () => {
    await createUser({ email: 'taken@example.com' });

    const takenRes = await request(app).post('/api/auth/register').send(validBody({ email: 'taken@example.com' }));
    const freshRes = await request(app).post('/api/auth/register').send(validBody({ email: 'fresh@example.com' }));

    assert.equal(takenRes.status, freshRes.status);
    assert.equal(takenRes.body.message, freshRes.body.message);
    assert.deepEqual(Object.keys(takenRes.body).sort(), Object.keys(freshRes.body).sort());
  });

  test('同邮箱 60 秒内重复发码 -> 429（发送冷却）', async () => {
    await request(app).post('/api/auth/register').send(validBody());
    const again = await request(app).post('/api/auth/register').send(validBody());
    assert.equal(again.status, 429);
  });
});

describe('POST /api/auth/register/verify', () => {
  async function startRegister(over) {
    const res = await request(app).post('/api/auth/register').send(validBody(over));
    return res.body.token;
  }

  test('正确验证码 -> 201 + 种 sid Cookie + 落库 + 默认用户名', async () => {
    const token = await startRegister();
    const code = await getRegistrationCode(token);

    const res = await request(app).post('/api/auth/register/verify').send({ token, code });
    assert.equal(res.status, 201);
    assert.equal(res.body.message, '注册成功');
    assert.equal(res.body.user.nickname, '新用户');
    assert.match(res.body.user.username, /^user_[0-9a-z]{6}$/);
    assert.equal(res.body.user.publicId.length, 21);
    assert.ok((res.headers['set-cookie'] || []).some((c) => c.startsWith('sid=')));

    const [rows] = await pool.query(
      `SELECT u.status, i.value email FROM users u JOIN user_identities i ON i.user_id = u.id`
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, 'newbie@example.com');
    assert.equal(rows[0].status, 'active');
  });

  test('token/code 缺失 -> 400', async () => {
    const res = await request(app).post('/api/auth/register/verify').send({ token: 'x' });
    assert.equal(res.status, 400);
  });

  test('验证码错误 -> 400，不建号', async () => {
    const token = await startRegister();
    const res = await request(app).post('/api/auth/register/verify').send({ token, code: '000000' });
    assert.equal(res.status, 400);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM users');
    assert.equal(n, 0);
  });

  test('验证码错误达上限后作废：前 5 次提示"验证码错误"，第 6 次提示"次数过多"并删除中间态', async () => {
    const token = await startRegister();
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post('/api/auth/register/verify').send({ token, code: '000000' });
      assert.equal(r.status, 400);
      assert.match(r.body.error, /验证码错误/);
    }
    const sixth = await request(app).post('/api/auth/register/verify').send({ token, code: '000000' });
    assert.equal(sixth.status, 400);
    assert.match(sixth.body.error, /次数过多/);
    assert.equal(await getRegistrationCode(token), null, '中间态应已被删除');
  });

  test('无效 token -> 400（提示按"过期"处理）', async () => {
    const res = await request(app).post('/api/auth/register/verify').send({ token: 'nope'.repeat(8), code: '123456' });
    assert.equal(res.status, 400);
  });

  test('token 一次性：注册成功后同一 token 再次 verify -> 400', async () => {
    const token = await startRegister();
    const code = await getRegistrationCode(token);
    const first = await request(app).post('/api/auth/register/verify').send({ token, code });
    assert.equal(first.status, 201);
    const replay = await request(app).post('/api/auth/register/verify').send({ token, code });
    assert.equal(replay.status, 400);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM users');
    assert.equal(n, 1, '不应重复建号');
  });

  test('不泄露账号存在性：邮箱已被占用时，verify 的失败表现与"验证码输错"一致', async () => {
    await createUser({ email: 'occupied@example.com' });
    const token = await startRegister({ email: 'occupied@example.com' });
    // 这种情况下 Redis 里 code 为空字符串，随便给个码
    const res = await request(app).post('/api/auth/register/verify').send({ token, code: '123456' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /验证码错误/);
  });
});
