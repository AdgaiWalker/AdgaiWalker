/**
 * 账号入口（页）
 * 职责：用户登录与注册标准插槽。
 * 访客无需登录即可使用「提问」与「文章」，登录后享有更高并发与个性化历史云同步。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserRound, Lock, Mail, ArrowRight } from 'lucide-react';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';
import { getStoredToken, setStoredToken, clearStoredToken } from '../lib/auth-token';

export function AccountLoginShellPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    // 阶段四插槽演示：支持凭证模拟与插槽就绪
    setNotice(
      mode === 'login'
        ? '账号服务正在灰度联调中，当前访客免登录即可畅享全站功能。'
        : '当前注册暂未全量对外开放，感谢关注！',
    );
  };

  const handleLogout = () => {
    clearStoredToken();
    setToken(null);
    setNotice('已退出当前账号会话');
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '2rem 1rem' }}>
      <header style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h1 className="page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
          <UserRound size={26} aria-hidden />
          {mode === 'login' ? '账号登录' : '注册账号'}
        </h1>
        <p className="page-lead" style={{ margin: '8px 0 0' }}>
          普通访客无需登录即可畅享「{dualEntry.ask.label}」与「{dualEntry.browse.label}」。
        </p>
      </header>

      <div
        className="panel-glass"
        style={{ padding: '2rem', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}
      >
        {token ? (
          <div>
            <p className="success-meta" style={{ fontSize: '1rem', marginTop: 0 }}>
              当前已登录账号身份
            </p>
            <p className="meta">
              Token 已在本地就绪。享有高并发通道与跨端提问记录同步。
            </p>
            <div style={{ marginTop: '1.5rem', display: 'flex', gap: 12 }}>
              <button type="button" className="btn-primary" onClick={handleLogout}>
                退出登录
              </button>
              <Link to={dualEntry.ask.path} className="btn-secondary">
                去{dualEntry.ask.cta}
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label htmlFor="login-email" className="meta" style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                邮箱地址
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, color: 'var(--muted, #888)' }} aria-hidden />
                <input
                  id="login-email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 10,
                    border: '1px solid var(--border, #ccc)',
                    background: 'var(--surface, #fff)',
                    fontSize: '0.95rem',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label htmlFor="login-password" className="meta" style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
                密码
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Lock size={16} style={{ position: 'absolute', left: 12, color: 'var(--muted, #888)' }} aria-hidden />
                <input
                  id="login-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    borderRadius: 10,
                    border: '1px solid var(--border, #ccc)',
                    background: 'var(--surface, #fff)',
                    fontSize: '0.95rem',
                  }}
                />
              </div>
            </div>

            {notice ? (
              <p className="meta" style={{ padding: '8px 12px', background: 'var(--surface-sunken, rgba(0,0,0,0.04))', borderRadius: 8, margin: '0 0 1.25rem' }}>
                {notice}
              </p>
            ) : null}

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px' }}
            >
              {mode === 'login' ? '登录' : '立即注册'}
              <ArrowRight size={16} aria-hidden />
            </button>

            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setMode((m) => (m === 'login' ? 'register' : 'login'));
                  setNotice(null);
                }}
                style={{ fontSize: '0.85rem' }}
              >
                {mode === 'login' ? '还没有账号？点击切换注册' : '已有账号？点击返回登录'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        <Link to={WEB_ROUTES.home} className="meta" style={{ textDecoration: 'none' }}>
          ← 返回首页
        </Link>
      </div>
    </div>
  );
}
