import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, Sparkles } from 'lucide-react';
import { SITE_EMAIL } from '../shared/constants';

export interface Spark {
  title: string;
  slug: string | null;
  isReal: boolean;
}

function greetingByHour(h: number): string {
  if (h < 5) return 'GOOD NIGHT';
  if (h < 11) return 'GOOD MORNING';
  if (h < 14) return 'GOOD NOON';
  if (h < 18) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

export function GreetingCard({ sparks }: { sparks: Spark[] }) {
  const [spark, setSpark] = useState<Spark | null>(null);
  const tag = useMemo(() => greetingByHour(new Date().getHours()), []);

  function draw() {
    if (!sparks.length) return;
    const next = sparks[Math.floor(Math.random() * sparks.length)];
    setSpark(next);
  }

  return (
    <div
      className="greeting-card panel-glass"
      role="button"
      tabIndex={0}
      aria-label="点我抽个点子"
      onClick={draw}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          draw();
        }
      }}
    >
      <div className="avatar-ring">
        <img src="/images/秋知（我的头像）.jpg" alt="秋知" />
      </div>
      <div className="greeting-time-tag">{tag}</div>
      <h2 className="greeting-heading">
        我是<strong>秋知</strong>，很高兴认识你！
      </h2>
      <p className="greeting-sub">用 AI 走自己的路 · 存点子</p>

      <div className="social-row">
        <a
          className="social-icon-btn"
          href="https://space.bilibili.com/1029612512"
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="哔哩哔哩"
        >
          <span className="icon-wrap" style={{ background: 'rgba(0,161,214,0.08)', color: '#00a1d6', fontWeight: 700, fontSize: 12 }}>
            B
          </span>
          B站
        </a>
        <a
          className="social-icon-btn"
          href="https://www.xiaohongshu.com"
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="小红书"
        >
          <span className="icon-wrap" style={{ background: 'rgba(255,36,66,0.08)', color: '#ff2442', fontWeight: 700, fontSize: 11 }}>
            红
          </span>
          小红书
        </a>
        <a
          className="social-icon-btn"
          href={`mailto:${SITE_EMAIL}`}
          onClick={(e) => e.stopPropagation()}
          title="Email"
        >
          <span className="icon-wrap">
            <Mail size={14} color="var(--color-brand)" />
          </span>
          邮箱
        </a>
      </div>

      <div className="spark-hint">
        <Sparkles size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> 点卡片抽个点子
      </div>

      {spark ? (
        <div className="idea-popup" onClick={(e) => e.stopPropagation()}>
          <div className="idea-popup-label">点子开了！</div>
          <p className="idea-popup-text">{spark.title}</p>
          {spark.isReal && spark.slug ? (
            <Link
              to={`/posts/${encodeURIComponent(spark.slug)}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              看看方案 <ArrowRight size={12} />
            </Link>
          ) : null}
          <button type="button" className="btn-ghost" onClick={draw}>
            再点一个 ✨
          </button>
        </div>
      ) : null}
    </div>
  );
}
