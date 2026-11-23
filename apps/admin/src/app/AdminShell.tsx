import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { FileText, LockKeyhole, MessageSquare, RefreshCw, Search, Settings } from "lucide-react";
import { ADMIN_ROUTES as R } from "../shared/routes";
import { useActivityCounts, useCapabilities, useServerHealth } from "../api/queries";
import { trackAdminUiEvent } from "../api/telemetry";
import { GitSyncBadge } from "../components/GitSyncBadge";
import { CommandPalette } from "../components/CommandPalette";
import { AppErrorBoundary } from "../components/AppErrorBoundary";

export { useCapabilities };

const DEFAULT_BUILD_VERSION = typeof __ADMIN_BUILD_VERSION__ === "string" ? __ADMIN_BUILD_VERSION__ : "dev";

function surfaceFromPath(pathname: string): "content" | "editor" | "signals" | "settings" {
  if (pathname.startsWith("/content/") && pathname.length > "/content/".length) return "editor";
  if (pathname.startsWith(R.records)) return "signals";
  if (pathname.startsWith(R.settings) || pathname.startsWith(R.agents)) return "settings";
  return "content";
}

export function AdminShell({ buildVersion = DEFAULT_BUILD_VERSION }: { buildVersion?: string } = {}) {
  const location = useLocation();
  const capabilities = useCapabilities();
  const health = useServerHealth();
  const counts = useActivityCounts();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const serverVersion = health.data?.version?.trim();
  const hasVersionDrift = Boolean(
    serverVersion &&
    buildVersion &&
    buildVersion !== "dev" &&
    serverVersion !== buildVersion,
  );

  const attentionCount =
    (counts.data?.runsFailed ?? 0) +
    (counts.data?.answersDegraded ?? 0) +
    (counts.data?.releaseWorkingAhead ?? 0);

  useEffect(() => {
    const viewport = typeof window !== "undefined" && window.innerWidth < 768 ? "mobile" : "desktop";
    trackAdminUiEvent("admin.page_view", { surface: surfaceFromPath(location.pathname), viewport });
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleVersionRefresh = () => {
    trackAdminUiEvent("app.version_drift_refreshed", {
      from: buildVersion,
      to: serverVersion ?? "unknown",
    });
    window.location.reload();
  };

  return (
    <div className="shell">
      <a className="skip-link" href="#workspace">
        跳到主要内容
      </a>

      <header className="topbar">
        <div className="topbar-left">
          <NavLink to={R.content} className="brand-inline" aria-label="Walker 文章">
            <span className="brand-mark">W</span>
          </NavLink>
          <nav className="top-nav" aria-label="主导航">
            <NavLink to={R.content}>
              <FileText size={16} aria-hidden="true" />
              <span>文章</span>
            </NavLink>
            <NavLink to={R.records}>
              <MessageSquare size={16} aria-hidden="true" />
              <span>访客</span>
              {attentionCount > 0 ? (
                <span className="nav-dot" aria-label={`${attentionCount} 项需关注`}>
                  {attentionCount > 9 ? "9+" : attentionCount}
                </span>
              ) : null}
            </NavLink>
          </nav>
        </div>

        <div className="topbar-right">
          {hasVersionDrift ? (
            <button type="button" className="drift-pill" onClick={handleVersionRefresh}>
              <RefreshCw size={13} aria-hidden="true" />
              <span>有新版本 · 刷新</span>
            </button>
          ) : null}

          <GitSyncBadge compact />

          {capabilities.isError ? (
            <span className="conn-alert" role="status">
              离线
            </span>
          ) : null}

          <button
            type="button"
            className="icon-btn cmd-trigger"
            aria-label="快速跳转"
            title="快速跳转 (⌘K)"
            onClick={() => setPaletteOpen(true)}
          >
            <Search size={15} aria-hidden="true" />
            <kbd>⌘K</kbd>
          </button>

          <NavLink to={R.settings} className="icon-btn" aria-label="系统设置" title="系统">
            <Settings size={16} aria-hidden="true" />
          </NavLink>

          <button
            type="button"
            className="icon-btn"
            aria-label="锁定工作台"
            title="锁定"
            onClick={() => window.dispatchEvent(new Event("walker:lock"))}
          >
            <LockKeyhole size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main id="workspace" className="workspace">
        <AppErrorBoundary scope="route">
          <Outlet />
        </AppErrorBoundary>
      </main>

      <nav className="mobile-tabbar" aria-label="移动端主导航">
        <NavLink to={R.content}>
          <FileText size={18} aria-hidden="true" />
          <span>文章</span>
        </NavLink>
        <NavLink to={R.records}>
          <MessageSquare size={18} aria-hidden="true" />
          <span>访客{attentionCount > 0 ? ` (${attentionCount})` : ""}</span>
        </NavLink>
        <NavLink to={R.settings}>
          <Settings size={18} aria-hidden="true" />
          <span>系统</span>
        </NavLink>
      </nav>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
