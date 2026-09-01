// POST /api/auth/login   密码登录（account 可为用户名或邮箱）
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const redis = require('../../src/lib/redis');
const { useCleanState } = require('../helpers/harness');
const { createUser, DEFAULT_PASSWORD } = require('../helpers/factory');

function sidFrom(res) {
  return (res.headers['set-cookie'] || []).find((c) => c.startsWith('sid=')).split(';')[0].slice(4);
}

useCleanState();

describe('POST /api/auth/login', () => {
  test('用邮箱 + 正确密码 -> 200 + 种 sid', async () => {
    const u = await createUser({ email: 'login@example.com' });
    const res = await request(app).post('/api/auth/login')
      .send({ account: 'login@example.com', password: DEFAULT_PASSWORD, captchaToken: 'x' });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, '登录成功');
    assert.equal(res.body.user.username, u.username);
    assert.ok((res.headers['set-cookie'] || []).some((c) => c.startsWith('sid=')));
  });

  test('用用户名 + 正确密码 -> 200', async () => {
    const u = await createUser({ username: 'byname01' });
    const res = await request(app).post('/api/auth/login')
      .send({ account: 'byname01', password: DEFAULT_PASSWORD, captchaToken: 'x' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.publicId, u.publicId);
  });

  test('账号为空 / 密码为空 -> 400', async () => {
    const a = await request(app).post('/api/auth/login').send({ password: 'x', captchaToken: 'x' });
    const b = await request(app).post('/api/auth/login').send({ account: 'x', captchaToken: 'x' });
    assert.equal(a.status, 400);
    assert.equal(b.status, 400);
  });

  test('不泄露账号存在性：账号不存在 与 密码错误 返回完全相同的 401', async () => {
    await createUser({ username: 'realuser' });

    const wrongPass = await request(app).post('/api/auth/login')
      .send({ account: 'realuser', password: 'WRONG-pass-1', captchaToken: 'x' });
    const noSuchUser = await request(app).post('/api/auth/login')
      .send({ account: 'ghost', password: 'WRONG-pass-1', captchaToken: 'x' });

    assert.equal(wrongPass.status, 401);
    assert.equal(noSuchUser.status, 401);
    assert.deepEqual(wrongPass.body, noSuchUser.body);
    assert.equal(wrongPass.body.error, '账号或密码错误');
  });

  test('密码正确但账号被封禁 -> 403 + reason（1.1 例外：验证通过后可告知）', async () => {
    await createUser({ username: 'banned01', status: 'banned', banReason: '违规内容' });
    const res = await request(app).post('/api/auth/login')
      .send({ account: 'banned01', password: DEFAULT_PASSWORD, captchaToken: 'x' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, '账号异常');
    assert.equal(res.body.reason, '违规内容');
  });

  test('密码正确但账号已注销 -> 403 账号已注销', async () => {
    await createUser({ username: 'gone01', status: 'deleted' });
    const res = await request(app).post('/api/auth/login')
      .send({ account: 'gone01', password: DEFAULT_PASSWORD, captchaToken: 'x' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, '账号已注销');
  });

  test('封禁账号但密码错误 -> 仍然是统一的 401，不泄露封禁状态', async () => {
    await createUser({ username: 'banned02', status: 'banned', banReason: 'x' });
    const res = await request(app).post('/api/auth/login')
      .send({ account: 'banned02', password: 'WRONG', captchaToken: 'x' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, '账号或密码错误');
  });

  test('remember 影响 Session 闲置时长：勾选 ≈30 天，不勾 ≈4 小时', async () => {
    await createUser({ email: 'rem@example.com' });
    const remembered = await request(app).post('/api/auth/login')
      .send({ account: 'rem@example.com', password: DEFAULT_PASSWORD, remember: true, captchaToken: 'x' });
    const normal = await request(app).post('/api/auth/login')
      .send({ account: 'rem@example.com', password: DEFAULT_PASSWORD, captchaToken: 'x' });

    const rTtl = await redis.ttl(`session:${sidFrom(remembered)}`);
    const nTtl = await redis.ttl(`session:${sidFrom(normal)}`);
    assert.ok(rTtl > 29 * 86400 && rTtl <= 30 * 86400, `remember TTL ${rTtl}`);
    assert.ok(nTtl > 3 * 3600 && nTtl <= 4 * 3600, `normal TTL ${nTtl}`);
  });
});
