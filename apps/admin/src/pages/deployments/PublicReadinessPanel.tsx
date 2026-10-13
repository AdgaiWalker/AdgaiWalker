import { Check, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
import type { PublicDeploymentReadiness, PublicReadinessGateKey } from '@walker/shared';

const GATE_LABELS: Record<PublicReadinessGateKey, string> = {
  verifiedSnapshot: '已核验公开快照',
  memberPermissions: '成员只读权限与测试',
  runtimeIsolation: '运行隔离探针',
  logRetention: '日志保留策略',
  deletionRecovery: '删除与恢复清单',
  publicRoutes: 'Nest / Caddy 公网白名单',
  resourceHeadroom: '目标机器内存余量',
};

export function readinessAllowsEnable(
  report: PublicDeploymentReadiness | undefined,
  isPending: boolean,
  isError: boolean,
): boolean {
  return !isPending && !isError && report?.canEnable === true;
}

export function PublicReadinessPanel({
  report, isPending, isError, onRetry,
}: {
  report: PublicDeploymentReadiness | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const readyCount = report?.gates.filter((gate) => gate.state === 'ready').length ?? 0;
  return (
    <details className="deployment-readiness" open={!report?.canEnable}>
      <summary>
        启用前检查
        <span className={report?.canEnable ? 'badge green' : 'badge red'}>
          {isPending ? '检查中' : isError ? '检查不可用' : report ? `${readyCount}/${report.gates.length} 项通过` : '尚未检查'}
        </span>
      </summary>
      {isPending ? <p className="muted"><LoaderCircle size={14} aria-hidden="true" />正在核对启用条件</p> : null}
      {isError ? <p role="alert">启用检查暂不可用，已禁用启用操作。</p> : null}
      <button type="button" disabled={isPending} onClick={onRetry}>
        <RefreshCw size={14} aria-hidden="true" />重新检查
      </button>
      {report && <ul>
        {report.gates.map((gate) => (
          <li key={gate.key}>
            {gate.state === 'ready'
              ? <Check size={15} className="readiness-icon ready" aria-label="通过" />
              : <CircleAlert size={15} className="readiness-icon blocked" aria-label="未通过" />}
            <div>
              <strong>{GATE_LABELS[gate.key]}</strong>
              <span>{gate.reason}</span>
              {gate.details.map((detail) => <small key={detail}>{detail}</small>)}
            </div>
          </li>
        ))}
      </ul>}
    </details>
  );
}
