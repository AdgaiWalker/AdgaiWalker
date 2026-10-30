/**
 * Intake 限流 / 配额 SSOT（api 与前台文案同源，禁止各处写死）
 */
export const RATE_LIMITS = {
  /** 游客：窗口内完整 intake 次数上限（按 IP 键） */
  guestPerWindow: 20,
  /** 已登录用户：窗口内次数上限 */
  userPerWindow: 60,
  /** 公开问答：窗口内每匿名身份（cookie hash）次数上限 */
  assistantAnonPerWindow: 30,
  /** 助手部件交互日志：按 IP 与匿名身份分别限流 */
  assistantInteractionPerWindow: 120,
  /** 滑动窗口长度（秒） */
  windowSeconds: 600,
} as const;

/** 游客完整问答配额（与 GuestQuota 一致） */
export const GUEST_INTAKE_QUOTA = 15;

/** 窗口分钟数（展示用，与 windowSeconds 对齐） */
export const RATE_WINDOW_MINUTES = RATE_LIMITS.windowSeconds / 60;
