import stats from './site-stats.json';

export const articles = [
  { title: '我的畏惧，也是动力', summary: '不甘心困在小小的时空里，三样东西自然积累，拼成了一个个人前进系统。', href: '/posts/我的畏惧也是动力' },
  { title: '点子是不分时空的资产', summary: '存的时候不知道何时取出，但 AI 让取出的成本越来越低。', href: '/posts/点子超越时间' },
  { title: '未来已经在来了', summary: '从现在到 2050，AI 会把想象变成现实。想象力是最后的壁垒。', href: '/posts/未来已经在来了' },
];

export const pillars = [
  { label: '思考', route: '/posts', icon: 'lucide:pen-line', hint: 'POSTS', desc: '写下来的思考，走过的路不想白走' },
  { label: '资源', route: '/tools', icon: 'lucide:wrench', hint: 'TOOLS', desc: '验证过的工具，便宜好用能解决问题' },
  { label: '点子', route: '/ideas', icon: 'lucide:lightbulb', hint: 'IDEAS', desc: '还没用上的灵感，先存着等时机' },
  { label: '项目', route: '/projects', icon: 'lucide:rocket', hint: 'PROJECTS', desc: '做出来的东西，从点子到现实' },
];

export const aiTools = [
  { name: 'Claude Code', role: '主力编程 Agent', model: 'GLM-5.1' },
  { name: 'Codex', role: '辅助编程 Agent', model: 'GPT-5.5 中转' },
  { name: 'Cherry Studio', role: '图片生成', model: 'GPT Image 2' },
  { name: 'OiiOii', role: '视频生成', model: 'Seedence 2.0' },
  { name: 'Gemini', role: '美化辅助', model: '—' },
];

const costs = stats.costs;
export const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);
export const costByCategory = Object.entries(
  costs.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] || 0) + c.amount;
    return acc;
  }, {})
);
