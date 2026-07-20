import { Link } from 'react-router-dom';

export function LoginPage() {
  return (
    <div>
      <h1>管理端登录</h1>
      <div className="panel">
        <p className="muted">
          登录入口保真存在。完整 cookie 会话（walker-session）在 AuthModule
          后续加固；推进核本地开发可直连写接口。
        </p>
        <Link to="/clues">进入线索池 →</Link>
      </div>
    </div>
  );
}
