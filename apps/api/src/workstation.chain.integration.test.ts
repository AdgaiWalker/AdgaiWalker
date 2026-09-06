import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { PUBLISHED_POST_REQUIRED_FIELDS } from '@walker/shared';
import { ConfigModule } from './config/config.module';
import { KernelModule } from './kernel.module';
import { AGENT_RUNNER, type AgentRunnerPort } from './ports/agent-runner.port';
import { WEBSITE_DEPLOYMENT_VERIFIER } from './ports/website-deployment-verifier.port';
import { WorkService } from './work/work.service';
import { ProductionService } from './workflow/production.service';
import { ReviewService } from './workflow/review.service';
import { PublicationService } from './workflow/publication.service';
import { newId } from './common/ids';

/**
 * 工作站交付链边界测（真实 kernel 接线 + 假 AgentRunner + 独立测试库）。
 * 验收锚点：初稿 → 生产 → 「刷新后」从服务端审阅包恢复候选 → 按候选 hash 批准
 * → 发布文件天然通过内容门禁（shared PUBLISHED_POST_REQUIRED_FIELDS）→ 线上校验通过。
 * 产物目录与内容目录指向临时位置，不污染仓库 content/log 与 var/works。
 */
const workRoot = mkdtempSync(path.join(tmpdir(), 'walker-works-'));
const contentDir = mkdtempSync(path.join(tmpdir(), 'walker-content-'));
process.env.WORK_ROOT_DIR = workRoot;
process.env.CONTENT_LOG_DIR = contentDir;

/** 按配方阶段逐段产出的假 runner：结构合法，内容稳定，不依赖外部模型 */
function fakeAgentRunner(): AgentRunnerPort {
  return {
    async run(input) {
      const stage = input.prompt.match(/stage=([A-Z_]+)/)?.[1] ?? 'NORMALIZE';
      return {
        output: {
          recipeVersion: 1,
          stage,
          output: { title: '工作站链路验收', body: `正文内容 ${stage}`, summary: '链路测试摘要' },
        },
        rawEvents: [],
        elapsedMs: 1,
      };
    },
  };
}

describe('工作站交付链（真实 kernel 接线）', () => {
  let moduleRef: TestingModule;
  let works: WorkService;
  let production: ProductionService;
  let review: ReviewService;
  let publication: PublicationService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [ConfigModule, KernelModule] })
      .overrideProvider(AGENT_RUNNER)
      .useValue(fakeAgentRunner())
      .overrideProvider(WEBSITE_DEPLOYMENT_VERIFIER)
      .useValue({ verify: async () => ({ ok: true }) })
      .compile();
    await moduleRef.init();
    works = moduleRef.get(WorkService);
    production = moduleRef.get(ProductionService);
    review = moduleRef.get(ReviewService);
    publication = moduleRef.get(PublicationService);
  });

  afterAll(async () => {
    await moduleRef.close();
    rmSync(workRoot, { recursive: true, force: true });
    rmSync(contentDir, { recursive: true, force: true });
  });

  const brief = {
    audience: '想入门 AI 的独立开发者',
    scenario: '选型阶段不知道从哪开始',
    problem: '工具太多无法判断哪个适合自己',
    keyQuestion: '按什么顺序评估 AI 工具？',
    intendedAction: '按清单跑通第一轮选型',
  };

  it('初稿 → 生产 → 刷新后审阅 → 同 hash 批准 → 发布文件过内容门禁 → 线上校验', async () => {
    const work = await works.create(
      {
        idempotencyKey: `chain-${newId()}`,
        title: '工作站链路验收',
        sourceProblem: '访客被 AI 工具淹没',
        whyNow: '需求信号连续三周出现',
        contentBriefRaw: JSON.stringify(brief),
        coreViewpoint: '工具要为人服务',
        protectedClaimsRaw: '[]',
      },
      {
        originalName: 'draft.md',
        mimeType: 'text/markdown',
        size: 24,
        bytes: Buffer.from('# 人工初稿\n正文内容'),
        role: 'draft',
      },
      [],
    );

    const produced = await production.run(work.id, '# 人工初稿\n正文内容');
    expect(produced.status).toBe('REVIEW_READY');

    // 「刷新」等价：候选从服务端审阅包恢复，审批绑定该 hash，不依赖页面内存
    const packet = await review.getReview(work.id);
    expect(packet.candidate?.hash).toBeTruthy();
    expect(String(packet.candidate!.output.markdown ?? packet.candidate!.output.body ?? '')).toContain('正文内容');

    const approved = await review.approve(work.id, packet.candidate!.hash);
    expect(approved.status).toBe('APPROVED');

    const pub = await publication.publishWebsite(work.id, packet.candidate!.hash);
    expect(pub.status).toBe('PREPARED');
    expect(pub.url).toContain('/posts/');

    // 发布落盘的文件必须天然过构建门禁（不放宽门禁迁就生成物）
    const fileName = readdirSync(contentDir).find((name) => /\.md$/i.test(name));
    expect(fileName).toBeTruthy();
    const raw = readFileSync(path.join(contentDir, fileName!), 'utf8');
    for (const field of PUBLISHED_POST_REQUIRED_FIELDS) {
      expect(raw).toContain(`${field}:`);
    }

    const verified = await publication.verifyWebsite(work.id);
    expect(verified.status).toBe('PUBLISHED');
  });
});
