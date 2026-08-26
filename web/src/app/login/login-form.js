"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { getSafeRedirect } from "../../lib/redirect";
import { useAuth } from "../../context/AuthContext";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect") || "";

  const [mode, setMode] = useState("password"); // 'password' | 'code'

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-xl font-semibold">登录</h1>

      <div className="flex gap-4 text-sm">
        <button
          type="button"
          onClick={() => setMode("password")}
          className={mode === "password" ? "font-semibold underline" : "text-zinc-500"}
        >
          密码登录
        </button>
        <button
          type="button"
          onClick={() => setMode("code")}
          className={mode === "code" ? "font-semibold underline" : "text-zinc-500"}
        >
          验证码登录
        </button>
      </div>

      {mode === "password" ? (
        <PasswordLogin redirectParam={redirectParam} />
      ) : (
        <CodeLogin redirectParam={redirectParam} />
      )}
    </div>
  );
}

function PasswordLogin({ redirectParam }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const redirect = getSafeRedirect(redirectParam);

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await api.post("/auth/login", { account, password, remember });
      setUser(data.user);
      router.push(redirect);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  const forgotHref = redirectParam
    ? `/forgot-password?redirect=${encodeURIComponent(redirectParam)}`
    : "/forgot-password";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="用户名或邮箱"
        value={account}
        onChange={(e) => setAccount(e.target.value)}
        required
        className="rounded border border-black/10 px-3 py-2 dark:border-white/20"
      />
      <input
        type="password"
        placeholder="密码"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="rounded border border-black/10 px-3 py-2 dark:border-white/20"
      />

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-auto w-auto"
          />
          记住我
        </label>
        <Link href={forgotHref} className="text-zinc-500 hover:underline">
          忘记密码？
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-foreground px-5 py-2 text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {submitting ? "登录中..." : "登录"}
      </button>
    </form>
  );
}

function CodeLogin({ redirectParam }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const redirect = getSafeRedirect(redirectParam);

  const [step, setStep] = useState("request"); // 'request' | 'verify'
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await api.post("/auth/login/code", { email });
      setToken(data.token);
      setStep("verify");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "发送失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await api.post("/auth/login/code/verify", { token, code });
      setUser(data.user);
      router.push(redirect);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "request") {
    return (
      <form onSubmit={handleRequest} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="邮箱"
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
    );
  }

  return (
    <form onSubmit={handleVerify} className="flex flex-col gap-3">
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
        {submitting ? "登录中..." : "登录"}
      </button>
    </form>
  );
}
