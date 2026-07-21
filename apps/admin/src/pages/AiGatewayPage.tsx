export function AiGatewayPage() {
  return (
    <div>
      <h1>AI Gateway</h1>
      <div className="panel">
        <p>
          现网 AI 配置页：<strong>未迁</strong>（Stage 1 默认关 AI，规则
          nextStep）。
        </p>
        <p className="muted">
          环境变量 <code>AI_ENABLED=true</code> 后可换 LlmNextStepAdapter；本页不伪造调用统计。
        </p>
      </div>
    </div>
  );
}
