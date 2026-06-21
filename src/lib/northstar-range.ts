/**
 * northstar-range.ts —— P5 NorthStar 经营范围开关（spec §14 硬约束）
 *
 * NorthStar 默认 OFF。关闭时 Walker 个人闭环须完整运行（私密原始数据不自动发布，
 * 由 northstar-containment 不变量测试守护）。开启需显式 env NORTHSTAR_ENABLED=true。
 *
 * 这是"范围切换"，不增加到 Walker 个人系统固定一级导航（spec §14）。
 * 真实支付商接入 / 公开路由挂载都门控在 isNorthStarEnabled() 之下。
 */

/** NorthStar 经营范围是否开启（默认关闭）。 */
export function isNorthStarEnabled(): boolean {
  return import.meta.env.NORTHSTAR_ENABLED === 'true';
}
