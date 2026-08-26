"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "../../../lib/api";
import { getSafeRedirect } from "../../../lib/redirect";
import { useAuth } from "../../../context/AuthContext";

export default function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();

  const token = searchParams.get("token") || "";
  const redirect = getSafeRedirect(searchParams.get("redirect"));

  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await api.post("/auth/forgot-password/reset", { token, newPassword });
      setUser(data.user);
      router.push(redirect);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "重置失败，请稍后重试");
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
      <h1 className="text-xl font-semibold">设置新密码</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          placeholder="新密码（至少8位）"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          className="rounded border border-black/10 px-3 py-2 dark:border-white/20"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-foreground px-5 py-2 text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {submitting ? "提交中..." : "完成重置"}
        </button>

        <p className="text-xs text-zinc-500">重置成功后，其他设备上的登录状态会全部失效，仅当前设备保持登录。</p>
      </form>
    </div>
  );
}
