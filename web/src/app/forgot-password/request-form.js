"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "../../lib/api";

export default function RequestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "";

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await api.post("/auth/forgot-password", { email });
      const params = new URLSearchParams({ token: data.token });
      if (redirect) params.set("redirect", redirect);
      router.push(`/forgot-password/verify?${params.toString()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "发送失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-xl font-semibold">找回密码</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="注册时使用的邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded border border-black/10 px-3 py-2 dark:border-white/20"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-foreground px-5 py-2 text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {submitting ? "发送中..." : "获取验证码"}
        </button>

        <p className="text-xs text-zinc-500">
          本地开发阶段邮件是打桩的，验证码不会显示在页面上，请去运行 npm start 的终端窗口查看日志。
        </p>
      </form>
    </div>
  );
}
