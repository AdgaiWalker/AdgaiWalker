import { describe, expect, it } from 'vitest';
import { ModelConfigController } from './model-config.controller';
import type { ModelConfigService } from './model-config.service';

/**
 * 控制器薄层测试。
 *
 * 存在的理由（真实缺陷）：UI 保存时发送 `protocol`，而控制器白名单漏了它，
 * 于是「保存配置」永远回「请求包含未知字段」——只在浏览器端到端才暴露。
 * 这里锁住「UI 实际发送的载荷必须被接受」这条契约。
 */
function makeController() {
  const calls: unknown[] = [];
  const service = {
    read: () => ({ ok: 'read' }),
    save: (input: unknown) => {
      calls.push(input);
      return { saved: input };
    },
  } as unknown as ModelConfigService;
  return { controller: new ModelConfigController(service), calls };
}

describe('ModelConfigController（HTTP 薄层）', () => {
  it('接受设置页实际发送的完整载荷（含 protocol）', () => {
    const { controller, calls } = makeController();
    const body = {
      providerId: 'deepseek-official',
      baseURL: 'https://api.deepseek.com',
      protocol: 'openai-completions',
      apiKey: 'sk-x',
      models: [{ id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash' }],
    };
    expect(() => controller.save(body)).not.toThrow();
    expect(calls[0]).toMatchObject({ protocol: 'openai-completions' });
  });

  it('接受不带 protocol 的载荷（协议保持默认）', () => {
    const { controller, calls } = makeController();
    controller.save({ providerId: 'deepseek-official', baseURL: 'https://api.deepseek.com' });
    expect((calls[0] as { protocol?: string }).protocol).toBeUndefined();
  });

  it('仍然拒绝真正未知的字段', () => {
    const { controller } = makeController();
    expect(() => controller.save({ providerId: 'x', baseURL: 'https://x.com', nope: 1 })).toThrow();
  });

  it('缺 providerId 或形状不对时 fail-closed', () => {
    const { controller } = makeController();
    expect(() => controller.save({ baseURL: 'https://x.com' })).toThrow();
    expect(() => controller.save(null)).toThrow();
    expect(() => controller.save([])).toThrow();
  });
});
