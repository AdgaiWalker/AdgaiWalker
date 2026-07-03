import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';

export const prerender = false;

/**
 * GET /api/posts/[slug]/export
 *
 * 动态 SSR 导出端点。根据文章 slug，读取原始 Content Collection 实例，
 * 重新拼装为带 YAML 标头的标准 Markdown 文本，并触发浏览器下载。
 * 支撑“用户是创造者，内容是生产资料，允许自由带走”的 Marxist 哲学。
 */
export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;

  if (!slug) {
    return new Response('Slug parameters missing', { status: 400 });
  }

  try {
    const entry = await getEntry('log', slug);

    if (!entry) {
      return new Response(`Article not found: ${slug}`, { status: 404 });
    }

    // 拼装标准 YAML Frontmatter，支持 Obsidian/Logseq 等工具无缝识别
    const frontmatter = [
      '---',
      `title: "${entry.data.title.replace(/"/g, '\\"')}"`,
      `date: ${entry.data.date.toISOString()}`,
      `type: ${entry.data.type}`,
      entry.data.form ? `form: ${entry.data.form}` : null,
      entry.data.domain ? `domain: ${entry.data.domain}` : null,
      entry.data.intent ? `intent: ${entry.data.intent}` : null,
      entry.data.status ? `status: ${entry.data.status}` : null,
      entry.data.tags.length > 0 ? `tags: [${entry.data.tags.map(t => `"${t}"`).join(', ')}]` : null,
      '---',
      '',
      entry.body || ''
    ]
      .filter(line => line !== null)
      .join('\n');

    // 触发下载响应。filename 含中文时，HTTP header（ByteString）不允许非 ASCII，
    // 需用 RFC 5987 的 filename*=UTF-8''<percent-encoded> 形式，并保留 ASCII fallback。
    const asciiFallback = /^[\x20-\x7E]+$/.test(slug) ? slug : 'export';
    const filenameStar = encodeURIComponent(slug);
    return new Response(frontmatter, {
      status: 200,
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${asciiFallback}.md"; filename*=UTF-8''${filenameStar}.md`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Failed to export markdown:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};
