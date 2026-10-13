import { redactSensitive } from '@walker/shared';

export function encodeConversationCsvRow(values: readonly unknown[]): string {
  return `${values.map(encodeCsvCell).join(',')}\r\n`;
}

export function redactExportValue(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitive(value);
  if (Array.isArray(value)) return value.map(redactExportValue);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactExportValue(child)]));
  }
  return value;
}

function encodeCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : redactSensitive(String(value));
  const safe = /^[\t\r\n]/.test(text) || /^[\u0000-\u0020]*[=+\-@]/.test(text)
    ? `'${text}`
    : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
