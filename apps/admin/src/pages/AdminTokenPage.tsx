import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import {
  ADMIN_TOKEN_MIN_LENGTH,
  isValidAdminToken,
} from '../auth/token-policy';
import {
  clearAdminToken,
  getAdminToken,
  setAdminToken,
} from '../auth/token-store';
import { ADMIN_ROUTES } from '../shared/routes';

export function AdminTokenPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from: string }).from !== ADMIN_ROUTES.login
      ? (location.state as { from: string }).from
      : ADMIN_ROUTES.clues;

  const [token, setToken] = useState(getAdminToken());
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="layout" style={{ maxWidth: 480, margin: '2rem auto', padding: 16 }}>
      <h1>管理令牌</h1>
      <div className="panel">
        <p className="muted">
          管理面使用 Bearer <code>ADMIN_API_TOKEN</code>（与 API 环境变量一致，长度至少{' '}
          {ADMIN_TOKEN_MIN_LENGTH}）。令牌只存在本机 localStorage，不上传第三方。
        </p>
        <label htmlFor="token">
          <KeyRound size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          ADMIN_API_TOKEN
        </label>
        <input
          id="token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          placeholder="粘贴管理令牌"
        />
        <button
          type="button"
          onClick={() => {
            if (!isValidAdminToken(token)) {
              setMsg(`令牌过短（至少 ${ADMIN_TOKEN_MIN_LENGTH} 字符）`);
              return;
            }
            setAdminToken(token);
            setMsg('已保存，进入工作台');
            navigate(from, { replace: true });
          }}
        >
          保存并进入
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            clearAdminToken();
            setToken('');
            setMsg('已清除本机令牌');
          }}
        >
          清除令牌
        </button>
        {msg ? <p className="muted">{msg}</p> : null}
        {isValidAdminToken(getAdminToken()) ? (
          <p className="muted">
            <Link to={ADMIN_ROUTES.clues}>已有令牌 · 去线索</Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
