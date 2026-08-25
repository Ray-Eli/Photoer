// 开发环境用这个把 /api/* 转发给 Express 后端，浏览器全程只看到 Next.js 的 3000 端口，
// 不会触发跨域，也不用在前端代码里处理 CORS。生产环境如果改用 Nginx 反代，这段可以不启用。
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 仓库根目录和 web/ 各有一份 package-lock.json，不显式指定的话 Turbopack 会猜错项目根目录
  turbopack: {
    root: import.meta.dirname,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
