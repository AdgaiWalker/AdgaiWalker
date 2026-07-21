/**
 * Intake 限流 / 配额 SSOT（api 与前台文案同源，禁止各处写死）
 */
export const RATE_LIMITS = {
  /** 游客：窗口内完整 intake 次数上限（按 IP 键） */
  guestPerWindow: 10,
  /** 已登录用户：窗口内次数上限 */
  userPerWindow: 30,
  /** 滑动窗口长度（秒） */
  windowSeconds: 600,
} as const;

/** 游客完整问答配额（与 GuestQuota 一致） */
export const GUEST_INTAKE_QUOTA = 1;

/** 窗口分钟数（展示用，与 windowSeconds 对齐） */
export const RATE_WINDOW_MINUTES = RATE_LIMITS.windowSeconds / 60;
