interface MatchResourceResult {
    id: string; title: string; href: string; kind: string;
    useFor: string; summary: string;
  }

interface MatchToolResult {
    id: string; name: string; tagline: string;
    useFor: string; nextStep: string;
    fit: 'best' | 'also-good' | 'fallback';
  }

interface DiagnosisOptionResult {
    label: string;
    text: string;
  }

interface ActionPlanResult {
    primaryTool?: MatchToolResult;
    backupTools?: MatchToolResult[];
    prompt: string;
    nextStep: string;
  }

interface MatchResponse {
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

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
  }

export function mountToolMatch(root: HTMLElement) {
  let abort: AbortController | null = null;
  let sessionId: string | null = null;
  let isPublic = false;
  let identityProbe: Promise<unknown> = Promise.resolve();
  let currentAnchor: string | null = null;
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  let toolMatchTimers: ReturnType<typeof setTimeout>[] = [];
  let toolMatchRafs: number[] = [];
  const conversationHistory: ChatMessage[] = [];

  function scheduleToolMatchTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    let timer: ReturnType<typeof setTimeout>;
    timer = setTimeout(() => {
      const index = toolMatchTimers.indexOf(timer);
      if (index >= 0) toolMatchTimers.splice(index, 1);
      callback();
    }, delay);
    toolMatchTimers.push(timer);
    return timer;
  }

  function scheduleToolMatchRaf(callback: FrameRequestCallback): number {
    let rafId = 0;
    rafId = requestAnimationFrame((time) => {
      toolMatchRafs = toolMatchRafs.filter((item) => item !== rafId);
      callback(time);
    });
    toolMatchRafs.push(rafId);
    return rafId;
  }

  function clearToolMatchAsyncWork() {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
    toolMatchTimers.forEach((timer) => clearTimeout(timer));
    toolMatchTimers = [];
    toolMatchRafs.forEach((rafId) => cancelAnimationFrame(rafId));
    toolMatchRafs = [];
  }

  function cleanupToolMatch() {
    abort?.abort();
    abort = null;
    clearToolMatchAsyncWork();
    const dialog = root.querySelector('#match-dialog') as HTMLDialogElement | null;
    if (dialog?.open) dialog.close();
    root.querySelector('#typing-indicator')?.remove();
  }

  function initToolMatch() {
    cleanupToolMatch();
    abort = new AbortController();
    const { signal } = abort;
    isPublic = false;

    // 身份应用：更新 isPublic / currentAnchor / signal-note 徽章 / 记忆条
    function applyIdentity(state: 'public' | 'user' | 'admin', anchor?: string) {
      isPublic = state === 'public';
      currentAnchor = state === 'user' ? (anchor ?? null) : null;
      const signalNote = root.querySelector('.signal-note');
      const roleLabel = root.querySelector('#memory-role-label');
      if (state === 'public') {
        if (signalNote) signalNote.textContent = '登录可解锁';
        if (roleLabel) roleLabel.textContent = '未登录';
      } else if (state === 'admin') {
        if (signalNote) signalNote.textContent = '管理员';
        if (roleLabel) roleLabel.textContent = '管理员';
      } else if (state === 'user' && !anchor) {
        if (signalNote) signalNote.textContent = '已登录';
        if (roleLabel) roleLabel.textContent = '已登录';
      } else if (anchor) {
        if (signalNote) signalNote.textContent = anchor;
        if (roleLabel) roleLabel.textContent = anchor;
      }
    }
    function probeIdentity(sig: AbortSignal): Promise<void> {
      return fetch('/api/profile', { signal: sig }).then(r => {
        if (sig.aborted) return;
        if (r.status === 401) { applyIdentity('public'); return; }
        if (!r.ok) return;
        return r.json().then((data: { authState?: string; profile?: { personaAnchor?: string } }) => {
          if (data?.authState === 'admin') { applyIdentity('admin'); return; }
          applyIdentity('user', data?.profile?.personaAnchor);
        });
      }).catch(() => { /* 探测失败不阻断，后端 gate 兜底 */ });
    }

    // 初始身份探测
    identityProbe = probeIdentity(signal);

    const open = root.querySelector('#match-open') as HTMLButtonElement;
    const dialog = root.querySelector('#match-dialog') as HTMLDialogElement;
    const close = root.querySelector('#match-close') as HTMLButtonElement;
    const messages = root.querySelector('#chat-messages') as HTMLDivElement;
    const input = root.querySelector('#chat-input') as HTMLTextAreaElement;
    const sendBtn = root.querySelector('#chat-send') as HTMLButtonElement;
    const status = root.querySelector('#chat-status') as HTMLDivElement;
    const consent = root.querySelector('#chat-consent') as HTMLInputElement;
    const audience = root.querySelector('#match-audience') as HTMLSelectElement;
    const stage = root.querySelector('#match-stage') as HTMLSelectElement;
    const contextToggle = root.querySelector('#context-toggle') as HTMLButtonElement;
    const contextPanel = root.querySelector('#context-panel') as HTMLDivElement;
    const suggestions = root.querySelector('#chat-suggestions') as HTMLDivElement;
    const stat = root.querySelector('#match-stat') as HTMLSpanElement | null;
    const memoryTurnCount = root.querySelector('#memory-turn-count') as HTMLElement | null;
    const memoryRoleLabel = root.querySelector('#memory-role-label') as HTMLElement | null;
    const memoryFrictionLabel = root.querySelector('#memory-friction-label') as HTMLElement | null;

    if (!open || !dialog || !close || !messages || !input || !sendBtn) return;

    // 注册流程已移至 /login（账号系统）；public 用户点提问会被引导去 /login。

    const audienceLabels: Record<string, string> = {
      'prefer-not-say': '未指定',
      student: '学生',
      'office-worker': '职场办公',
      creator: '内容创作者',
      developer: '开发者',
      'freelancer-founder': '自由职业 / 创业者',
      teacher: '老师',
      parent: '家长',
      minor: '青少年',
      other: '其他',
    };

    function updateMemoryPanel(data?: MatchResponse) {
      const userTurns = conversationHistory.filter((message) => message.role === 'user').length;
      const visibleTurns = Math.min(userTurns, 8);
      const role = currentAnchor ?? audienceLabels[audience?.value ?? 'prefer-not-say'] ?? '未指定';
      if (memoryTurnCount) memoryTurnCount.textContent = `${visibleTurns} / 8`;
      if (memoryRoleLabel) memoryRoleLabel.textContent = role;
      if (memoryFrictionLabel && data?.frictionLayerLabel) memoryFrictionLabel.textContent = data.frictionLayerLabel;
      if (stat) stat.textContent = `${visibleTurns}/8 问题槽`;
    }

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 96) + 'px';
    }, { signal });

    // Open/close dialog
    open.addEventListener('click', async () => {
      await identityProbe;
      if (isPublic) {
        window.location.href = '/login';
        return;
      }
      if (!dialog.open) dialog.showModal();
      scheduleToolMatchTimer(() => input.focus(), 60);
    }, { signal });

    close.addEventListener('click', () => dialog.close(), { signal });

    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    }, { signal });


    // History panel
    const historyToggle = root.querySelector('#match-history-toggle') as HTMLButtonElement;
    const historyPanel = root.querySelector('#chat-history-panel') as HTMLDivElement;
    const historyList = root.querySelector('#history-list') as HTMLDivElement;
    const historyClose = root.querySelector('#history-close') as HTMLButtonElement;

    historyToggle?.addEventListener('click', async () => {
      const sessionIds = JSON.parse(localStorage.getItem('match-session-ids') || '[]') as string[];
      if (sessionIds.length === 0) {
        historyList.innerHTML = '<div class="history-empty">暂无历史对话</div>';
      } else {
        historyList.innerHTML = '<div class="history-empty">加载中...</div>';
        try {
          const res = await fetch('/api/match-history?sessionIds=' + encodeURIComponent(sessionIds.join(',')), { signal });
          const data = await res.json();
          if (signal.aborted) return;
          const convs = data.conversations as Array<{ sessionId: string; messages: Array<{role: string; content: string}>; startedAt?: string }>;
          if (convs.length === 0 || convs.every(c => c.messages.length === 0)) {
            historyList.innerHTML = '<div class="history-empty">暂无历史对话</div>';
          } else {
            historyList.innerHTML = convs
              .filter(c => c.messages.length > 0)
              .map(c => {
                const userMsg = c.messages.find(m => m.role === 'user');
                const date = c.startedAt ? new Date(c.startedAt).toLocaleDateString('zh-CN', {month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}) : '';
                return '<div class="history-item" data-sid="' + c.sessionId + '"><div class="history-item-date">' + date + '</div><div class="history-item-text">' + escapeHtml(userMsg?.content || '(空)') + '</div></div>';
              }).join('');
          }
        } catch {
          if (signal.aborted) return;
          historyList.innerHTML = '<div class="history-empty">加载失败</div>';
        }
      }
      messages.classList.add('hidden');
      historyPanel.classList.add('visible');
    }, { signal });

    historyClose?.addEventListener('click', () => {
      historyPanel.classList.remove('visible');
      messages.classList.remove('hidden');
    }, { signal });

    messages.addEventListener('click', async (event) => {
      const diagnosisButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-diagnosis-text]');
      if (diagnosisButton) {
        const text = diagnosisButton.dataset.diagnosisText ?? '';
        if (text) sendMessage(text);
        return;
      }

      const copyButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-copy-prompt]');
      if (copyButton) {
        const prompt = copyButton.dataset.copyPrompt ?? '';
        if (!prompt) return;
        try {
          await navigator.clipboard.writeText(prompt);
          copyButton.textContent = '已复制';
          scheduleToolMatchTimer(() => { copyButton.textContent = '复制'; }, 1200);
        } catch {
          status.textContent = '复制失败，可以手动选中提示词。';
        }
        return;
      }

      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-feedback]');
      if (!button || !sessionId) return;

      const card = button.closest<HTMLElement>('.chat-result-card');
      const feedbackType = button.dataset.feedback;
      if (!feedbackType) return;

      button.disabled = true;
      try {
        const response = await fetch('/api/match-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            sessionId,
            needCaseId: card?.dataset.needCaseId || undefined,
            feedbackType,
          }),
        });
        if (signal.aborted) return;
        if (!response.ok) throw new Error('feedback failed');

        card?.querySelectorAll<HTMLButtonElement>('[data-feedback]').forEach(item => {
          item.disabled = true;
          item.classList.toggle('is-selected', item === button);
        });
        status.textContent = '已记录反馈。';
      } catch {
        if (signal.aborted) return;
        button.disabled = false;
        status.textContent = '反馈记录失败，稍后再试。';
      }
    }, { signal });

    // Context toggle
    contextToggle?.addEventListener('click', () => {
      contextPanel?.classList.toggle('hidden');
    }, { signal });

    // Restore saved context (localStorage, no personal info)
    try {
      const saved = JSON.parse(localStorage.getItem('match-context') || '{}');
      if (saved.audience && audience) audience.value = saved.audience;
      if (saved.stage && stage) stage.value = saved.stage;
    } catch {}
    const saveContext = () => {
      try {
        localStorage.setItem('match-context', JSON.stringify({
          audience: audience?.value,
          stage: stage?.value,
        }));
      } catch {}
      updateMemoryPanel();
    };
    audience?.addEventListener('change', saveContext, { signal });
    stage?.addEventListener('change', saveContext, { signal });
    updateMemoryPanel();

    // Quick suggestions
    const suggestionBtns = suggestions?.querySelectorAll<HTMLButtonElement>('button');
    suggestionBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.text ?? '';
        input.value = text;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 96) + 'px';
        sendMessage(text);
      }, { signal });
    });

    // Send on Enter (Shift+Enter for newline)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (text) sendMessage(text);
      }
    }, { signal });

    // Send button
    sendBtn.addEventListener('click', () => {
      const text = input.value.trim();
      if (text) sendMessage(text);
    }, { signal });

    // Inactivity timer
    window.addEventListener('beforeunload', () => endSession(), { signal });

    function scrollToBottom() {
      scheduleToolMatchRaf(() => {
        messages.scrollTop = messages.scrollHeight;
      });
    }

    function addUserBubble(text: string) {
      const msg = document.createElement('div');
      msg.className = 'chat-msg chat-msg-user';
      msg.innerHTML = `<div class="chat-bubble chat-bubble-user"><p>${escapeHtml(text)}</p></div>`;
      messages.appendChild(msg);
      scrollToBottom();
    }

    function addAgentBubble(html: string) {
      const msg = document.createElement('div');
      msg.className = 'chat-msg chat-msg-agent';
      msg.innerHTML = `<div class="chat-bubble chat-bubble-agent">${html}</div>`;
      messages.appendChild(msg);
      scrollToBottom();
    }

    function addTypingIndicator(): HTMLElement {
      const el = document.createElement('div');
      el.className = 'chat-typing';
      el.id = 'typing-indicator';
      el.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(el);
      scrollToBottom();
      return el;
    }

    function renderPlainResponse(data: MatchResponse): string {
      return `<p>${escapeHtml(data.bridge || '你可以直接说想用 AI 做什么，我帮你判断方向。')}</p>`;
    }

    function renderPromptBox(actionPlan?: ActionPlanResult): string {
      if (!actionPlan?.prompt) return '';
      return `<div class="prompt-box">
        <div class="prompt-head">
          <span class="prompt-label">可复制提示词</span>
          <button class="copy-prompt" type="button" data-copy-prompt="${escapeAttr(actionPlan.prompt)}">复制</button>
        </div>
        <p class="prompt-text">${escapeHtml(actionPlan.prompt)}</p>
      </div>`;
    }

    function renderDiagnosisResponse(data: MatchResponse): string {
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

    function renderComplianceResponse(data: MatchResponse): string {
      let html = `<div class="chat-result-card">`;
      html += `<div class="result-chips"><span class="result-chip">合规转向</span></div>`;
      html += `<div class="result-bridge">${escapeHtml(data.bridge || '这个方向我不能协助。我们可以换一条合规路线，先说说你真正想完成的任务。')}</div>`;
      html += `</div>`;
      return html;
    }

    function renderResultCard(data: MatchResponse): string {
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

    async function sendMessage(text: string) {
      if (!text.trim()) return;

      input.value = '';
      input.style.height = 'auto';
      sendBtn.disabled = true;

      addUserBubble(text);
      conversationHistory.push({ role: 'user', content: text });
      updateMemoryPanel();

      const typing = addTypingIndicator();
      resetInactivityTimer();

      try {
        const payload = {
          ...(sessionId ? { sessionId } : {}),
          sourcePage: '/tools',
          audienceGroup: audience?.value,
          aiStage: stage?.value,
          consentForTopic: consent?.checked ?? true,
          messages: conversationHistory.slice(-16),
        };

        const response = await fetch('/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify(payload),
        });

        // 后端 gate 401：未登录，引导去 /login
        if (response.status === 401) {
          typing.remove();
          isPublic = true;
          window.location.href = '/login';
          return;
        }

        const data = await response.json() as MatchResponse;
        if (signal.aborted) return;
        typing.remove();

        if (!response.ok || data.error) {
          addAgentBubble(`<p>${escapeHtml(data.error || '匹配失败，请稍后再试。')}</p>`);
          conversationHistory.push({ role: 'assistant', content: data.error || '匹配失败' });
          return;
        }

        sessionId = data.sessionId ?? sessionId;
        // 记录 sessionId 到历史
        if (sessionId) try {
          const ids: string[] = JSON.parse(localStorage.getItem("match-session-ids") || "[]");
          if (!ids.includes(sessionId)) { ids.unshift(sessionId); localStorage.setItem("match-session-ids", JSON.stringify(ids.slice(0, 10))); }
        } catch {}

        // Store assistant response in history
        const agentText = data.bridge || data.toolDirection || '已为你匹配结果。';
        conversationHistory.push({ role: 'assistant', content: agentText });
        updateMemoryPanel(data);

        if (data.responseMode === 'recommendation') {
          addAgentBubble(renderResultCard(data));
        } else if (data.responseMode === 'diagnosis') {
          addAgentBubble(renderDiagnosisResponse(data));
        } else if (data.responseMode === 'compliance') {
          addAgentBubble(renderComplianceResponse(data));
        } else {
          addAgentBubble(renderPlainResponse(data));
        }

        if ((data.responseMode === 'recommendation' || data.responseMode === 'compliance') && suggestions && !suggestions.classList.contains('hidden')) {
          suggestions.classList.add('hidden');
        }

        if (data.safety?.piiDetected) {
          status.textContent = '已隐藏敏感信息。';
        } else if (data.responseMode === 'recommendation' && data.safety?.consentForTopic === false) {
          status.textContent = '本次问题不会进入选题库。';
        } else {
          status.textContent = '';
        }
      } catch {
        if (signal.aborted) return;
        typing.remove();
        addAgentBubble(`<p>网络异常，请稍后再试。</p>`);
      } finally {
        if (!signal.aborted) {
          sendBtn.disabled = false;
          input.focus();
        }
      }
    }

    async function endSession() {
      if (!sessionId) return;
      const id = sessionId;
      sessionId = null;
      try {
        await fetch('/api/match-end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: id }),
          keepalive: true,
        });
      } catch { /* ignore */ }
    }

    function resetInactivityTimer() {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = scheduleToolMatchTimer(() => {
        inactivityTimer = null;
        endSession();
      }, 10 * 60 * 1000);
    }
  }

  function escapeHtml(text: string): string {
    const el = document.createElement('span');
    el.textContent = text;
    return el.innerHTML;
  }

  function escapeAttr(text: string): string {
    return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  initToolMatch();
  return cleanupToolMatch;
}

