import { IntakePanel } from '../components/ui/IntakePanel';
import { useIntake } from '../hooks/useIntake';
import { dualEntry } from '../shared/dual-entry';
import { INTAKE_RULE_HINTS } from '../shared/rules-ui';

const EXAMPLES = [
  '想学 AI，从哪开始？',
  '公众号文章写不出来，卡在选题',
  '改页面有 bug，不知道怎么排查',
  '要做一个报名表单收集信息',
  '每天重复加班，想提效',
  '周报总是拖到最后一刻',
] as const;

export function ToolsPage() {
  const intake = useIntake();

  return (
    <IntakePanel
      title={dualEntry.ask.title}
      lead={dualEntry.ask.lead}
      ruleHints={INTAKE_RULE_HINTS}
      examples={EXAMPLES}
      body={intake.body}
      bodyOk={intake.bodyOk}
      remaining={intake.remaining}
      minLength={intake.minLength}
      loading={intake.loading}
      error={intake.error}
      result={
        intake.result
          ? {
              nextStep: intake.result.nextStep,
              bucketId: intake.result.bucketId,
              aiUsedFlag: intake.result.aiUsedFlag,
            }
          : null
      }
      browsePath={dualEntry.browse.path}
      browseLabel={dualEntry.browse.label}
      onBodyChange={intake.onBodyChange}
      onPickExample={intake.onPickExample}
      onSubmit={intake.onSubmit}
    />
  );
}
