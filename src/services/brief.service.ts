/**
 * 创作简报服务 — 从选题簇生成创作简报（C2）
 *
 * 只给框架与弹药，不代写正文（PRD §3.5：选题系统是雷达+判断辅助器，不替代创作者）。
 * 建议角度/结构用规则生成，不调 AI。
 */

import { matchResources } from '@/profiles/resource-index';
import type { TopicCandidate } from '@/stores/ports';

export interface ContentBrief {
  topicId: string;
  clusterKey?: string;
  title: string;
  /** 目标角色（来自遭遇切片 roleInContext + 锚点） */
  targetRoles: string;
  /** 核心卡点 / 问题 */
  coreStuckPoint: string;
  contentAngle: string;
  /** 站内可引用内容标题 */
  referenceContent: string[];
  suggestedAngles: string[];
  suggestedStructure: string[];
  density: number;
  priority: TopicCandidate['priority'];
}

function generateAngles(topic: TopicCandidate): string[] {
  const angles: string[] = [];
  const questionHead = topic.coreQuestion.slice(0, 18);
  if (topic.priority === 'high') angles.push('做成可复用指南：把这个卡点拆成可复制的步骤。');
  if (topic.relatedContentIds.length === 0) angles.push('从零补内容：先写最小教程或工具清单。');
  if (topic.sourceNeedCount >= 3) angles.push('整理成方法论入口：多人反复问，值得系统化。');
  angles.push(`围绕「${questionHead}」给一个可以立刻执行的第一步。`);
  return angles.slice(0, 3);
}

function generateStructure(topic: TopicCandidate): string[] {
  const questionHead = topic.coreQuestion.slice(0, 18);
  return [
    '引子：用一个真实场景点出这个卡点',
    `问题：说清用户卡在哪里（${questionHead}）`,
    '方法：给最小可执行路径',
    '案例：用一个具体例子走一遍',
    '收尾：下一步和延伸',
  ];
}

export function generateBrief(topic: TopicCandidate): ContentBrief {
  return {
    topicId: topic.topicId,
    clusterKey: topic.clusterKey,
    title: topic.title,
    targetRoles: topic.audience,
    coreStuckPoint: topic.coreQuestion,
    contentAngle: topic.contentAngle,
    referenceContent: topic.relatedContentIds
      .map(id => matchResources.find(r => r.id === id)?.title)
      .filter((t): t is string => Boolean(t)),
    suggestedAngles: generateAngles(topic),
    suggestedStructure: generateStructure(topic),
    density: topic.sourceNeedCount,
    priority: topic.priority,
  };
}
