#!/usr/bin/env node
/**
 * UX1-07 生产等价媒体对象存储验证（Vercel Blob）
 *
 * 用法：
 *   BLOB_READ_WRITE_TOKEN=... node scripts/verify-production-media-storage.mjs
 *
 * 这个脚本必须在真实 Vercel Blob token 存在时才通过；缺 token 直接失败，
 * 避免用 Data URL、默认本地目录或 Vercel 函数文件系统冒充生产持久媒体存储。
 */
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { del, get, put } from '@vercel/blob';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
  console.error('UX1 media storage verification failed: missing BLOB_READ_WRITE_TOKEN.');
  process.exit(1);
}

const runId = `ux1_media_${Date.now()}_${randomUUID().slice(0, 8)}`;
const storageKey = `admin-media/__verify__/${runId}/probe.webp`;
const expectedBytes = Buffer.from([0x57, 0x41, 0x4c, 0x4b, 0x45, 0x52]);
const largeVideoKey = `admin-media/__verify__/${runId}/probe-large.mp4`;
const largeVideoBytes = Buffer.alloc(9 * 1024 * 1024, 0x57);

async function readBlobBytes(pathname) {
  const result = await get(pathname, { access: 'private', useCache: false, token });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error('Blob object could not be read.');
  }
  const reader = result.stream.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      length += value.byteLength;
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return Buffer.from(bytes);
}

async function verifyCrossProcessRead(pathname, expectedHex) {
  const code = [
    "const { get } = require('@vercel/blob');",
    "const pathname = process.argv[1];",
    "const expected = process.argv[2];",
    "const token = process.env.BLOB_READ_WRITE_TOKEN;",
    "async function main() {",
    "  const result = await get(pathname, { access: 'private', useCache: false, token });",
    "  if (!result || result.statusCode !== 200 || !result.stream) process.exit(2);",
    "  const reader = result.stream.getReader();",
    "  const chunks = []; let length = 0;",
    "  while (true) { const { done, value } = await reader.read(); if (done) break; if (value) { chunks.push(value); length += value.byteLength; } }",
    "  const bytes = new Uint8Array(length); let offset = 0;",
    "  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }",
    "  if (Buffer.from(bytes).toString('hex') !== expected) process.exit(3);",
    "}",
    "main().catch(() => process.exit(1));",
  ].join('\n');

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', code, pathname, expectedHex], {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
      env: { ...process.env, BLOB_READ_WRITE_TOKEN: token },
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`Cross-process Blob read failed with exit code ${code}.`));
    });
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

try {
  const saved = await put(storageKey, expectedBytes, {
    access: 'private',
    contentType: 'image/webp',
    multipart: false,
    token,
  });

  if (saved.pathname !== storageKey) {
    throw new Error(`Blob pathname mismatch: expected ${storageKey}, got ${saved.pathname}.`);
  }

  const restored = await readBlobBytes(storageKey);
  if (!restored.equals(expectedBytes)) {
    throw new Error('Blob bytes were not restored exactly from storage.');
  }

  await verifyCrossProcessRead(storageKey, expectedBytes.toString('hex'));

  const savedLargeVideo = await put(largeVideoKey, largeVideoBytes, {
    access: 'private',
    contentType: 'video/mp4',
    multipart: true,
    token,
  });
  if (savedLargeVideo.pathname !== largeVideoKey) {
    throw new Error(`Large video Blob pathname mismatch: expected ${largeVideoKey}, got ${savedLargeVideo.pathname}.`);
  }
  const restoredLargeVideo = await readBlobBytes(largeVideoKey);
  if (sha256(restoredLargeVideo) !== sha256(largeVideoBytes)) {
    throw new Error('Large video Blob bytes were not restored exactly from storage.');
  }

  await del(storageKey, { token });
  await del(largeVideoKey, { token });
  const afterDelete = await get(storageKey, { access: 'private', useCache: false, token });
  if (afterDelete) {
    throw new Error('Blob object still exists after deletion.');
  }
  const largeVideoAfterDelete = await get(largeVideoKey, { access: 'private', useCache: false, token });
  if (largeVideoAfterDelete) {
    throw new Error('Large video Blob object still exists after deletion.');
  }

  console.log(JSON.stringify({
    ok: true,
    runId,
    verified: ['blob.write', 'blob.read', 'blob.crossProcessRead', 'blob.largeVideoMultipart', 'blob.privateUrl', 'blob.delete', 'blob.readAfterDelete'],
    storageKey,
    largeVideoKey,
    url: saved.url,
  }, null, 2));
} catch (error) {
  console.error('UX1 media storage verification failed:', error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await Promise.allSettled([
    del(storageKey, { token }),
    del(largeVideoKey, { token }),
  ]);
}
