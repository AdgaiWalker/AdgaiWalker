import { Link } from 'react-router-dom';
import { useState } from 'react';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div>
      <h1 className="page-title">登录</h1>
      <p className="page-lead">统一入口。游客问答不挡首屏。</p>
      <div className="panel-glass" style={{ padding: '1.35rem 1.5rem', borderRadius: 28, maxWidth: 420 }}>
        <label htmlFor="u">用户名</label>
        <input id="u" value={username} onChange={(e) => setUsername(e.target.value)} style={{ margin: '6px 0 12px' }} />
        <label htmlFor="p">密码</label>
        <input
          id="p"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ margin: '6px 0 12px' }}
        />
        <button
          type="button"
          className="btn-primary"
          onClick={() => setMsg('登录 API 将在 Auth 阶段接入；路径与表单壳已就绪。')}
        >
          登录
        </button>
        {msg ? <p className="meta">{msg}</p> : null}
        <p className="meta" style={{ marginTop: 12 }}>
          <Link to="/">返回首页</Link>
        </p>
      </div>
    </div>
  );
}
