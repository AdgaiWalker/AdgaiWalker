/**
 * 哆啦与硬件（页）
 * 职责：方法论 + 按场景展示装备；教程深链挂 guide。
 * 数据：apps/web/src/data/gear.json
 * 触发：/gear · 侧栏「拿」
 */
import { Link } from 'react-router-dom';
import { ArrowRight, Cpu, ExternalLink } from 'lucide-react';
import gearData from '../data/gear.json';
import { WEB_ROUTES } from '../shared/routes';

type GearLink = {
  platform: string;
  url: string;
};

type GearItem = {
  name: string;
  price: string;
  why: string;
  guide?: string;
  links: GearLink[];
};

type GearScene = {
  key: string;
  label: string;
  description: string;
  items: GearItem[];
};

type GearData = {
  methodology: string;
  scenes: GearScene[];
};

const data = gearData as GearData;

const PLATFORM_COLORS: Record<string, string> = {
  闲鱼: '#fbbf24',
  京东: '#e11d48',
  淘宝: '#f97316',
  拼多多: '#e11d48',
};

function PlatformBadge({ link }: { link: GearLink }) {
  const hasUrl = Boolean(link.url?.trim());
  const color = PLATFORM_COLORS[link.platform] ?? 'var(--color-brand)';

  if (!hasUrl) {
    return (
      <span
        className="gear-badge gear-badge-empty"
        style={{ borderColor: `${color}44`, color: `${color}88` }}
      >
        {link.platform}
      </span>
    );
  }

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="gear-badge"
      style={{ borderColor: color, color }}
    >
      {link.platform}
      <ExternalLink size={10} style={{ marginLeft: 3 }} />
    </a>
  );
}

export function GearPage() {
  return (
    <div className="gear-page">
      <header className="ideas-intro panel-glass" style={{ marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>
            <Cpu size={26} aria-hidden className="page-title-icon" />
            哆啦与硬件
          </h1>
          <p className="page-lead" style={{ margin: 0 }}>
            装备清单与选型逻辑。长文教程见「深究」；更多 how-to 在教程。
          </p>
        </div>
        <Link
          to={WEB_ROUTES.tutorials}
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          教程
          <ArrowRight size={14} />
        </Link>
      </header>

      <section className="panel-glass gear-methodology">
        <p>{data.methodology}</p>
      </section>

      {/* 按场景分组 */}
      {data.scenes.map((scene) => (
        <section key={scene.key} className="gear-scene">
          <h2 className="gear-scene-title">{scene.label}</h2>
          <p className="meta gear-scene-desc">{scene.description}</p>

          <div className="gear-table">
            {scene.items.map((item) => (
              <div key={item.name} className="gear-row">
                <div className="gear-row-main">
                  <div className="gear-row-name">{item.name}</div>
                  <div className="meta gear-row-why">{item.why}</div>
                </div>
                <div className="gear-row-price">{item.price}</div>
                <div className="gear-row-links">
                  {item.guide ? (
                    <Link to={item.guide} className="gear-guide-link">
                      深究 <ArrowRight size={11} />
                    </Link>
                  ) : null}
                  {item.links.length === 0 ? (
                    <span className="gear-no-link">—</span>
                  ) : (
                    item.links.map((link) => (
                      <PlatformBadge key={link.platform} link={link} />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
