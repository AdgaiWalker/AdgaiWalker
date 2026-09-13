/**
 * 卡结果会话存储（sessionStorage）。
 *
 * 边界（诚实）：没有后端结果查询接口，所以结果只属于「生成它的这个浏览器会话」——
 * 刷新可还原，换设备/换链接打不开。任何存储异常都降级为「无结果」，
 * 由结果页给出说明，而不是假装数据还在。
 */
import type { IntakeResult } from '../api/public-api';
import type { IntakeTypeId } from '../shared/intake-types';

/** 结果视图：对话消息与结果页共用 */
export type IntakeResultView = {
  result: IntakeResult;
  /** 本次提交的原始描述 */
  body: string;
  /** 对话式没有类型步骤：旧记录可能缺这个字段 */
  typeId?: IntakeTypeId;
};

export type StoredIntakeResult = IntakeResultView & { savedAt: string };

const STORAGE_KEY = 'walker:intake-result';

export function writeIntakeResult(payload: IntakeResultView): void {
  try {
    const record: StoredIntakeResult = {
      ...payload,
      savedAt: new Date().toISOString(),
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (error) {
    console.error('[intake-result] 会话存储写入失败，刷新后无法还原结果', error);
  }
}

export function readIntakeResult(): StoredIntakeResult | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredIntakeResult;
    if (!parsed?.result?.nextStep) return null;
    return parsed;
  } catch (error) {
    console.error('[intake-result] 会话存储读取失败，按无结果处理', error);
    return null;
  }
}
