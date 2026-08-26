"use client";

import Link from "next/link";
import { useAuth } from "../context/AuthContext";

export default function Home() {
  const { user, loading } = useAuth();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold">Photoer</h1>
      <p className="text-zinc-600 dark:text-zinc-400">分享日常瞬间与拍摄地点推荐</p>

      {loading ? null : user ? (
        <p className="mt-4">
          欢迎回来，{user.nickname}（@{user.username}）
        </p>
      ) : (
        <div className="mt-4 flex gap-4">
          <Link
            href="/login"
            className="rounded-full bg-foreground px-5 py-2 text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            登录
          </Link>
          <Link
            href="/register"
            className="rounded-full border border-black/10 px-5 py-2 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            注册
          </Link>
        </div>
      )}
    </div>
  );
}
