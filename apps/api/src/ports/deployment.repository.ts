import type { DeploymentMemberInput, DeploymentView } from '@walker/shared';

export const DEPLOYMENT_REPOSITORY = Symbol('DEPLOYMENT_REPOSITORY');

export interface DeploymentRepositoryPort {
  list(): Promise<DeploymentView[]>;
  detail(id: string): Promise<DeploymentView | null>;
  /** 按位置与对象范围查找部署（公开问答解析入口）。 */
  findByPlacement(placementKey: string, scopeKind: string, scopeSlug: string): Promise<DeploymentView | null>;
  /**
   * 创建或更新位置绑定。expectedGeneration 为 null 表示新建；
   * 更新时必须与当前 generation 相等（CAS），不等即冲突。
   * deploymentId 是幂等键：重复提交相同内容返回同一部署，内容不同拒绝。
   * 启用中的部署拒绝普通成员更新；受控回退由服务层先核验目标修订。
   */
  save(input: {
    deploymentId: string;
    actor: string;
    requestId: string;
    placementKey: string;
    scopeKind: string;
    scopeSlug: string;
    members: DeploymentMemberInput[];
    expectedGeneration: number | null;
    /** Internal rollback path only; caller has qualified the new default revision. */
    allowEnabledUpdate?: boolean;
  }): Promise<DeploymentView>;
  /** 启用/禁用同样走 generation CAS；禁用保留历史成员。 */
  setEnabled(input: {
    id: string;
    enabled: boolean;
    expectedGeneration: number;
    actor: string;
    requestId: string;
  }): Promise<DeploymentView>;
}
