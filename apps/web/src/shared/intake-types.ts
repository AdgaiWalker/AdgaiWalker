/**
 * 卡口向导的「卡点类型」单一配置（前端引导层）。
 * 职责：类型 → 标题、提示语、placeholder、示例 chips 只在此定义，页面只遍历。
 * 边界：类型只是引导访客把话说清，不随提交发出（线索正文保持干净）。
 */
export type IntakeTypeId = 'learn' | 'build' | 'write' | 'tool';

export interface IntakeTypeDef {
  id: IntakeTypeId;
  label: string;
  hint: string;
  placeholder: string;
  examples: readonly string[];
}

export const INTAKE_TYPES: readonly IntakeTypeDef[] = [
  {
    id: 'learn',
    label: '想学会',
    hint: '学一个工具或方法，不知道从哪下手',
    placeholder: '例如：想学 AI 做周报，但不知道第一步做什么…',
    examples: [
      '想学 AI，从哪开始？',
      '教程看懂了，自己动手还是卡住',
      '不知道先学哪个工具',
    ],
  },
  {
    id: 'build',
    label: '想做出',
    hint: '有个想法想做成能用的东西，不确定先做什么',
    placeholder: '例如：要做一个报名表单收集信息，不知道从哪开始…',
    examples: [
      '要做一个报名表单收集信息',
      '想把一个点子做成能用的东西',
      '不知道先做哪一步',
    ],
  },
  {
    id: 'write',
    label: '想写清',
    hint: '要写给人看的东西，卡在选题或结构',
    placeholder: '例如：公众号文章卡在选题，写不出第一段…',
    examples: [
      '公众号文章写不出来，卡在选题',
      '周报总是拖到最后一刻',
      '写完自己都觉得没说服力',
    ],
  },
  {
    id: 'tool',
    label: '用工具',
    hint: '手上的工具不好用，或重复劳动想自动化',
    placeholder: '例如：改页面有 bug，不知道怎么排查…',
    examples: [
      '改页面有 bug，不知道怎么排查',
      '每天重复加班，想提效',
      '装了一堆工具，还是没省下时间',
    ],
  },
] as const;

/** 未知 id 回落到第一个类型，页面不必自己兜底 */
export function intakeTypeById(id: IntakeTypeId): IntakeTypeDef {
  return INTAKE_TYPES.find((type) => type.id === id) ?? INTAKE_TYPES[0];
}
