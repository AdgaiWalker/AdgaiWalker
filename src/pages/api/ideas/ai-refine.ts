import type { APIRoute } from 'astro';
import { callGateway } from '@/agent/gateway';

export const prerender = false;

interface RefineResponse {
  title: string;
  summary: string;
  sourceScene: string;
  problem: string;
  targetUsers: string;
  solutions: string[];
  validationSteps: string[];
  risks: string[];
  tags: string[];
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { rawInput, sourceType } = await request.json();
    if (!rawInput || rawInput.trim().length < 5) {
      return new Response(
        JSON.stringify({ error: '点子内容太短，多写几个字吧。' }),
        { status: 400 }
      );
    }

    const systemPrompt = `你是「点子 DIANZI」平台的 AI 结构化整理引擎。
你的任务是将用户模糊、零碎的想法整理成清晰、可讨论、可验证的点子规划。
要求：
- 保持真实、具体，不夸大，不营销化。
- 不要承诺结果，不替用户下绝对可行的结论。
- 必须严格只返回一个 JSON 对象，结构如下：
{
  "title": "点子标题（不超过20字）",
  "summary": "一句话简介（不超过50字）",
  "sourceScene": "来源场景分析",
  "problem": "用户想解决的痛点/问题",
  "targetUsers": "可能需要它的人/目标群体",
  "solutions": ["可能实现方向1", "可能实现方向2"],
  "validationSteps": ["下一步验证建议1", "下一步验证建议2"],
  "risks": ["潜在风险1", "潜在风险2"],
  "tags": ["标签1", "标签2", "标签3"]
}`;

    const fallback: RefineResponse = {
      title: rawInput.slice(0, 15) + (rawInput.length > 15 ? '...' : ''),
      summary: rawInput.slice(0, 45) + (rawInput.length > 45 ? '...' : ''),
      sourceScene: sourceType === 'life_observation' ? '生活中的微小观察与启发' : '日常工作中发现的效率痛点',
      problem: '目前想法较为模糊，需要进行结构化和明确定义。',
      targetUsers: '对该领域有共同兴趣的同行者。',
      solutions: ['通过微信群或低代码工具快速搭建原型', '小范围调研目标用户'],
      validationSteps: ['发布到点子广场收集同频者反馈', '向潜在需求者发起 1v1 访谈'],
      risks: ['想法过于早期，商业路径不明确', '执行成本和时间精力有限'],
      tags: ['早期想法', '行动派', '共创中']
    };

    const parseResponse = (text: string): RefineResponse | null => {
      try {
        // 清理 markdown 代码块标记
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleaned) as RefineResponse;
      } catch {
        return null;
      }
    };

    // 运行 AI 网关调用
    const response = await callGateway<RefineResponse>(
      {
        route: 'ideas/refine',
        systemPrompt,
        userPrompt: `点子原始内容: "${rawInput}"\n来源类别: "${sourceType}"`,
        temperature: 0.2,
      },
      fallback,
      parseResponse
    );

    return new Response(JSON.stringify(response.data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
  }
};
