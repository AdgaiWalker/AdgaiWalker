const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[邮箱已隐藏]'],
  [/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[手机号已隐藏]'],
  [/\b(?:sk|ak|pk|rk|xoxb|ghp|github_pat|AIza)[A-Za-z0-9_\-]{12,}\b/g, '[密钥已隐藏]'],
  [/\b(?:api[_-]?key|token|secret|password|passwd|pwd)\s*[:=：]\s*[^\s，。；;]+/gi, '[敏感凭据已隐藏]'],
  [/(?:微信|wechat|wx|QQ|qq)\s*[:：]?\s*[A-Za-z0-9_\-]{5,}/g, '[联系方式已隐藏]'],
  [/\b\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, '[身份证已隐藏]'],
];

export interface RedactionResult {
  text: string;
  piiDetected: boolean;
}

export function redactSensitiveText(input: string): RedactionResult {
  let text = input;
  let piiDetected = false;

  for (const [pattern, replacement] of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) {
      piiDetected = true;
      text = text.replace(pattern, replacement);
    }
    pattern.lastIndex = 0;
  }

  return { text: text.trim(), piiDetected };
}

export function compactText(input: string, maxLength: number): string {
  const normalized = input.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

export function isMinorAudience(value: unknown): boolean {
  return value === 'minor';
}
