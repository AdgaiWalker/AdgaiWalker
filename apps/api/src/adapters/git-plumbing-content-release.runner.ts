/** 无工作树单篇原子发布适配器（替代重型 pnpm content:publish 子进程） */
import type { ContentReleaseRunnerPort, ReleaseProcessResult, RunReleaseOptions } from '../ports/content-release-runner.port';
import { resolveContentRepoRoot } from './content-repo-dir';
import { publishSingleArticle } from './git-content-plumbing';

export class GitPlumbingContentReleaseRunner implements ContentReleaseRunnerPort {
  async runRelease(options?: RunReleaseOptions): Promise<ReleaseProcessResult> {
    const target = options?.target;
    if (!target) {
      return { exitCode: 1, timedOut: false, stdout: '', stderr: 'missing-release-target', exitProof: 'exited' };
    }
    const repoRoot = resolveContentRepoRoot();
    if (!repoRoot) {
      return { exitCode: 1, timedOut: false, stdout: '', stderr: 'content-repo-root-not-found', exitProof: 'exited' };
    }
    const res = await publishSingleArticle({ repoRoot, ...target });
    if (!res.ok) {
      return {
        exitCode: 1, timedOut: false, stdout: '', stderr: res.error || 'publish-failed',
        exitProof: 'exited', conflict: res.conflict === true,
      };
    }
    const sha = res.commit?.slice(0, 12) ?? '';
    const line = res.noop ? `远端已包含相同内容（${sha}）` : `已单篇原子推送到 GitHub（${sha}），等待 Vercel 部署`;
    return {
      exitCode: 0, timedOut: false, stdout: `${JSON.stringify({ exitCode: 0, tail: [line] })}\n`,
      stderr: '', exitProof: 'exited', gitCommit: res.commit ?? null,
    };
  }
}
