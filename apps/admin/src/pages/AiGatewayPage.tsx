/**
 * 系统（页）
 * 职责：旧 AI Gateway / 系统健康等价——只读 /health，不伪造调用统计。
 *
 * 依赖：admin-api.health
 * 调用：GET /health
 * 触发：/ai-gateway
 * 实现：展示 db / AI 开关；配置走环境变量
 */
import { useCallback, useEffect, useState } from 'react';
import { Activity, Server } from 'lucide-react';
import { adminApi } from '../api/admin-api';
import { useAdminAction } from '../hooks/useAdminAction';

export function AiGatewayPage() {
  const [health, setHealth] = useState<{
    ok: boolean;
    db: boolean;
    aiEnabled: boolean;
  } | null>(null);
  const { err, run } = useAdminAction();

  const load = useCallback(async () => {
    await run(async () => {
      setHealth(await adminApi.health());
    });
  }, [run]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>
        <Server size={22} style={{ verticalAlign: -4, marginRight: 8 }} aria-hidden />
        系统
      </h1>
      <p className="muted">
        旧站 AI Gateway 全配面板不迁。现网：AI 由环境变量{' '}
        <code>AI_ENABLED</code> 控制；关时 intake 用规则 nextStep。
      </p>
      {err ? <p className="error">{err}</p> : null}
      <div className="panel">
        <h3>
          <Activity size={16} style={{ verticalAlign: -2, marginRight: 6 }} aria-hidden />
          健康态
        </h3>
        {!health ? (
          <p className="muted">加载中…</p>
        ) : (
          <ul className="muted" style={{ lineHeight: 1.8 }}>
            <li>API：{health.ok ? 'ok' : '异常'}</li>
            <li>数据库：{health.db ? '已连接' : '未连接 / 不可写'}</li>
            <li>AI：{health.aiEnabled ? '已启用' : '关闭（规则路径）'}</li>
          </ul>
        )}
        <button type="button" className="secondary" onClick={() => void load()}>
          刷新
        </button>
      </div>
      <div className="panel">
        <h3>配置说明</h3>
        <p className="muted">
          改 AI 开关请编辑 <code>apps/api/.env</code> 中 <code>AI_ENABLED</code>
          ，重启 API。不在此页存密钥、不做假统计。
        </p>
      </div>
    </div>
  );
}
