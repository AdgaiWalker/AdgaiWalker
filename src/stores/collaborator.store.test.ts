import { describe, expect, it, beforeEach } from 'vitest';
import {
  saveCollaboratorApplication,
  findCollaboratorsByContent,
  getCollaboratorCountByContent,
  __resetMemoryCollaboratorStore,
  type CollaboratorApplication
} from './collaborator.store';

describe('collaborator.store (无 Redis 环境走内存降级)', () => {
  beforeEach(() => {
    __resetMemoryCollaboratorStore();
  });

  it('未申请时返回空列表且数量为 0', async () => {
    const contentId = 'post-001';
    expect(await findCollaboratorsByContent(contentId)).toEqual([]);
    expect(await getCollaboratorCountByContent(contentId)).toBe(0);
  });

  it('保存申请后能正确检索和计数', async () => {
    const contentId = 'post-002';
    const app1: CollaboratorApplication = {
      id: 'app-1',
      contentId,
      role: '前端开发',
      suggestion: '我建议第一步搭建 UI 框架。',
      createdAt: '2026-06-23T12:00:00Z',
    };
    const app2: CollaboratorApplication = {
      id: 'app-2',
      contentId,
      role: '产品经理',
      suggestion: '我建议第一步梳理 PRD。',
      createdAt: '2026-06-23T12:05:00Z',
    };

    await saveCollaboratorApplication(app1);
    await saveCollaboratorApplication(app2);

    expect(await getCollaboratorCountByContent(contentId)).toBe(2);
    const apps = await findCollaboratorsByContent(contentId);
    expect(apps).toHaveLength(2);
    // 按时间降序排列
    expect(apps[0].id).toBe('app-2');
    expect(apps[1].id).toBe('app-1');
  });

  it('不同内容 ID 之间互不干扰', async () => {
    const app1: CollaboratorApplication = {
      id: 'app-1',
      contentId: 'post-003',
      role: '前端开发',
      suggestion: '建议1',
      createdAt: '2026-06-23T12:00:00Z',
    };
    const app2: CollaboratorApplication = {
      id: 'app-2',
      contentId: 'post-004',
      role: '后端开发',
      suggestion: '建议2',
      createdAt: '2026-06-23T12:05:00Z',
    };

    await saveCollaboratorApplication(app1);
    await saveCollaboratorApplication(app2);

    expect(await getCollaboratorCountByContent('post-003')).toBe(1);
    expect(await getCollaboratorCountByContent('post-004')).toBe(1);
    
    const apps3 = await findCollaboratorsByContent('post-003');
    expect(apps3[0].id).toBe('app-1');
  });
});
