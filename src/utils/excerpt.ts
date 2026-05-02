export function extractExcerpt(body: string | undefined, maxLen = 150): string | undefined {
  if (!body) return undefined;
  return body
    .replace(/^---[\s\S]*?---/, '')
    .replace(/^import\s+.*$/gm, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[#*_`\[\]()>|]/g, '')
    .trim()
    .slice(0, maxLen) + '...';
}
