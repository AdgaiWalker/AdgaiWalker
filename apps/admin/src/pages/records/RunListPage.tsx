import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ActivityStreamPanel } from "./ActivityStreamPanel";

/**
 * 运营记录：单页活动流（2026-10-12 起五个旧 tab 合并为一条时间线）。
 *
 * 旧 tab 链接不设重定向表，但参数按语义映射成时间线筛选：
 * runs→run、visitors→visitor、reminders→reminder、reviews→review、runtime→概览的运行监控折叠块。
 * 未知参数按既有口径清掉，页面回到「全部」。
 */
const LEGACY_TAB_KINDS: Record<string, string> = {
  runs: "run",
  visitors: "visitor",
  reminders: "reminder",
  reviews: "review",
};

export function RunListPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const tab = params.get("tab");

  useEffect(() => {
    if (!tab) return;
    // 旧 tab → 时间线筛选；runtime 已搬概览（清掉即回全部）；未知 tab 同样清掉。
    // 写 URL 用 navigate：react-router v7 的 setSearchParams 在本仓库实测不落 history。
    const legacy = tab ? LEGACY_TAB_KINDS[tab] : undefined;
    const next = new URLSearchParams(legacy ? { kind: legacy } : {});
    const existing = params.get("kind");
    if (existing && !legacy) next.set("kind", existing);
    const search = next.toString();
    navigate(search ? "?" + search : location.pathname, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return <ActivityStreamPanel />;
}
