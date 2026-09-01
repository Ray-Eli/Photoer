// 单元测试样例：纯函数，不碰数据库 / Redis / HTTP。
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { validateUsername } = require('../../src/utils/validator');

test('validateUsername：合法用户名通过', () => {
  assert.deepEqual(validateUsername('alice_01'), { valid: true });
});

test('validateUsername：长度不足下限（3）被拒', () => {
  const r = validateUsername('ab');
  assert.equal(r.valid, false);
  assert.match(r.reason, /长度/);
});

test('validateUsername：超过上限（20）被拒', () => {
  const r = validateUsername('a'.repeat(21));
  assert.equal(r.valid, false);
  assert.match(r.reason, /长度/);
});

test('validateUsername：非法字符（连字符）被拒', () => {
  const r = validateUsername('a-b-c');
  assert.equal(r.valid, false);
  assert.match(r.reason, /字母、数字和下划线/);
});

test('validateUsername：纯数字被拒', () => {
  const r = validateUsername('123456');
  assert.equal(r.valid, false);
  assert.match(r.reason, /纯数字/);
});

test('validateUsername：保留字被拒（大小写不敏感）', () => {
  const r = validateUsername('Admin');
  assert.equal(r.valid, false);
  assert.match(r.reason, /不可用/);
});

test('validateUsername：非字符串被拒', () => {
  assert.equal(validateUsername(undefined).valid, false);
  assert.equal(validateUsername(12345).valid, false);
});
