/**
 * 技能导出物 —— 把一份技能变成「别人能接上」的东西。纯函数，无 IO。
 *
 * 三种输出对应三种对接场合：
 * - `buildIntegrationPrompt`：**贴给任何 AI**，它就能在新项目里把接口接起来（最常用）；
 * - `buildCallExamples`：给人看的可直接运行的 curl / fetch / SSE；
 * - `buildInterfaceData`：给代码读的接口契约（JSON）。
 *
 * 三者都由同一份 `SkillExportInput` 生成 —— 提示词与示例不可能与技能声明漂移。
 */
import type { SkillCase, SkillManifest, SkillModelRequirement } from './skill.js';

/** 技能的部署端点（binding 层决定；技能本体不含具体地址） */
export type SkillEndpoint = { baseUrl: string; path: string };

export type SkillExportInput = {
  manifest: SkillManifest;
  /** `SKILL.md` 原文（含 frontmatter）—— 必须整段给出，否则对方只拿到壳 */
  promptMarkdown: string;
  cases: readonly SkillCase[];
  endpoint: SkillEndpoint;
};

export type SkillField = {
  name: string;
  type: string;
  required: boolean;
  description: string;
};

export type SkillInterfaceData = {
  schemaVersion: number;
  skill: {
    id: string;
    name: string;
    icon: string;
    version: string;
    description: string;
  };
  endpoint: { method: 'POST'; url: string; contentType: 'application/json' };
  request: { fields: SkillField[]; example: string };
  response: { fields: SkillField[]; example: string };
  model: {
    requirement: SkillModelRequirement;
    params: SkillManifest['model']['params'];
  };
  io: SkillManifest['io'];
  cases: SkillCase[];
};

function urlOf(endpoint: SkillEndpoint): string {
  return `${endpoint.baseUrl.replace(/\/+$/, '')}${endpoint.path}`;
}

const REQUEST_FIELDS: SkillField[] = [
  {
    name: 'input',
    type: 'string',
    required: true,
    description: '要交给技能处理的文本（用户问题 / 待处理内容）',
  },
  {
    name: 'sessionId',
    type: 'string | null',
    required: false,
    description: '多轮会话标识；省略表示单轮',
  },
];

const RESPONSE_FIELDS: SkillField[] = [
  { name: 'output', type: 'string', required: true, description: '技能产出的正文（纯文本）' },
  { name: 'model', type: 'string', required: false, description: '实际使用的模型标识' },
  {
    name: 'usage',
    type: '{ promptTokens, completionTokens }',
    required: false,
    description: 'token 用量（供应商回执，用于计费/观测）',
  },
];

export function buildInterfaceData(input: SkillExportInput): SkillInterfaceData {
  const { manifest, cases, endpoint } = input;
  return {
    schemaVersion: manifest.schemaVersion,
    skill: {
      id: manifest.id,
      name: manifest.name,
      icon: manifest.icon,
      version: manifest.version,
      description: manifest.description,
    },
    endpoint: { method: 'POST', url: urlOf(endpoint), contentType: 'application/json' },
    request: {
      fields: REQUEST_FIELDS,
      example: JSON.stringify(
        { input: '（在此填入要处理的文本）', sessionId: 'demo-session' },
        null,
        2,
      ),
    },
    response: {
      fields: RESPONSE_FIELDS,
      example: JSON.stringify(
        {
          output: '（技能产出的正文）',
          model: manifest.bindingExample.modelId,
          usage: { promptTokens: 0, completionTokens: 0 },
        },
        null,
        2,
      ),
    },
    model: { requirement: manifest.model.requirement, params: manifest.model.params },
    io: manifest.io,
    cases: [...cases],
  };
}

export function buildCallExamples(input: SkillExportInput): {
  curl: string;
  fetch: string;
  sse: string;
} {
  const url = urlOf(input.endpoint);
  const body = JSON.stringify({ input: '（在此填入要处理的文本）', sessionId: 'demo-session' });

  const curl = [
    `curl -sS -X POST '${url}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H 'Authorization: Bearer $WALKER_API_TOKEN' \\`,
    `  -d '${body}'`,
  ].join('\n');

  const fetch = [
    `const res = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: {`,
    `    'Content-Type': 'application/json',`,
    '    Authorization: `Bearer ${process.env.WALKER_API_TOKEN}` ,',
    `  },`,
    `  body: JSON.stringify({ "input": "（在此填入要处理的文本）", "sessionId": "demo-session" }),`,
    `});`,
    `const data = await res.json();`,
    `console.log(data.output);`,
  ].join('\n');

  const sse = [
    `// 流式：技能声明 streaming 时，服务端可用 text/event-stream 逐段返回`,
    `const res = await fetch('${url}', {`,
    `  method: 'POST',`,
    `  headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },`,
    `  body: JSON.stringify({ "input": "（在此填入要处理的文本）" }),`,
    `});`,
    `// 每行形如：data: {"delta":"增量文本"}；以 data: [DONE] 收尾`,
  ].join('\n');

  return { curl, fetch, sse };
}

export function buildIntegrationPrompt(input: SkillExportInput): string {
  const { manifest, promptMarkdown, cases, endpoint } = input;
  const data = buildInterfaceData(input);
  const examples = buildCallExamples(input);
  const params = manifest.model.params;
  const paramLines = [
    params.temperature !== undefined ? `temperature = ${params.temperature}` : null,
    params.maxTokens !== undefined ? `maxTokens = ${params.maxTokens}` : null,
  ].filter((line): line is string => line !== null);

  const caseLines =
    cases.length > 0
      ? cases.map((item) => `- [${item.id}] 输入：${item.input}`).join('\n')
      : '- （该技能尚未提供自检考题）';

  return `# 对接任务：把技能「${manifest.name}」接入当前项目

你要做的是**接入一个已经定义好的 AI 技能**，不要重新设计它的行为。

## 1. 技能是什么

- 技能 id：\`${manifest.id}\`
- 版本：\`${manifest.version}\`
- 用途：${manifest.description}
- 输入：${manifest.io.input.description}（${manifest.io.input.kind}）
- 输出：${manifest.io.output.description}（${manifest.io.output.kind}）

## 2. 要对接的接口

\`\`\`
POST ${data.endpoint.url}
Content-Type: application/json
Authorization: Bearer <你的 API 令牌>
\`\`\`

请求字段：

\`\`\`json
${data.request.example}
\`\`\`

响应字段：

\`\`\`json
${data.response.example}
\`\`\`

\`input\` 必填，\`sessionId\` 可选（省略即单轮）。响应里的 \`output\` 就是要展示给用户的正文。

## 3. 系统提示词（技能的灵魂，不要改写）

\`\`\`markdown
${promptMarkdown}
\`\`\`

## 4. 部署绑定（每个项目填一次）

技能只声明**能力需求**，不绑定具体模型；请在目标项目里提供等价的模型配置：
- 能力：${manifest.model.requirement.kind}${
    manifest.model.requirement.contextTokens
      ? `，上下文 ≥ ${manifest.model.requirement.contextTokens} tokens`
      : ''
  }${manifest.model.requirement.streaming ? '，支持流式' : ''}
- 参考绑定：provider \`${manifest.bindingExample.providerId}\` / model \`${manifest.bindingExample.modelId}\`
${paramLines.map((line) => `- 采样参数：${line}`).join('\n')}

若目标项目已有模型供应商配置，把上述能力需求映射到它即可，无需照抄参考绑定。

## 5. 可直接运行的调用示例

\`\`\`bash
${examples.curl}
\`\`\`

\`\`\`ts
${examples.fetch}
\`\`\`

\`\`\`ts
${examples.sse}
\`\`\`

## 6. 验收标准（做完请逐条自测）

${caseLines}

每条都要真实调用一次接口并检查响应：回答中必须体现技能的系统提示词行为，
不能出现"未实现""占位""假数据"这类敷衍结果。

## 7. 交付物

1. 一个调用该技能的客户端函数（含错误处理）；
2. 一个可运行的验收脚本，逐条跑第 6 节的用例并打印通过情况；
3. 说明你把能力需求映射到了哪个模型（写了哪几行配置）。
`;
}
