export type PublicSnapshotSource = {
  slug: string;
  title: string;
  updated: string;
  summary: string;
  body: string;
  tags?: readonly string[];
  type: string;
  visibility: string;
  published: boolean;
  aiUsePolicy?: { readable?: boolean; citable?: boolean };
};

export type PublicSnapshotItem = {
  slug: string;
  title: string;
  updated: string;
  summary: string;
  body: string;
  tags: string[];
  type: string;
  readable: boolean;
  citable: boolean;
};

export function projectPublicItems(items: readonly PublicSnapshotSource[]): PublicSnapshotItem[] {
  return items
    .filter((item) => item.visibility === 'public' && item.published)
    .map((item) => ({
      slug: item.slug,
      title: item.title,
      updated: item.updated,
      summary: item.summary,
      body: item.body,
      tags: [...(item.tags ?? [])].sort(),
      type: item.type,
      readable: item.aiUsePolicy?.readable === true,
      citable: item.aiUsePolicy?.citable === true,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function publicManifest(items: readonly PublicSnapshotSource[], hash: (text: string) => string) {
  const projected = projectPublicItems(items).map((item) => ({ ...item, hash: hash(stableJson(item)) }));
  const collectionHash = hash(stableJson(projected.map((item) => ({ hash: item.hash, slug: item.slug }))));
  return { buildId: collectionHash, collectionHash, items: projected };
}
