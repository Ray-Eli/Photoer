// 测试用的 app 入口：拿到 Express app（不 listen），交给 supertest。
// 单独包一层是为了集中"测试怎么拿到 app"这个约定，将来 app 构建方式变了只改这里。
require('./guard');
module.exports = require('../../src/app');
