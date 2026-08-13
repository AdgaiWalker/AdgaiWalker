import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const prismaDir = path.resolve(__dirname, '../prisma');

describe('AI workstation schema parity', () => {
  it.each(['schema.prisma', 'schema.postgresql.prisma'])(
    '%s contains the Slice 1 models and fields',
    (file) => {
      const source = fs.readFileSync(path.join(prismaDir, file), 'utf8');
      expect(source).toContain('workflowStatus');
      expect(source).toContain('contentBrief');
      expect(source).toContain('model Submission');
      expect(source).toContain('model Action');
      expect(source).toContain('idempotencyKey');
      expect(source).toContain('plannedDate');
    },
  );
});
