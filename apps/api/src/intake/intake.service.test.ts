import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IntakeService } from './intake.service';
import type { PrismaPort } from '../ports/prisma.port';
import type { ClueRepositoryPort } from '../ports/clue.repository';
import type { NextStepStrategyPort } from '../ports/nextstep.port';
import type { RateLimitPort } from '../ports/rate-limit.port';
import type { GuestQuotaPort } from '../ports/guest-quota.port';
import type { FeatureEventPort } from '../ports/feature-event.port';
import { JevFastPathService } from '../assistant/jev-fast-path.service';

describe('IntakeService with JEV Fast-Path & Quota Exemption', () => {
  let prisma: PrismaPort;
  let clues: ClueRepositoryPort;
  let nextStep: NextStepStrategyPort;
  let rateLimit: RateLimitPort;
  let guestQuota: GuestQuotaPort;
  let events: FeatureEventPort;
  let jevFastPath: JevFastPathService;
  let service: IntakeService;

  beforeEach(() => {
    prisma = {
      isWritable: vi.fn().mockReturnValue(true),
    } as unknown as PrismaPort;

    clues = {
      create: vi.fn().mockResolvedValue({ id: 'clue-123', poolStatus: 'candidate' }),
    } as unknown as ClueRepositoryPort;

    nextStep = {
      generate: vi.fn().mockResolvedValue({
        nextStep: '生成实际行动步骤',
        bucketId: 'learn-ai',
        aiUsedFlag: true,
      }),
    } as unknown as NextStepStrategyPort;

    rateLimit = {
      consume: vi.fn().mockReturnValue(true),
    } as unknown as RateLimitPort;

    guestQuota = {
      isExhausted: vi.fn().mockResolvedValue(false),
      consume: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
      getUsedCount: vi.fn().mockResolvedValue(0),
    } as unknown as GuestQuotaPort;

    events = {
      record: vi.fn().mockResolvedValue(undefined),
    } as unknown as FeatureEventPort;

    jevFastPath = new JevFastPathService();
    // 模拟启用了 JEV
    vi.spyOn(jevFastPath, 'isEnabled').mockReturnValue(true);

    service = new IntakeService(
      prisma,
      clues,
      nextStep,
      rateLimit,
      guestQuota,
      events,
      jevFastPath,
    );
  });

  it('打招呼问候（你好）：命中 Fast-Path，豁免配额扣减，不产生数据库脏线索', async () => {
    const result = await service.intake({
      body: '你好',
      anonId: 'visitor-001',
      ipKey: '127.0.0.1',
      isAuthenticated: false,
    });

    expect(result.nextStep).toContain('你好！我是小影');
    expect(result.bucketId).toBe('general_start');
    expect(guestQuota.consume).not.toHaveBeenCalled();
    expect(clues.create).not.toHaveBeenCalled();
    expect(nextStep.generate).not.toHaveBeenCalled();
  });

  it('询问模型身份（你是啥模型）：命中 L1 高频特征，豁免配额扣减，秒级给出精准说明', async () => {
    const result = await service.intake({
      body: '你是啥模型',
      anonId: 'visitor-002',
      ipKey: '127.0.0.1',
      isAuthenticated: false,
    });

    expect(result.nextStep).toContain('DeepSeek 大语言模型配合 TypeSafe JEV');
    expect(guestQuota.consume).not.toHaveBeenCalled();
    expect(clues.create).not.toHaveBeenCalled();
  });

  it('真实行动卡点（我想学AI不知从何开始）：走完整通道，扣减 1 次配额并写入线索池', async () => {
    const result = await service.intake({
      body: '我想学AI但不知从何开始搭建知识库',
      anonId: 'visitor-003',
      ipKey: '127.0.0.1',
      isAuthenticated: false,
    });

    expect(result.clueId).toBe('clue-123');
    expect(result.nextStep).toBe('生成实际行动步骤');
    expect(guestQuota.consume).toHaveBeenCalledWith('visitor-003');
    expect(clues.create).toHaveBeenCalled();
    expect(nextStep.generate).toHaveBeenCalled();
  });

  it('访客配额已耗尽时：打招呼问候仍可获礼貌解答，无需报错；行动卡点则受配额拦截', async () => {
    vi.mocked(guestQuota.isExhausted).mockResolvedValue(true);

    // 打招呼即便配额已用完仍可被豁免回答
    const greetingResult = await service.intake({
      body: '你好',
      anonId: 'exhausted-visitor',
      ipKey: '127.0.0.1',
      isAuthenticated: false,
    });
    expect(greetingResult.nextStep).toContain('你好！我是小影');

    // 实际复杂问题则抛出 guest-quota-exceeded 异常
    await expect(
      service.intake({
        body: '我想搭建一个知识库选型卡住了怎么办',
        anonId: 'exhausted-visitor',
        ipKey: '127.0.0.1',
        isAuthenticated: false,
      }),
    ).rejects.toSatisfy((e: any) => e.getResponse?.()?.code === 'guest-quota-exceeded');
  });
});
