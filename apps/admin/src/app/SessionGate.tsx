import { useEffect, useState, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { adminSession, clearPrivateSession } from "../api/session";
import { onUnauthorized } from "../api/http";
import { LoadingState } from "../components/States";

export function SessionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "ready">("checking");
  const [message, setMessage] = useState("");
  const [username, setUsername] = useState("Dora");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const lock = () => {
      clearPrivateSession();
      if (active) setState("locked");
    };
    const off = onUnauthorized(lock);
    window.addEventListener("walker:lock", lock);
    void adminSession.check().then((result) => {
      if (!active) return;
      setState(result.authenticated ? "ready" : "locked");
      setMessage(
        result.error?.name === "AbortError"
          ? "请验证管理权限后继续"
          : (result.error?.message ?? ""),
      );
    });
    return () => {
      active = false;
      off();
      window.removeEventListener("walker:lock", lock);
    };
  }, []);

  if (state === "checking") {
    return (
      <div className="access-screen">
        <LoadingState />
      </div>
    );
  }
  if (state === "ready") return children;

  return (
    <main className="access-screen">
      <form
        className="access-card"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const result = await adminSession.login({ username, token });
          setToken("");
          setBusy(false);
          if (result.success) {
            setMessage("");
            setState("ready");
          } else {
            setMessage(result.error?.message ?? "账号或密码不正确");
          }
        }}
      >
        <span className="brand-mark">W</span>
        <h1>Walker 工作台</h1>
        <label htmlFor="admin-username">
          账号
          <input
            id="admin-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label htmlFor="admin-token">
          密码
          <input
            id="admin-token"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="输入管理密码"
          />
        </label>
        {message ? (
          <p className="error-text" role="alert">
            {message}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <LockKeyhole size={15} aria-hidden="true" />
          {busy ? "验证中…" : "进入"}
        </button>
      </form>
    </main>
  );
}
