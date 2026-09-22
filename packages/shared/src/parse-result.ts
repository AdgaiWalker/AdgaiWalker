/**
 * 解析结果 —— 所有「读外部数据」的契约层共用的形态。
 *
 * 约定：**不抛错**，坏输入给原因（`reason`），由调用方决定失败形态
 * （api 转 HTTP 错误码、agent 回结构化 error、脚本直接退出）。
 * 产物契约（code-artifact）与技能契约（skill）共用这一份定义，避免各写一遍。
 */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };
