export const WORK_STATUSES = [
  'DRAFT_READY',
  'PROCESSING',
  'NEEDS_INPUT',
  'REVIEW_READY',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PUBLISHING',
  'PARTIALLY_PUBLISHED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const MAX_ORIGINAL_FILES = 21;
export const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function parseProtectedClaims(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('invalid-protected-claims');
  }
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== 'string')
  ) {
    throw new Error('invalid-protected-claims');
  }
  return parsed.map((item) => item.trim()).filter(Boolean);
}

export function validateOriginalUpload(input: {
  title: string;
  coreViewpoint: string;
  draftCount: number;
  attachmentCount: number;
}): void {
  if (!input.title.trim()) throw new Error('work-title-required');
  if (!input.coreViewpoint.trim()) throw new Error('core-viewpoint-required');
  if (input.draftCount !== 1) throw new Error('one-draft-required');
  if (input.draftCount + input.attachmentCount > MAX_ORIGINAL_FILES) {
    throw new Error('too-many-original-files');
  }
}
