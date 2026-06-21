/**
 * content-telemetry.ts —— 阅读深度遥测客户端 beacon（P3-A）
 *
 * 设计要点：
 * - 不新增滚动监听：progress 由 ContentShell.initReadingProgress 计算后调用 trackReadingProgress。
 * - 隐私最小化：readerToken 是 per-page-load 随机 UUID（sessionStorage，非跨会话、非身份派生）；
 *   尊重 navigator.doNotTrack === '1'（DNT 开启则完全不采集）。
 * - 极简页内 beacon（≤2/读，全部在页面生命周期内完成，无 beforeunload 跨页累积）：
 *   content_progress（≥50%，一次）+ content_complete（≥90%，一次）。
 *   completionRate = complete 读者 / progress 读者，支撑"哪篇读完率低 → 改进哪篇"。
 * - 失败静默（keepalive fetch + catch）：阅读体验绝不被遥测拖累。
 */

const PROGRESS_THRESHOLD = 0.5;
const COMPLETE_THRESHOLD = 0.9;
const READER_TOKEN_KEY = 'walker:reader-token';
const ENDPOINT = '/api/content-telemetry';

let readerToken: string | null = null;
let activeContentId: string | null = null;
let progressFired = false;
let completeFired = false;

function isTrackingDisabled(): boolean {
  return typeof navigator !== 'undefined' && navigator.doNotTrack === '1';
}

function generateToken(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  // 兜底：crypto.randomUUID 不可用时（极旧环境/受限上下文）用随机串，仍非身份派生
  return `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getReaderToken(): string {
  if (readerToken) return readerToken;
  try {
    const stored = sessionStorage.getItem(READER_TOKEN_KEY);
    if (stored) {
      readerToken = stored;
      return stored;
    }
    const generated = generateToken();
    sessionStorage.setItem(READER_TOKEN_KEY, generated);
    readerToken = generated;
    return generated;
  } catch {
    // sessionStorage 不可用（隐私模式/受限）→ 生成进程内 ephemeral token，仍能当次去重
    readerToken = generateToken();
    return readerToken;
  }
}

function postBeacon(payload: Record<string, unknown>): void {
  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // 静默失败：遥测不应影响阅读
    });
  } catch {
    // 忽略
  }
}

function emit(contentId: string, eventType: 'content_progress' | 'content_complete', progress: number): void {
  postBeacon({
    contentId,
    eventType,
    progress,
    readerToken: getReaderToken(),
    consentForAnalysis: true,
  });
}

/**
 * 由 ContentShell.initReadingProgress 在每次滚动重算后调用。
 * 在页面内一次性触发 progress(≥50%) 与 complete(≥90%)，无中间 beacon、无 beforeunload。
 */
export function trackReadingProgress(contentId: string, progress: number): void {
  if (!contentId || isTrackingDisabled()) return;
  if (activeContentId !== contentId) {
    activeContentId = contentId;
    progressFired = false;
    completeFired = false;
  }
  if (!progressFired && progress >= PROGRESS_THRESHOLD) {
    progressFired = true;
    emit(contentId, 'content_progress', Math.round(progress * 100) / 100);
  }
  if (!completeFired && progress >= COMPLETE_THRESHOLD) {
    completeFired = true;
    emit(contentId, 'content_complete', 1);
  }
}

/** 仅测试用：重置模块内触发状态（ContentShell 在 astro:page-load 重算时也调用）。 */
export function resetContentTelemetryState(): void {
  activeContentId = null;
  progressFired = false;
  completeFired = false;
}

/** 仅测试用：读取当前 readerToken（验证 sessionStorage 持久化）。 */
export function __getReaderTokenForTesting(): string | null {
  return readerToken;
}

/** 仅测试用：强制重置 readerToken 缓存，下次重新从 sessionStorage 读取/生成。 */
export function __resetReaderTokenForTesting(): void {
  readerToken = null;
}


