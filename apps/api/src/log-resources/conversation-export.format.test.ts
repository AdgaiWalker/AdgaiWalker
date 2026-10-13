import { describe, expect, it } from 'vitest';
import { encodeConversationCsvRow } from './conversation-export.format';

describe('conversation export formatting', () => {
  it('redacts sensitive text and neutralizes spreadsheet formulas in every CSV cell', () => {
    expect(encodeConversationCsvRow([
      '=1+1',
      '  =HYPERLINK("x")',
      '+SUM(A1:A2)',
      '-1+2',
      '@command',
      'contact user@example.com',
      'two lines\nwith "quotes"',
    ])).toBe('"\'=1+1","\'  =HYPERLINK(""x"")","\'+SUM(A1:A2)","\'-1+2","\'@command","contact [redacted-email]","two lines\nwith ""quotes"""\r\n');
  });
});
