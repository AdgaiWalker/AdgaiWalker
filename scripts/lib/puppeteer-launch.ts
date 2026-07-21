/**
 * puppeteer-launch — 本机 Chrome for Testing / 系统 puppeteer 启动
 * 依赖：node:fs、node:path、createRequire
 * 被调用：accept-dual-entry、accept-deep（浏览器段）
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

export type BrowserLike = {
  newPage: () => Promise<PageLike>;
  close: () => Promise<void>;
};

/** 宽松页接口：仅约束验收脚本实际用到的方法，实现由 puppeteer 提供 */
export type PageLike = {
  goto: (url: string, opts?: Record<string, unknown>) => Promise<unknown>;
  type: (sel: string, text: string) => Promise<void>;
  click: (sel: string) => Promise<void>;
  focus: (sel: string) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluate: <T = unknown>(fn: (...args: any[]) => T | Promise<T>, ...args: unknown[]) => Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $eval: <T = unknown>(sel: string, fn: (el: any) => T) => Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $$eval: <T = unknown>(sel: string, fn: (els: any[]) => T) => Promise<T>;
  $: (sel: string) => Promise<{ click: () => Promise<void> } | null>;
  waitForFunction: (fn: () => boolean, opts?: Record<string, unknown>) => Promise<unknown>;
  waitForSelector: (sel: string, opts?: Record<string, unknown>) => Promise<unknown>;
  setViewport: (vp: Record<string, unknown>) => Promise<void>;
  reload: (opts?: Record<string, unknown>) => Promise<unknown>;
  on: (event: string, handler: (e: Error) => void) => void;
  createCDPSession: () => Promise<{ send: (method: string) => Promise<unknown> }>;
};

export async function launchBrowser(viewport?: {
  width: number;
  height: number;
}): Promise<BrowserLike> {
  const require = createRequire(
    path.join(process.env.HOME || '', '.local/node/lib/node_modules/devloop-mcp/package.json'),
  );
  const puppeteer = require('puppeteer') as {
    launch: (opts: Record<string, unknown>) => Promise<BrowserLike>;
  };
  const chrome =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    path.join(
      process.env.HOME || '',
      '.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    );

  return puppeteer.launch({
    headless: true,
    executablePath: fs.existsSync(chrome) ? chrome : undefined,
    args: [
      '--no-sandbox',
      ...(viewport ? [`--window-size=${viewport.width},${viewport.height}`] : []),
    ],
    defaultViewport: viewport ?? { width: 1280, height: 900 },
  });
}
