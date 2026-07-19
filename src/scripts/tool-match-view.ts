/**
 * Tool Match 视图层 — 纯渲染函数与 HTML 转义，零状态依赖。
 *
 * 从 tool-match-chat.ts 抽出：所有 render* 函数只接收 data、返回 HTML 字符串，
 * 不触碰 DOM 节点、不读闭包状态，便于独立单测与复用。
 */

export interface MatchResourceResult {
  id: string; title: string; href: string; kind: string;
  useFor: string; summary: string;
}

export interface MatchToolResult {
  id: string; name: string; tagline: string;
  useFor: string; nextStep: string;
  fit: 'best' | 'also-good' | 'fallback';
}

export interface DiagnosisOptionResult {
  label: string;
  text: string;
}

export interface ActionPlanResult {
  primaryTool?: MatchToolResult;
  backupTools?: MatchToolResult[];
  prompt: string;
  nextStep: string;
}

export interface MatchResponse {
  needCaseId?: string;
  sessionId?: string;
  responseMode?: 'greeting' | 'identity' | 'clarify' | 'diagnosis' | 'recommendation' | 'compliance';
  frictionLayer?: string;
  frictionLayerLabel?: string;
  recommendedAbilityType?: string;
  recommendedAbilityLabel?: string;
  toolDirection?: string;
  reason?: string;
  bridge?: string;
  needSummary?: string;
  categories?: Array<{ id: string; label: string }>;
  resources?: MatchResourceResult[];
  recommendedTools?: MatchToolResult[];
  diagnosisOptions?: DiagnosisOptionResult[];
  actionPlan?: ActionPlanResult;
  remaining?: number;
  error?: string;
  understandNote?: string;
  safety?: {
    piiDetected?: boolean;
    consentForTopic?: boolean;
    isMinorContext?: boolean;
    complianceRedirected?: boolean;
    note?: string;
  };
}

export function escapeHtml(text: string): string {
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderPlainResponse(data: MatchResponse): string {
  return `<p>${escapeHtml(data.bridge || '你可以直接说想用 AI 做什么，我帮你判断方向。')}</p>`;
}

export function renderPromptBox(actionPlan?: ActionPlanResult): string {
  if (!actionPlan?.prompt) return '';
  return `<div class="prompt-box">
    <div class="prompt-head">
      <span class="prompt-label">可复制提示词</span>
      <button class="copy-prompt" type="button" data-copy-prompt="${escapeAttr(actionPlan.prompt)}">复制</button>
    </div>
    <p class="prompt-text">${escapeHtml(actionPlan.prompt)}</p>
  </div>`;
}

export function renderDiagnosisResponse(data: MatchResponse): string {
  let html = `<p>${escapeHtml(data.bridge || '我先帮你收窄方向。选一个更接近的成品形式，我们再继续。')}</p>`;
  html += renderPromptBox(data.actionPlan);
  const options = data.diagnosisOptions ?? [];
  if (options.length) {
    html += `<div class="diagnosis-options" aria-label="选择方向">`;
    options.forEach(option => {
      html += `<button type="button" data-diagnosis-text="${escapeAttr(option.text)}">${escapeHtml(option.label)}</button>`;
    });
    html += `</div>`;
  }
  return html;
}

export function renderComplianceResponse(data: MatchResponse): string {
  let html = `<div class="chat-result-card">`;
  html += `<div class="result-chips"><span class="result-chip">合规转向</span></div>`;
  html += `<div class="result-bridge">${escapeHtml(data.bridge || '这个方向我不能协助。我们可以换一条合规路线，先说说你真正想完成的任务。')}</div>`;
  html += `</div>`;
  return html;
}

export function renderResultCard(data: MatchResponse): string {
  const actionPlan = data.actionPlan;
  const primaryTool = actionPlan?.primaryTool ?? data.recommendedTools?.[0];
  const backupTools = actionPlan?.backupTools ?? data.recommendedTools?.slice(1, 3) ?? [];

  let html = `<div class="chat-result-card" data-need-case-id="${escapeAttr(data.needCaseId ?? '')}">`;
  html += `<div class="result-verdict">先做这一步</div>`;
  if (data.bridge) html += `<div class="result-bridge">${escapeHtml(data.bridge)}</div>`;

  if (primaryTool) {
    html += `<div class="action-tool">
      <span class="action-tool-kicker">主工具</span>
      <div class="action-tool-name">${escapeHtml(primaryTool.name)}</div>
      <div class="action-tool-use">${escapeHtml(primaryTool.useFor || primaryTool.tagline)}</div>
    </div>`;
  } else if (data.toolDirection) {
    html += `<div class="result-direction">${escapeHtml(data.toolDirection)}</div>`;
  }

  if (backupTools.length) {
    html += `<div class="action-backups">备选：${backupTools.map(tool => escapeHtml(tool.name)).join(' / ')}</div>`;
  }

  html += renderPromptBox(actionPlan);

  if (actionPlan?.nextStep || primaryTool?.nextStep) {
    html += `<div class="action-next">下一步：${escapeHtml(actionPlan?.nextStep || primaryTool?.nextStep || '')}</div>`;
  }

  if (data.resources?.length) {
    html += `<div class="result-section-title">站内资料</div>`;
    html += `<div class="result-resources">`;
    data.resources.forEach((res, i) => {
      html += `<a href="${escapeHtml(res.href)}" target="_blank" rel="noopener noreferrer" class="result-resource-row">
        <span class="result-resource-idx">${i + 1}</span>
        <div class="result-resource-info">
          <div class="result-resource-title">${escapeHtml(res.title)}</div>
          <div class="result-resource-use">${escapeHtml(res.useFor)}</div>
        </div>
      </a>`;
    });
    html += `</div>`;
  }

  html += `<div class="result-feedback" aria-label="反馈">
    <button type="button" data-feedback="first-draft">做出第一版</button>
    <button type="button" data-feedback="next-step-clear">知道下一步</button>
    <button type="button" data-feedback="wrong-direction">方向不对</button>
    <button type="button" data-feedback="need-tutorial">还缺教程</button>
  </div>`;
  html += `</div>`;
  return html;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
