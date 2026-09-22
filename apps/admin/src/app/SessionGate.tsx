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
          const result = await authProvider.login({ token });
          setToken("");
          setBusy(false);
          if (result.success) {
            setMessage("");
            setState("ready");
          } else setMessage(result.error?.message ?? "验证失败，请重试");
        }}
      >
        <span className="brand-mark">W</span>
        <h1>进入站主工作台</h1>
        <p>验证管理权限，继续查看本站内容与 Agent。</p>
        <label htmlFor="admin-token">管理凭据</label>
        <input
          id="admin-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="已通过网关验证时可留空"
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
