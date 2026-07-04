/**
 * Support Media Storage — 赞赏码图片公开存储
 *
 * 赞赏码是公开展示给 /support 访客的小图,与 appearance 的 owner-only 私有背景媒体职责分离。
 * 存到 public/uploads/support/,Astro 静态服务,访客直接公开可读。
 * 不接 Vercel Blob(赞赏码是小图,本地 public 足够,无需 BLOB token)。
 *
 * 与 admin-media-storage 的区别:
 * - appearance 媒体:owner 可见,走 /api/admin/appearance/media 受保护读取
 * - support 媒体:公开可读,直接 /uploads/support/... 静态 URL
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SUPPORT_ROOT = path.resolve(process.cwd(), 'public', 'uploads', 'support');
const SUPPORT_PUBLIC_BASE = '/uploads/support';

/** 赞赏码图片格式白名单(png/jpeg/webp/gif,够用且通用) */
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/** 赞赏码不需要大文件,5MB 上限(远大于普通赞赏码尺寸) */
export const SUPPORT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

/** mime → 扩展名映射(避免信任客户端 filename 扩展) */
const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export interface SavedSupportMedia {
  /** 公开可读 URL,直接用于 <img src> */
  publicUrl: string;
  /** 存储相对路径(相对 SUPPORT_ROOT) */
  storageKey: string;
}

/**
 * 保存赞赏码图片到 public/uploads/support/。
 * 文件名用 UUID,扩展名由 mimeType 决定(不信客户端 filename)。
 */
export async function saveSupportMedia(mimeType: string, bytes: Uint8Array): Promise<SavedSupportMedia> {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new SupportMediaError('unsupported-media', `不支持的图片类型:${mimeType}。支持 png/jpeg/webp/gif。`, 415);
  }
  if (bytes.byteLength > SUPPORT_MEDIA_MAX_BYTES) {
    throw new SupportMediaError('too-large', `图片过大(${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB),上限 5MB。`, 413);
  }

  const ext = MIME_TO_EXT[mimeType] ?? '';
  const storageKey = `${randomUUID()}${ext}`;
  const target = path.resolve(SUPPORT_ROOT, storageKey);

  // 路径越界守卫:确保 target 在 SUPPORT_ROOT 内
  const root = path.resolve(SUPPORT_ROOT);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new SupportMediaError('invalid-path', '存储路径异常。', 400);
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);

  return {
    publicUrl: `${SUPPORT_PUBLIC_BASE}/${storageKey}`,
    storageKey,
  };
}

/** 业务错误,带 code + http status,API 层据此映射响应码 */
export class SupportMediaError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SupportMediaError';
    this.code = code;
    this.status = status;
  }
}
