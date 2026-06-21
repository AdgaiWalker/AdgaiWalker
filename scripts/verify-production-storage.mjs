#!/usr/bin/env node
/**
 * S0-03 / S0-04 生产等价存储验证
 *
 * 用法：
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... node scripts/verify-production-storage.mjs
 * 或：
 *   KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/verify-production-storage.mjs
 *
 * 这个脚本必须在真实 Redis/Upstash 凭据存在时才通过；缺凭据直接失败，避免用本地内存冒充生产等价验证。
 */
import { Redis } from '@upstash/redis';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

if (!url || !token) {
  console.error('S0 storage verification failed: missing UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN or KV_REST_API_URL/KV_REST_API_TOKEN.');
  process.exit(1);
}

const redis = new Redis({ url, token });
const runId = `s0_${Date.now()}_${randomUUID().slice(0, 8)}`;
const workItemId = `wi_${runId}`;
const feedbackId = `cf_${runId}`;
// 注意：键名必须与 src/conversation/store.ts 中生产代码定义完全一致。
// WorkItem 走 `match:workitem*` / `match:workitems*` 前缀（store.ts:944-949）。
// ContentFeedback 走 `content-feedback:*` 前缀，无 `match:`（store.ts:1111-1120）。
// 早期版本误用 `match:content-feedback:*` 与 `by-content:` 段，会让脚本写到 app 永远不读的命名空间，
// 即使有真实 Redis 凭据也只是自写自读"假通过"，违背脚本"防本地内存冒充生产等价"的初衷。
const workItemKey = `match:workitem:${workItemId}`;
const feedbackKey = `content-feedback:event:${feedbackId}`;
const workItemsList = 'match:workitems';
const workItemsActiveList = 'match:workitems:active';
const feedbackRecent = 'content-feedback:recent';
const contentFeedbackByContent = `content-feedback:content:s0-production-check`;

const now = new Date().toISOString();

const workItem = {
  workItemId,
  queue: 'system-event',
  title: 'S0 生产等价存储验证',
  summary: '验证 Decision / Action / Outcome 可从 Redis 读回',
  status: 'resolved',
  priorityBand: 'now',
  priorityReasons: ['生产等价验证'],
  uncertainty: [],
  evidenceRefs: [{
    evidenceId: `ev_${runId}`,
    sourceType: 'incident',
    sourceId: runId,
    occurredAt: now,
    collectedAt: now,
    environment: 'production',
    visibility: 'owner',
    freshness: 'fresh',
    qualityStatus: 'verified-source',
    summary: 'S0 Redis 持久化验证事件',
  }],
  decision: {
    requestedDecision: '是否通过生产等价存储验证',
    outcome: 'accepted',
    reason: '真实 Redis 写入成功',
    decidedBy: 's0-storage-verifier',
    decidedAt: now,
  },
  actions: [{
    actionId: `wa_${runId}`,
    actionType: 'review-outcome',
    targetType: 'system-storage',
    status: 'completed',
    expectedOutcome: 'Redis 重读后仍能获得 Action 与 Outcome',
    createdAt: now,
    updatedAt: now,
  }],
  outcomes: [{
    outcomeId: `wo_${runId}`,
    actionId: `wa_${runId}`,
    result: 'successful',
    summary: 'Redis 写入后可读回',
    evidenceRefs: [],
    observedAt: now,
  }],
  history: [{
    historyId: `wh_${runId}`,
    occurredAt: now,
    fromStatus: null,
    toStatus: 'resolved',
    actor: 's0-storage-verifier',
    reason: '生产等价验证写入',
    kind: 'outcome-recorded',
  }],
  createdAt: now,
  updatedAt: now,
};

const feedback = {
  feedbackId,
  contentId: 's0-production-check',
  contentPath: '/posts/s0-production-check',
  sourceTopicId: 'topic_s0_production_check',
  signal: 'useful',
  note: 'S0 生产等价存储验证反馈',
  createdAt: now,
  environment: 'production',
  consentForAnalysis: true,
};

async function verifyCrossProcessRead() {
  const code = [
    "const workItemKey = process.argv[1];",
    "const feedbackKey = process.argv[2];",
    "const workItemId = process.argv[3];",
    "const feedbackId = process.argv[4];",
    "const workItemsList = process.argv[5];",
    "const feedbackRecent = process.argv[6];",
    "const workItemsActiveList = process.argv[7];",
    "const contentFeedbackByContent = process.argv[8];",
    "const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;",
    "const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;",
    "async function main() {",
    "  const { Redis } = await import('@upstash/redis');",
    "  if (!url || !token) process.exit(2);",
    "  const redis = new Redis({ url, token });",
    "  const workItem = await redis.get(workItemKey);",
    "  const feedback = await redis.get(feedbackKey);",
    "  if (!workItem || workItem.decision?.outcome !== 'accepted') process.exit(3);",
    "  if (workItem.actions?.[0]?.status !== 'completed') process.exit(4);",
    "  if (workItem.outcomes?.[0]?.result !== 'successful') process.exit(5);",
    "  if (!feedback || feedback.signal !== 'useful' || feedback.sourceTopicId !== 'topic_s0_production_check') process.exit(6);",
    "  const workItemIds = await redis.lrange(workItemsList, 0, 20);",
    "  if (!Array.isArray(workItemIds) || !workItemIds.includes(workItemId)) process.exit(7);",
    "  const feedbackIds = await redis.lrange(feedbackRecent, 0, 20);",
    "  if (!Array.isArray(feedbackIds) || !feedbackIds.includes(feedbackId)) process.exit(8);",
    "  const activeWorkItemIds = await redis.lrange(workItemsActiveList, 0, 20);",
    "  if (!Array.isArray(activeWorkItemIds) || !activeWorkItemIds.includes(workItemId)) process.exit(9);",
    "  const byContentIds = await redis.lrange(contentFeedbackByContent, 0, 20);",
    "  if (!Array.isArray(byContentIds) || !byContentIds.includes(feedbackId)) process.exit(10);",
    "}",
    "main().catch(() => process.exit(1));",
  ].join('\n');

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      '-e',
      code,
      workItemKey,
      feedbackKey,
      workItemId,
      feedbackId,
      workItemsList,
      feedbackRecent,
      workItemsActiveList,
      contentFeedbackByContent,
    ], {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
      env: { ...process.env },
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`Cross-process Redis read failed with exit code ${code}.`));
    });
  });
}

try {
  await redis.set(workItemKey, workItem);
  await redis.lpush(workItemsList, workItemId);
  await redis.lpush(workItemsActiveList, workItemId);
  await redis.set(feedbackKey, feedback);
  await redis.lpush(feedbackRecent, feedbackId);
  await redis.lpush(contentFeedbackByContent, feedbackId);

  const restoredWorkItem = await redis.get(workItemKey);
  const restoredFeedback = await redis.get(feedbackKey);

  if (!restoredWorkItem || restoredWorkItem.decision?.outcome !== 'accepted') {
    throw new Error('WorkItem decision not restored from Redis.');
  }
  if (restoredWorkItem.actions?.[0]?.status !== 'completed') {
    throw new Error('WorkItem action not restored from Redis.');
  }
  if (restoredWorkItem.outcomes?.[0]?.result !== 'successful') {
    throw new Error('WorkItem outcome not restored from Redis.');
  }
  if (!restoredFeedback || restoredFeedback.signal !== 'useful' || restoredFeedback.sourceTopicId !== 'topic_s0_production_check') {
    throw new Error('ContentFeedback not restored from Redis.');
  }

  await verifyCrossProcessRead();

  console.log(JSON.stringify({
    ok: true,
    runId,
    verified: [
      'workItem.decision',
      'workItem.action',
      'workItem.outcome',
      'contentFeedback',
      'redis.crossProcessRead',
      'redis.indexes.workitems',
      'redis.indexes.workitems-active',
      'redis.indexes.content-feedback-recent',
      'redis.indexes.content-feedback-by-content',
    ],
  }, null, 2));
} catch (error) {
  console.error('S0 storage verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await Promise.allSettled([
    redis.del(workItemKey),
    redis.lrem(workItemsList, 0, workItemId),
    redis.lrem(workItemsActiveList, 0, workItemId),
    redis.del(feedbackKey),
    redis.lrem(feedbackRecent, 0, feedbackId),
    redis.lrem(contentFeedbackByContent, 0, feedbackId),
  ]);
}
