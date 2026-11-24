import { HttpStatus, type Logger } from '@nestjs/common';
import {
  resolvePublicSiteUrl,
  type ContentReleaseStage,
  type ReleaseCancelResult,
  type ReleaseReconcileResult,
  type ReleaseVerificationResult,
} from '@walker/shared';
import { ApiError, validationError } from '../common/http-error';
import type { ContentLockPort } from '../ports/content-lock.port';
import type { ContentReleaseRunnerPort } from '../ports/content-release-runner.port';
import type { ContentReleaseRepositoryPort } from '../ports/content-release.repository';
import type { GitStatusPort } from '../ports/git-status.repository';
import type { WebsiteDeploymentVerifierPort } from '../ports/website-deployment-verifier.port';

export interface RunningReleaseHandle {
  runId: string;
  releaseId?: string;
  slug: string;
  pid?: number;
  abortController?: AbortController;
}

export interface ReleaseReconcileDeps {
  releasesRepo?: ContentReleaseRepositoryPort;
  contentLock?: ContentLockPort;
  websiteVerifier?: WebsiteDeploymentVerifierPort;
  git?: GitStatusPort;
  runner: ContentReleaseRunnerPort;
  log: Logger;
  getRunning: () => RunningReleaseHandle | null;
  verifyRelease: (releaseId: string) => Promise<ReleaseVerificationResult>;
}

async function stopRunningRelease(
  running: RunningReleaseHandle | null,
  runner: ContentReleaseRunnerPort,
  releaseId: string,
): Promise<void> {
  if (running?.releaseId !== releaseId) return;
  running.abortController?.abort();
  if (running.pid && runner.terminateProcessTree) {
    await runner.terminateProcessTree(running.pid);
  }
}

/**
 * 结果不明的发布核对（PRD A3 / C18）：
 * 根据线上站点与 Git 提交事实把不明状态收敛为事实状态，严防自动重复推送。
 */
export async function reconcileContentRelease(
  deps: ReleaseReconcileDeps,
  releaseId: string,
): Promise<ReleaseReconcileResult> {
  if (!deps.releasesRepo) throw validationError('content-release-repository-unavailable');
  const release = await deps.releasesRepo.findById(releaseId);
  if (!release) throw new ApiError('content-release-not-found', HttpStatus.NOT_FOUND, '找不到发布记录');

  const previousStage = release.stage;
  if (
    release.stage === 'COMMITTING' &&
    (deps.getRunning()?.releaseId === releaseId || (await deps.contentLock?.isLocked()))
  ) {
    return {
      releaseId: release.id,
      previousStage,
      currentStage: 'COMMITTING',
      resolved: false,
      nextAction: 'wait-run',
      details: '发布进程或工作区锁仍在运行，等待退出证明后再核对',
      verifiedHash: null,
      gitCommit: release.gitCommit,
    };
  }

  if (release.stage === 'PUBLISHED') {
    return {
      releaseId: release.id,
      previousStage,
      currentStage: release.stage,
      resolved: true,
      nextAction: 'none',
      details: '发布已由线上证据确证为已发布，无需核对',
      verifiedHash: release.verifiedHash,
      gitCommit: release.gitCommit,
    };
  }

  if (release.stage === 'FAILED') {
    return {
      releaseId: release.id,
      previousStage,
      currentStage: release.stage,
      resolved: true,
      nextAction: 'none',
      details: `发布此前已失败（${release.errorCode ?? 'unknown-error'}），未发生有效推送`,
      verifiedHash: null,
      gitCommit: release.gitCommit,
    };
  }

  const base = resolvePublicSiteUrl(process.env.PUBLIC_SITE_URL);
  const url = `${base}/posts/${encodeURIComponent(release.target.slug)}`;
  if (deps.websiteVerifier) {
    try {
      const verification = await deps.websiteVerifier.verify(url, {
        slug: release.target.slug,
        expectedHash: release.sourceHash,
        retries: 0,
      });
      if (verification.ok === true && verification.verifiedHash === release.sourceHash) {
        if (release.stage !== 'VERIFYING') {
          await deps.releasesRepo.updateStage({ id: release.id, stage: 'VERIFYING' });
        }
        const verified = await deps.verifyRelease(release.id);
        return {
          releaseId: release.id,
          previousStage,
          currentStage: verified.stage,
          resolved: true,
          nextAction: 'none',
          details: '线上文章与版本证明已确证，发布成功且问答索引已同步',
          verifiedHash: verified.verifiedHash,
          gitCommit: release.gitCommit,
        };
      }
    } catch (err: unknown) {
      deps.log.warn(`线上核验探针失败（将回落至 Git 事实判定）：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const hasRecordedCommit = Boolean(release.gitCommit);
  const commitExistsInRepo =
    release.gitCommit && deps.git?.hasCommit ? await deps.git.hasCommit(release.gitCommit) : false;

  if (release.stage === 'PUSHED' || release.stage === 'VERIFYING') {
    let currentStage: ContentReleaseStage = release.stage;
    if (currentStage !== 'VERIFYING') {
      currentStage = (await deps.releasesRepo.updateStage({ id: release.id, stage: 'VERIFYING' })).stage;
    }
    return {
      releaseId: release.id,
      previousStage,
      currentStage,
      resolved: false,
      nextAction: 'wait-deployment',
      details: '已确证 Git 提交存在，内容已推送或准备推送，正等待 Vercel 部署生效，严禁重复提交',
      verifiedHash: null,
      gitCommit: release.gitCommit,
    };
  }

  if (hasRecordedCommit || commitExistsInRepo) {
    if (release.stage !== 'UNKNOWN') {
      await deps.releasesRepo.updateStage({ id: release.id, stage: 'UNKNOWN' });
    }
    return {
      releaseId: release.id,
      previousStage,
      currentStage: 'UNKNOWN',
      resolved: false,
      nextAction: 'check-git-remote',
      details: '仅确证本地提交存在，尚无远端推送证据；保持结果不明且不自动重复提交',
      verifiedHash: null,
      gitCommit: release.gitCommit,
    };
  }

  if (release.stage === 'COMMITTING') {
    const ws = await deps.git?.workspaceSnapshot?.();
    const isDirty = ws?.dirtyFiles.some((f) => f.includes(release.target.slug));
    if (isDirty) {
      const updated = await deps.releasesRepo.updateStage({
        id: release.id,
        stage: 'FAILED',
        errorCode: 'commit-interrupted',
      });
      return {
        releaseId: release.id,
        previousStage,
        currentStage: updated.stage,
        resolved: true,
        nextAction: 'none',
        details: '工作区文件未提交，原发布提交动作已中断并安全置为失败，可重新发起发布',
        verifiedHash: null,
        gitCommit: null,
      };
    }
  }

  let currentStage: ContentReleaseStage = release.stage;
  if (currentStage !== 'UNKNOWN') {
    currentStage = (await deps.releasesRepo.updateStage({ id: release.id, stage: 'UNKNOWN' })).stage;
  }
  return {
    releaseId: release.id,
    previousStage,
    currentStage,
    resolved: false,
    nextAction: 'check-git-remote',
    details: '无法确认 Git 推送与线上生效状态，保持 UNKNOWN 状态，请人工核查远端 Git 仓库与网络',
    verifiedHash: null,
    gitCommit: release.gitCommit,
  };
}

/** 取消发布并进行进程树终止核验（C19）：已派发推送后绝不伪造"已取消且未发布"。 */
export async function cancelContentRelease(
  deps: ReleaseReconcileDeps,
  releaseId: string,
): Promise<ReleaseCancelResult> {
  if (!deps.releasesRepo) throw validationError('content-release-repository-unavailable');
  const release = await deps.releasesRepo.findById(releaseId);
  if (!release) throw new ApiError('content-release-not-found', HttpStatus.NOT_FOUND, '找不到发布记录');

  if (release.stage === 'PUBLISHED') {
    return {
      releaseId: release.id,
      cancelled: false,
      stage: release.stage,
      message: '发布已由线上确证为已发布，无法取消',
    };
  }
  if (release.stage === 'FAILED') {
    return {
      releaseId: release.id,
      cancelled: false,
      stage: release.stage,
      message: '发布已处于失败终态，无需取消',
    };
  }
  if (release.stage === 'PREPARED') {
    const updated = await deps.releasesRepo.updateStage({
      id: release.id,
      stage: 'FAILED',
      errorCode: 'cancelled-before-dispatch',
    });
    return { releaseId: release.id, cancelled: true, stage: updated.stage, message: '发布尚未派发，已取消' };
  }

  await stopRunningRelease(deps.getRunning(), deps.runner, release.id);

  if (release.stage === 'COMMITTING') {
    const updated = await deps.releasesRepo
      .updateStage({ id: release.id, stage: 'UNKNOWN', errorCode: 'cancel-outcome-unknown' })
      .catch(async () => (await deps.releasesRepo!.findById(release.id))!);
    return {
      releaseId: release.id,
      cancelled: false,
      stage: updated.stage,
      message: '已请求停止；推送结果仍需核对，不能据此断言未发布',
    };
  }

  const reconciled = await reconcileContentRelease(deps, release.id);
  if (reconciled.currentStage === 'PUBLISHED') {
    return {
      releaseId: release.id,
      cancelled: false,
      stage: reconciled.currentStage,
      message: '发布已派发并在生产环境生效，无法取消，已确证为已发布',
    };
  }
  return {
    releaseId: release.id,
    cancelled: false,
    stage: reconciled.currentStage,
    message: `发布已推送到远端，无法直接取消；当前状态：${reconciled.currentStage}，需等待部署核对结果`,
  };
}
