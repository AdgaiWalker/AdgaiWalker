/**
 * 关于本站（页）— 站，不是人
 * 计划文案与 docs/VISION.md 同向；近端行为见 PRODUCT。
 */
import { Link } from 'react-router-dom';
import siteStats from '../data/site-stats.json';
import { MessageCircle, MessageCircleQuestion, PenLine, User } from 'lucide-react';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function AboutPage() {
  const totalCost = siteStats.costs.reduce((s, c) => s + (c.amount || 0), 0);

  return (
    <div className="about-page">
      <section className="about-hero">
        <video
          className="about-hero-video"
          autoPlay
          muted
          loop
          playsInline
          poster="/images/hero-bg.png"
          aria-hidden
        >
          <source src="/video/A-storyboard-2.mp4" type="video/mp4" />
        </video>
        <div className="about-hero-overlay" />
        <div className="about-hero-content">
          <h1 className="about-hero-title">Walker</h1>
          <p className="about-hero-sub">
            赋能，不依赖 — 让每个人都能用 AI 解决真实问题
          </p>
          <p className="about-hero-era">
            一个人 + AI，从零搭了这整个站。你也可以。
          </p>
          <div className="home-dual-cta" style={{ justifyContent: 'center' }}>
            <Link to={dualEntry.ask.path} className="btn-primary">
              <MessageCircleQuestion size={16} />
              {dualEntry.ask.cta}
            </Link>
            <Link to={dualEntry.browse.path} className="btn-secondary">
              <PenLine size={16} />
              {dualEntry.browse.cta}
            </Link>
            <Link to={WEB_ROUTES.assistant} className="btn-secondary">
              <MessageCircle size={16} />
              问小影
            </Link>
          </div>
        </div>
      </section>

      <section className="panel-glass about-section">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>这个站做什么</h2>
        <p style={{ lineHeight: 1.7, color: 'var(--color-parchment-dim)' }}>
          <strong style={{ color: 'var(--color-parchment)' }}>Walker</strong>{' '}
          是站名；人是 duola，知识主权在人。本站是先跑通的
          <strong style={{ color: 'var(--color-parchment)' }}>样板节点</strong>
          ：公开工作台里，资源与教程可拿走；实验分为向外做事的探索，和向内形成认识的札记。它们是知识库的可读切片，不只是展览。
        </p>
        <p style={{ lineHeight: 1.7, color: 'var(--color-parchment-dim)' }}>
          现在就能用的两种入口：
          <strong>{dualEntry.ask.label}</strong>
          （{dualEntry.ask.hint}）或
          <strong>{dualEntry.browse.label}</strong>
          （{dualEntry.browse.hint}）。近端要把「卡真能用、逛有证据、过程可转」做实。
        </p>
        <p style={{ marginTop: '1rem' }}>
          <Link
            to={WEB_ROUTES.me}
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <User size={16} />
            关于我
          </Link>
        </p>
      </section>

      <section className="panel-glass about-section">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>计划</h2>
        <p
          className="meta"
          style={{ marginTop: 0, marginBottom: '0.85rem', lineHeight: 1.55 }}
        >
          方向与边界，不是已全部上线的功能清单。与仓库{' '}
          <code style={{ fontSize: '0.85em' }}>docs/VISION.md</code> 同向。
        </p>

        <p style={{ lineHeight: 1.75, color: 'var(--color-parchment-dim)' }}>
          <strong style={{ color: 'var(--color-parchment)' }}>一句话：</strong>
          人的认识沉淀为知识库；库上建工作站（Agent）；服务判断与行动（数字先，具身后）；行动数据回灌知识。社会面上做点子社区：每人可有智能微体站——既是自己的影子，又能辅助行稳致远。
        </p>

        <h3 style={{ fontSize: '1rem', margin: '1.25rem 0 0.5rem' }}>
          个体：知识 → 工作站 → 回灌
        </h3>
        <ol
          style={{
            lineHeight: 1.7,
            color: 'var(--color-parchment-dim)',
            paddingLeft: '1.25rem',
            margin: '0.5rem 0 0',
          }}
        >
          <li style={{ marginBottom: '0.45rem' }}>
            <strong style={{ color: 'var(--color-parchment)' }}>知识来源</strong>
            ——来自人的总结与方法，不是爬来的公知堆。
          </li>
          <li style={{ marginBottom: '0.45rem' }}>
            <strong style={{ color: 'var(--color-parchment)' }}>决策支持</strong>
            ——提供给智能做判断；
            <strong style={{ color: 'var(--color-parchment)' }}>
              人定框架，智能在框架内执行
            </strong>
            。
          </li>
          <li style={{ marginBottom: '0.45rem' }}>
            <strong style={{ color: 'var(--color-parchment)' }}>数据闭环</strong>
            ——行动采集证据 → 写回库 → 认识随实践更新。
          </li>
        </ol>
        <p
          style={{
            lineHeight: 1.7,
            color: 'var(--color-parchment-dim)',
            marginTop: '0.75rem',
          }}
        >
          工作站建在知识上，要能
          <strong style={{ color: 'var(--color-parchment)' }}>调用</strong>
          这些认识。具身智能是远期执行器；近端只要求方法可执行、结果可回传，不做近端交付物。
        </p>

        <h3 style={{ fontSize: '1rem', margin: '1.25rem 0 0.5rem' }}>
          社会：点子社区与智能微体站
        </h3>
        <p style={{ lineHeight: 1.7, color: 'var(--color-parchment-dim)' }}>
          打造「点子的社区」：点子相遇、共创、共促。目标是每个人都能拥有一个智能微体站——像哆啦
          A
          梦一样辅助成长：影子（认识与方法的外化）+ 行稳致远的助手。Walker
          是样板节点，不是全人类唯一的站。社区复杂度不灌进本站；样板验证前不做多租户复制。
        </p>

        <h3 style={{ fontSize: '1rem', margin: '1.25rem 0 0.5rem' }}>
          与 NorthStar
        </h3>
        <p style={{ lineHeight: 1.7, color: 'var(--color-parchment-dim)' }}>
          <strong style={{ color: 'var(--color-parchment)' }}>NorthStar</strong>{' '}
          是<strong style={{ color: 'var(--color-parchment)' }}>另一个项目</strong>
          ，不是点子社区本身。点子与内容的分发与产品设计，将
          <strong style={{ color: 'var(--color-parchment)' }}>
            参照、建在 NorthStar 的能力之上
          </strong>
          （尤其是内容分发），而不是把社区中台做进 iwalk，也不是把本站改名叫
          NorthStar。
        </p>

        <h3 style={{ fontSize: '1rem', margin: '1.25rem 0 0.5rem' }}>
          从远到近
        </h3>
        <ul
          style={{
            lineHeight: 1.7,
            color: 'var(--color-parchment-dim)',
            paddingLeft: '1.25rem',
            margin: '0.5rem 0 0',
          }}
        >
          <li style={{ marginBottom: '0.4rem' }}>
            <strong style={{ color: 'var(--color-parchment)' }}>远</strong>
            ——微体站网络 + 点子社区（分发依托 NorthStar 能力）；具身用个人方法库决策并回灌。
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong style={{ color: 'var(--color-parchment)' }}>中</strong>
            ——样板站：库可被 Agent/规则引用进决策与下一步；问题 → 引用知识 →
            行动/交付 → 检验 → 改库。
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong style={{ color: 'var(--color-parchment)' }}>近</strong>
            ——卡真可用 + 逛有证据；一人可养的小生产过程（线索 → 题苗 → 交付 →
            检验）。
          </li>
          <li>
            <strong style={{ color: 'var(--color-parchment)' }}>今</strong>
            ——内容壳与分类已搭；近端主航道仍是把样板做成「真有知识底座、真能辅助下一步与闭环」。社区复制与具身，等样板证明影子有用再开。
          </li>
        </ul>
      </section>

      <section className="panel-glass about-section">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>站点时间线</h2>
        <ul className="post-list">
          {siteStats.siteTimeline.map((t) => (
            <li key={t.date + t.text}>
              <strong style={{ color: 'var(--color-parchment)' }}>{t.date}</strong>
              <div className="meta">{t.text}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-glass about-section">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>花费记录</h2>
        <p className="meta">合计约 ¥{totalCost}（来自 site-stats.json）</p>
        <ul className="post-list">
          {siteStats.costs.map((c, i) => (
            <li key={i}>
              <strong style={{ color: 'var(--color-parchment)' }}>
                {c.date} · {c.category} · ¥{c.amount}
              </strong>
              <div className="meta">{c.note}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
