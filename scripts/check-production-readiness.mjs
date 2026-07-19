#!/usr/bin/env node
/**
 * S0 / UX1 生产验证前置检查
 *
 * 只检查必需环境变量是否存在，不输出任何密钥值。
 * 通过后仍必须运行：
 *   npm run verify:production-storage
 *   npm run verify:production-media-storage
 */
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const redisGroups = [
  ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
];

const blobKeys = ['BLOB_READ_WRITE_TOKEN'];

function present(key) {
  return typeof process.env[key] === 'string' && process.env[key].trim().length > 0;
}

function groupReady(group) {
  return group.every(present);
}

const redisReadyGroup = redisGroups.find(groupReady);
const missingRedisGroups = redisGroups.map(group => group.filter(key => !present(key)));
const missingBlob = blobKeys.filter(key => !present(key));

const result = {
  ok: Boolean(redisReadyGroup) && missingBlob.length === 0,
  redis: redisReadyGroup
    ? { ok: true, provider: redisReadyGroup[0].startsWith('UPSTASH') ? 'upstash' : 'vercel-kv-compatible' }
    : { ok: false, acceptedGroups: redisGroups, missingByGroup: missingRedisGroups },
  blob: missingBlob.length === 0
    ? { ok: true, provider: 'vercel-blob' }
    : { ok: false, missing: missingBlob },
  next: [
    'npm run verify:production-storage',
    'npm run verify:production-media-storage',
  ],
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
