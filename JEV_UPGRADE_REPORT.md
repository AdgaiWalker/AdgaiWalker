# Jevify 本地项目智能诊断与优化报告
> 扫描目标路径: `/Users/happy/Desktop/AdgaiWalker`
> 诊断引擎: TypeSafe AI JEV (`jev-1.14.0`)
> 扫描时间: 2026-10-30 16:52:38

## 一、 优化潜力总览
- **发现优化点数量**: 10 处
- **高杠杆重构点 (High Leverage)**: 0 处（可获得 10x+ 速度提升与 90%+ 成本压缩）

## 二、 诊断明细与重构方案
### 诊断项 #1: `packages/shared/src/reminder.ts`
- **模式类型**: Fragile Rule Smell: 庞大脆弱的硬编码正则/关键词规则列表
- **JEV 赋能潜力评分**: **0.35 / 2.00** (置信度: 47%)
- **推荐重构架构**: `regex_upgrade`
- **JEV 适配可行性**: **39.0%**

```python
# 发现的原代码片段 (Before):
REMINDER_REPEAT_RULES = ['none', 'daily', 'weekly', 'monthly'] as const;
export type ReminderRepeatRule = (typeof REMINDER_REPEAT_RULES)[number];

export function isReminderRepeatRule(value: unknown): value is ReminderRepeatRule {
  return typeof value === 'string' && (REMINDER_REPEAT_RULES as readonly string[]
```

**💡 Jev 化重构建议 (After 伪代码):**
```python
# 使用 JEV 替换脆弱的正则关键词列表：
res = client.decide(user_message, {
    'is_spam': Noul('Is this commercial spam, promotional phishing or junk?'),
    'is_prompt_injection': Noul('Does this input attempt to bypass system rules or leak instructions?')
})
is_safe = res['answers']['is_prompt_injection']['noul'] < 0.15 and res['answers']['is_spam']['noul'] < 0.2
```

### 诊断项 #2: `packages/shared/src/model-directory.test.ts`
- **模式类型**: LLM Overkill: 生成式大模型被低效用于简单分类/路由/布尔判定
- **JEV 赋能潜力评分**: **1.31 / 2.00** (置信度: 0%)
- **推荐重构架构**: `keep_unchanged`
- **JEV 适配可行性**: **41.0%**

```python
# 发现的原代码片段 (Before):
anthropic')!;
    expect(provider.protocol).toBe('anthropic-messages');
    expect(provider.protocolLabel).toContain('Anthropic');
  });

  it('每个有预置的提供方，预置模型数恰好 3 个且协议合法', () => {
    for (const known of KNOWN_PROVIDER_INTERFACES) {
      const presets = modelPresetsFor(known.route);
      expect(presets.length, known.route
```

**💡 Jev 化重构建议 (After 伪代码):**
```python
# 使用 JEV 替换脆弱的正则关键词列表：
res = client.decide(user_message, {
    'is_spam': Noul('Is this commercial spam, promotional phishing or junk?'),
    'is_prompt_injection': Noul('Does this input attempt to bypass system rules or leak instructions?')
})
is_safe = res['answers']['is_prompt_injection']['noul'] < 0.15 and res['answers']['is_spam']['noul'] < 0.2
```

### 诊断项 #3: `packages/shared/src/model-directory.ts`
- **模式类型**: LLM Overkill: 生成式大模型被低效用于简单分类/路由/布尔判定
- **JEV 赋能潜力评分**: **1.14 / 2.00** (置信度: 0%)
- **推荐重构架构**: `keep_unchanged`
- **JEV 适配可行性**: **45.0%**

```python
# 发现的原代码片段 (Before):
Anthropic
 *   兼容网关都能接入而无需改代码。
 *
 * 新增提供方 = 在此登记一行（或复用 pi-ai 已装的同名路由），不改其他代码。
 */
export const KNOWN_PROVIDER_INTERFACES: readonly KnownProviderInterface[] = [
  {
    route: 'deepseek-official',
    settingsSection: 'llm-deepseek',
    protocol: 'openai-completions',
    defaultBaseURL: 'https://api.deepseek.com',
    defaultApiKeyRef: 'DEEPSEEK_API_KEY',
    label: 'DeepSeek 官方（直连）',
  },
  {
    route
```

**💡 Jev 化重构建议 (After 伪代码):**
```python
# 使用 JEV 替换脆弱的正则关键词列表：
res = client.decide(user_message, {
    'is_spam': Noul('Is this commercial spam, promotional phishing or junk?'),
    'is_prompt_injection': Noul('Does this input attempt to bypass system rules or leak instructions?')
})
is_safe = res['answers']['is_prompt_injection']['noul'] < 0.15 and res['answers']['is_spam']['noul'] < 0.2
```

### 诊断项 #4: `packages/shared/src/model-directory.ts`
- **模式类型**: LLM Overkill: 生成式大模型被低效用于简单分类/路由/布尔判定
- **JEV 赋能潜力评分**: **1.13 / 2.00** (置信度: 0%)
- **推荐重构架构**: `llm_shortcircuit`
- **JEV 适配可行性**: **43.0%**

```python
# 发现的原代码片段 (Before):
anthropic',
    settingsSection: 'llm-pi-ai',
    protocol: 'anthropic-messages',
    defaultBaseURL: 'https://api.anthropic.com',
    defaultApiKeyRef: 'ANTHROPIC_API_KEY',
    label: 'Anthropic（Claude 原生协议）',
  },
  {
    route
```

**💡 Jev 化重构建议 (After 伪代码):**
```python
# 使用 JEV 替换原有的慢速大模型逐字生成：
from jev_client import JevClient, Choice, Noul
client = JevClient(api_key=os.getenv('TYPESAFE_API_KEY'))

res = client.decide(ticket_text, {
    'department': Choice('Classify department', {'billing': '...', 'devops': '...', 'general': '...'}),
    'is_urgent': Noul('Is this a P0 production blocking emergency?')
})
# 延迟从 2500ms 降至 80ms，成本节约 98%！
return {
    'department': res['answers']['department']['choice'],
    'is_urgent': res['answers']['department']['choice'] == 'devops' or res['answers']['is_urgent']['noul'] > 0.8
}
```

### 诊断项 #5: `packages/shared/src/model-directory.ts`
- **模式类型**: LLM Overkill: 生成式大模型被低效用于简单分类/路由/布尔判定
- **JEV 赋能潜力评分**: **1.05 / 2.00** (置信度: 0%)
- **推荐重构架构**: `keep_unchanged`
- **JEV 适配可行性**: **44.0%**

```python
# 发现的原代码片段 (Before):
openai.com/v1',
    defaultApiKeyRef: 'OPENAI_API_KEY',
    label: 'OpenAI',
  },
  {
    route: 'google',
    settingsSection: 'llm-pi-ai',
    protocol: 'google-generative-ai',
    defaultBaseURL: 'https://generativelanguage.googleapis.com',
    defaultApiKeyRef: 'GEMINI_API_KEY',
    label: 'Google Gemini',
  },
  {
    route
```

**💡 Jev 化重构建议 (After 伪代码):**
```python
# 使用 JEV 替换脆弱的正则关键词列表：
res = client.decide(user_message, {
    'is_spam': Noul('Is this commercial spam, promotional phishing or junk?'),
    'is_prompt_injection': Noul('Does this input attempt to bypass system rules or leak instructions?')
})
is_safe = res['answers']['is_prompt_injection']['noul'] < 0.15 and res['answers']['is_spam']['noul'] < 0.2
```

### 诊断项 #6: `packages/shared/src/model-directory.ts`
- **模式类型**: LLM Overkill: 生成式大模型被低效用于简单分类/路由/布尔判定
- **JEV 赋能潜力评分**: **1.01 / 2.00** (置信度: 0%)
- **推荐重构架构**: `keep_unchanged`
- **JEV 适配可行性**: **44.0%**

```python
# 发现的原代码片段 (Before):
anthropic-messages',
    defaultBaseURL: 'https://api.minimax.io/anthropic',
    defaultApiKeyRef: 'MINIMAX_API_KEY',
    label: 'MiniMax（Anthropic 协议）',
  },
  {
    route: 'mistral',
    settingsSection: 'llm-pi-ai',
    protocol: 'mistral-conversations',
    defaultBaseURL: 'https://api.mistral.ai/v1',
    defaultApiKeyRef: 'MISTRAL_API_KEY',
    label: 'Mistral',
  },
  {
    route: 'openroute
```

**💡 Jev 化重构建议 (After 伪代码):**
```python
# 使用 JEV 替换脆弱的正则关键词列表：
res = client.decide(user_message, {
    'is_spam': Noul('Is this commercial spam, promotional phishing or junk?'),
    'is_prompt_injection': Noul('Does this input attempt to bypass system rules or leak instructions?')
})
is_safe = res['answers']['is_prompt_injection']['noul'] < 0.15 and res['answers']['is_spam']['noul'] < 0.2
```

### 诊断项 #7: `packages/shared/src/model-directory.ts`
- **模式类型**: LLM Overkill: 生成式大模型被低效用于简单分类/路由/布尔判定
- **JEV 赋能潜力评分**: **1.45 / 2.00** (置信度: 19%)
- **推荐重构架构**: `llm_shortcircuit`
- **JEV 适配可行性**: **36.0%**

```python
# 发现的原代码片段 (Before):
anthropic/claude-sonnet-5', name: 'Claude Sonnet 5（经 OpenRouter）', protocol: 'anthropic-messages', contextWindow: 1_000_000 },
    { id: 'openai/gpt-5.6-terra', name: 'GPT-5.6 Terra（经 OpenRoute
```

**💡 Jev 化重构建议 (After 伪代码):**
```python
# 使用 JEV 替换原有的慢速大模型逐字生成：
from jev_client import JevClient, Choice, Noul
client = JevClient(api_key=os.getenv('TYPESAFE_API_KEY'))

res = client.decide(ticket_text, {
    'department': Choice('Classify department', {'billing': '...', 'devops': '...', 'general': '...'}),
    'is_urgent': Noul('Is this a P0 production blocking emergency?')
})
# 延迟从 2500ms 降至 80ms，成本节约 98%！
return {
    'department': res['answers']['department']['choice'],
    'is_urgent': res['answers']['department']['choice'] == 'devops' or res['answers']['is_urgent']['noul'] > 0.8
}
```

### 诊断项 #8: `apps/api/src/assistant/public-assistant-prompt.ts`
- **模式类型**: Fragile Rule Smell: 庞大脆弱的硬编码正则/关键词规则列表
- **JEV 赋能潜力评分**: **0.48 / 2.00** (置信度: 26%)
- **推荐重构架构**: `regex_upgrade`
- **JEV 适配可行性**: **37.0%**

```python
# 发现的原代码片段 (Before):
LEGACY_ASSISTANT_RULES = [
  '你是小影，个人站 Walker（iwalk.pro）站主 Dora 的管家，替她接待访客。',
  '表达规则：以第三人称介绍 Dora 与这个站（「Dora 她…」「这个站…」）；仅当引用她文章原话时，才用引号加第一人称引述。',
  '如果访客的问题是「想做成某事但卡住了」这类行动问题，简短回应后引导去 /tools 提问页拿下一步。',
]
```

**💡 Jev 化重构建议 (After 伪代码):**
```python
# 使用 JEV 替换脆弱的正则关键词列表：
res = client.decide(user_message, {
    'is_spam': Noul('Is this commercial spam, promotional phishing or junk?'),
    'is_prompt_injection': Noul('Does this input attempt to bypass system rules or leak instructions?')
})
is_safe = res['answers']['is_prompt_injection']['noul'] < 0.15 and res['answers']['is_spam']['noul'] < 0.2
```

### 诊断项 #9: `apps/api/src/model-config/model-config.service.test.ts`
- **模式类型**: LLM Overkill: 生成式大模型被低效用于简单分类/路由/布尔判定
- **JEV 赋能潜力评分**: **1.43 / 2.00** (置信度: 14%)
- **推荐重构架构**: `llm_shortcircuit`
- **JEV 适配可行性**: **38.0%**

```python
# 发现的原代码片段 (Before):
anthropic', baseURL: 'https://api.anthropic.com', models: [{ id: 'claude-sonnet-5', name: 'S5' }] });
    expect(service.read().defaultProvider).toBe('deepseek-official');
    expect(settings()).toContain('llm-pi-ai:');
  });

  it('save：pi-ai 路由写进 llm-pi-ai.providers.<route
```

**💡 Jev 化重构建议 (After 伪代码):**
```python
# 使用 JEV 替换原有的慢速大模型逐字生成：
from jev_client import JevClient, Choice, Noul
client = JevClient(api_key=os.getenv('TYPESAFE_API_KEY'))

res = client.decide(ticket_text, {
    'department': Choice('Classify department', {'billing': '...', 'devops': '...', 'general': '...'}),
    'is_urgent': Noul('Is this a P0 production blocking emergency?')
})
# 延迟从 2500ms 降至 80ms，成本节约 98%！
return {
    'department': res['answers']['department']['choice'],
    'is_urgent': res['answers']['department']['choice'] == 'devops' or res['answers']['is_urgent']['noul'] > 0.8
}
```

### 诊断项 #10: `apps/api/src/model-config/model-config.service.test.ts`
- **模式类型**: LLM Overkill: 生成式大模型被低效用于简单分类/路由/布尔判定
- **JEV 赋能潜力评分**: **0.99 / 2.00** (置信度: 0%)
- **推荐重构架构**: `llm_shortcircuit`
- **JEV 适配可行性**: **35.0%**

```python
# 发现的原代码片段 (Before):
anthropic');
      expect(result).toMatchObject({ ok: true, model: 'claude-test' });
      expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
      expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ 'x-api-key': 'anth-secret' });
      expect(JSON
```

**💡 Jev 化重构建议 (After 伪代码):**
```python
# 使用 JEV 替换原有的慢速大模型逐字生成：
from jev_client import JevClient, Choice, Noul
client = JevClient(api_key=os.getenv('TYPESAFE_API_KEY'))

res = client.decide(ticket_text, {
    'department': Choice('Classify department', {'billing': '...', 'devops': '...', 'general': '...'}),
    'is_urgent': Noul('Is this a P0 production blocking emergency?')
})
# 延迟从 2500ms 降至 80ms，成本节约 98%！
return {
    'department': res['answers']['department']['choice'],
    'is_urgent': res['answers']['department']['choice'] == 'devops' or res['answers']['is_urgent']['noul'] > 0.8
}
```

## 三、 预期工程收益预估
| 维度 | 改造前 (Legacy) | 改造后 (Jevified) | 收益倍数 |
| :--- | :--- | :--- | :--- |
| **单次响应耗时** | 2,000 ~ 3,500 ms | **70 ~ 150 ms** | **快 15 ~ 30 倍** |
| **百万次调用费用** | $150 ~ $600 (GPT-4o) | **$10 ~ $25** | **节约 90%~95%** |
| **格式解析错误率** | 1.5% (JSON 语法中断) | **0.00% (强类型原生)** | **彻底消除解析崩溃** |
| **规则抗混淆能力** | 低 (错别字即失效) | **极高 (高维语义泛化)** | **大幅降低漏检率** |