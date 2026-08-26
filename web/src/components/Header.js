'use client';

import Link from 'next/link';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { user, loading, logout } = useAuth();

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold">
          Photoer
        </Link>

        <div className="text-sm">
          {loading ? (
            <span className="text-zinc-500">加载中...</span>
          ) : user ? (
            <div className="flex items-center gap-4">
              <span>
                已登录：{user.nickname}（@{user.username}）
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded-full border border-black/10 px-3 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                退出登录
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-zinc-500">游客</span>
              <Link href="/login" className="hover:underline">
                登录
              </Link>
              <Link href="/register" className="hover:underline">
                注册
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
