import { CHARS_PER_MINUTE_ZH } from './constants';

export function estimateReadingMinutes(text: string): number {
  const chars = text.replace(/\s/g, '').length;
  return Math.max(1, Math.ceil(chars / CHARS_PER_MINUTE_ZH));
}
