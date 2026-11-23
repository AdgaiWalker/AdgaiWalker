import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, FileText, MessageSquare, Search, Settings, Terminal } from "lucide-react";
import { useContent } from "../api/queries";
import { ADMIN_ROUTES as R } from "../shared/routes";
import { ModalDialog } from "./ModalDialog";

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  to: string;
  icon: typeof FileText;
}

const STATIC_ITEMS: PaletteItem[] = [
  { id: "nav-content", label: "文章列表", hint: "写作与发布", to: R.content, icon: FileText },
  { id: "nav-signals", label: "访客信号", hint: "对话与异常", to: R.records, icon: MessageSquare },
  { id: "nav-settings", label: "系统设置", hint: "模型 · 额度 · 密码", to: R.settings, icon: Settings },
  { id: "nav-agents", label: "小影与 Agent", hint: "部署 · 试跑 · 授权", to: `${R.settings}#agents`, icon: Bot },
  { id: "nav-diag", label: "运行诊断日志", hint: "进程内指标与日志", to: `${R.settings}#diagnostics`, icon: Terminal },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const content = useContent({ enabled: open });
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const articles: PaletteItem[] = (content.data?.data ?? []).map((item) => ({
      id: `post:${item.slug}`,
      label: item.title,
      hint: item.slug,
      to: R.contentDetail(item.slug),
      icon: FileText,
    }));
    const all = [...STATIC_ITEMS, ...articles];
    if (!q) return all.slice(0, 12);
    return all
      .filter((it) => it.label.toLowerCase().includes(q) || it.hint.toLowerCase().includes(q))
      .slice(0, 12);
  }, [content.data, query]);

  const pick = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  return (
    <ModalDialog open={open} title="快速跳转" onClose={onClose} className="cmd-dialog">
      <div className="cmd-input-row">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          autoFocus
          value={query}
          placeholder="搜索文章标题、slug 或系统入口…"
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((i) => (items.length ? (i + 1) % items.length : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(items[activeIdx]);
            }
          }}
        />
      </div>
      <ul className="cmd-list" role="listbox">
        {items.length === 0 ? (
          <li className="cmd-empty muted">没有匹配项</li>
        ) : (
          items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`cmd-item ${idx === activeIdx ? "is-active" : ""}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => pick(item)}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span className="cmd-label">{item.label}</span>
                  <span className="cmd-hint muted">{item.hint}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </ModalDialog>
  );
}
