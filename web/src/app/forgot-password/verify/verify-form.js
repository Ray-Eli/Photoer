"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "../../../lib/api";

export default function VerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const redirect = searchParams.get("redirect") || "";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await api.post("/auth/forgot-password/verify", { token, code });
      const params = new URLSearchParams({ token: data.token });
      if (redirect) params.set("redirect", redirect);
      router.push(`/forgot-password/reset?${params.toString()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "验证失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-16">
        <p className="text-sm text-red-600">
          缺少找回密码凭证，请重新
          <a href="/forgot-password" className="underline">
            发起找回密码
          </a>
          。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-xl font-semibold">输入验证码</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="6位验证码"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
          className="rounded border border-black/10 px-3 py-2 dark:border-white/20"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-foreground px-5 py-2 text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {submitting ? "验证中..." : "下一步"}
        </button>
      </form>
    </div>
  );
}
