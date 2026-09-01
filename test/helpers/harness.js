// 每个集成测试文件顶部调用一次 useCleanState()：
//   - 每个用例前清空测试库 + 测试 Redis（db 15）
//   - 文件跑完关掉连接池 / redis，让测试进程正常退出
const { beforeEach, after } = require('node:test');
const { resetAll, closeConnections } = require('./reset');

function useCleanState() {
  beforeEach(resetAll);
  after(closeConnections);
}

module.exports = { useCleanState };
