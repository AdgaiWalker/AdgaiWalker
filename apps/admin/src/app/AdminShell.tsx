import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Home,
  FileText,
  Bot,
  CalendarDays,
  Settings,
  LockKeyhole,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { OpsCapabilities } from "@walker/shared";
import { ADMIN_ROUTES as R } from "../shared/routes";
import { requestJson } from "../api/http";
export const useCapabilities = () =>
  useQuery({
    queryKey: ["ops-capabilities"],
    queryFn: ({ signal }) =>
      requestJson<OpsCapabilities>("/ops/capabilities", { signal, backgroundPoll: true }),
    refetchInterval: 15_000,
  });
const links = [
  { path: R.overview, label: "概览", icon: Home },
  { path: R.content, label: "内容", icon: FileText },
  { path: R.agents, label: "Agent", icon: Bot },
  { path: R.records, label: "运营记录", icon: CalendarDays },
];
export function AdminShell() {
  const location = useLocation(),
    capabilities = useCapabilities();
  const title =
    [...links, { path: R.settings, label: "设置" }].find((item) =>
      location.pathname.startsWith(item.path),
    )?.label ?? "工作台";
  return (
    <div className="admin-layout">
      <a className="skip-link" href="#workspace">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <NavLink to={R.overview} className="brand">
          <span className="brand-mark">W</span>
          <span>
            <strong>Walker</strong>
            <small>站主工作台</small>
          </span>
        </NavLink>
        <nav aria-label="主导航">
          {links.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path}>
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to={R.settings}>
            <Settings size={20} />
            设置
          </NavLink>
          <button
            className="lock-button"
            onClick={() => window.dispatchEvent(new Event("walker:lock"))}
          >
            <LockKeyhole size={16} />
            锁定工作台
          </button>
        </div>
      </aside>
      <main id="workspace" className="workspace">
        <div className="topbar">
          <span>
            工作台 <span className="separator">/</span> {title}
          </span>
          <span
            className={`connection ${capabilities.isError ? "offline" : ""}`}
          >
            <i />
            {capabilities.isError
              ? "连接中断"
              : capabilities.isPending
                ? "正在连接"
                : "API 已连接"}
          </span>
        </div>
        <Outlet />
        <footer className="workspace-footer">
          数据来自本站服务 · 上线状态尚未核验
        </footer>
      </main>
    </div>
  );
}
