/**
 * GreetingCard — 首页左侧「Dora 身份卡 + 3D 灵感翻牌」
 * 职责：保留唯一 Dora 身份标识与直觉社交外链；点翻牌原地旋转展现真实站内想法，1 步跳读原文或问小影。
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, MessageCircle, RotateCcw, Sparkles } from 'lucide-react';
import { trackWebEvent } from '../lib/web-telemetry';
import { SITE_LINKS } from '../shared/constants';
import { dualEntry } from '../shared/dual-entry';

export interface Spark {
  title: string;
  summary?: string;
  slug: string | null;
  isReal: boolean;
}

function greetingByHour(h: number): string {
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export function GreetingCard({
  sparks,
  onAskSpark,
}: {
  sparks: Spark[];
  onAskSpark?: (title: string, trigger?: HTMLElement) => void;
}) {
  const [spark, setSpark] = useState<Spark | null>(null);
  const tag = useMemo(() => greetingByHour(new Date().getHours()), []);

  function draw() {
    if (!sparks.length) return;
    let pool = sparks;
    if (spark && sparks.length > 1) {
      pool = sparks.filter((item) => item.title !== spark.title);
    }
    const next = pool[Math.floor(Math.random() * pool.length)] ?? sparks[0];
    setSpark(next);
    trackWebEvent('web.home_card_flipped', {
      slug: next.slug,
      isReal: next.isReal,
    });
  }

  return (
    <section className="greeting-card surface-l1" aria-label="Dora 与灵感翻牌">
      <div className="identity-head">
        <img
          src="/images/dora.jpg"
          alt="Dora"
          className="identity-avatar"
          width={64}
          height={64}
        />
        <div className="identity-copy">
          <div className="greeting-time-tag">{tag}</div>
          <h1 className="greeting-heading">
            I&apos;m <strong>Dora</strong>, Nice to meet you.
          </h1>
          <p className="greeting-sub">用好 AI 做好事</p>
        </div>
      </div>

      <div className="social-row">
        <a
          className="social-icon-btn"
          href={SITE_LINKS.bilibili}
          target="_blank"
          rel="noreferrer"
          title="哔哩哔哩"
        >
          <span className="icon-badge is-bili">B</span>
          <span>B站</span>
        </a>
        <a
          className="social-icon-btn"
          href={SITE_LINKS.xiaohongshu}
          target="_blank"
          rel="noreferrer"
          title="小红书"
        >
          <span className="icon-badge is-xhs">红</span>
          <span>小红书</span>
        </a>
        <a
          className="social-icon-btn"
          href={SITE_LINKS.mailto}
          title="Email"
        >
          <Mail size={14} aria-hidden />
          <span>邮箱</span>
        </a>
      </div>

      <div
        className="spark-flip-wrap"
        data-flipped={spark ? 'true' : 'false'}
      >
        <div className="spark-flip-inner">
          <div className="spark-flip-face is-front">
            <button
              type="button"
              className="spark-flip-btn"
              aria-label="抽个点子"
              onClick={draw}
            >
              <Sparkles size={15} aria-hidden />
              <span className="spark-flip-prompt">翻开一张真实想法卡</span>
            </button>
          </div>

          {spark ? (
            <div className="spark-flip-face is-back">
              <div className="spark-back-head">
                <span className="spark-back-badge">
                  {spark.isReal ? '站内真实实践' : '灵感切片'}
                </span>
                <button
                  type="button"
                  className="spark-close-btn"
                  aria-label="合上翻牌"
                  onClick={() => setSpark(null)}
                >
                  <RotateCcw size={13} aria-hidden />
                </button>
              </div>
              <p className="spark-back-title">{spark.title}</p>
              {spark.summary ? (
                <p className="spark-back-summary">{spark.summary}</p>
              ) : null}
              <div className="spark-back-actions">
                {spark.isReal && spark.slug ? (
                  <Link
                    to={`${dualEntry.browse.path}/${encodeURIComponent(spark.slug)}`}
                    className="btn-primary spark-act-btn"
                    onClick={() =>
                      trackWebEvent('web.home_card_acted', {
                        action: 'read',
                        slug: spark.slug,
                      })
                    }
                  >
                    <span>读原文</span>
                    <ArrowRight size={13} aria-hidden />
                  </Link>
                ) : null}
                {onAskSpark ? (
                  <button
                    type="button"
                    className="btn-secondary spark-act-btn"
                    onClick={(e) => {
                      trackWebEvent('web.home_card_acted', {
                        action: 'ask',
                        slug: spark.slug,
                      });
                      onAskSpark(spark.title, e.currentTarget);
                    }}
                  >
                    <MessageCircle size={13} aria-hidden />
                    <span>问小影</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost spark-act-btn"
                  aria-label="抽个点子"
                  onClick={draw}
                >
                  <Sparkles size={13} aria-hidden />
                  <span>再点一个</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
