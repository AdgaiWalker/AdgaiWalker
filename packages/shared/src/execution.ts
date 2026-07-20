export type DeliveryForm = 'article' | 'live' | 'group' | 'tool' | 'other';

export type ReviewOutcome = 'yes' | 'no' | 'unclear';

export interface DeliveryInput {
  url?: string | null;
  form?: DeliveryForm | null;
  note?: string | null;
}

export interface ReviewInput {
  outcome: ReviewOutcome;
  evidence?: string | null;
}

const FORMS: readonly DeliveryForm[] = [
  'article',
  'live',
  'group',
  'tool',
  'other',
] as const;

export function isDeliveryForm(value: string): value is DeliveryForm {
  return (FORMS as readonly string[]).includes(value);
}

/**
 * 合法交付：url 非空，或 form + note≥4
 */
export function isValidDelivery(input: DeliveryInput): boolean {
  const url = input.url?.trim() ?? '';
  if (url.length > 0) return true;
  const form = input.form;
  const note = input.note?.trim() ?? '';
  if (form && isDeliveryForm(form) && note.length >= 4) return true;
  return false;
}

/**
 * 检验：yes|no|unclear；no 时证据 trim≥4
 */
export function isValidReview(input: ReviewInput): boolean {
  if (input.outcome === 'yes' || input.outcome === 'unclear') return true;
  if (input.outcome === 'no') {
    return (input.evidence?.trim().length ?? 0) >= 4;
  }
  return false;
}
