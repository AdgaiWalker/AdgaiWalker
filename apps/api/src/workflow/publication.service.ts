import { Inject, Injectable, Optional } from '@nestjs/common';
import { missingPublishedPostFields } from '@walker/shared';
import { newId } from '../common/ids';
import { storageUnavailable, validationError } from '../common/http-error';
import { CONTENT_FILE_REPOSITORY, type ContentFileRepositoryPort } from '../ports/content-file.repository';
import { PRISMA, type PrismaPort } from '../ports/prisma.port';
import { PUBLICATION_REPOSITORY, type PublicationRepositoryPort } from '../ports/publication.repository';
import { STAGE_ARTIFACT_REPOSITORY, type StageArtifactRepositoryPort } from '../ports/stage-artifact.repository';
import { WORK_REPOSITORY, type WorkRepositoryPort } from '../ports/work.repository';
import { PUBLICATION_PACKAGE_REPOSITORY, type PublicationPackageRepositoryPort } from '../ports/publication-package.repository';
import { WEBSITE_DEPLOYMENT_VERIFIER, type WebsiteDeploymentVerifierPort } from '../ports/website-deployment-verifier.port';
import { WECHAT_DRAFT_SESSION, type WechatDraftSessionPort } from '../ports/wechat-draft-session.port';

@Injectable()
export class PublicationService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaPort,
    @Inject(WORK_REPOSITORY) private readonly works: WorkRepositoryPort,
    @Inject(STAGE_ARTIFACT_REPOSITORY) private readonly stages: StageArtifactRepositoryPort,
    @Inject(PUBLICATION_REPOSITORY) private readonly publications: PublicationRepositoryPort,
    @Inject(CONTENT_FILE_REPOSITORY) private readonly files: ContentFileRepositoryPort,
    @Optional() @Inject(PUBLICATION_PACKAGE_REPOSITORY) private readonly packages?: PublicationPackageRepositoryPort,
    @Optional() @Inject(WEBSITE_DEPLOYMENT_VERIFIER) private readonly websiteVerifier?: WebsiteDeploymentVerifierPort,
    @Optional() @Inject(WECHAT_DRAFT_SESSION) private readonly wechatSession?: WechatDraftSessionPort,
  ) {}

  async list(workId: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    if (!(await this.works.findById(workId))) throw validationError('work-not-found');
    return this.publications.list(workId);
  }

  async publishWebsite(workId: string, artifactHash: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const work = await this.works.findById(workId);
    if (!work) throw validationError('work-not-found');
    if (!['APPROVED', 'PARTIALLY_PUBLISHED'].includes(work.status) || work.approvedArtifactHash !== artifactHash) throw validationError('artifact-hash-mismatch');
    const artifact = await this.stages.latest(workId, 'REVIEW_READY');
    if (!artifact || artifact.hash !== artifactHash) throw validationError('artifact-hash-mismatch');
    const output = artifact.artifact.output;
    const title = typeof output.title === 'string' && output.title.trim() ? output.title.trim() : work.title;
    const slug = slugify(`${title}-${work.id.slice(-6)}`);
    const markdown = typeof output.markdown === 'string' ? output.markdown : typeof output.body === 'string' ? output.body : '';
    if (!markdown.trim()) throw validationError('website-markdown-missing');
    // frontmatter 合同与 build:web 门禁同源（shared PUBLISHED_POST_REQUIRED_FIELDS）：
    // 缺字段在写盘前就拒绝，绝不产出过不了构建的文件
    const frontmatter = buildPostFrontmatter({ title, output });
    const missing = missingPublishedPostFields(frontmatter);
    if (missing.length > 0) throw validationError(`website-frontmatter-incomplete:${missing.join(',')}`);
    const raw = `${renderFrontmatterYaml(frontmatter)}\n\n${markdown}\n`;
    const saved = await this.files.save(slug, raw);
    const base = (process.env.PUBLIC_SITE_URL?.trim() || 'https://iwalk.pro').replace(/\/$/, '');
    const url = `${base}/posts/${encodeURIComponent(saved.slug)}`;
    // 保存 ≠ 发布：文件只落盘到 content/log，上线走 pnpm content:publish（commit+push+Vercel），
    // 之后由 verifyWebsite 校验线上 URL 才翻 PUBLISHED。这里如实记录 PREPARED。
    const publication = await this.publications.upsert({
      id: newId(),
      submissionId: workId,
      channel: 'WEBSITE',
      artifactHash,
      status: 'PREPARED',
      url,
      lastError: null,
      publishedAt: null,
    });
    return publication;
  }

  async verifyWebsite(workId: string) {
    if (!this.websiteVerifier) throw validationError('website-verifier-unavailable');
    const work = await this.works.findById(workId);
    if (!work || !work.approvedArtifactHash) throw validationError('work-not-approved');
    const publication = await this.publications.find(workId, 'WEBSITE');
    if (!publication?.url) throw validationError('website-publication-not-found');
    const artifact = await this.stages.latest(workId, 'REVIEW_READY');
    const title = typeof artifact?.artifact.output.title === 'string' ? artifact.artifact.output.title : work.title;
    const verification = await this.websiteVerifier.verify(publication.url, { title });
    const updated = await this.publications.upsert({ id: publication.id, submissionId: workId, channel: 'WEBSITE', artifactHash: work.approvedArtifactHash, status: verification.ok ? 'PUBLISHED' : 'FAILED', url: publication.url, lastError: verification.ok ? null : verification.reason ?? 'remote-verification-failed', publishedAt: verification.ok ? new Date() : null });
    if (this.works.setStatus) await this.works.setStatus(workId, verification.ok ? 'PARTIALLY_PUBLISHED' : 'APPROVED', work.approvedArtifactHash);
    return updated;
  }

  async prepareWechat(workId: string, artifactHash: string) {
    if (!this.prisma.isWritable()) throw storageUnavailable();
    const work = await this.works.findById(workId);
    if (!work) throw validationError('work-not-found');
    if (!['APPROVED', 'PARTIALLY_PUBLISHED'].includes(work.status) || work.approvedArtifactHash !== artifactHash) throw validationError('artifact-hash-mismatch');
    const artifact = await this.stages.latest(workId, 'REVIEW_READY');
    if (!artifact || artifact.hash !== artifactHash) throw validationError('artifact-hash-mismatch');
    const output = artifact.artifact.output;
    const title = typeof output.title === 'string' && output.title.trim() ? output.title.trim() : work.title;
    const value = {
      title,
      summary: typeof output.summary === 'string' ? output.summary : title,
      author: typeof output.author === 'string' ? output.author : 'AdgaiWalker',
      html: typeof output.html === 'string' ? output.html : `<p>${escapeHtml(typeof output.body === 'string' ? output.body : '')}</p>`,
      mobilePreviewHtml: typeof output.mobilePreviewHtml === 'string' ? output.mobilePreviewHtml : '',
      images: Array.isArray(output.images) ? output.images.filter((item): item is string => typeof item === 'string') : [],
      landscapeCover: typeof output.landscapeCover === 'string' ? output.landscapeCover : '',
      portraitCover: typeof output.portraitCover === 'string' ? output.portraitCover : '',
      fieldChecklist: ['title', 'summary', 'author', 'html', 'mobilePreviewHtml', 'landscapeCover', 'portraitCover'],
      artifactHash,
    };
    const saved = this.packages ? await this.packages.saveWechat(workId, value) : { path: '', value };
    const session = this.wechatSession ? await this.wechatSession.saveDraft(value) : { saved: false, reason: 'wechat-session-unavailable' };
    const publication = await this.publications.upsert({ id: newId(), submissionId: workId, channel: 'WECHAT', artifactHash, status: 'WAITING_USER', url: session.draftId ? `wechat://draft/${encodeURIComponent(session.draftId)}` : null, lastError: session.saved ? null : session.reason ?? null });
    const website = await this.publications.find(workId, 'WEBSITE');
    if (website?.status === 'PUBLISHED' && this.works.setStatus) await this.works.setStatus(workId, 'COMPLETED', artifactHash);
    return { publication, packagePath: saved.path, package: saved.value };
  }
}

function slugify(value: string): string {
  const slug = value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
  return slug || 'work';
}

/**
 * 组装公开文章 frontmatter。工作站产出的默认口径：article / product / share / utility；
 * 模型输出里带了合法同名字段时优先采用。aiUsePolicy 固定 AI-2（AI 加工、人工审核后发布），
 * 与站内既有人工审核文章一致，readable/citable/actionable 全开。
 */
function buildPostFrontmatter(input: { title: string; output: Record<string, unknown> }): Record<string, unknown> {
  const pick = (key: string, fallback: string): string => {
    const v = input.output[key];
    return typeof v === 'string' && v.trim() ? v.trim() : fallback;
  };
  return {
    title: input.title,
    date: new Date().toISOString(),
    updated: new Date().toISOString().slice(0, 10),
    type: 'knowledge',
    published: true,
    tags: Array.isArray(input.output.tags)
      ? input.output.tags.filter((t): t is string => typeof t === 'string')
      : [],
    form: pick('form', 'article'),
    domain: pick('domain', 'product'),
    intent: pick('intent', 'share'),
    valueMode: pick('valueMode', 'utility'),
    summary: pick('summary', input.title),
    aiUsePolicy: {
      level: 'AI-2',
      readable: true,
      citable: true,
      actionable: true,
      reason: '工作站产出：AI 加工、人工审核批准后发布',
    },
  };
}

/** 确定性 YAML 输出（本函数只为 buildPostFrontmatter 的固定形状服务：标量/字符串数组/一层对象） */
function renderFrontmatterYaml(data: Record<string, unknown>): string {
  const scalar = (value: unknown): string =>
    typeof value === 'boolean' || typeof value === 'number'
      ? String(value)
      : JSON.stringify(String(value).replace(/[\r\n]+/g, ' ').trim());
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value.map((v) => String(v).replace(/[\r\n]+/g, ' ').trim()))}`);
    } else if (value !== null && typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`  ${childKey}: ${scalar(childValue)}`);
      }
    } else {
      lines.push(`${key}: ${scalar(value)}`);
    }
  }
  return `---\n${lines.join('\n')}\n---`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
