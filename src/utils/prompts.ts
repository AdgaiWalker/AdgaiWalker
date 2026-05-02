import type { ConceptEntry, LogEntry } from './knowledge';

export interface PromptItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  concepts: string[];
  sourceTitle: string;
  sourceUrl: string;
}

function parseQuotedList(value: string | undefined) {
  if (!value) return [];
  return [...value.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

function parsePromptAttributes(rawAttributes: string) {
  const title = rawAttributes.match(/title=["']([^"']+)["']/)?.[1] ?? '未命名提示词';
  const tagsSource = rawAttributes.match(/tags=\{(\[[\s\S]*?\])\}/)?.[1];
  const tags = parseQuotedList(tagsSource);

  return { title, tags };
}

function normalizePromptContent(content: string) {
  return content
    .replace(/^\n+|\n+$/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

export function extractPromptBlocks(entry: LogEntry): PromptItem[] {
  const body = entry.body ?? '';
  const prompts: PromptItem[] = [];
  const blockPattern = /<PromptBlock\b([^>]*)>([\s\S]*?)<\/PromptBlock>/g;

  for (const match of body.matchAll(blockPattern)) {
    const [, rawAttributes, rawContent] = match;
    const { title, tags } = parsePromptAttributes(rawAttributes);
    const content = normalizePromptContent(rawContent);
    if (!content) continue;

    prompts.push({
      id: `${entry.id}#prompt-${prompts.length + 1}`,
      title,
      content,
      tags,
      concepts: entry.data.concepts ?? [],
      sourceTitle: entry.data.title,
      sourceUrl: `/log/${entry.id}`,
    });
  }

  return prompts;
}

export function buildPromptLibrary(entries: LogEntry[]) {
  return entries.flatMap((entry) => {
    const embeddedPrompts = extractPromptBlocks(entry);

    if (entry.data.type !== 'prompt') {
      return embeddedPrompts;
    }

    const standalonePrompt: PromptItem = {
      id: `${entry.id}#standalone`,
      title: entry.data.title,
      content: normalizePromptContent(entry.body ?? ''),
      tags: entry.data.tags ?? [],
      concepts: entry.data.concepts ?? [],
      sourceTitle: entry.data.title,
      sourceUrl: `/log/${entry.id}`,
    };

    return [standalonePrompt, ...embeddedPrompts].filter((prompt) => prompt.content);
  });
}

export function groupPromptsByConcept(prompts: PromptItem[], concepts: ConceptEntry[]) {
  const conceptMap = new Map(concepts.map((concept) => [concept.id, concept]));
  const groups = new Map<string, { concept: ConceptEntry | null; prompts: PromptItem[] }>();

  for (const prompt of prompts) {
    const tagMatchedConcept = concepts.find((concept) =>
      prompt.tags.includes(concept.data.title) ||
      concept.data.domain.some((domain) => prompt.tags.includes(domain))
    );
    const conceptId = tagMatchedConcept?.id ?? prompt.concepts[0] ?? 'uncategorized';

    if (!groups.has(conceptId)) {
      groups.set(conceptId, {
        concept: conceptMap.get(conceptId) ?? null,
        prompts: [],
      });
    }

    groups.get(conceptId)!.prompts.push(prompt);
  }

  return [...groups.entries()]
    .map(([id, group]) => ({ id, ...group }))
    .sort((a, b) => {
      if (a.concept?.data.layer && b.concept?.data.layer) {
        return a.concept.data.layer - b.concept.data.layer;
      }
      if (a.concept?.data.layer) return -1;
      if (b.concept?.data.layer) return 1;
      return a.id.localeCompare(b.id, 'zh-CN');
    });
}
