import { createHash } from 'node:crypto';

/** 全 API 统一内容与契约 SHA-256 十六进制摘要函数（UTF-8） */
export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
