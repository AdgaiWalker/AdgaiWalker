/**
 * Ferry 生态系统谱系数据
 *
 * 根(Ferry) → 干(Skill-Craft) → 枝(具体技能) → 果(经验回流)
 * 两种视图：
 *   - tree: 结构维度，谁是谁的爹
 *   - timeline: 时间维度，什么时候发生了什么
 */

export type FerryNodeRole = 'root' | 'trunk' | 'branch' | 'fruit';
export type FerryNodeType = 'theory' | 'methodology' | 'skill' | 'product' | 'experience';

export interface FerryNode {
  /** 唯一标识，对应 content entry 的 slug 或自定义 ID */
  id: string;
  /** 显示名称 */
  name: string;
  /** 在谱系中的角色 */
  role: FerryNodeRole;
  /** 类型 */
  type: FerryNodeType;
  /** 一句话描述 */
  description: string;
  /** 外部链接（GitHub 等） */
  url?: string;
  /** 对应的网站内容条目 slug（如果有） */
  contentSlug?: string;
  /** 状态 */
  status: 'building' | 'verified' | 'archived';
  /** 创建日期 */
  date: string;
  /** 子节点 */
  children?: FerryNode[];
}

/**
 * Ferry 生态系统谱系树
 */
export const ferryTree: FerryNode = {
  id: 'ferry',
  name: 'Ferry 渡轮',
  role: 'root',
  type: 'theory',
  description: '面向人机协作的世界协议。f(x)=y · 做减法 · 螺旋进化 · 熵减命令。',
  url: 'https://github.com/AdgaiWalker/Ferry',
  contentSlug: '渡论构建',
  status: 'building',
  date: '2026-05-23',
  children: [
    {
      id: 'skill-craft',
      name: 'Walkcraft-Skill-Craft',
      role: 'trunk',
      type: 'methodology',
      description: '从真实测试中迭代出健壮技能的方法论。6 阶段流程，经验库螺旋升级。',
      url: 'https://github.com/AdgaiWalker/Walkcraft-Skill-Craft',
      contentSlug: 'walkcraft-skill-craft',
      status: 'verified',
      date: '2026-05-18',
      children: [
        {
          id: 'side-hustle-blueprint',
          name: '副业蓝图',
          role: 'branch',
          type: 'skill',
          description: '从零规划并上线服务型副业。8 阶段流程，双入口设计，8 次迭代。',
          url: 'https://github.com/AdgaiWalker/Walker-skills-test/tree/main/side-hustle-blueprint',
          contentSlug: 'side-hustle-blueprint',
          status: 'verified',
          date: '2026-06-07',
          children: [
            {
              id: 'case-002',
              name: 'Case 002: 副业技能架构进化',
              role: 'fruit',
              type: 'experience',
              description: '6 个被证伪的假设、7 个关键决策、SKILL 是守门员不是知识库。',
              url: 'https://github.com/AdgaiWalker/Walkcraft-Skill-Craft/blob/main/references/cases/002-side-hustle-blueprint.md',
              status: 'verified',
              date: '2026-06-07',
            },
            {
              id: 'pattern-002',
              name: 'Pattern 002: 技能即守门员',
              role: 'fruit',
              type: 'experience',
              description: '决策逻辑放主文件，具体数据放 references。500 行红线。',
              url: 'https://github.com/AdgaiWalker/Walkcraft-Skill-Craft/blob/main/references/patterns/skill-as-gatekeeper.md',
              status: 'verified',
              date: '2026-06-07',
            },
          ],
        },
      ],
    },
  ],
};

/**
 * 扁平化所有节点（用于遍历、搜索）
 */
export function flattenFerryTree(node: FerryNode = ferryTree): FerryNode[] {
  return [node, ...(node.children?.flatMap(flattenFerryTree) ?? [])];
}

/**
 * 按 role 分组
 */
export function groupByRole(nodes?: FerryNode[]): Record<FerryNodeRole, FerryNode[]> {
  const flat = nodes ?? flattenFerryTree();
  return {
    root: flat.filter(n => n.role === 'root'),
    trunk: flat.filter(n => n.role === 'trunk'),
    branch: flat.filter(n => n.role === 'branch'),
    fruit: flat.filter(n => n.role === 'fruit'),
  };
}
