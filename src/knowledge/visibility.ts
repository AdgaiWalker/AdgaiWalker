export type ContentVisibility = 'public' | 'draft' | 'private';

export interface VisibilitySource {
  visibility?: unknown;
  published?: unknown;
}

export function resolveContentVisibility(source: VisibilitySource): ContentVisibility {
  if (source.visibility === 'public' || source.visibility === 'draft' || source.visibility === 'private') {
    return source.visibility;
  }
  return source.published === false ? 'draft' : 'public';
}

export function isPublicVisibility(source: VisibilitySource): boolean {
  return resolveContentVisibility(source) === 'public';
}
