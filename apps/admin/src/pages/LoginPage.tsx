import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import {
  clearAdminToken,
  getAdminToken,
  setAdminToken,
} from '../auth/token-store';

export function LoginPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(getAdminToken());
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div>
      <h1>管理令牌</h1>
      <div className="panel">
        <p className="muted">
          管理面使用 Bearer <code>ADMIN_API_TOKEN</code>（与 API 环境变量一致，长度至少 16）。
          令牌只存在本机 localStorage，不上传第三方。
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
            if (token.trim().length < 16) {
              setMsg('令牌过短（至少 16 字符）');
              return;
            }
            setAdminToken(token);
            setMsg('已保存，进入线索池');
            navigate('/clues');
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
        <p className="muted">
          <Link to="/clues">线索</Link>
        </p>
      </div>
    </div>
  );
}
