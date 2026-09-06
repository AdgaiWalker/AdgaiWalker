import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from './config/config.module';
import { KernelModule } from './kernel.module';
import { SeedService } from './seed/seed.service';
import { ClueService } from './clue/clue.service';
import { ExecutionService } from './execution/execution.service';
import { ActionService } from './action/action.service';
import { PRISMA, type PrismaPort } from './ports/prisma.port';
import { newId } from './common/ids';

/**
 * 真实 Nest kernel 接线的主选合同集成测（独立测试库，见 vitest.global-setup.ts）。
 * 与 kernel.integration.test.ts 的手工构造不同：SeedService 在这里由 KernelModule
 * 按生产 provider 接线（含 ACTION_REPOSITORY），因此「主选必须带 brief」的规则
 * 与线上完全一致——手工构造漏注入 actions 时该规则被静默跳过，测试会假绿。
 */
describe('主选合同（真实 kernel 接线）', () => {
  let seeds: SeedService;
  let clues: ClueService;
  let executions: ExecutionService;
  let actions: ActionService;
  let prisma: PrismaPort;
  let moduleRef: TestingModule;

  const brief = {
    audience: '想入门 AI 的独立开发者',
    scenario: '选型阶段不知道从哪开始',
    problem: '工具太多无法判断哪个适合自己',
    keyQuestion: '按什么顺序评估 AI 工具？',
    intendedAction: '按清单跑通第一轮选型',
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, KernelModule],
    }).compile();
    await moduleRef.init();
    seeds = moduleRef.get(SeedService);
    clues = moduleRef.get(ClueService);
    executions = moduleRef.get(ExecutionService);
    actions = moduleRef.get(ActionService);
    prisma = moduleRef.get(PRISMA);
    expect(prisma.isWritable()).toBe(true);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function makeInPoolClue(): Promise<string> {
    const clue = await clues.createManual(`主选集成测线索正文 ${newId()}`);
    await clues.setPoolStatus(clue.id, 'in-pool');
    return clue.id;
  }

  it('缺 brief 主选 → content-brief-incomplete，不产生执行与任务', async () => {
    const seed = await seeds.create(`主选缺brief-${newId().slice(0, 6)}`);
    const clueId = await makeInPoolClue();
    const execBefore = (await executions.list(100)).length;

    await expect(seeds.promote(seed.id, clueId)).rejects.toSatisfy(
      (e: { getResponse?: () => { code?: string; message?: string } }) => {
        const body = e.getResponse?.();
        return body?.message === 'content-brief-incomplete' || body?.code === 'content-brief-incomplete';
      },
    );
    expect((await executions.list(100)).length).toBe(execBefore);
  });

  it('带完整 brief 主选 → 建执行（含 brief）并生成写作任务', async () => {
    const seed = await seeds.create(`主选成功-${newId().slice(0, 6)}`);
    const clueId = await makeInPoolClue();

    const promoted = await seeds.promote(seed.id, clueId, { brief });
    expect(promoted.primaryClueId).toBe(clueId);

    const execution = (await executions.list(100)).find((e) => e.seedId === seed.id);
    expect(execution).toBeTruthy();
    expect(execution!.contentBrief).toEqual(brief);

    const openActions = await actions.list({ status: 'OPEN' });
    const writeTask = openActions.find(
      (a) => a.entityType === 'EXECUTION' && a.entityId === execution!.id,
    );
    expect(writeTask).toBeTruthy();
    expect(writeTask!.note).toBe(brief.keyQuestion);
  });
});
