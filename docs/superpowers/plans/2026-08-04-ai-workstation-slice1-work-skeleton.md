# AI Content Workstation Slice 1: Work Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first independently testable slice of the AI content workstation: lightweight topic selection, flexible actions/video logs, work creation from a selected topic or an existing draft, immutable original files, and one user-visible work timeline.

**Architecture:** Preserve `Clue → Seed → Execution` as the business truth and add `Submission` as the work aggregate, `Action` as the flexible planning truth, and a filesystem artifact port for immutable originals. The Admin consumes aggregate `/workbench`, `/actions`, and `/works` APIs; it does not expose the underlying object graph or introduce the production Recipe yet.

**Tech Stack:** pnpm 9, Node.js 20+, TypeScript 5.9, React 19, Vite 6, React Router 7, NestJS 11, Prisma 6, SQLite/PostgreSQL parity, Vitest 3, Testing Library, local filesystem artifacts.

---

## Scope lock

This plan implements PRD requirements `TOP-01`, `TOP-02`, `ACT-01`, `WORK-01`, and `WORK-02` only.

It deliberately does not implement Codex execution, production stages, cover generation, WeChat layout, review approval, publishing, feedback conversion, tool installation, MCP management, calendar drag-and-drop, or a second AI provider. Those belong to Slice 2 and Slice 3 plans after this slice passes with one real draft.

## File map

### Shared contracts

- Create `packages/shared/src/topic.ts`: topic status, content brief, and validation.
- Create `packages/shared/src/action.ts`: action kinds, statuses, date validation, and transition rules.
- Create `packages/shared/src/work.ts`: work statuses, upload constraints, and protected-claim parsing.
- Create `packages/shared/src/topic.test.ts`.
- Create `packages/shared/src/action.test.ts`.
- Create `packages/shared/src/work.test.ts`.
- Create `packages/shared/src/json-request.test.ts`.
- Modify `packages/shared/src/json-request.ts`: allow browser-generated multipart boundaries.
- Modify `packages/shared/src/index.ts`: export new contracts.

### Persistence and API

- Modify `apps/api/prisma/schema.prisma`: add topic fields, execution brief, `Submission`, and `Action`.
- Modify `apps/api/prisma/schema.postgresql.prisma`: mirror the SQLite schema.
- Create `apps/api/prisma/migrations/20260804000000_ai_workstation_slice1/migration.sql`: PostgreSQL deployment migration.
- Create `apps/api/src/ports/action.repository.ts`.
- Create `apps/api/src/ports/work.repository.ts`.
- Create `apps/api/src/ports/artifact.repository.ts`.
- Create `apps/api/src/adapters/prisma-action.repository.ts`.
- Create `apps/api/src/adapters/prisma-work.repository.ts`.
- Create `apps/api/src/adapters/fs-artifact.repository.ts`.
- Create `apps/api/src/adapters/fs-artifact.repository.test.ts`.
- Modify `apps/api/src/ports/seed.repository.ts`.
- Modify `apps/api/src/ports/execution.repository.ts`.
- Modify `apps/api/src/adapters/prisma-seed.repository.ts`.
- Modify `apps/api/src/adapters/prisma-execution.repository.ts`.
- Modify `apps/api/src/seed/seed.service.ts`.
- Modify `apps/api/src/seed/seed.controller.ts`.
- Create `apps/api/src/seed/seed.service.test.ts`.
- Create `apps/api/src/action/action.service.ts`.
- Create `apps/api/src/action/action.controller.ts`.
- Create `apps/api/src/action/action.service.test.ts`.
- Create `apps/api/src/work/work.service.ts`.
- Create `apps/api/src/work/work.controller.ts`.
- Create `apps/api/src/work/work.service.test.ts`.
- Create `apps/api/src/workbench/workbench.service.ts`.
- Create `apps/api/src/workbench/workbench.controller.ts`.
- Modify `apps/api/src/config/config.port.ts`.
- Modify `apps/api/src/config/env-config.adapter.ts`.
- Modify `apps/api/src/kernel.module.ts`.

### Admin

- Modify `apps/admin/package.json`: add the same Testing Library and jsdom versions already used by `apps/web`.
- Modify `apps/admin/vitest.config.ts`: use jsdom and setup file.
- Create `apps/admin/src/test/setup.ts`.
- Modify `apps/admin/src/api/admin-api.ts`: add workbench, action, and multipart work methods.
- Modify `apps/admin/src/shared/routes.ts`: add work routes.
- Modify `apps/admin/src/shared/nav.ts`: rename Today to Workbench and add Works without adding future empty pages.
- Modify `apps/admin/src/App.tsx`: register work list/detail routes.
- Create `apps/admin/src/pages/WorkbenchPage.tsx`.
- Create `apps/admin/src/pages/WorkbenchPage.test.tsx`.
- Create `apps/admin/src/pages/WorksPage.tsx`.
- Create `apps/admin/src/pages/WorksPage.test.tsx`.
- Create `apps/admin/src/pages/WorkDetailPage.tsx`.
- Modify `apps/admin/src/styles.css`: add only the controls needed by the two new surfaces.

### Acceptance and configuration

- Create `scripts/accept-ai-workstation-slice1.ts`.
- Modify `package.json`: add `accept:ai-workstation:slice1`.
- Modify `.gitignore`: ignore `var/works` and upload staging.
- Modify `apps/api/.env.example`: document `WORK_ROOT_DIR` and upload limits.

## Task 1: Add shared topic, action, work, and multipart contracts

**Files:**
- Create: `packages/shared/src/topic.test.ts`
- Create: `packages/shared/src/action.test.ts`
- Create: `packages/shared/src/work.test.ts`
- Create: `packages/shared/src/json-request.test.ts`
- Create: `packages/shared/src/topic.ts`
- Create: `packages/shared/src/action.ts`
- Create: `packages/shared/src/work.ts`
- Modify: `packages/shared/src/json-request.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing domain tests**

Create `packages/shared/src/topic.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { assertTopicTransition, normalizeContentBrief } from './topic.js';

describe('topic contracts', () => {
  it('only permits the four MVP topic states', () => {
    expect(() => assertTopicTransition('INBOX', 'CANDIDATE')).not.toThrow();
    expect(() => assertTopicTransition('CANDIDATE', 'SELECTED')).not.toThrow();
    expect(() => assertTopicTransition('SELECTED', 'INBOX')).toThrow(
      'invalid-topic-transition',
    );
  });

  it('normalizes a complete content brief', () => {
    expect(
      normalizeContentBrief({
        audience: '刚开始使用 AI 的普通人',
        scenario: '想把一个想法做成第一篇教程',
        problem: '会聊天但不会形成作品',
        keyQuestion: '怎样从初稿走到可发布成品',
        intendedAction: '上传自己的第一版初稿',
      }),
    ).toEqual({
      audience: '刚开始使用 AI 的普通人',
      scenario: '想把一个想法做成第一篇教程',
      problem: '会聊天但不会形成作品',
      keyQuestion: '怎样从初稿走到可发布成品',
      intendedAction: '上传自己的第一版初稿',
    });
  });
});
```

Create `packages/shared/src/action.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizePlannedDate, transitionAction } from './action.js';

describe('action contracts', () => {
  it('accepts an empty date and a calendar date', () => {
    expect(normalizePlannedDate(null)).toBeNull();
    expect(normalizePlannedDate('2026-08-04')).toBe('2026-08-04');
    expect(() => normalizePlannedDate('2026-8-4')).toThrow(
      'invalid-planned-date',
    );
  });

  it('supports reversible completion', () => {
    const done = transitionAction('OPEN', 'complete', new Date('2026-08-04T10:00:00Z'));
    expect(done.status).toBe('DONE');
    expect(done.completedAt?.toISOString()).toBe('2026-08-04T10:00:00.000Z');
    expect(transitionAction('DONE', 'reopen', new Date())).toEqual({
      status: 'OPEN',
      completedAt: null,
    });
  });
});
```

Create `packages/shared/src/work.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseProtectedClaims, validateOriginalUpload } from './work.js';

describe('work contracts', () => {
  it('requires one non-empty core viewpoint and one draft', () => {
    expect(() =>
      validateOriginalUpload({
        title: '第一篇稿子',
        coreViewpoint: 'AI 应该帮助普通人完成真实工作。',
        draftCount: 1,
        attachmentCount: 2,
      }),
    ).not.toThrow();
    expect(() =>
      validateOriginalUpload({
        title: '第一篇稿子',
        coreViewpoint: ' ',
        draftCount: 1,
        attachmentCount: 0,
      }),
    ).toThrow('core-viewpoint-required');
  });

  it('parses protected claims from JSON without accepting non-strings', () => {
    expect(parseProtectedClaims('["不制造焦虑","不承诺一键成功"]')).toEqual([
      '不制造焦虑',
      '不承诺一键成功',
    ]);
    expect(() => parseProtectedClaims('["有效",3]')).toThrow(
      'invalid-protected-claims',
    );
  });
});
```

Create `packages/shared/src/json-request.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from './json-request.js';

afterEach(() => vi.unstubAllGlobals());

describe('fetchJson multipart transport', () => {
  it('does not override the FormData boundary', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.has('Content-Type')).toBe(false);
      return new Response(JSON.stringify({ id: 'work-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const form = new FormData();
    form.set('title', '第一篇稿子');
    await expect(fetchJson('/works', { method: 'POST', body: form })).resolves.toEqual({
      ok: true,
      data: { id: 'work-1' },
    });
  });
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run:

```powershell
pnpm --filter @walker/shared exec vitest run src/topic.test.ts src/action.test.ts src/work.test.ts src/json-request.test.ts
```

Expected: FAIL because `topic.ts`, `action.ts`, and `work.ts` do not exist and `fetchJson` still forces `Content-Type: application/json`.

- [ ] **Step 3: Implement the shared contracts**

Create `packages/shared/src/topic.ts`:

```ts
export const TOPIC_STATUSES = ['INBOX', 'CANDIDATE', 'SELECTED', 'ARCHIVED'] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export interface ContentBrief {
  audience: string;
  scenario: string;
  problem: string;
  keyQuestion: string;
  intendedAction: string;
}

const TOPIC_TRANSITIONS: Record<TopicStatus, readonly TopicStatus[]> = {
  INBOX: ['CANDIDATE', 'ARCHIVED'],
  CANDIDATE: ['INBOX', 'SELECTED', 'ARCHIVED'],
  SELECTED: ['ARCHIVED'],
  ARCHIVED: ['INBOX', 'CANDIDATE'],
};

export function assertTopicTransition(from: TopicStatus, to: TopicStatus): void {
  if (from === to) return;
  if (!TOPIC_TRANSITIONS[from].includes(to)) {
    throw new Error('invalid-topic-transition');
  }
}

export function normalizeContentBrief(input: ContentBrief): ContentBrief {
  const value: ContentBrief = {
    audience: input.audience.trim(),
    scenario: input.scenario.trim(),
    problem: input.problem.trim(),
    keyQuestion: input.keyQuestion.trim(),
    intendedAction: input.intendedAction.trim(),
  };
  if (Object.values(value).some((item) => item.length === 0)) {
    throw new Error('content-brief-incomplete');
  }
  return value;
}
```

Create `packages/shared/src/action.ts`:

```ts
export const ACTION_KINDS = ['TASK', 'VIDEO'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export const ACTION_STATUSES = ['OPEN', 'DONE'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const ACTION_SOURCES = ['HUMAN', 'SYSTEM'] as const;
export type ActionSource = (typeof ACTION_SOURCES)[number];
export const ACTION_ENTITY_TYPES = [
  'SEED',
  'EXECUTION',
  'SUBMISSION',
  'PUBLICATION',
] as const;
export type ActionEntityType = (typeof ACTION_ENTITY_TYPES)[number];

export function normalizePlannedDate(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('invalid-planned-date');
  }
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new Error('invalid-planned-date');
  }
  return normalized;
}

export function transitionAction(
  current: ActionStatus,
  event: 'complete' | 'reopen',
  now: Date,
): { status: ActionStatus; completedAt: Date | null } {
  if (event === 'complete') {
    return { status: 'DONE', completedAt: now };
  }
  return { status: 'OPEN', completedAt: null };
}
```

Create `packages/shared/src/work.ts`:

```ts
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
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
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
```

Modify `packages/shared/src/json-request.ts` so headers are constructed safely:

```ts
const headers = new Headers(init?.headers);
const isFormData =
  typeof FormData !== 'undefined' && init?.body instanceof FormData;
if (!isFormData && !headers.has('Content-Type')) {
  headers.set('Content-Type', 'application/json');
}

res = await fetch(url, {
  credentials: 'include',
  ...init,
  headers,
});
```

Export the three files from `packages/shared/src/index.ts`:

```ts
export * from './topic.js';
export * from './action.js';
export * from './work.js';
```

- [ ] **Step 4: Run the focused and package tests**

Run:

```powershell
pnpm --filter @walker/shared exec vitest run src/topic.test.ts src/action.test.ts src/work.test.ts src/json-request.test.ts
pnpm test:shared
```

Expected: all shared tests PASS.

- [ ] **Step 5: Commit the shared contracts**

```powershell
git add packages/shared/src/topic.ts packages/shared/src/topic.test.ts packages/shared/src/action.ts packages/shared/src/action.test.ts packages/shared/src/work.ts packages/shared/src/work.test.ts packages/shared/src/json-request.ts packages/shared/src/json-request.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add workstation domain contracts"
```

## Task 2: Add the Slice 1 persistence model with SQLite/PostgreSQL parity

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/schema.postgresql.prisma`
- Create: `apps/api/prisma/migrations/20260804000000_ai_workstation_slice1/migration.sql`
- Modify: `.gitignore`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Add a schema parity test that fails before the models exist**

Create `apps/api/src/workstation-schema.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the schema test and confirm RED**

```powershell
pnpm --filter @walker/api exec vitest run src/workstation-schema.test.ts
```

Expected: FAIL because both schemas lack the new fields and models.

- [ ] **Step 3: Update both Prisma schemas**

Add these fields and relations to `Seed`:

```prisma
workflowStatus String   @default("INBOX")
whyNow         String?
```

Add this field and relation to `Execution`:

```prisma
contentBrief Json?
submission   Submission?
```

Add these models verbatim to both schema files:

```prisma
model Submission {
  id                   String   @id
  executionId          String   @unique
  idempotencyKey       String   @unique
  title                String
  status               String   @default("DRAFT_READY")
  manifestPath         String
  coreViewpoint        String
  protectedClaims      Json
  approvedArtifactHash String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  execution Execution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  @@index([status])
  @@index([createdAt])
}

model Action {
  id          String   @id
  title       String
  note        String?
  kind        String   @default("TASK")
  entityType  String?
  entityId    String?
  status      String   @default("OPEN")
  plannedDate String?
  completedAt DateTime?
  source      String   @default("HUMAN")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([status])
  @@index([plannedDate])
  @@index([entityType, entityId])
}
```

- [ ] **Step 4: Add the PostgreSQL deployment migration**

Create `apps/api/prisma/migrations/20260804000000_ai_workstation_slice1/migration.sql`:

```sql
ALTER TABLE "Seed"
ADD COLUMN "workflowStatus" TEXT NOT NULL DEFAULT 'INBOX',
ADD COLUMN "whyNow" TEXT;

ALTER TABLE "Execution"
ADD COLUMN "contentBrief" JSONB;

CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT_READY',
    "manifestPath" TEXT NOT NULL,
    "coreViewpoint" TEXT NOT NULL,
    "protectedClaims" JSONB NOT NULL,
    "approvedArtifactHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Submission_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'TASK',
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "plannedDate" TEXT,
    "completedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'HUMAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Submission_executionId_key" ON "Submission"("executionId");
CREATE UNIQUE INDEX "Submission_idempotencyKey_key" ON "Submission"("idempotencyKey");
CREATE INDEX "Submission_status_idx" ON "Submission"("status");
CREATE INDEX "Submission_createdAt_idx" ON "Submission"("createdAt");
CREATE INDEX "Action_status_idx" ON "Action"("status");
CREATE INDEX "Action_plannedDate_idx" ON "Action"("plannedDate");
CREATE INDEX "Action_entityType_entityId_idx" ON "Action"("entityType", "entityId");
```

- [ ] **Step 5: Document local artifact configuration and ignore generated data**

Append to `.gitignore`:

```gitignore
# AI content workstation local artifacts
var/works/
var/uploads/
```

Append to `apps/api/.env.example`:

```dotenv
# AI content workstation artifacts; defaults to <repo>/var/works
# WORK_ROOT_DIR=D:/path/to/AdgaiWalker/var/works

# Maximum bytes per original file; default 104857600 (100 MiB)
# WORK_MAX_UPLOAD_BYTES=104857600
```

- [ ] **Step 6: Generate Prisma types, update SQLite, and verify parity**

Run:

```powershell
pnpm db:generate
pnpm db:push
pnpm --filter @walker/api exec vitest run src/workstation-schema.test.ts
```

Expected: Prisma generation succeeds, local SQLite schema updates, and the parity test PASSes.

- [ ] **Step 7: Commit the data model**

```powershell
git add apps/api/prisma/schema.prisma apps/api/prisma/schema.postgresql.prisma apps/api/prisma/migrations/20260804000000_ai_workstation_slice1/migration.sql apps/api/src/workstation-schema.test.ts apps/api/.env.example .gitignore
git commit -m "feat(api): add workstation persistence model"
```

## Task 3: Make topic editing and selection idempotent

**Files:**
- Modify: `apps/api/src/ports/seed.repository.ts`
- Modify: `apps/api/src/ports/execution.repository.ts`
- Create: `apps/api/src/ports/action.repository.ts`
- Modify: `apps/api/src/adapters/prisma-seed.repository.ts`
- Modify: `apps/api/src/adapters/prisma-execution.repository.ts`
- Create: `apps/api/src/adapters/prisma-action.repository.ts`
- Modify: `apps/api/src/seed/seed.service.ts`
- Modify: `apps/api/src/seed/seed.controller.ts`
- Create: `apps/api/src/seed/seed.service.test.ts`
- Modify: `apps/api/src/kernel.module.ts`

- [ ] **Step 1: Write failing tests for human selection and status transitions**

Create `apps/api/src/seed/seed.service.test.ts` with in-memory repositories and these assertions:

```ts
import { describe, expect, it } from 'vitest';
import type { ContentBrief } from '@walker/shared';

const brief: ContentBrief = {
  audience: 'AI 初学者',
  scenario: '已经写完第一版教程',
  problem: '不知道怎样制作成品',
  keyQuestion: '如何减少初稿后的重复劳动',
  intendedAction: '上传自己的稿子',
};

describe('SeedService workstation behavior', () => {
  it('moves INBOX to CANDIDATE but rejects SELECTED without promote', async () => {
    const harness = createSeedHarness();
    const seed = await harness.service.create('初稿到成品');
    await expect(
      harness.service.updateTopic(seed.id, { workflowStatus: 'CANDIDATE' }),
    ).resolves.toMatchObject({ workflowStatus: 'CANDIDATE' });
    await expect(
      harness.service.updateTopic(seed.id, { workflowStatus: 'SELECTED' }),
    ).rejects.toSatisfy(hasApiMessage('selected-requires-human-promote'));
  });

  it('promote creates one execution and one draft action even when retried', async () => {
    const harness = createSeedHarness({ inPoolClue: true });
    const seed = await harness.service.create('初稿到成品');
    await harness.service.updateTopic(seed.id, { workflowStatus: 'CANDIDATE' });
    await harness.service.promote(seed.id, harness.clueId, { whyNow: '本周验证', brief });
    await harness.service.promote(seed.id, harness.clueId, { whyNow: '本周验证', brief });
    expect(harness.executions).toHaveLength(1);
    expect(harness.actions).toHaveLength(1);
    expect(harness.actions[0]).toMatchObject({
      kind: 'TASK',
      plannedDate: null,
      status: 'OPEN',
    });
  });
});
```

In the same test file, implement `createSeedHarness` with arrays backing every method in `SeedRepositoryPort`, `ClueRepositoryPort`, `ExecutionRepositoryPort`, `ActionRepositoryPort`, and `FeatureEventPort`. Implement `hasApiMessage` by reading `error.getResponse().message`. Do not mock `SeedService` internals.

- [ ] **Step 2: Run the test and confirm RED**

```powershell
pnpm --filter @walker/api exec vitest run src/seed/seed.service.test.ts
```

Expected: FAIL because topic status, content brief, action repository, and idempotent execution lookup do not exist.

- [ ] **Step 3: Extend repository contracts**

Add to `SeedRecord`:

```ts
workflowStatus: TopicStatus;
whyNow: string | null;
```

Add to `SeedRepositoryPort`:

```ts
updateTopic(
  id: string,
  input: { title?: string; workflowStatus?: TopicStatus; whyNow?: string | null },
): Promise<SeedRecord>;
```

Add `contentBrief: ContentBrief | null` to `ExecutionRecord`, change `create` to accept `contentBrief`, and add:

```ts
findBySeedId(seedId: string): Promise<ExecutionRecord | null>;
```

Implement the corresponding Prisma mapping and update methods. Cast Prisma JSON to `ContentBrief | null` only at the adapter boundary.

Create `apps/api/src/ports/action.repository.ts` before injecting it into `SeedService`:

```ts
export interface ActionRecord {
  id: string;
  title: string;
  note: string | null;
  kind: ActionKind;
  entityType: ActionEntityType | null;
  entityId: string | null;
  status: ActionStatus;
  plannedDate: string | null;
  completedAt: Date | null;
  source: ActionSource;
  createdAt: Date;
  updatedAt: Date;
}

export type NewActionRecord = Omit<
  ActionRecord,
  'createdAt' | 'updatedAt' | 'completedAt' | 'status'
>;

export interface ActionRepositoryPort {
  create(input: NewActionRecord): Promise<ActionRecord>;
  ensureOpenForEntity(input: NewActionRecord): Promise<ActionRecord>;
  findById(id: string): Promise<ActionRecord | null>;
  list(input: {
    status?: ActionStatus;
    kind?: ActionKind;
    limit: number;
  }): Promise<ActionRecord[]>;
  update(
    id: string,
    input: { title?: string; note?: string | null; plannedDate?: string | null },
  ): Promise<ActionRecord>;
  setCompletion(
    id: string,
    input: { status: ActionStatus; completedAt: Date | null },
  ): Promise<ActionRecord>;
}

export const ACTION_REPOSITORY = Symbol('ACTION_REPOSITORY');
```

Implement `PrismaActionRepository`, including `ensureOpenForEntity`, and register the repository provider in `KernelModule`. Task 4 adds the Action service and controller. This keeps the topic-selection commit bootable.

- [ ] **Step 4: Implement the topic service rules**

Add `updateTopic` to `SeedService`:

```ts
async updateTopic(
  seedId: string,
  input: { title?: string; workflowStatus?: TopicStatus; whyNow?: string | null },
) {
  if (!this.prisma.isWritable()) throw storageUnavailable();
  const seed = await this.seeds.findById(seedId);
  if (!seed) throw validationError('seed-not-found');
  if (input.workflowStatus === 'SELECTED') {
    throw validationError('selected-requires-human-promote');
  }
  if (input.workflowStatus) {
    assertTopicTransition(seed.workflowStatus, input.workflowStatus);
  }
  if (input.title !== undefined && !input.title.trim()) {
    throw validationError('title-required');
  }
  return this.seeds.updateTopic(seedId, {
    title: input.title?.trim(),
    workflowStatus: input.workflowStatus,
    whyNow: input.whyNow === undefined ? undefined : input.whyNow?.trim() || null,
  });
}
```

Extend `promote` so it receives `{ whyNow, brief }`, normalizes the brief, reuses `executions.findBySeedId(seedId)`, creates one execution when absent, updates the seed to `SELECTED`, and calls `actions.ensureOpenForEntity` with:

```ts
{
  id: newId(),
  title: `撰写初稿：${seed.title}`,
  note: normalizedBrief.keyQuestion,
  kind: 'TASK',
  entityType: 'EXECUTION',
  entityId: execution.id,
  plannedDate: null,
  source: 'SYSTEM',
}
```

Map `assertTopicTransition` and `normalizeContentBrief` errors to `validationError(error.message)` so API responses remain stable.

- [ ] **Step 5: Add controller endpoints without breaking existing callers**

Add:

```ts
@Patch(':id')
updateTopic(
  @Param('id') id: string,
  @Body() body: { title?: string; workflowStatus?: TopicStatus; whyNow?: string | null },
) {
  return this.seeds.updateTopic(id, body);
}
```

Extend the existing promote body with `whyNow` and five brief fields. Existing callers that only send `clueId` must receive `content-brief-incomplete`; update the Admin in Task 7 before the full suite is expected to pass. Do not silently synthesize an author brief.

- [ ] **Step 6: Run the focused API tests**

```powershell
pnpm --filter @walker/api exec vitest run src/seed/seed.service.test.ts
```

Expected: PASS with one execution and one no-date action after two identical promote calls.

- [ ] **Step 7: Commit topic lifecycle changes**

```powershell
git add apps/api/src/ports/seed.repository.ts apps/api/src/ports/execution.repository.ts apps/api/src/ports/action.repository.ts apps/api/src/adapters/prisma-seed.repository.ts apps/api/src/adapters/prisma-execution.repository.ts apps/api/src/adapters/prisma-action.repository.ts apps/api/src/seed/seed.service.ts apps/api/src/seed/seed.controller.ts apps/api/src/seed/seed.service.test.ts apps/api/src/kernel.module.ts
git commit -m "feat(api): add human-owned topic selection"
```

## Task 4: Add the flexible Action API

**Files:**
- Create: `apps/api/src/action/action.service.ts`
- Create: `apps/api/src/action/action.controller.ts`
- Create: `apps/api/src/action/action.service.test.ts`
- Modify: `apps/api/src/kernel.module.ts`

- [ ] **Step 1: Write failing service tests**

Create `apps/api/src/action/action.service.test.ts` and verify:

```ts
it('creates an undated video action', async () => {
  const { service } = createActionHarness();
  await expect(
    service.create({ title: '录制第一篇视频', kind: 'VIDEO', plannedDate: null }),
  ).resolves.toMatchObject({
    kind: 'VIDEO',
    status: 'OPEN',
    plannedDate: null,
    completedAt: null,
  });
});

it('sets, clears, completes, and reopens an action', async () => {
  const { service } = createActionHarness();
  const action = await service.create({ title: '录制第一篇视频', kind: 'VIDEO' });
  await expect(service.update(action.id, { plannedDate: '2026-08-08' }))
    .resolves.toMatchObject({ plannedDate: '2026-08-08' });
  await expect(service.update(action.id, { plannedDate: null }))
    .resolves.toMatchObject({ plannedDate: null });
  await expect(service.complete(action.id)).resolves.toMatchObject({ status: 'DONE' });
  await expect(service.reopen(action.id)).resolves.toMatchObject({
    status: 'OPEN',
    completedAt: null,
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
pnpm --filter @walker/api exec vitest run src/action/action.service.test.ts
```

Expected: FAIL because the Action service does not exist.

- [ ] **Step 3: Implement the service and controller**

The service must:

- require a non-empty title;
- accept only `TASK` or `VIDEO`;
- normalize `plannedDate` with the shared rule;
- default `source` to `HUMAN`, `status` to `OPEN`, and `plannedDate` to `null`;
- reject update/complete/reopen when the action is missing;
- use `transitionAction` for reversible completion.

Expose:

```text
GET   /actions?status=OPEN&kind=VIDEO&limit=100
POST  /actions
PATCH /actions/:id
POST  /actions/:id/complete
POST  /actions/:id/reopen
```

Register `ActionService` and `ActionController` in `KernelModule`. Reuse the repository provider already registered in Task 3.

- [ ] **Step 4: Run Action, Seed, and type checks**

```powershell
pnpm --filter @walker/api exec vitest run src/action/action.service.test.ts src/seed/seed.service.test.ts
pnpm --filter @walker/api typecheck
```

Expected: focused tests PASS and API typecheck exits 0.

- [ ] **Step 5: Commit the Action API**

```powershell
git add apps/api/src/action/action.service.ts apps/api/src/action/action.controller.ts apps/api/src/action/action.service.test.ts apps/api/src/kernel.module.ts
git commit -m "feat(api): add flexible actions and video logs"
```

## Task 5: Add immutable originals and the Work API

**Files:**
- Create: `apps/api/src/ports/artifact.repository.ts`
- Create: `apps/api/src/ports/work.repository.ts`
- Create: `apps/api/src/adapters/fs-artifact.repository.ts`
- Create: `apps/api/src/adapters/fs-artifact.repository.test.ts`
- Create: `apps/api/src/adapters/prisma-work.repository.ts`
- Create: `apps/api/src/work/work.service.ts`
- Create: `apps/api/src/work/work.controller.ts`
- Create: `apps/api/src/work/work-upload.config.ts`
- Create: `apps/api/src/work/work.service.test.ts`
- Modify: `apps/api/src/config/config.port.ts`
- Modify: `apps/api/src/config/env-config.adapter.ts`
- Modify: `apps/api/src/kernel.module.ts`

- [ ] **Step 1: Define the filesystem Artifact contract**

Create `apps/api/src/ports/artifact.repository.ts`:

```ts
export interface OriginalFileInput {
  originalName: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
  role: 'draft' | 'attachment';
}

export interface OriginalFileRecord {
  name: string;
  mimeType: string;
  size: number;
  sha256: string;
  role: 'draft' | 'attachment';
}

export interface WorkManifest {
  workId: string;
  version: 1;
  originalCreatedAt: string;
  originalFiles: OriginalFileRecord[];
}

export interface ArtifactRepositoryPort {
  createOriginal(workId: string, files: OriginalFileInput[]): Promise<WorkManifest>;
  readManifest(workId: string): Promise<WorkManifest | null>;
  discardWork(workId: string): Promise<void>;
}

export const ARTIFACT_REPOSITORY = Symbol('ARTIFACT_REPOSITORY');
```

- [ ] **Step 2: Write failing filesystem tests**

Create `apps/api/src/adapters/fs-artifact.repository.test.ts` with a temporary root and verify:

```ts
it('writes immutable originals and hashes every file', async () => {
  const repo = new FsArtifactRepository(tempRoot);
  const manifest = await repo.createOriginal('work-1', [
    {
      originalName: 'draft.md',
      mimeType: 'text/markdown',
      size: 12,
      bytes: new TextEncoder().encode('# 第一稿\n正文'),
      role: 'draft',
    },
  ]);
  expect(manifest.originalFiles[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  await expect(
    repo.createOriginal('work-1', [
      {
        originalName: 'draft.md',
        mimeType: 'text/markdown',
        size: 3,
        bytes: new TextEncoder().encode('改写'),
        role: 'draft',
      },
    ]),
  ).rejects.toThrow('original-already-exists');
});

it('sanitizes file names without allowing traversal', async () => {
  const repo = new FsArtifactRepository(tempRoot);
  const manifest = await repo.createOriginal('work-2', [
    {
      originalName: '../private.txt',
      mimeType: 'text/plain',
      size: 4,
      bytes: new TextEncoder().encode('safe'),
      role: 'draft',
    },
  ]);
  expect(manifest.originalFiles[0].name).toBe('private.txt');
});
```

- [ ] **Step 3: Run the filesystem test and confirm RED**

```powershell
pnpm --filter @walker/api exec vitest run src/adapters/fs-artifact.repository.test.ts
```

Expected: FAIL because `FsArtifactRepository` does not exist.

- [ ] **Step 4: Implement atomic, immutable original storage**

`FsArtifactRepository` must:

- receive an explicit root in tests and use `AppConfigPort.getWorkRootDir()` in production;
- accept work IDs matching `/^[a-zA-Z0-9_-]+$/`;
- normalize each filename with `path.basename`, replace control characters, and de-duplicate with `-2`, `-3` suffixes;
- create `original` with `{ recursive: false }` after creating only the work parent;
- write files with `{ flag: 'wx' }`;
- calculate SHA-256 from the bytes actually written;
- write `manifest.json.tmp` and rename it to `manifest.json` atomically;
- remove the incomplete work directory when any write fails;
- reject a second `createOriginal` with `original-already-exists`;
- never expose a recursive delete outside the configured work root.

Add these methods to `AppConfigPort` and `EnvConfigAdapter`:

```ts
getWorkRootDir(): string;
getWorkMaxUploadBytes(): number;
```

The default root is `path.resolve(process.cwd(), '../../var/works')` when the API runs from `apps/api`; resolve and validate the absolute path once in the adapter constructor.

- [ ] **Step 5: Define and implement the Work repository**

Create `apps/api/src/ports/work.repository.ts` with:

```ts
export interface WorkRecord {
  id: string;
  executionId: string;
  idempotencyKey: string;
  title: string;
  status: WorkStatus;
  manifestPath: string;
  coreViewpoint: string;
  protectedClaims: string[];
  approvedArtifactHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkRepositoryPort {
  findById(id: string): Promise<WorkRecord | null>;
  findByIdempotencyKey(key: string): Promise<WorkRecord | null>;
  list(limit: number): Promise<WorkRecord[]>;
  createForExecution(input: NewWorkRecord): Promise<WorkRecord>;
  createFromDraft(input: NewManualWorkRecord): Promise<WorkRecord>;
}

export const WORK_REPOSITORY = Symbol('WORK_REPOSITORY');
```

`PrismaWorkRepository.createFromDraft` must use one Prisma transaction to create:

1. `Clue` with source `manual-self` and pool status `in-pool`;
2. `Seed` with workflow status `SELECTED`, `whyNow`, and the draft title;
3. one primary `SeedClueLink`;
4. one `Execution` with the supplied content brief;
5. one `Submission` using the supplied IDs and manifest path;
`createForExecution` verifies that the execution exists and relies on unique `executionId` and `idempotencyKey` constraints for idempotency.

- [ ] **Step 6: Write failing Work service tests**

Create `apps/api/src/work/work.service.test.ts` and cover both entry paths:

```ts
it('creates a work for an existing execution and stores immutable originals', async () => {
  const harness = createWorkHarness({ executionExists: true });
  const result = await harness.service.create(
    {
      idempotencyKey: 'ui-1',
      executionId: harness.executionId,
      title: 'AI 初稿到成品',
      coreViewpoint: 'AI 应该帮助普通人完成真实作品。',
      protectedClaimsRaw: '["不制造焦虑"]',
    },
    oneDraft(),
    [],
  );
  expect(result.status).toBe('DRAFT_READY');
  expect(harness.manifests).toHaveLength(1);
});

it('creates the full truth chain for an existing manual draft', async () => {
  const harness = createWorkHarness();
  const result = await harness.service.create(
    {
      idempotencyKey: 'ui-2',
      title: 'AI 初稿到成品',
      sourceProblem: '初稿之后重复劳动太多',
      whyNow: '本周验证第一篇',
      contentBriefRaw: JSON.stringify(brief),
      coreViewpoint: 'AI 应该帮助普通人完成真实作品。',
      protectedClaimsRaw: '[]',
    },
    oneDraft(),
    [],
  );
  expect(result.executionId).toBeTruthy();
  expect(harness.manualChains).toHaveLength(1);
});

it('returns the existing work for a repeated idempotency key', async () => {
  const harness = createWorkHarness({ executionExists: true });
  const first = await createExistingExecutionWork(harness, 'same-key');
  const second = await createExistingExecutionWork(harness, 'same-key');
  expect(second.id).toBe(first.id);
  expect(harness.manifests).toHaveLength(1);
});
```

Implement the harness with in-memory implementations of `WorkRepositoryPort` and `ArtifactRepositoryPort`; do not mock WorkService methods.

- [ ] **Step 7: Implement WorkService and multipart controller**

Expose:

```text
GET  /works
GET  /works/:id
POST /works
```

`POST /works` uses `FileFieldsInterceptor` with one `draft` and at most 20 `attachments`. It accepts these text fields:

```ts
interface CreateWorkForm {
  idempotencyKey: string;
  executionId?: string;
  title: string;
  sourceProblem?: string;
  whyNow?: string;
  contentBrief?: string;
  coreViewpoint: string;
  protectedClaims: string;
}
```

Create `apps/api/src/work/work-upload.config.ts` so the interceptor has one explicit configuration source:

```ts
import { DEFAULT_MAX_UPLOAD_BYTES, MAX_ORIGINAL_FILES } from '@walker/shared';

const configured = Number(
  process.env.WORK_MAX_UPLOAD_BYTES ?? DEFAULT_MAX_UPLOAD_BYTES,
);

export const WORK_UPLOAD_OPTIONS = {
  limits: {
    fileSize:
      Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_MAX_UPLOAD_BYTES,
    files: MAX_ORIGINAL_FILES,
  },
};
```

Use default Multer memory storage for Slice 1 with `WORK_UPLOAD_OPTIONS`. Map each Multer file to `OriginalFileInput`. Return HTTP 400 for missing draft, malformed brief, malformed protected claims, unsupported entry shape, and empty viewpoint. Return the existing work for a repeated idempotency key before writing files.

If filesystem creation succeeds but database creation fails, call `artifactRepository.discardWork(workId)` before rethrowing. If database creation succeeds but the response is interrupted, the idempotency key returns the existing work on retry.

- [ ] **Step 8: Run focused tests and API typecheck**

```powershell
pnpm --filter @walker/api exec vitest run src/adapters/fs-artifact.repository.test.ts src/work/work.service.test.ts
pnpm --filter @walker/api typecheck
```

Expected: filesystem and Work tests PASS; API typecheck exits 0.

- [ ] **Step 9: Commit the Work API**

```powershell
git add apps/api/src/ports/artifact.repository.ts apps/api/src/ports/work.repository.ts apps/api/src/adapters/fs-artifact.repository.ts apps/api/src/adapters/fs-artifact.repository.test.ts apps/api/src/adapters/prisma-work.repository.ts apps/api/src/work/work.service.ts apps/api/src/work/work.controller.ts apps/api/src/work/work-upload.config.ts apps/api/src/work/work.service.test.ts apps/api/src/config/config.port.ts apps/api/src/config/env-config.adapter.ts apps/api/src/kernel.module.ts
git commit -m "feat(api): add immutable work originals"
```

## Task 6: Add the aggregate Workbench API

**Files:**
- Create: `apps/api/src/workbench/workbench.service.ts`
- Create: `apps/api/src/workbench/workbench.controller.ts`
- Create: `apps/api/src/workbench/workbench.service.test.ts`
- Modify: `apps/api/src/kernel.module.ts`

- [ ] **Step 1: Write a failing aggregate test**

Create `apps/api/src/workbench/workbench.service.test.ts`:

```ts
it('returns topics, open actions, video history, and active works without copying truth', async () => {
  const service = createWorkbenchHarness({
    topics: [topic('seed-1', 'CANDIDATE')],
    actions: [action('action-1', 'OPEN', 'TASK'), action('video-1', 'DONE', 'VIDEO')],
    works: [work('work-1', 'DRAFT_READY')],
  });
  await expect(service.get()).resolves.toMatchObject({
    topics: [{ id: 'seed-1', workflowStatus: 'CANDIDATE' }],
    openActions: [{ id: 'action-1' }],
    videoLog: [{ id: 'video-1', kind: 'VIDEO', status: 'DONE' }],
    activeWorks: [{ id: 'work-1', status: 'DRAFT_READY' }],
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
pnpm --filter @walker/api exec vitest run src/workbench/workbench.service.test.ts
```

Expected: FAIL because the aggregate service does not exist.

- [ ] **Step 3: Implement the read-only aggregate**

`WorkbenchService.get()` calls existing repository list methods in parallel and returns:

```ts
export interface WorkbenchSnapshot {
  topics: SeedRecord[];
  openActions: ActionRecord[];
  videoLog: ActionRecord[];
  activeWorks: WorkRecord[];
  generatedAt: string;
}
```

It owns no database table and writes no duplicated state. `GET /workbench` returns the snapshot. Register service and controller in `KernelModule`.

- [ ] **Step 4: Run the focused and API suites**

```powershell
pnpm --filter @walker/api exec vitest run src/workbench/workbench.service.test.ts
pnpm test:api
```

Expected: all API tests PASS. If the existing kernel integration test calls the old promote shape, update that test to supply the explicit content brief rather than weakening the new requirement.

- [ ] **Step 5: Commit the aggregate API**

```powershell
git add apps/api/src/workbench/workbench.service.ts apps/api/src/workbench/workbench.controller.ts apps/api/src/workbench/workbench.service.test.ts apps/api/src/kernel.module.ts apps/api/src/kernel.integration.test.ts
git commit -m "feat(api): add workstation workbench snapshot"
```

## Task 7: Add Admin test infrastructure and workstation transport

**Files:**
- Modify: `apps/admin/package.json`
- Modify: `apps/admin/vitest.config.ts`
- Create: `apps/admin/src/test/setup.ts`
- Modify: `apps/admin/src/api/admin-api.ts`
- Create: `apps/admin/src/api/admin-api.test.ts`

- [ ] **Step 1: Add the existing workspace test dependencies to Admin**

Run:

```powershell
pnpm --filter @walker/admin add -D @testing-library/jest-dom@^7.0.0 @testing-library/react@^16.3.2 @testing-library/user-event@^14.6.1 jsdom@^26.1.0
```

Expected: `apps/admin/package.json` and `pnpm-lock.yaml` update without adding a second testing framework.

- [ ] **Step 2: Configure jsdom and cleanup**

Replace `apps/admin/vitest.config.ts` test configuration with:

```ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

Create `apps/admin/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

- [ ] **Step 3: Write a failing multipart transport test**

Create `apps/admin/src/api/admin-api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from './admin-api';

afterEach(() => vi.unstubAllGlobals());

describe('adminApi workstation transport', () => {
  it('sends the Work FormData without a forced JSON content type', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.body).toBeInstanceOf(FormData);
      expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
      return new Response(
        JSON.stringify({
          id: 'work-1',
          executionId: 'execution-1',
          title: '第一篇作品',
          status: 'DRAFT_READY',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    form.set('title', '第一篇作品');
    await expect(adminApi.createWork(form)).resolves.toMatchObject({
      id: 'work-1',
      status: 'DRAFT_READY',
    });
  });
});
```

- [ ] **Step 4: Run the transport test and confirm RED**

```powershell
pnpm --filter @walker/admin exec vitest run src/api/admin-api.test.ts
```

Expected: FAIL because `adminApi.createWork` does not exist.

- [ ] **Step 5: Add Admin DTOs and API methods**

Extend `admin-api.ts` with shared-contract-compatible DTOs for `Action`, `Work`, `WorkManifest`, and `WorkbenchSnapshot`, then add:

```ts
workbench: () => adminRequest<WorkbenchSnapshot>('/workbench'),
actions: (query = '') => adminRequest<Action[]>(`/actions${query}`),
createAction: (input: CreateActionInput) =>
  adminRequest<Action>('/actions', { method: 'POST', body: JSON.stringify(input) }),
updateAction: (id: string, input: UpdateActionInput) =>
  adminRequest<Action>(`/actions/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
completeAction: (id: string) =>
  adminRequest<Action>(`/actions/${id}/complete`, { method: 'POST' }),
reopenAction: (id: string) =>
  adminRequest<Action>(`/actions/${id}/reopen`, { method: 'POST' }),
updateTopic: (id: string, input: UpdateTopicInput) =>
  adminRequest<Seed>(`/seeds/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
works: () => adminRequest<Work[]>('/works'),
work: (id: string) => adminRequest<WorkDetail>(`/works/${id}`),
createWork: (form: FormData) =>
  adminRequest<Work>('/works', { method: 'POST', body: form }),
```

Extend `promote` to send `whyNow` and `ContentBrief` fields explicitly.

- [ ] **Step 6: Run Admin tests and typecheck**

```powershell
pnpm --filter @walker/admin typecheck
pnpm --filter @walker/admin test
```

Expected: the transport test PASSes and Admin typecheck exits 0.

- [ ] **Step 7: Commit Admin infrastructure**

```powershell
git add apps/admin/package.json pnpm-lock.yaml apps/admin/vitest.config.ts apps/admin/src/test/setup.ts apps/admin/src/api/admin-api.ts apps/admin/src/api/admin-api.test.ts
git commit -m "test(admin): add workstation transport harness"
```

## Task 8: Build the Workbench topic, action, and video views

**Files:**
- Create: `apps/admin/src/pages/WorkbenchPage.test.tsx`
- Create: `apps/admin/src/pages/WorkbenchPage.tsx`
- Modify: `apps/admin/src/shared/routes.ts`
- Modify: `apps/admin/src/shared/nav.ts`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/styles.css`

- [ ] **Step 1: Write failing interaction tests**

Mock `adminApi.workbench`, `adminApi.updateTopic`, `adminApi.promote`, `adminApi.createAction`, `adminApi.updateAction`, `adminApi.completeAction`, and `adminApi.reopenAction`. Verify these behaviors:

```ts
it('shows topic states and only selects after an explicit brief submit', async () => {
  render(<WorkbenchPage />);
  expect(await screen.findByText('初稿到成品')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '主选' }));
  expect(screen.getByLabelText('目标用户')).toBeRequired();
  expect(adminApi.promote).not.toHaveBeenCalled();
});

it('creates an undated video action and can complete then reopen it', async () => {
  render(<WorkbenchPage />);
  await userEvent.type(await screen.findByLabelText('行动标题'), '录制第一篇视频');
  await userEvent.selectOptions(screen.getByLabelText('行动类型'), 'VIDEO');
  await userEvent.click(screen.getByRole('button', { name: '添加行动' }));
  expect(adminApi.createAction).toHaveBeenCalledWith(
    expect.objectContaining({ title: '录制第一篇视频', kind: 'VIDEO', plannedDate: null }),
  );
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
pnpm --filter @walker/admin exec vitest run src/pages/WorkbenchPage.test.tsx
```

Expected: FAIL because `WorkbenchPage` does not exist.

- [ ] **Step 3: Implement WorkbenchPage**

The page contains four real sections backed by `GET /workbench`:

1. **选题** — tabs for inbox, candidate, selected, archived; inline title/why-now edit; move to candidate/archive; explicit selection form with five content-brief fields.
2. **行动收件箱** — all open actions, including undated actions; optional date input; complete control.
3. **视频记录** — `VIDEO` actions grouped into planned/open and completed, displaying `plannedDate` and `completedAt`.
4. **进行中的作品** — links to `/works/:id`.

On mutation success, reload the aggregate. On failure, keep the user's form values and show the error beside the action that failed. Date clearing sends `plannedDate: null`. Completion immediately disables only the affected control until the request settles.

Add CSS classes for status chips, a responsive two-column workbench grid, form rows, action checkboxes, and the video log. Reuse existing color, spacing, button, input, panel, error, and reduced-motion rules.

- [ ] **Step 4: Make Workbench the primary route**

Add `workbench: '/'` to `ADMIN_ROUTES`, render `WorkbenchPage` at that path, and keep every old route reachable by direct URL. Change primary navigation to one real item:

```ts
export const adminNavGroups: AdminNavGroup[] = [
  {
    title: '工作',
    items: [
      {
        path: ADMIN_ROUTES.workbench,
        label: '工作台',
        icon: LayoutDashboard,
        end: true,
      },
    ],
  },
];
```

Do not import `WorksPage` or `WorkDetailPage` before Task 9 creates them.

- [ ] **Step 5: Run interaction tests, typecheck, and build**

```powershell
pnpm --filter @walker/admin exec vitest run src/pages/WorkbenchPage.test.tsx
pnpm --filter @walker/admin typecheck
pnpm build:admin
```

Expected: Workbench tests PASS; Admin typecheck and build exit 0.

- [ ] **Step 6: Commit the Workbench**

```powershell
git add apps/admin/src/pages/WorkbenchPage.tsx apps/admin/src/pages/WorkbenchPage.test.tsx apps/admin/src/shared/routes.ts apps/admin/src/shared/nav.ts apps/admin/src/App.tsx apps/admin/src/styles.css
git commit -m "feat(admin): add topic and action workbench"
```

## Task 9: Build work creation and the immutable-original timeline

**Files:**
- Create: `apps/admin/src/pages/WorksPage.test.tsx`
- Create: `apps/admin/src/pages/WorksPage.tsx`
- Create: `apps/admin/src/pages/WorkDetailPage.tsx`
- Modify: `apps/admin/src/shared/routes.ts`
- Modify: `apps/admin/src/shared/nav.ts`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/styles.css`

- [ ] **Step 1: Write failing work creation tests**

Cover both entry modes and FormData content:

```ts
it('creates a work from an existing execution', async () => {
  render(<WorksPage />);
  await userEvent.selectOptions(await screen.findByLabelText('作品入口'), 'execution');
  await userEvent.selectOptions(screen.getByLabelText('已主选项目'), 'execution-1');
  await fillRequiredWorkFields();
  const draft = new File(['第一版正文'], 'draft.md', { type: 'text/markdown' });
  await userEvent.upload(screen.getByLabelText('初稿文件'), draft);
  await userEvent.click(screen.getByRole('button', { name: '创建作品' }));
  const form = vi.mocked(adminApi.createWork).mock.calls[0][0];
  expect(form.get('executionId')).toBe('execution-1');
  expect((form.get('draft') as File).name).toBe('draft.md');
});

it('requires a source problem and content brief for a manual draft', async () => {
  render(<WorksPage />);
  await userEvent.selectOptions(await screen.findByLabelText('作品入口'), 'draft');
  await userEvent.click(screen.getByRole('button', { name: '创建作品' }));
  expect(screen.getByText('请补全来源问题和内容任务书')).toBeInTheDocument();
  expect(adminApi.createWork).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
pnpm --filter @walker/admin exec vitest run src/pages/WorksPage.test.tsx
```

Expected: FAIL because `WorksPage` does not exist.

- [ ] **Step 3: Implement WorksPage**

The page must:

- list current works with title, status, updated time, and link;
- switch between “已有主选项目” and “我已有初稿” entry modes;
- collect title, core viewpoint, protected claims, exactly one draft, and optional attachments;
- collect source problem, why-now, and all five brief fields only for manual draft mode;
- generate one UUID idempotency key when the form first becomes dirty and retain it across retries;
- build FormData using the exact API field names from Task 5;
- preserve selected files and text after a failed request;
- navigate to `/works/:id` after success.

The protected-claims UI uses one line per claim and serializes a JSON string array. Reject more than 20 attachments client-side and display the configured 100 MiB per-file limit.

- [ ] **Step 4: Implement WorkDetailPage**

The page reads `GET /works/:id` and shows a single timeline with:

- selected topic and Execution link metadata;
- core viewpoint and protected claims;
- immutable original files with filename, role, size, MIME type, and SHA-256;
- the current `DRAFT_READY` status;
- an explicit statement that processing has not started yet;
- created and updated timestamps.

Do not add a fake “Start AI” button in Slice 1. Slice 2 adds the processing command only after the Agent Runner exists.

- [ ] **Step 5: Register real work routes and the final Slice 1 navigation**

Add `works: '/works'` and `workDetail: '/works/:id'` to `ADMIN_ROUTES`, then register `WorksPage` and `WorkDetailPage` in `App.tsx`. Keep legacy pages reachable by direct URL but use only these primary navigation items:

```ts
export const adminNavGroups: AdminNavGroup[] = [
  {
    title: '工作',
    items: [
      { path: ADMIN_ROUTES.workbench, label: '工作台', icon: LayoutDashboard, end: true },
      { path: ADMIN_ROUTES.works, label: '作品', icon: FileText },
    ],
  },
];
```

Do not add Review or Publish empty pages in this slice.

- [ ] **Step 6: Run page tests, all Admin tests, and build**

```powershell
pnpm --filter @walker/admin exec vitest run src/pages/WorksPage.test.tsx
pnpm --filter @walker/admin test
pnpm build:admin
```

Expected: all Admin tests PASS and production build exits 0.

- [ ] **Step 7: Commit the work surfaces**

```powershell
git add apps/admin/src/pages/WorksPage.tsx apps/admin/src/pages/WorksPage.test.tsx apps/admin/src/pages/WorkDetailPage.tsx apps/admin/src/shared/routes.ts apps/admin/src/shared/nav.ts apps/admin/src/App.tsx apps/admin/src/styles.css
git commit -m "feat(admin): add work creation and original timeline"
```

## Task 10: Add the real Slice 1 acceptance path and run the full gate

**Files:**
- Create: `scripts/accept-ai-workstation-slice1.ts`
- Modify: `package.json`
- Modify: `docs/PRD-AI-CONTENT-WORKSTATION.md` only if implementation evidence reveals an actual contradiction

- [ ] **Step 1: Write the acceptance script**

Create `scripts/accept-ai-workstation-slice1.ts`. Use the existing helpers in `scripts/lib/accept-http.ts` and perform this real HTTP path against the local API:

```text
POST /clues                      create a manual problem
PATCH /clues/:id/pool            move it into the pool
POST /seeds                      create the topic
PATCH /seeds/:id                 move it to CANDIDATE and set whyNow
POST /seeds/:id/promote          submit the five-field brief and select it
GET /actions                     assert one OPEN undated draft action
POST /actions                    create one undated VIDEO action
PATCH /actions/:id               set and clear plannedDate
POST /actions/:id/complete       assert completedAt exists
POST /actions/:id/reopen         assert completedAt is null
POST /works                      upload one real Markdown draft and one text attachment
POST /works with same key        assert the same work id returns
GET /works/:id                   assert viewpoint, protected claims, hashes, and DRAFT_READY
GET /workbench                   assert selected topic, actions, video log, and active work
```

The script creates its Markdown and attachment as in-memory `Blob` objects, never writes fixtures into `content/log`, and prints a JSON report containing created IDs and each assertion result. It exits non-zero on the first failed assertion.

- [ ] **Step 2: Add the root command**

Add to root `package.json`:

```json
"accept:ai-workstation:slice1": "tsx scripts/accept-ai-workstation-slice1.ts"
```

- [ ] **Step 3: Start the API and run acceptance**

In terminal 1:

```powershell
pnpm dev:api
```

In terminal 2:

```powershell
pnpm accept:ai-workstation:slice1
```

Expected: the script prints `"ok": true`, one work ID, one selected seed ID, one execution ID, and one video action ID.

- [ ] **Step 4: Run the complete verification gate**

```powershell
pnpm test:shared
pnpm test:api
pnpm --filter @walker/admin test
pnpm typecheck
pnpm build:api
pnpm build:admin
pnpm accept:ai-workstation:slice1
git diff --check
git status --short
```

Expected:

- every test command reports zero failures;
- typecheck and both builds exit 0;
- Slice 1 acceptance reports `ok: true`;
- `git diff --check` reports no whitespace errors;
- `apps/web/src/generated/content.json` remains an unrelated user modification and is not staged by this work.

- [ ] **Step 5: Perform one manual Admin walkthrough**

Open the Admin and verify with keyboard-only interaction:

1. create a topic and move it to candidate;
2. open the selection form and submit a complete brief;
3. create an undated video action, set a date, clear it, complete it, and reopen it;
4. create a work from the selected Execution with one draft and one attachment;
5. open the work timeline and compare displayed SHA-256 values with the API response;
6. refresh the browser and verify the same topic, actions, and work remain;
7. enlarge browser text to 200% and confirm the primary controls remain usable;
8. enable reduced motion and confirm no information depends on animation.

- [ ] **Step 6: Commit Slice 1 acceptance**

```powershell
git add scripts/accept-ai-workstation-slice1.ts package.json
git commit -m "test: add AI workstation Slice 1 acceptance"
```

## Slice 1 exit criteria

Do not write the Slice 2 implementation plan until all of these are evidenced:

- `TOP-01`, `TOP-02`, `ACT-01`, `WORK-01`, and `WORK-02` each map to a passing automated or manual acceptance check.
- A real author draft, not a generated fixture, has been uploaded through the Admin once.
- The original draft and attachment hashes remain identical after refresh and API restart.
- Topic selection retry creates one Execution and one draft Action.
- Repeating work creation with the same idempotency key returns one Submission.
- An undated Action is visible and is never labeled overdue.
- A `VIDEO` Action records planned date separately from actual completion time.
- No future Review, Publish, Tool Center, MCP, or Recipe UI has been added.
- The user's existing `apps/web/src/generated/content.json` modification is untouched.

Once these criteria pass, create the separate Slice 2 plan for `PROD-01` through `REV-02` using the real Work API and Artifact contract delivered here.
