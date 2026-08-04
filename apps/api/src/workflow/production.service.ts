import { Inject, Injectable } from '@nestjs/common';
import { FIXED_RECIPE, PRODUCTION_STAGES, validateStageArtifact, type ProductionStage, type StageArtifact } from '@walker/shared';
import { storageUnavailable, validationError } from '../common/http-error';
import { AGENT_RUNNER, type AgentRunnerPort } from '../ports/agent-runner.port';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { STAGE_ARTIFACT_REPOSITORY, type StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';
import { WORK_REPOSITORY, type WorkRepositoryPort } from '../ports/work.repository';

export interface ProductionRunOptions {
  fromStage?: ProductionStage;
  allowFailure?: boolean;
}

export type ProductionRunResult =
  | { status: 'REVIEW_READY'; latestHash: string | null; completedStages: ProductionStage[] }
  | { status: 'FAILED'; failedStage: ProductionStage; error: string; latestHash: string | null; completedStages: ProductionStage[] }
  | { status: 'CANCELLED'; latestHash: string | null; completedStages: ProductionStage[] };

@Injectable()
export class ProductionService {
  private readonly cancelled = new Set<string>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(AGENT_RUNNER) private readonly runner: AgentRunnerPort,
    @Inject(STAGE_ARTIFACT_REPOSITORY) private readonly artifacts: StageArtifactRepositoryPort,
    @Inject(WORK_REPOSITORY) private readonly works?: WorkRepositoryPort,
  ) {}

  async run(workId: string, originalText: string, options: ProductionRunOptions = {}): Promise<ProductionRunResult> {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    if (!originalText.trim()) throw validationError('original-text-required');
    const persistedWork = await this.works?.findById?.(workId);
    if (persistedWork?.status === 'CANCELLED') {
      const existing = await this.artifacts.list(workId);
      return {
        status: 'CANCELLED',
        latestHash: existing.at(-1)?.hash ?? null,
        completedStages: existing.map((item) => item.stage).filter((stage, index, all) => all.indexOf(stage) === index),
      };
    }
    if (this.cancelled.has(workId)) {
      const completedStages = (await this.artifacts.list(workId)).map((item) => item.stage).filter((stage, index, all) => all.indexOf(stage) === index);
      const latestHash = (await this.artifacts.list(workId)).at(-1)?.hash ?? null;
      return { status: 'CANCELLED', latestHash, completedStages };
    }
    const from = options.fromStage ?? await this.findNextStage(workId);
    const start = PRODUCTION_STAGES.indexOf(from);
    if (options.fromStage && (await this.artifacts.list(workId)).filter((item) => item.stage === from).length >= 3) {
      throw validationError('retry-limit-exceeded');
    }
    await this.works?.setStatus?.(workId, 'PROCESSING');
    await this.works?.setProgress?.(workId, { currentStage: from, stageStartedAt: new Date(), waitingReason: null });
    const completedStages = (await this.artifacts.list(workId)).map((item) => item.stage).filter((stage, index, all) => all.indexOf(stage) === index);
    let previousHash: string | null = null;
    const prior = await this.artifacts.list(workId);
    const priorAtStart = prior.filter((item) => PRODUCTION_STAGES.indexOf(item.stage) < start).at(-1);
    previousHash = priorAtStart?.hash ?? null;

    for (const stage of PRODUCTION_STAGES.slice(start)) {
      if (this.cancelled.has(workId)) {
        await this.works?.setStatus?.(workId, 'CANCELLED');
        await this.works?.setProgress?.(workId, { currentStage: stage, waitingReason: 'cancelled' });
        return { status: 'CANCELLED', latestHash: previousHash, completedStages };
      }
      await this.works?.setProgress?.(workId, { currentStage: stage, stageStartedAt: new Date(), waitingReason: null });
      const prompt = this.buildPrompt(stage, originalText, prior, previousHash);
      try {
        const result = await this.runner.run({ prompt, cwd: process.cwd() });
        validateStageArtifact(result.output, stage);
        const artifact = result.output as StageArtifact;
        this.assertQualitySafe(stage, artifact.output);
        artifact.output = this.ensurePortableOutput(stage, artifact.output, originalText);
        artifact.inputHash = previousHash ?? undefined;
        artifact.createdAt = new Date().toISOString();
        const saved = await this.artifacts.write(workId, artifact);
        await this.works?.setProgress?.(workId, { lastOutputAt: new Date() });
        // Feed the just-produced artifact into the next stage prompt. Keeping
        // this list live is what makes the fixed recipe a real chain rather
        // than repeatedly asking the agent to process the original draft.
        prior.push(saved);
        previousHash = saved.hash;
        if (!completedStages.includes(stage)) completedStages.push(stage);
      } catch (error) {
        await this.works?.setStatus?.(workId, 'FAILED');
        await this.works?.setProgress?.(workId, { currentStage: stage, waitingReason: error instanceof Error ? error.message : 'production-stage-failed' });
        return {
          status: 'FAILED',
          failedStage: stage,
          error: error instanceof Error ? error.message : 'production-stage-failed',
          latestHash: previousHash,
          completedStages,
        };
      }
    }
    await this.works?.setStatus?.(workId, 'REVIEW_READY');
    await this.works?.setProgress?.(workId, { currentStage: null, waitingReason: null });
    return { status: 'REVIEW_READY', latestHash: previousHash, completedStages };
  }

  async cancel(workId: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    this.cancelled.add(workId);
    await this.works?.setStatus?.(workId, 'CANCELLED');
    await this.works?.setProgress?.(workId, { waitingReason: 'cancelled' });
    return { status: 'CANCELLED' as const, workId };
  }

  async acceptManualArtifact(workId: string, artifact: StageArtifact) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    validateStageArtifact(artifact);
    this.assertQualitySafe(artifact.stage, artifact.output);
    if ((await this.artifacts.list(workId)).filter((item) => item.stage === artifact.stage).length >= 3) {
      throw validationError('retry-limit-exceeded');
    }
    const body = typeof artifact.output.body === 'string' ? artifact.output.body : '';
    const normalized: StageArtifact = {
      ...artifact,
      output: this.ensurePortableOutput(artifact.stage, artifact.output, body),
      createdAt: artifact.createdAt ?? new Date().toISOString(),
    };
    const saved = await this.artifacts.write(workId, normalized);
    if (this.works?.setStatus) {
      await this.works.setStatus(workId, artifact.stage === 'REVIEW_READY' ? 'REVIEW_READY' : 'PROCESSING');
    }
    await this.works?.setProgress?.(workId, {
      currentStage: artifact.stage === 'REVIEW_READY' ? null : artifact.stage,
      lastOutputAt: new Date(),
      waitingReason: null,
    });
    return saved;
  }

  private async findNextStage(workId: string): Promise<ProductionStage> {
    const existing = await this.artifacts.list(workId);
    return PRODUCTION_STAGES.find((stage) => !existing.some((item) => item.stage === stage)) ?? 'REVIEW_READY';
  }

  private buildPrompt(stage: ProductionStage, originalText: string, previous: Awaited<ReturnType<StageArtifactRepositoryPort['list']>>, previousHash: string | null): string {
    const source = previous.at(-1)?.artifact.output ?? { body: originalText };
    return [
      `recipe=${FIXED_RECIPE.id}@${FIXED_RECIPE.version}`,
      `stage=${stage}`,
      'Return one JSON object with recipeVersion, stage, and output. Keep the author core viewpoint unchanged.',
      `inputHash=${previousHash ?? 'original'}`,
      `input=${JSON.stringify(source)}`,
    ].join('\n');
  }

  private ensurePortableOutput(stage: ProductionStage, output: Record<string, unknown>, originalText: string): Record<string, unknown> {
    const body = typeof output.body === 'string' && output.body.trim() ? output.body : originalText;
    if (stage === 'COVER') {
      return {
        ...output,
        landscapeCover: this.coverOrFallback(output.landscapeCover, 'landscape', body),
        portraitCover: this.coverOrFallback(output.portraitCover, 'portrait', body),
      };
    }
    if (stage === 'WEB_FORMAT') return { ...output, body, markdown: typeof output.markdown === 'string' ? output.markdown : body };
    if (stage === 'WECHAT_FORMAT') {
      const html = this.sanitizeHtml(typeof output.html === 'string' ? output.html : `<p>${this.escapeHtml(body)}</p>`);
      return { ...output, body, html, mobilePreviewHtml: this.mobilePreview(html), landscapeCover: this.coverOrFallback(output.landscapeCover, 'landscape', body), portraitCover: this.coverOrFallback(output.portraitCover, 'portrait', body) };
    }
    if (stage === 'REVIEW_READY') {
      const html = this.sanitizeHtml(typeof output.html === 'string' ? output.html : `<p>${this.escapeHtml(body)}</p>`);
      return { ...output, body, markdown: typeof output.markdown === 'string' ? output.markdown : body, html, mobilePreviewHtml: this.mobilePreview(html), title: typeof output.title === 'string' ? output.title : 'AI content draft', landscapeCover: this.coverOrFallback(output.landscapeCover, 'landscape', body), portraitCover: this.coverOrFallback(output.portraitCover, 'portrait', body) };
    }
    return { ...output, body };
  }

  private coverSvg(orientation: 'landscape' | 'portrait', text: string): string {
    const width = orientation === 'landscape' ? 2100 : 900;
    const height = orientation === 'landscape' ? 900 : 1200;
    const label = this.escapeHtml(text.slice(0, 42));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#111827"/><text x="8%" y="45%" fill="#fff" font-size="54" font-family="Arial, sans-serif">${label}</text><text x="8%" y="54%" fill="#93c5fd" font-size="30" font-family="Arial, sans-serif">AdgaiWalker</text></svg>`;
  }

  private escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }

  private sanitizeHtml(value: string): string {
    return value
      .replace(/<\/?(script|iframe|object|embed|form)[^>]*>[\s\S]*?<\/?\1\s*>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .trim();
  }

  private coverOrFallback(value: unknown, orientation: 'landscape' | 'portrait', body: string): string {
    const expected = orientation === 'landscape' ? 'width="2100" height="900"' : 'width="900" height="1200"';
    return typeof value === 'string' && value.includes(expected) ? value : this.coverSvg(orientation, body);
  }

  private mobilePreview(html: string): string {
    return `<div data-preview-width="390" style="max-width:390px;width:100%;overflow-wrap:anywhere">${html}</div>`;
  }

  private assertQualitySafe(stage: ProductionStage, output: Record<string, unknown>): void {
    if (stage !== 'QUALITY_CHECK') return;
    const risks = Array.isArray(output.risks) ? output.risks : [];
    const unresolved = risks.some((risk) => {
      if (!risk || typeof risk !== 'object') return false;
      const item = risk as { severity?: unknown; resolved?: unknown };
      return item.severity === 'high' && item.resolved !== true;
    });
    if (unresolved) throw new Error('quality-risk-unresolved');
  }
}
