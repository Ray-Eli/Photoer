// 单元测试：src/utils/validator.js —— 纯函数，不碰数据库 / Redis / HTTP。
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidEmail, validateUsername, validateNickname, validatePassword,
} = require('../../src/utils/validator');

describe('isValidEmail', () => {
  test('正常邮箱通过', () => {
    assert.equal(isValidEmail('a@b.com'), true);
    assert.equal(isValidEmail('foo.bar+tag@sub.example.co'), true);
  });
  test('缺少 @ / 域名点号 / 含空格 均不通过', () => {
    assert.equal(isValidEmail('ab.com'), false);
    assert.equal(isValidEmail('a@bcom'), false);
    assert.equal(isValidEmail('a b@c.com'), false);
  });
  test('非字符串 / 超长不通过', () => {
    assert.equal(isValidEmail(undefined), false);
    assert.equal(isValidEmail(123), false);
    assert.equal(isValidEmail(`${'a'.repeat(250)}@b.com`), false);
  });
});

describe('validateUsername', () => {
  test('合法用户名通过', () => {
    assert.deepEqual(validateUsername('alice_01'), { valid: true });
  });
  test('长度越界（<3 / >20）被拒', () => {
    assert.match(validateUsername('ab').reason, /长度/);
    assert.match(validateUsername('a'.repeat(21)).reason, /长度/);
  });
  test('非法字符被拒', () => {
    assert.match(validateUsername('a-b-c').reason, /字母、数字和下划线/);
  });
  test('纯数字被拒', () => {
    assert.match(validateUsername('123456').reason, /纯数字/);
  });
  test('保留字被拒（大小写不敏感）', () => {
    assert.equal(validateUsername('Admin').valid, false);
    assert.equal(validateUsername('api').valid, false);
  });
  test('非字符串被拒', () => {
    assert.equal(validateUsername(undefined).valid, false);
    assert.equal(validateUsername(12345).valid, false);
  });
});

describe('validateNickname', () => {
  test('正常昵称通过', () => {
    assert.deepEqual(validateNickname('小明'), { valid: true });
  });
  test('全空白 / 空串被拒', () => {
    assert.equal(validateNickname('   ').valid, false);
    assert.equal(validateNickname('').valid, false);
  });
  test('去空格后超过 30 字符被拒', () => {
    assert.equal(validateNickname('x'.repeat(31)).valid, false);
    assert.equal(validateNickname(`  ${'x'.repeat(30)}  `).valid, true); // 首尾空格不计入
  });
  test('非字符串被拒', () => {
    assert.equal(validateNickname(null).valid, false);
  });
});

describe('validatePassword', () => {
  test('>= 8 位通过，< 8 位被拒', () => {
    assert.deepEqual(validatePassword('12345678'), { valid: true });
    assert.match(validatePassword('1234567').reason, /至少 8 位/);
  });
  test('不强制复杂度：纯数字 8 位也通过（遵循 NIST 建议）', () => {
    assert.equal(validatePassword('00000000').valid, true);
  });
  test('非字符串被拒', () => {
    assert.equal(validatePassword(undefined).valid, false);
  });
});
