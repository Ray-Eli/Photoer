// GET    /api/auth/sessions        当前用户所有有效登录设备（只暴露 ref，不暴露真实 sessionId）
// DELETE /api/auth/sessions/:ref    按 ref 下线某台设备（不能下线当前设备本身）
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../helpers/app');
const redis = require('../../src/lib/redis');
const { useCleanState } = require('../helpers/harness');
const { loggedInUser, sessionCookieFor } = require('../helpers/factory');

useCleanState();

describe('GET /api/auth/sessions', () => {
  test('未登录 -> 401', async () => {
    assert.equal((await request(app).get('/api/auth/sessions')).status, 401);
  });

  test('列出全部有效设备，标记当前设备，且不泄露真实 sessionId', async () => {
    const me = await loggedInUser({ email: 'sess@example.com' });
    await sessionCookieFor(me.userId); // 第二台
    await sessionCookieFor(me.userId); // 第三台

    const res = await request(app).get('/api/auth/sessions').set('Cookie', me.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.sessions.length, 3);

    const current = res.body.sessions.filter((s) => s.isCurrent);
    assert.equal(current.length, 1);

    for (const s of res.body.sessions) {
      assert.deepEqual(
        Object.keys(s).sort(),
        ['browser', 'createdAt', 'deviceType', 'ip', 'isCurrent', 'lastActiveAt', 'ref'].sort()
      );
      assert.doesNotMatch(JSON.stringify(s), new RegExp(me.sessionId), '响应不应包含真实 sessionId');
    }
  });

  test('惰性清理：集合里残留的过期 sessionId 不出现在列表里', async () => {
    const me = await loggedInUser({ email: 'sess2@example.com' });
    // 手动往集合塞一个没有对应 hash 的假 sessionId
    await redis.sadd(`user_sessions:${me.userId}`, 'stale-session-id');

    const res = await request(app).get('/api/auth/sessions').set('Cookie', me.cookie);
    assert.equal(res.body.sessions.length, 1);
    assert.equal(await redis.sismember(`user_sessions:${me.userId}`, 'stale-session-id'), 0, '过期引用应被顺手清掉');
  });
});

describe('DELETE /api/auth/sessions/:ref', () => {
  test('下线另一台设备 -> 200，该 session 被销毁', async () => {
    const me = await loggedInUser({ email: 'rev@example.com' });
    const other = await sessionCookieFor(me.userId);

    const list = await request(app).get('/api/auth/sessions').set('Cookie', me.cookie);
    const otherRef = list.body.sessions.find((s) => !s.isCurrent).ref;

    const res = await request(app).delete(`/api/auth/sessions/${otherRef}`).set('Cookie', me.cookie);
    assert.equal(res.status, 200);
    assert.equal(await redis.exists(`session:${other.sessionId}`), 0);
  });

  test('下线当前设备本身 -> 400（应改用登出）', async () => {
    const me = await loggedInUser({ email: 'rev2@example.com' });
    const list = await request(app).get('/api/auth/sessions').set('Cookie', me.cookie);
    const currentRef = list.body.sessions.find((s) => s.isCurrent).ref;

    const res = await request(app).delete(`/api/auth/sessions/${currentRef}`).set('Cookie', me.cookie);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /登出/);
  });

  test('ref 不存在 / 伪造 / 属于别人 -> 统一 404 同一句提示', async () => {
    const me = await loggedInUser({ email: 'rev3@example.com' });
    const stranger = await loggedInUser({ email: 'stranger@example.com' });
    const strangerList = await request(app).get('/api/auth/sessions').set('Cookie', stranger.cookie);
    const strangerRef = strangerList.body.sessions[0].ref;

    const fake = await request(app).delete('/api/auth/sessions/totally-made-up').set('Cookie', me.cookie);
    const others = await request(app).delete(`/api/auth/sessions/${strangerRef}`).set('Cookie', me.cookie);

    assert.equal(fake.status, 404);
    assert.equal(others.status, 404);
    assert.deepEqual(fake.body, others.body);
    assert.match(fake.body.error, /不存在或已下线/);
  });

  test('未登录 -> 401', async () => {
    assert.equal((await request(app).delete('/api/auth/sessions/x')).status, 401);
  });
});
