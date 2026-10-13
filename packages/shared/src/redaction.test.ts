import { describe, expect, it } from 'vitest';
import { redactRequestMetadata, redactSensitive, redactSensitiveText } from './redaction.js';

describe('redactSensitiveText（V09 输入侧脱敏）', () => {
  it('过滤明显密钥形态，并按类别计数（不保留原值）', () => {
    const result = redactSensitiveText('我的 key 是 sk-abcdefghijklmnopqrstuvwx 别外传');
    expect(result.text).toBe('我的 key 是 [redacted-api-key] 别外传');
    expect(result.hits['api-key']).toBe(1);
    expect(result.text).not.toContain('sk-abcdefghijklmnopqrstuvwx');
  });

  it('Bearer、GitHub token、AWS key、PEM 私钥块都被替换', () => {
    const input = [
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      'token ghp_0123456789abcdefghijklmnopqrstuvwx',
      'aws AKIAIOSFODNN7EXAMPLE',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const result = redactSensitiveText(input);
    expect(result.text).toContain('Bearer [redacted-token]');
    expect(result.text).toContain('[redacted-api-key]');
    expect(result.text).toContain('[redacted-private-key]');
    expect(result.text).not.toContain('MIIEowIBAAKCAQEA');
    expect(result.hits['bearer-token']).toBe(1);
    expect(result.hits['private-key-block']).toBe(1);
  });

  it('过滤联系方式：邮箱、手机号（含分组写法）、身份证号', () => {
    const result = redactSensitiveText('联系 a.b-c@example.com 或 13812345678 或 138-1234-5678，证件 110101199003071234');
    expect(result.text).toContain('[redacted-email]');
    expect(result.text.match(/\[redacted-mobile\]/g)).toHaveLength(2);
    expect(result.text).toContain('[redacted-id]');
    expect(result.text).not.toContain('a.b-c@example.com');
    expect(result.text).not.toContain('13812345678');
  });

  it('正文引用不被无差别破坏：普通数字、短数字、slug 原样保留', () => {
    const input = '参见 /posts/ai-low-cost-access 与 2026-09-22 的 3 条记录，成本 1/3';
    const result = redactSensitiveText(input);
    expect(result.text).toBe(input);
    expect(result.changed).toBe(false);
  });

  it('超长数字串按账号类处理，但不误伤正常长文', () => {
    const result = redactSensitiveText('卡号 6222021234567890123 请勿外传');
    expect(result.text).toContain('[redacted-number]');
    expect(result.text).not.toContain('6222021234567890123');
    const prose = '本文共 1234 字，发表于 2026 年';
    expect(redactSensitiveText(prose).text).toBe(prose);
  });

  it('空输入与无命中输入按原样返回，changed 如实标记', () => {
    expect(redactSensitiveText('')).toEqual({ text: '', hits: {}, changed: false });
    const clean = redactSensitiveText('什么都没写');
    expect(clean.changed).toBe(false);
    expect(clean.hits).toEqual({});
  });

  it('redactSensitive 包装返回同一份结果（两条管道共用）', () => {
    const input = 'key sk-abcdefghijklmnopqrstuvwx';
    expect(redactSensitive(input)).toBe(redactSensitiveText(input).text);
  });
});

describe('redactRequestMetadata（不记录完整 IP/header/query）', () => {
  it('IPv4 只留前两段；IPv6 只留形状；未知形状标记', () => {
    expect(redactRequestMetadata({ ip: '203.0.113.42' }).ipHint).toBe('203.0.x.x');
    expect(redactRequestMetadata({ ip: '2001:db8::1' }).ipHint).toBe('ipv6');
    expect(redactRequestMetadata({ ip: 'not-an-ip' }).ipHint).toBe('unknown-shape');
    expect(redactRequestMetadata({}).ipHint).toBeNull();
  });

  it('header 只保留小写名集合，不含值；query 只标记有无', () => {
    const meta = redactRequestMetadata({
      headers: { Cookie: 'walker-anon=secret', 'X-Admin-Token': 'leak' },
      query: 'q=敏感内容',
    });
    expect(meta.headerNames).toEqual(['cookie', 'x-admin-token']);
    expect(JSON.stringify(meta)).not.toContain('secret');
    expect(JSON.stringify(meta)).not.toContain('leak');
    expect(meta.hasQuery).toBe(true);
    expect(redactRequestMetadata({ query: '' }).hasQuery).toBe(false);
  });
});
