const { customAlphabet } = require('nanoid');

// public_id：21位，URL安全字符集
const nanoid = customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_',
    21
);

// 临时token（注册、验证码流程用）
const tokenId = customAlphabet(
    '0123456789abcdefghijklmnopqrstuvwxyz',
    32
);

// 默认用户名后缀：6位小写字母数字
const usernameSuffix = customAlphabet(
    '0123456789abcdefghijklmnopqrstuvwxyz',
    6
);

function generatePublicId() {
    return nanoid();
}

function generateToken() {
    return tokenId();
}

function generateDefaultUsername() {
    return `user_${usernameSuffix()}`;
}

module.exports = {
    generatePublicId,
    generateToken,
    generateDefaultUsername,
};