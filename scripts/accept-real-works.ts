import fs from 'node:fs/promises';
import path from 'node:path';

type Work = { id: string; idempotencyKey: string; title: string };
type SavedArtifact = { hash: string };

const base = process.env.WORKSTATION_URL?.trim() || 'http://127.0.0.1:8790';
const stages = ['NORMALIZE', 'EDIT', 'QUALITY_CHECK', 'FREEZE_BODY', 'COVER', 'WEB_FORMAT', 'WECHAT_FORMAT', 'REVIEW_READY'] as const;
const fixtures = [
  { key: 'real-work-cc-intro', file: 'cc-intro.md', viewpoint: '先解释问题为什么出现，再用一次完整实操让用户获得第一次成功。' },
  { key: 'real-work-affordable', file: 'affordable-ai-community.md', viewpoint: '先识别学习和行动的真实阻力，再设计能让人持续实践的社群。' },
  { key: 'real-work-fear', file: 'fear-as-fuel.md', viewpoint: '把恐惧当作反馈信号，用一个最小动作把想法带进现实。' },
];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function toHtml(value: string): string {
  return value.split(/\n\s*\n/).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph.replace(/^#+\s*/gm, ''))}</p>`).join('');
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return JSON.parse(text) as T;
}

async function main(): Promise<void> {
  const works = await (await fetch(`${base}/works`)).json() as Work[];
  for (const fixture of fixtures) {
    const work = works.find((item) => item.idempotencyKey === fixture.key);
    if (!work) throw new Error(`missing-work:${fixture.key}`);
    const raw = await fs.readFile(path.resolve('content/log', fixture.file), 'utf8');
    const body = raw.replace(/^---[\s\S]*?---\s*/, '').trim();
    let previousHash: string | undefined;
    for (const stage of stages) {
      // One intentionally invalid submission proves that the next valid
      // artifact can be accepted from the last successful hash.
      if (fixture.key === 'real-work-affordable' && stage === 'QUALITY_CHECK') {
        const invalid = await fetch(`${base}/works/${work.id}/artifacts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ artifact: { recipeVersion: 999, stage, output: { body } } }) });
        if (invalid.ok) throw new Error('expected-invalid-artifact-to-fail');
        console.log(`${work.title} ${stage}: intentional rejection ${invalid.status}`);
      }

      const output: Record<string, unknown> = {
        title: work.title,
        body,
        agent: 'assistant-manual-fallback',
        model: 'current-session',
        sourceFile: fixture.file,
        coreViewpoint: fixture.viewpoint,
        inputHash: previousHash ?? 'original',
      };
      if (stage === 'NORMALIZE') output.normalizedProblem = '从原稿中提取真实问题、场景和目标受众。';
      if (stage === 'EDIT') output.editNotes = ['保留作者核心观点', '压缩重复段落', '补足可执行结论'];
      if (stage === 'QUALITY_CHECK') output.checks = { factuality: '待人工核验', claims: '未新增外部事实', privacy: '通过' };
      if (stage === 'FREEZE_BODY') output.freezeReason = '审批前锁定正文边界';
      if (stage === 'COVER') {
        output.landscapeCover = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="100%" height="100%" fill="#111827"/><text x="8%" y="48%" fill="white" font-size="54">${escapeHtml(work.title)}</text></svg>`;
        output.portraitCover = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="100%" height="100%" fill="#111827"/><text x="8%" y="48%" fill="white" font-size="42">${escapeHtml(work.title)}</text></svg>`;
      }
      if (stage === 'WEB_FORMAT') Object.assign(output, { markdown: `# ${work.title}\n\n${body}`, summary: '把一个真实问题拆开，给出可以立刻开始的最小行动。' });
      if (stage === 'WECHAT_FORMAT') Object.assign(output, { html: toHtml(body), summary: '把一个真实问题拆开，给出可以立刻开始的最小行动。', author: 'AdgaiWalker', images: [] });
      if (stage === 'REVIEW_READY') Object.assign(output, { markdown: `# ${work.title}\n\n${body}`, html: toHtml(body), summary: '把一个真实问题拆开，给出可以立刻开始的最小行动。', author: 'AdgaiWalker', images: [] });

      const saved = await postJson<SavedArtifact>(`${base}/works/${work.id}/artifacts`, { artifact: { recipeVersion: 1, stage, output, inputHash: previousHash, createdAt: new Date().toISOString() } });
      previousHash = saved.hash;
      console.log(`${work.title} ${stage}: ${saved.hash.slice(0, 12)}`);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
