/**
 * MatchingService TDD — 匹配服务行为
 *
 * 测试约束：
 * 1. 输入合规关键词（如"绕过"），返回 compliance 模式
 * 2. 输入问候语（如"你好"），返回 greeting 模式
 * 3. 输入明确场景+工具需求（如"工作汇报 PPT"），返回 recommendation
 * 4. PPT 无场景 → diagnosis（需要先确认用途）
 * 5. 返回结果包含 bridge（串联语）
 * 6. 结果包含 frictionLayer 和 recommendedAbilityType
 * 7. 身份问题 → identity 模式
 * 8. 信息不足 → clarify 模式
 */

import { describe, it, expect } from 'vitest';
import { createMatchingService } from '@/services/matching.service';

describe('MatchingService — 需求匹配行为', () => {
  const service = createMatchingService();

  it('合规关键词 → compliance 模式', async () => {
    const result = await service.matchNeed({ need: '怎么绕过验证码' });
    expect(result.responseMode).toBe('compliance');
    expect(result.complianceRedirected).toBe(true);
  });

  it('问候语 → greeting 模式', async () => {
    const result = await service.matchNeed({ need: '你好' });
    expect(result.responseMode).toBe('greeting');
  });

  it('PPT 无场景 → diagnosis（需先确认用途）', async () => {
    const result = await service.matchNeed({ need: '帮我做个 PPT' });
    expect(result.responseMode).toBe('diagnosis');
  });

  it('工作汇报 PPT → recommendation', async () => {
    const result = await service.matchNeed({ need: '帮我做个工作汇报 PPT，给领导看的' });
    expect(result.responseMode).toBe('recommendation');
  });

  it('结果始终包含 bridge（串联语）', async () => {
    const result = await service.matchNeed({ need: '学 AI' });
    expect(result.bridge).toBeTruthy();
    expect(typeof result.bridge).toBe('string');
  });

  it('结果包含 frictionLayer', async () => {
    const result = await service.matchNeed({ need: '帮我写文章' });
    expect(result.frictionLayer).toBeTruthy();
  });

  it('结果包含 recommendedAbilityType', async () => {
    const result = await service.matchNeed({ need: '帮我写代码' });
    expect(result.recommendedAbilityType).toBeTruthy();
  });

  it('身份问题 → identity 模式', async () => {
    const result = await service.matchNeed({ need: '你是谁' });
    expect(result.responseMode).toBe('identity');
  });

  it('信息不足 → clarify 模式', async () => {
    const result = await service.matchNeed({ need: '帮' });
    expect(result.responseMode).toBe('clarify');
  });
});
