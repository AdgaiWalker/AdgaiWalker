import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const prismaDir = path.resolve(__dirname, '../prisma');

describe('AI workstation SQLite schema', () => {
  it('contains the Slice 1 models and fields', () => {
    const source = fs.readFileSync(path.join(prismaDir, 'schema.prisma'), 'utf8');
    expect(source).toContain('workflowStatus');
    expect(source).toContain('contentBrief');
    expect(source).toContain('model Submission');
    expect(source).toContain('model Action');
    expect(source).toContain('idempotencyKey');
    expect(source).toContain('plannedDate');
  });
});
