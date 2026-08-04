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
  | { status: 'FAILED'; failedStage: ProductionStage; error: string; latestHash: string | null; completedStages: ProductionStage[] };

@Injectable()
export class ProductionService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(AGENT_RUNNER) private readonly runner: AgentRunnerPort,
    @Inject(STAGE_ARTIFACT_REPOSITORY) private readonly artifacts: StageArtifactRepositoryPort,
    @Inject(WORK_REPOSITORY) private readonly works?: WorkRepositoryPort,
  ) {}

  async run(workId: string, originalText: string, options: ProductionRunOptions = {}): Promise<ProductionRunResult> {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    if (!originalText.trim()) throw validationError('original-text-required');
    await this.works?.setStatus?.(workId, 'PROCESSING');
    const from = options.fromStage ?? await this.findNextStage(workId);
    const start = PRODUCTION_STAGES.indexOf(from);
    const completedStages = (await this.artifacts.list(workId)).map((item) => item.stage).filter((stage, index, all) => all.indexOf(stage) === index);
    let previousHash: string | null = null;
    const prior = await this.artifacts.list(workId);
    const priorAtStart = prior.filter((item) => PRODUCTION_STAGES.indexOf(item.stage) < start).at(-1);
    previousHash = priorAtStart?.hash ?? null;

    for (const stage of PRODUCTION_STAGES.slice(start)) {
      const prompt = this.buildPrompt(stage, originalText, prior, previousHash);
      try {
        const result = await this.runner.run({ prompt, cwd: process.cwd() });
        validateStageArtifact(result.output, stage);
        const artifact = result.output as StageArtifact;
        artifact.output = this.ensurePortableOutput(stage, artifact.output, originalText);
        artifact.inputHash = previousHash ?? undefined;
        artifact.createdAt = new Date().toISOString();
        const saved = await this.artifacts.write(workId, artifact);
        // Feed the just-produced artifact into the next stage prompt. Keeping
        // this list live is what makes the fixed recipe a real chain rather
        // than repeatedly asking the agent to process the original draft.
        prior.push(saved);
        previousHash = saved.hash;
        if (!completedStages.includes(stage)) completedStages.push(stage);
      } catch (error) {
        await this.works?.setStatus?.(workId, 'FAILED');
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
    return { status: 'REVIEW_READY', latestHash: previousHash, completedStages };
  }

  async acceptManualArtifact(workId: string, artifact: StageArtifact) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    validateStageArtifact(artifact);
    return this.artifacts.write(workId, artifact);
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
        landscapeCover: typeof output.landscapeCover === 'string' ? output.landscapeCover : this.coverSvg('landscape', body),
        portraitCover: typeof output.portraitCover === 'string' ? output.portraitCover : this.coverSvg('portrait', body),
      };
    }
    if (stage === 'WEB_FORMAT') return { ...output, body, markdown: typeof output.markdown === 'string' ? output.markdown : body };
    if (stage === 'WECHAT_FORMAT') return { ...output, body, html: typeof output.html === 'string' ? output.html : `<p>${this.escapeHtml(body)}</p>` };
    if (stage === 'REVIEW_READY') return { ...output, body, markdown: typeof output.markdown === 'string' ? output.markdown : body, html: typeof output.html === 'string' ? output.html : `<p>${this.escapeHtml(body)}</p>`, title: typeof output.title === 'string' ? output.title : 'AI content draft' };
    return { ...output, body };
  }

  private coverSvg(orientation: 'landscape' | 'portrait', text: string): string {
    const width = orientation === 'landscape' ? 1600 : 900;
    const height = orientation === 'landscape' ? 900 : 1200;
    const label = this.escapeHtml(text.slice(0, 42));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#111827"/><text x="8%" y="45%" fill="#fff" font-size="54" font-family="Arial, sans-serif">${label}</text><text x="8%" y="54%" fill="#93c5fd" font-size="30" font-family="Arial, sans-serif">AdgaiWalker</text></svg>`;
  }

  private escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!); }
}
