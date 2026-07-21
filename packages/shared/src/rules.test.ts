import { describe, expect, it } from 'vitest';
import {
  assertClueBody,
  isExternalSource,
  isValidClueBody,
  sourceBucket,
} from './clue.js';
import {
  assertPrimaryHasClue,
  canPromoteToPrimary,
  countPrimary,
  isValidTwoQuestions,
  rebalancePrimary,
  type SeedClueLink,
} from './seed.js';
import { isValidDelivery, isValidReview } from './execution.js';
import {
  graduationProgress,
  hasSpinRisk,
  isCountableLoop,
} from './loop.js';
import { isErrorCode } from './errors.js';
import { ruleNextStep, matchNextStepBucket } from './nextstep.js';
import { resolveVisibility, toContentDoc, isPostType } from './content.js';
import { FEATURE_KEYS, isFeatureKey } from './feature-keys.js';
import {
  FEATURE_FAIL_CODES,
  HTTP_TO_FEATURE_FAIL,
} from './feature-fail-codes.js';
import { GUEST_INTAKE_QUOTA, RATE_LIMITS, RATE_WINDOW_MINUTES } from './rate-limits.js';

describe('线索规则', () => {
  it('正文 trim 后长度 ≥4 才合法', () => {
    expect(isValidClueBody('  ab  ')).toBe(false);
    expect(isValidClueBody('abcd')).toBe(true);
    expect(isValidClueBody('  学AI入门  ')).toBe(true);
  });

  it('过短正文 assert 抛 validation', () => {
    expect(() => assertClueBody('x')).toThrow(/validation-error/);
  });

  it('external 来源判定：非 manual-self', () => {
    expect(isExternalSource('manual-self')).toBe(false);
    expect(isExternalSource('tools-visitor')).toBe(true);
    expect(isExternalSource('wechat')).toBe(true);
    expect(isExternalSource('live')).toBe(true);
    expect(isExternalSource('other-external')).toBe(true);
  });
});

describe('题苗主选', () => {
  const inPoolPrimary: SeedClueLink = {
    clueId: 'c1',
    poolStatus: 'in-pool',
    role: 'primary',
  };
  const candidateOnly: SeedClueLink = {
    clueId: 'c2',
    poolStatus: 'candidate',
    role: 'primary',
  };

  it('无线索或无 in-pool 主选不可 promote', () => {
    expect(canPromoteToPrimary([])).toBe(false);
    expect(canPromoteToPrimary([candidateOnly])).toBe(false);
    expect(() => assertPrimaryHasClue([])).toThrow('missing-clue');
  });

  it('至少一条 in-pool primary 可 promote', () => {
    expect(canPromoteToPrimary([inPoolPrimary])).toBe(true);
  });

  it('rebalancePrimary 保证全局 primary=1', () => {
    const links: SeedClueLink[] = [
      { clueId: 'a', poolStatus: 'in-pool', role: 'primary' },
      { clueId: 'b', poolStatus: 'in-pool', role: 'backup' },
    ];
    const next = rebalancePrimary(links, 'b');
    expect(countPrimary(next)).toBe(1);
    expect(next.find((l) => l.clueId === 'b')?.role).toBe('primary');
    expect(next.find((l) => l.clueId === 'a')?.role).toBe('backup');
  });

  it('两问 severity/selfInterest 必须 low|mid|high', () => {
    expect(
      isValidTwoQuestions({ severity: 'mid', selfInterest: 'high' }),
    ).toBe(true);
    expect(
      isValidTwoQuestions({
        severity: 'nope' as 'low',
        selfInterest: 'high',
      }),
    ).toBe(false);
  });
});

describe('交付与检验', () => {
  it('交付：url 非空或 form+note≥4', () => {
    expect(isValidDelivery({ url: 'https://x.test' })).toBe(true);
    expect(isValidDelivery({ form: 'article', note: 'abcd' })).toBe(true);
    expect(isValidDelivery({ form: 'article', note: 'ab' })).toBe(false);
    expect(isValidDelivery({})).toBe(false);
  });

  it('检验 no 须证据≥4；yes/unclear 可无证据', () => {
    expect(isValidReview({ outcome: 'yes' })).toBe(true);
    expect(isValidReview({ outcome: 'unclear' })).toBe(true);
    expect(isValidReview({ outcome: 'no', evidence: '缺' })).toBe(false);
    expect(isValidReview({ outcome: 'no', evidence: '证据足够了' })).toBe(
      true,
    );
  });
});

describe('可计数闭环与毕业', () => {
  const goodLinks: SeedClueLink[] = [
    { clueId: 'c1', poolStatus: 'in-pool', role: 'primary' },
  ];

  it('完整 yes 闭环可计数', () => {
    expect(
      isCountableLoop({
        links: goodLinks,
        delivery: { url: 'https://x.test/post' },
        review: { outcome: 'yes' },
      }),
    ).toBe(true);
  });

  it('unclear 不计入可计数闭环', () => {
    expect(
      isCountableLoop({
        links: goodLinks,
        delivery: { url: 'https://x.test' },
        review: { outcome: 'unclear' },
      }),
    ).toBe(false);
  });

  it('no 无证据不可计数', () => {
    expect(
      isCountableLoop({
        links: goodLinks,
        delivery: { url: 'https://x.test' },
        review: { outcome: 'no', evidence: 'x' },
      }),
    ).toBe(false);
  });

  it('毕业指标：≥5 闭环且 yes≥2 且外部≥1', () => {
    expect(
      graduationProgress({
        countableLoops: 5,
        yesCount: 2,
        externalLoopCount: 1,
      }).readyByMetrics,
    ).toBe(true);
    expect(
      graduationProgress({
        countableLoops: 4,
        yesCount: 2,
        externalLoopCount: 1,
      }).readyByMetrics,
    ).toBe(false);
  });

  it('连续 3 次 no/unclear 触发 spin-risk', () => {
    expect(hasSpinRisk(['no', 'unclear', 'no'])).toBe(true);
    expect(hasSpinRisk(['yes', 'no', 'no'])).toBe(false);
  });

  it('错误码白名单识别', () => {
    expect(isErrorCode('missing-clue')).toBe(true);
    expect(isErrorCode('storage-unavailable')).toBe(true);
    expect(isErrorCode('not-a-code')).toBe(false);
  });
});

describe('规则 nextStep', () => {
  it('关 AI 五桶+default 均非空且 ≥4', () => {
    const samples = [
      '想学AI入门',
      '写公众号文案',
      '改页面有 bug',
      '做报名表单',
      '重复加班提效',
      '随便说说',
    ];
    for (const body of samples) {
      const r = ruleNextStep(body);
      expect(r.nextStep.trim().length).toBeGreaterThanOrEqual(4);
    }
    expect(matchNextStepBucket('学 ai 从哪开始')).toBe('learn-ai');
  });
});

describe('内容解析', () => {
  it('visibility 与 toContentDoc', () => {
    expect(resolveVisibility({ published: false })).toBe('draft');
    expect(resolveVisibility({ visibility: 'public' })).toBe('public');
    const doc = toContentDoc(
      'hello',
      { title: '你好', type: 'knowledge', date: '2026-01-01' },
      '# hi',
    );
    expect(doc.title).toBe('你好');
    expect(doc.slug).toBe('hello');
    expect(isPostType('knowledge')).toBe(true);
  });
});

describe('feature_key 字典', () => {
  it('含 intake 与闭环相关 key', () => {
    expect(isFeatureKey('match.intake')).toBe(true);
    expect(isFeatureKey('seed.promote')).toBe(true);
    expect(FEATURE_KEYS['content.feedback']).toBeTruthy();
  });
});

describe('sourceBucket (A11)', () => {
  it('maps sources to visitor/self/external', () => {
    expect(sourceBucket('tools-visitor')).toBe('visitor');
    expect(sourceBucket('manual-self')).toBe('self');
    expect(sourceBucket('wechat')).toBe('external');
    expect(sourceBucket('live')).toBe('external');
  });
});

describe('限流与 failCode SSOT', () => {
  it('RATE_LIMITS 与历史行为一致（10/30/600）', () => {
    expect(RATE_LIMITS.guestPerWindow).toBe(10);
    expect(RATE_LIMITS.userPerWindow).toBe(30);
    expect(RATE_LIMITS.windowSeconds).toBe(600);
    expect(RATE_WINDOW_MINUTES).toBe(10);
    expect(GUEST_INTAKE_QUOTA).toBe(1);
  });

  it('FEATURE_FAIL_CODES 保持历史 snake 字面量', () => {
    expect(FEATURE_FAIL_CODES.quotaExceeded).toBe('quota_exceeded');
    expect(FEATURE_FAIL_CODES.validationError).toBe('validation_error');
    expect(FEATURE_FAIL_CODES.rateLimited).toBe('rate_limited');
    expect(HTTP_TO_FEATURE_FAIL['guest-quota-exceeded']).toBe('quota_exceeded');
  });
});
