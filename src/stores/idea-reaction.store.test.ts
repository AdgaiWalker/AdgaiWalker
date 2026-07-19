import { describe, it, expect } from 'vitest';
import { createIdeaReactionStore } from './idea-reaction.store';

describe('IdeaReactionStore 测试', () => {
  const store = createIdeaReactionStore();

  it('应当能对点子进行互动并获取最新计数', async () => {
    const ideaId = 'test-idea-id-1';
    
    // 初始状态
    const init = await store.getReactions(ideaId);
    expect(init.need).toBe(0);
    expect(init.thought_before).toBe(0);

    // 增加计数
    const nextNeed = await store.addReaction(ideaId, 'need');
    expect(nextNeed).toBe(1);
    
    await store.addReaction(ideaId, 'thought_before');
    await store.addReaction(ideaId, 'thought_before');

    const updated = await store.getReactions(ideaId);
    expect(updated.need).toBe(1);
    expect(updated.thought_before).toBe(2);
    expect(updated.can_help).toBe(0);
  });

  it('应当能提交共创合作申请并反馈到 can_help 计数中', async () => {
    const ideaId = 'test-idea-id-2';

    await store.addHelp(ideaId, {
      name: '张三',
      email: 'zhangsan@example.com',
      helpType: 'tech',
      note: '我会用 React 和 Astro，想参与开发。',
    });

    const helps = await store.getHelps(ideaId);
    expect(helps.length).toBe(1);
    expect(helps[0].name).toBe('张三');
    expect(helps[0].helpType).toBe('tech');

    const reactions = await store.getReactions(ideaId);
    expect(reactions.can_help).toBe(1);
  });

  it('应当能发布社区点子并进行列表加载', async () => {
    const newIdea = await store.saveCommunityIdea({
      title: '校园闲置分享小助手',
      summary: '解决毕业季闲置物品交换的痛点。',
      rawInput: '我想做个帮大学生整理二手物品的小程序',
      sourceType: 'life_observation',
      tags: ['校园', '二手', '小程序'],
      aiStructure: {
        problem: '大学生闲置物品多，不好处理。',
        targetUsers: '在校大学生。',
        possibleSolutions: ['微信小程序交易平台', '宿管处集中代管'],
        validationSteps: ['先建个微信群测试'],
        risks: ['信任成本高'],
      }
    });

    expect(newIdea.id).toContain('community-idea-');
    expect(newIdea.status).toBe('thinking');

    const list = await store.listCommunityIdeas();
    expect(list.some(item => item.id === newIdea.id)).toBe(true);

    const fetched = await store.getCommunityIdea(newIdea.id);
    expect(fetched?.title).toBe('校园闲置分享小助手');
  });
});
