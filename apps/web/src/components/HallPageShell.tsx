/**
 * 厅/类页壳（块）— 底栏链到公开内容路径
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

const CONTENT_LINKS = [
  { label: '资源', href: WEB_ROUTES.toolsResources },
  { label: '教程', href: WEB_ROUTES.tutorials },
  { label: '探索', href: WEB_ROUTES.explore },
  { label: '札记', href: WEB_ROUTES.lab },
  { label: '逛', href: dualEntry.browse.path },
] as const;

type Props = {
  title: string;
  icon: LucideIcon;
  lead: string;
  children: ReactNode;
  aside?: ReactNode;
  /** 底栏高亮当前类名 */
  currentLabel?: string;
};

export function HallPageShell({
  title,
  icon: Icon,
  lead,
  children,
  aside,
  currentLabel,
}: Props) {
  return (
    <div className="hall-page">
      <header className="ideas-intro panel-glass">
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <Icon size={26} aria-hidden className="page-title-icon" />
            {title}
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            {lead}
          </p>
        </div>
        {aside}
      </header>

      {children}

      <nav className="hall-chain meta" aria-label="内容路径">
        <span className="hall-chain-label">内容</span>
        {CONTENT_LINKS.filter((l) => l.label !== currentLabel).map((l) => (
          <Link key={l.href} to={l.href} className="hall-chain-link">
            {l.label}
            <ArrowRight size={12} aria-hidden />
          </Link>
        ))}
      </nav>
    </div>
  );
}
