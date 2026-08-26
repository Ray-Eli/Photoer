// 重定向白名单（design-principles.md 1.5）：只允许站内路径，拒绝 http(s):// 和协议相对的 // 开头的值
export function getSafeRedirect(value) {
  if (!value || typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
