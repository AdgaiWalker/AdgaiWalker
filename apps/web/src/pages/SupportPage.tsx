/**
 * 赞赏页（页）
 * 职责：展示赞赏配置；配置真相源为仓库 content/support-config.json（构建期打入）。
 * 不经 API 读：生产 web 静态无 Nest 时仍可展示；改配置靠 git push 重建。
 *
 * 依赖：support-config.json（配置）、WEB_ROUTES
 * 调用：无 HTTP 读
 * 触发：路由 /support
 * 实现：静态渲染二维码与文案
 */
import { Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import supportConfig from '../../../../content/support-config.json';
import { WEB_ROUTES } from '../shared/routes';

type SupportView = {
  title: string;
  body: string;
  wechatQrUrl: string;
  alipayQrUrl: string;
  externalLinks: Array<{ label: string; url: string }>;
};

const cfg = supportConfig as SupportView;

export function SupportPage() {
  const hasQr = Boolean(cfg.wechatQrUrl || cfg.alipayQrUrl);
  const hasLinks = Boolean(cfg.externalLinks?.length);

  return (
    <div className="support-page">
      <h1 className="page-title">
        <Heart size={26} aria-hidden className="page-title-icon" />
        {cfg.title}
      </h1>
      <p className="page-lead support-sub">{cfg.body}</p>

      <section className="panel-glass support-body">
        {hasQr ? (
          <div className="qr-row">
            {cfg.wechatQrUrl ? (
              <figure className="qr-card">
                <img
                  src={cfg.wechatQrUrl}
                  alt="微信赞赏码"
                  width={180}
                  height={180}
                />
                <figcaption>微信赞赏</figcaption>
                <span className="meta">长按或扫码</span>
              </figure>
            ) : null}
            {cfg.alipayQrUrl ? (
              <figure className="qr-card">
                <img
                  src={cfg.alipayQrUrl}
                  alt="支付宝收款码"
                  width={180}
                  height={180}
                />
                <figcaption>支付宝</figcaption>
                <span className="meta">长按或扫码</span>
              </figure>
            ) : null}
          </div>
        ) : (
          <p className="meta">暂未配置收款码。</p>
        )}

        {hasLinks ? (
          <ul className="support-links">
            {cfg.externalLinks.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="meta support-foot">所有内容免费阅读，赞赏完全自愿。谢谢你。</p>
      <Link to={WEB_ROUTES.home}>回到首页</Link>
    </div>
  );
}
