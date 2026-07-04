/**
 * Support Media Storage — 赞赏码图片公开存储
 *
 * 赞赏码是公开展示给 /support 访客的小图,与 appearance 的 owner-only 私有背景媒体职责分离。
 *
 * 双模式存储:
 * - dev/test:写入 public/uploads/support/(本地磁盘可写,Astro 静态服务)
 * - 生产:上传到 Vercel Blob(access: 'public',公开 URL,访客直接 <img src>)
 *   (Vercel 函数文件系统只读,public/ 目录不可写,必须用对象存储)
 *
 * 与 admin-media-storage 的区别:
 * - appearance 媒体:owner 可见,access: 'private',需受保护读取
 * - support 媒体:公开可读,access: 'public',直接静态 URL
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { put as blobPut, del as blobDel } from '@vercel/blob';

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
  /** Blob 存储路径(Blob 模式)或本地相对路径(本地模式),用于删除 */
  storageKey: string;
  /** 存储模式标识,决定删除逻辑 */
  storageBackend: 'local' | 'blob';
}

/** 判断当前运行环境 */
function currentEnvironment(): string {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) return process.env.NODE_ENV;
  return 'production';
}

/** 是否走 Vercel Blob(生产 + 有 token) */
function shouldUseBlob(): boolean {
  const env = currentEnvironment();
  const isDevLike = env === 'development' || env === 'test';
  if (isDevLike) return false;
  return Boolean(typeof process !== 'undefined' && process.env?.BLOB_READ_WRITE_TOKEN);
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

function validateImage(mimeType: string, bytes: Uint8Array): string {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new SupportMediaError('unsupported-media', `不支持的图片类型:${mimeType}。支持 png/jpeg/webp/gif。`, 415);
  }
  if (bytes.byteLength > SUPPORT_MEDIA_MAX_BYTES) {
    throw new SupportMediaError('too-large', `图片过大(${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB),上限 5MB。`, 413);
  }
  return MIME_TO_EXT[mimeType] ?? '';
}

/**
 * 路径越界守卫:确保解析后的路径在 SUPPORT_ROOT 内,返回绝对路径。
 */
function resolveSafePath(storageKey: string): string {
  const resolved = path.resolve(SUPPORT_ROOT, storageKey);
  const root = path.resolve(SUPPORT_ROOT);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new SupportMediaError('invalid-path', '存储路径异常。', 400);
  }
  return resolved;
}

/**
 * 保存赞赏码图片。
 * - dev/test:写入 public/uploads/support/<uuid>.<ext>
 * - 生产:上传到 Vercel Blob(公开访问)
 */
export async function saveSupportMedia(mimeType: string, bytes: Uint8Array): Promise<SavedSupportMedia> {
  const ext = validateImage(mimeType, bytes);

  if (shouldUseBlob()) {
    // 生产:Vercel Blob 公开上传
    const storageKey = `support/${randomUUID()}${ext}`;
    const blob = await blobPut(storageKey, Buffer.from(bytes), {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: false,
    });
    return {
      publicUrl: blob.url,
      storageKey: blob.pathname,
      storageBackend: 'blob',
    };
  }

  // dev/test:本地文件系统(生产 Vercel 函数文件系统只读,走不到这里)
  const env = currentEnvironment();
  const isDevLike = env === 'development' || env === 'test';
  if (!isDevLike) {
    throw new SupportMediaError(
      'storage-unavailable',
      '生产环境需要配置 BLOB_READ_WRITE_TOKEN 才能上传图片。Vercel 函数文件系统只读。',
      503,
    );
  }

  const storageKey = `${randomUUID()}${ext}`;
  const target = resolveSafePath(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return {
    publicUrl: `${SUPPORT_PUBLIC_BASE}/${storageKey}`,
    storageKey,
    storageBackend: 'local',
  };
}

/**
 * 删除赞赏码图片。
 * - 本地文件:从磁盘删除(force:true,不存在不报错)
 * - Vercel Blob:调用 blob.del
 * - 外部图床 URL(非本站存的):跳过,不报错
 */
export async function removeSupportMedia(saved: { publicUrl: string; storageBackend: string; storageKey: string }): Promise<void> {
  if (saved.storageBackend === 'blob') {
    if (shouldUseBlob()) {
      await blobDel(saved.publicUrl).catch(() => { /* 不存在不报错 */ });
    }
    return;
  }

  // 本地模式:仅删 UUID.扩展名 格式的本地文件
  const key = saved.storageKey;
  if (!/^[a-f0-9-]+\.(png|jpe?g|webp|gif)$/i.test(key)) return;
  const target = resolveSafePath(key);
  await rm(target, { force: true });
}
