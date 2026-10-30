import { useEffect, useState, type ReactNode } from "react";
import { authProvider, clearPrivateSession } from "../api/auth-provider";
import { onUnauthorized } from "../api/http";
import { LoadingState } from "../components/States";
import { LockKeyhole } from "lucide-react";
export function SessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "ready">(
    "checking",
  );
  const [message, setMessage] = useState(""),
    [username, setUsername] = useState("Dora"),
    [token, setToken] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const lock = () => {
      clearPrivateSession();
      if (active) setState("locked");
    };
    const off = onUnauthorized(lock);
    window.addEventListener("walker:lock", lock);
    void authProvider.check().then((result) => {
      if (active) {
        setState(result.authenticated ? "ready" : "locked");
        setMessage(
          result.error?.name === "AbortError"
            ? "请验证管理权限后继续"
            : (result.error?.message ?? ""),
        );
      }
    });
    return () => {
      active = false;
      off();
      window.removeEventListener("walker:lock", lock);
    };
  }, []);
  if (state === "checking")
    return (
      <div className="access-screen">
        <LoadingState />
      </div>
    );
  if (state === "ready") return children;
  return (
    <main className="access-screen">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const result = await authProvider.login({ username, token });
          setToken("");
          setBusy(false);
          if (result.success) {
            setMessage("");
            setState("ready");
          } else setMessage(result.error?.message ?? "账号或密码不正确，请重试");
        }}
      >
        <span className="brand-mark">W</span>
        <h1>进入站主工作台</h1>
        <p>使用站主账号与密码登录，管理本站内容与 Agent。</p>
        <label htmlFor="admin-username">账号</label>
        <input
          id="admin-username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="请输入账号（默认 Dora）"
          style={{ marginBottom: 12 }}
        />
        <label htmlFor="admin-token">密码</label>
        <input
          id="admin-token"
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="请输入管理密码"
        />
        {message && (
          <p className="error-text" role="alert">
            {message}
          </p>
        )}
        <button className="primary" disabled={busy}>
          <LockKeyhole size={16} />
          {busy ? "正在验证…" : "验证并进入"}
        </button>
        <small>凭据只在当前页面内存中使用。</small>
      </form>
    </main>
  );
}
