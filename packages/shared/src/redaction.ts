/**
 * 输入侧必要脱敏（V09）。
 *
 * 设计边界（不夸大能力）：
 * - 只处理「明显」的凭据与联系方式，**不宣称能识别所有个人信息**；
 * - 面向「进入 SDK 前」与「落库前」的同一份文本，避免 native session 与
 *   业务存储各留一份未处理原文；
 * - 正文引用（文章 slug/标题内的词）不得被无差别破坏——只替换有结构特征的模式，
 *   不做通用「敏感词」猜测。
 */

/** 脱敏项的类别，用于测试与审计（不含被替换的原值）。 */
export type RedactionKind =
  | 'api-key'
  | 'bearer-token'
  | 'private-key-block'
  | 'email'
  | 'cn-mobile'
  | 'cn-id-card'
  | 'long-digit-run';

/** 一次脱敏的结果：文本 + 命中的类别计数（不含原值，可安全记录）。 */
export interface RedactionResult {
  text: string;
  hits: Partial<Record<RedactionKind, number>>;
  /** 是否有任何替换发生 */
  changed: boolean;
}

/** 凭据类：sk-xxx / ghp_xxx / xoxb-xxx 等常见前缀 + 足够长度。 */
const CREDENTIAL_PATTERNS: { kind: RedactionKind; pattern: RegExp; replace: string }[] = [
  {
    kind: 'private-key-block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replace: '[redacted-private-key]',
  },
  {
    kind: 'bearer-token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
    replace: 'Bearer [redacted-token]',
  },
  {
    kind: 'api-key',
    // sk- / sk_ / ghp_ / gho_ / github_pat_ / xoxb- / xoxp- / AKIA 等常见形态
    pattern: /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b|\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b|\bxox[abposr]-[A-Za-z0-9-]{10,}\b|\bAKIA[0-9A-Z]{16}\b/g,
    replace: '[redacted-api-key]',
  },
];

/** 联系方式类：邮箱与中国大陆手机号；身份证号按 18 位结构化匹配。 */
const CONTACT_PATTERNS: { kind: RedactionKind; pattern: RegExp; replace: string }[] = [
  {
    kind: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replace: '[redacted-email]',
  },
  {
    kind: 'cn-mobile',
    // 1[3-9]xxxxxxxxx，允许用空格/连字符分组（如 138-1234-5678）
    pattern: /(?<!\d)1[3-9]\d[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g,
    replace: '[redacted-mobile]',
  },
  {
    kind: 'cn-id-card',
    pattern: /(?<!\d)\d{17}[\dXx](?!\d)/g,
    replace: '[redacted-id]',
  },
];

/** 超长数字串（≥16 位）：银行卡/账号类；放在手机号与身份证之后，避免抢先匹配。 */
const LONG_DIGIT_RUN: { kind: RedactionKind; pattern: RegExp; replace: string } = {
  kind: 'long-digit-run',
  pattern: /(?<!\d)\d{16,}(?!\d)/g,
  replace: '[redacted-number]',
};

function applyAll(
  input: string,
  rules: { kind: RedactionKind; pattern: RegExp; replace: string }[],
  hits: Partial<Record<RedactionKind, number>>,
): string {
  let out = input;
  for (const rule of rules) {
    // 每条规则用新的 RegExp 实例，避免 lastIndex 在 /g 下串扰
    const re = new RegExp(rule.pattern.source, rule.pattern.flags);
    out = out.replace(re, () => {
      hits[rule.kind] = (hits[rule.kind] ?? 0) + 1;
      return rule.replace;
    });
  }
  return out;
}

/**
 * 对进入模型/落库前的文本做必要脱敏。
 * 顺序：先结构化凭据（含 PEM 块），再联系方式，最后超长数字串。
 */
export function redactSensitiveText(input: string): RedactionResult {
  if (!input) return { text: input, hits: {}, changed: false };
  const hits: Partial<Record<RedactionKind, number>> = {};
  let text = applyAll(input, CREDENTIAL_PATTERNS, hits);
  text = applyAll(text, CONTACT_PATTERNS, hits);
  text = applyAll(text, [LONG_DIGIT_RUN], hits);
  return { text, hits, changed: text !== input };
}

/**
 * 便捷包装：只要脱敏后的文本。
 * 供连接 SDK 输入与业务落库两条管道共用，确保两者处理的是同一份结果。
 */
export function redactSensitive(input: string): string {
  return redactSensitiveText(input).text;
}

/**
 * 请求元数据的可记录形态：**不**记录完整 IP 与原始 header/query。
 * 返回稳定的短摘要，够用于限流归因与排错，但不可还原原始值。
 */
export function redactRequestMetadata(input: {
  ip?: string | null;
  headers?: Record<string, string | string[] | undefined> | null;
  query?: string | null;
}): { ipHint: string | null; headerNames: string[]; hasQuery: boolean } {
  const ip = input.ip?.trim() || null;
  // IP 只保留形状提示（v4/v6/未知）与前两段，不可还原完整地址
  let ipHint: string | null = null;
  if (ip) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      const parts = ip.split('.');
      ipHint = `${parts[0]}.${parts[1]}.x.x`;
    } else if (ip.includes(':')) {
      ipHint = 'ipv6';
    } else {
      ipHint = 'unknown-shape';
    }
  }
  const headerNames = input.headers ? Object.keys(input.headers).map((k) => k.toLowerCase()).sort() : [];
  return { ipHint, headerNames, hasQuery: Boolean(input.query && input.query.length > 0) };
}
