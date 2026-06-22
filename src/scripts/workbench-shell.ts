/**
 * 工作台（/admin）前端编排
 *
 * 从 admin/index.astro 内联闭包抽离（437 行 → 单文件），与项目既有
 * scripts/ 约定对齐（tool-match-chat.ts / inline-editor.ts 等）。
 *
 * 数据流保持不变：服务端把 WorkItem 字段经 data-* 属性序列化到 DOM，
 * 本模块读取 dataset 并驱动详情面板 / 命令栏 / 执行步骤 / 暂缓表单等交互。
 * 由 admin/index.astro 通过 registerLifecycle 挂载。
 */

export function mountWorkbench(root: HTMLElement): (() => void) | void {
  const abort = new AbortController();
  const { signal } = abort;
  const detail = root.querySelector('[data-detail-panel]') as HTMLElement;
  const items = () => [...root.querySelectorAll<HTMLElement>('[data-decision-item]')];
  let selected = root.querySelector<HTMLElement>('[data-decision-item].is-selected') || items()[0];
  let executionTimer: number | undefined;

  const setText = (selector: string, value = '') => {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  };

  const parseJsonData = <T,>(value: string | undefined, fallback: T): T => {
    if (!value) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  };

  const renderDetailLists = (d: DOMStringMap) => {
    const history = parseJsonData<Array<{ kind: string; actor: string; reason?: string; occurredAt: string }>>(d.history, []);
    const actions = parseJsonData<Array<{ actionId: string; actionType: string; status: string; expectedOutcome: string }>>(d.actions, []);
    const outcomes = parseJsonData<Array<{ result: string; summary: string; observedAt: string }>>(d.outcomes, []);
    const uncertainty = parseJsonData<string[]>(d.uncertainty, []);
    const reasons = parseJsonData<string[]>(d.priorityReasons, []);
    const historyBox = root.querySelector<HTMLElement>('[data-detail-history]');
    if (historyBox) {
      const rows = history.slice(-5).reverse().map(entry => `<article><strong>${entry.kind}</strong><span>${entry.reason || '无补充说明'}</span><small>${entry.actor} · ${new Date(entry.occurredAt).toLocaleString('zh-CN')}</small></article>`);
      historyBox.innerHTML = rows.length ? rows.join('') : '<p>还没有持久化历史；待你作出决定后会写入这里。</p>';
    }
    const nextSteps = root.querySelector<HTMLElement>('[data-next-steps]');
    if (nextSteps) {
      const actionText = actions.length ? `当前行动：${actions.at(-1)!.actionType} · ${actions.at(-1)!.status} · ${actions.at(-1)!.expectedOutcome}` : '还没有 Action：先接受或暂缓当前决定。';
      const outcomeText = outcomes.length ? `最近结果：${outcomes.at(-1)!.result} · ${outcomes.at(-1)!.summary}` : '还没有 Outcome：执行完成后在这里记录现实结果。';
      const nextText = d.nextActionReason || (uncertainty.length ? `不确定性：${uncertainty.join('；')}` : reasons[0] || '下一步会由真实状态和结果派生，不自动执行。');
      nextSteps.innerHTML = `<li><i>1</i><span>${actionText}</span></li><li><i>2</i><span>${outcomeText}</span></li><li><i>3</i><span>${nextText}</span></li>`;
    }
    const outcomeForm = root.querySelector<HTMLFormElement>('[data-outcome-form]');
    if (outcomeForm) {
      const latest = actions.at(-1);
      outcomeForm.hidden = !(d.workItemId && latest && (latest.status === 'completed' || latest.status === 'awaiting-verification'));
      outcomeForm.dataset.workItemId = d.workItemId || '';
      outcomeForm.dataset.actionId = latest?.actionId || '';
      outcomeForm.dataset.evidenceSourceType = d.evidenceSourceType || '';
      outcomeForm.dataset.evidenceSourceId = d.evidenceSourceId || '';
      outcomeForm.dataset.evidenceSummary = d.evidenceBody || d.summary || '';
    }
  };

  const selectItem = (item: HTMLElement) => {
    selected?.classList.remove('is-selected');
    item.classList.add('is-selected');
    selected = item;
    const d = item.dataset;
    setText('[data-detail-source]', d.source);
    setText('[data-detail-title]', d.title);
    setText('[data-detail-summary]', d.summary);
    setText('[data-detail-evidence]', d.evidence);
    setText('[data-detail-evidence-title]', d.evidenceTitle);
    setText('[data-detail-evidence-body]', d.evidenceBody);
    setText('[data-detail-start]', d.action || '开始处理');
    setText('[data-confirm-action]', d.action || '建立一个可验证的处理任务');
    renderDetailLists(d);
    const href = root.querySelector<HTMLAnchorElement>('[data-detail-href]');
    if (href) href.href = d.href || '#';
    detail.hidden = false;
    detail.animate([{ opacity: .55, transform: 'translateX(12px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 210, easing: 'ease-out' });
  };

  const bindItem = (item: HTMLElement) => {
    item.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('button, a')) return;
      selectItem(item);
    }, { signal });
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectItem(item); }
    }, { signal });
  };
  items().forEach(bindItem);
  if (selected) renderDetailLists(selected.dataset);

  root.querySelector('[data-detail-close]')?.addEventListener('click', () => { detail.hidden = true; }, { signal });
  root.querySelector('[data-evidence-focus]')?.addEventListener('click', () => {
    (root.querySelector('[data-detail-tab="evidence"]') as HTMLButtonElement)?.click();
    detail.animate([{ transform: 'scale(.995)' }, { transform: 'scale(1)' }], { duration: 180 });
  }, { signal });

  root.querySelectorAll<HTMLButtonElement>('[data-detail-tab]').forEach(button => button.addEventListener('click', () => {
    root.querySelectorAll('[data-detail-tab]').forEach(tab => tab.classList.toggle('is-active', tab === button));
    root.querySelectorAll<HTMLElement>('[data-detail-view]').forEach(view => { view.hidden = view.dataset.detailView !== button.dataset.detailTab; });
  }, { signal }));

  root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(button => button.addEventListener('click', () => {
    root.querySelectorAll('[data-filter]').forEach(tab => tab.classList.toggle('is-active', tab === button));
    const filter = button.dataset.filter;
    let visible = 0;
    items().forEach(item => {
      const show = filter === 'all' || item.dataset.state === filter;
      item.hidden = !show;
      if (show) visible += 1;
    });
    const empty = root.querySelector<HTMLElement>('[data-queue-empty]');
    if (empty) empty.hidden = visible > 0;
  }, { signal }));

  const confirm = root.querySelector<HTMLElement>('[data-decision-confirm]');
  const openConfirm = () => {
    if (!confirm) return;
    confirm.hidden = false;
    confirm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    confirm.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
  };
  root.querySelector('[data-start-decision]')?.addEventListener('click', openConfirm, { signal });
  root.querySelector('[data-detail-start]')?.addEventListener('click', openConfirm, { signal });
  root.querySelector('[data-confirm-close]')?.addEventListener('click', () => { if (confirm) confirm.hidden = true; }, { signal });
  const check = root.querySelector<HTMLInputElement>('[data-confirm-check]');
  const submit = root.querySelector<HTMLButtonElement>('[data-confirm-submit]');
  check?.addEventListener('change', () => { if (submit) submit.disabled = !check.checked; }, { signal });

  submit?.addEventListener('click', () => {
    if (confirm) confirm.hidden = true;
    const execution = root.querySelector<HTMLElement>('[data-execution]');
    if (!execution) return;
    execution.hidden = false;
    execution.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    const steps = [...execution.querySelectorAll<HTMLElement>('[data-step]')];
    let step = 0;
    steps.forEach(node => { node.className = ''; node.querySelector('small')!.textContent = '等待'; });
    const run = async () => {
      steps.forEach((node, index) => {
        node.classList.toggle('is-done', index < step);
        node.classList.toggle('is-running', index === step);
        node.querySelector('small')!.textContent = index < step ? '完成' : index === step ? '进行中' : '等待';
      });
      if (step >= steps.length) {
        clearInterval(executionTimer);
        // P0-D：完成后把真实 NeedCase 作为证据创建并接受 WorkItem，再创建行动。
        // 失败时明确提示，不伪造"草稿已生成"成功状态。
        setText('.execution-head span', '正在写入工作项…');
        const result = await ensureWorkItemForSelected({ outcome: 'accepted', reason: '确认证据，开始执行' });
        if (!result.ok || !result.workItemId) {
          execution.classList.add('is-complete');
          setText('.execution-head span', `写入失败：${result.error}`);
          return;
        }
        // 创建行动（产出内容/改功能由事项来源决定）
        const d = selected?.dataset;
        const actionType = d?.actionType || (d?.source === '系统事件' ? 'review-incident' : 'create-content');
        const actionRes = await fetch('/api/admin/actions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            workItemId: result.workItemId,
            actionType,
            targetType: d?.targetType || (actionType === 'review-incident' ? 'incident' : 'content'),
            targetId: d?.targetId || undefined,
            expectedOutcome: d?.title ? `基于"${d.title}"产出可验证的方案` : '产出可验证的方案',
          }),
        });
        if (!actionRes.ok) {
          const err = await actionRes.json().catch(() => ({}));
          execution.classList.add('is-complete');
          setText('.execution-head span', `行动创建失败：${err.error || actionRes.status}`);
          return;
        }
        execution.classList.add('is-complete');
        if (selected) {
          selected.dataset.workItemId = result.workItemId;
          const actionData = await actionRes.json().catch(() => ({}));
          if (actionData.item) {
            selected.dataset.state = actionData.item.status === 'awaiting-verification' ? 'awaiting-verification' : 'acting';
            selected.dataset.actions = JSON.stringify(actionData.item.actions || []);
            selected.dataset.history = JSON.stringify(actionData.item.history || []);
            renderDetailLists(selected.dataset);
          }
        }
        setText('.execution-head span', '工作项已建立，等待你执行并验证');
      }
      step += 1;
    };
    run();
    executionTimer = window.setInterval(run, 850);
  }, { signal });

  root.querySelector('[data-stop-execution]')?.addEventListener('click', () => {
    window.clearInterval(executionTimer);
    const execution = root.querySelector<HTMLElement>('[data-execution]');
    if (execution) execution.hidden = true;
  }, { signal });

  // P0-D：把真实 NeedCase 作为证据创建 WorkItem 提案（不写 localStorage 业务状态）。
  // 失败时保留当前输入并明确提示，不伪造"已暂缓"成功。
  const ensureWorkItemForSelected = async (decide?: { outcome: 'accepted' | 'paused' | 'rejected'; reason: string }) => {
    if (!selected) return { ok: false as const, error: '未选择事项' };
    const d = selected.dataset;
    if (d.workItemId) {
      if (!decide) return { ok: true as const, workItemId: d.workItemId };
      const decideRes = await fetch(`/api/admin/decisions/${d.workItemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decide }),
      });
      if (!decideRes.ok) {
        const err = await decideRes.json().catch(() => ({}));
        return { ok: false as const, error: err.error || `决定失败（${decideRes.status}）`, workItemId: d.workItemId };
      }
      const decided = await decideRes.json();
      return { ok: true as const, workItemId: d.workItemId, item: decided.item };
    }
    const sourceNeedCaseId = (d.id || '').replace(/^need-/, '');
    const isNeedCase = d.id?.startsWith('need-') && sourceNeedCaseId.length > 0;
    const sourceType = d.evidenceSourceType || (isNeedCase ? 'need-case' : undefined);
    const sourceId = d.evidenceSourceId || (isNeedCase ? sourceNeedCaseId : undefined);
    const evidenceRefs = sourceType && sourceId ? [{
      evidenceId: `ev_${sourceType.replace(/-/g, '_')}_${sourceId}`,
      sourceType,
      sourceId,
      occurredAt: d.evidenceOccurredAt || new Date().toISOString(),
      summary: d.evidenceBody || d.summary || '原始需求',
      qualityStatus: 'verified-source' as const,
    }] : [];
    // 命令栏 AI 草稿无真实证据，按 hai-razor 只能是 proposal，不允许直接决定。
    if (evidenceRefs.length === 0 && decide) {
      return { ok: false as const, error: '该事项无现实证据，不能直接作出决定。' };
    }
    const queue = d.source === '用户需求' || d.source === '内容反馈' ? 'user-demand'
      : d.source === 'Walker 主张' ? 'walker-thesis'
      : d.source === '系统事件' ? 'system-event' : 'ai-asset';
    const createRes = await fetch('/api/admin/decisions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        queue,
        title: d.title || '未命名事项',
        summary: d.summary || '',
        priorityBand: 'now',
        evidenceRefs,
        requestDecision: Boolean(decide),
      }),
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      return { ok: false as const, error: err.error || `创建工作项失败（${createRes.status}）` };
    }
    const created = await createRes.json();
    const workItemId = created.item?.workItemId;
    if (!workItemId) return { ok: false as const, error: '未返回工作项 ID' };
    if (decide) {
      const decideRes = await fetch(`/api/admin/decisions/${workItemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decide }),
      });
      if (!decideRes.ok) {
        const err = await decideRes.json().catch(() => ({}));
        return { ok: false as const, error: err.error || `决定失败（${decideRes.status}）`, workItemId };
      }
      const decided = await decideRes.json();
      return { ok: true as const, workItemId, item: decided.item };
    }
    return { ok: true as const, workItemId, item: created.item };
  };

  const outcomeForm = root.querySelector<HTMLFormElement>('[data-outcome-form]');
  outcomeForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const status = outcomeForm.querySelector<HTMLElement>('[data-outcome-status]');
    const submit = outcomeForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const result = (outcomeForm.elements.namedItem('result') as HTMLSelectElement).value;
    const summaryInput = outcomeForm.elements.namedItem('summary') as HTMLTextAreaElement;
    const summary = summaryInput.value.trim();
    if (!summary) return summaryInput.focus();
    if (submit) submit.disabled = true;
    if (status) status.hidden = true;
    try {
      const evidenceSourceType = outcomeForm.dataset.evidenceSourceType || 'content-feedback';
      const evidenceSourceId = outcomeForm.dataset.evidenceSourceId || outcomeForm.dataset.actionId || 'manual-outcome';
      const res = await fetch('/api/admin/outcomes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workItemId: outcomeForm.dataset.workItemId,
          actionId: outcomeForm.dataset.actionId,
          result,
          summary,
          evidenceRefs: [{
            evidenceId: `ev_outcome_${Date.now()}`,
            sourceType: evidenceSourceType,
            sourceId: evidenceSourceId,
            occurredAt: new Date().toISOString(),
            summary: outcomeForm.dataset.evidenceSummary || summary,
            qualityStatus: 'verified-source',
          }],
          nextDecisionSuggested: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (status) { status.textContent = `保存失败：${data.error || res.status}。输入已保留。`; status.hidden = false; }
        return;
      }
      if (selected) {
        selected.dataset.state = 'ignored';
        selected.dataset.outcomes = JSON.stringify(data.item?.outcomes || []);
        selected.dataset.history = JSON.stringify(data.item?.history || []);
        selected.dataset.nextActionReason = '结果已记录，可继续创建下一步或结束观察。';
        renderDetailLists(selected.dataset);
      }
      summaryInput.value = '';
      if (status) { status.textContent = 'Outcome 已保存，当前事项已进入结果历史。'; status.hidden = false; }
    } catch {
      if (status) { status.textContent = '网络异常，请重试。输入已保留。'; status.hidden = false; }
    } finally {
      if (submit) submit.disabled = false;
    }
  }, { signal });

  const pauseForm = root.querySelector<HTMLFormElement>('[data-pause-form]');
  const pauseStatus = root.querySelector<HTMLElement>('[data-pause-status]');
  const closePauseForm = () => {
    if (pauseForm) pauseForm.hidden = true;
    if (pauseStatus) pauseStatus.hidden = true;
  };
  root.querySelector('[data-pause]')?.addEventListener('click', () => {
    if (!pauseForm || !selected) return;
    pauseForm.hidden = false;
    const input = pauseForm.elements.namedItem('reason') as HTMLTextAreaElement;
    input.focus();
  }, { signal });
  root.querySelectorAll('[data-pause-cancel]').forEach(button => button.addEventListener('click', closePauseForm, { signal }));
  pauseForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selected) return;
    const input = pauseForm.elements.namedItem('reason') as HTMLTextAreaElement;
    const reason = input.value.trim();
    if (!reason) return input.focus();
    const submit = pauseForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) submit.disabled = true;
    if (pauseStatus) pauseStatus.hidden = true;
    const result = await ensureWorkItemForSelected({ outcome: 'paused', reason });
    if (submit) submit.disabled = false;
    if (!result.ok) {
      if (pauseStatus) {
        pauseStatus.textContent = `暂缓失败：${result.error}。你的输入仍在，可以直接重试。`;
        pauseStatus.hidden = false;
      }
      return;
    }
    if (selected) {
      selected.dataset.state = 'paused';
      selected.dataset.workItemId = result.workItemId;
      if (result.item) {
        selected.dataset.history = JSON.stringify(result.item.history || []);
        selected.dataset.priorityReasons = JSON.stringify(result.item.priorityReasons || []);
      }
      renderDetailLists(selected.dataset);
    }
    selected?.classList.add('is-paused');
    setText('.status-pill', '已暂缓');
    input.value = '';
    closePauseForm();
  }, { signal });

  const commandForm = root.querySelector<HTMLFormElement>('[data-command-form]');
  const commandPreview = root.querySelector<HTMLElement>('[data-command-preview]');
  commandForm?.addEventListener('submit', event => {
    event.preventDefault();
    const input = commandForm.elements.namedItem('command') as HTMLInputElement;
    const value = input.value.trim();
    if (!value || !commandPreview) return;
    setText('[data-command-title]', value);
    const chips = root.querySelector<HTMLElement>('[data-command-chips]');
    const tags = [value.includes('文章') || value.includes('内容') ? '内容' : value.includes('功能') ? '功能' : '待判断', value.includes('今天') ? '今天' : '未设期限', '需你授权'];
    if (chips) chips.innerHTML = tags.map(tag => `<span>${tag}</span>`).join('');
    commandPreview.hidden = false;
    commandPreview.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 200 });
  }, { signal });
  root.querySelector('[data-command-cancel]')?.addEventListener('click', () => { if (commandPreview) commandPreview.hidden = true; }, { signal });
  root.querySelector('[data-command-keep]')?.addEventListener('click', () => {
    if (!commandPreview || !commandForm) return;
    const command = (commandForm.elements.namedItem('command') as HTMLInputElement).value.trim();
    commandPreview.hidden = true;
    const count = root.querySelector('[data-ai-count]');
    if (count) count.textContent = '1';
    const existing = root.querySelector<HTMLElement>('[data-id="ai-command-draft"]');
    const template = root.querySelector<HTMLTemplateElement>('[data-ai-template]');
    const draft = existing || template?.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    if (draft && !existing) {
      draft.dataset.id = 'ai-command-draft';
      draft.dataset.source = 'AI 提案 · 未保存';
      draft.dataset.state = 'ai';
      draft.dataset.evidence = '0 条现实证据 · 来自你的命令';
      draft.dataset.evidenceTitle = '生成依据';
      draft.dataset.evidenceBody = `命令：${command}`;
      draft.dataset.action = '检查提案';
      draft.dataset.href = '/admin';
      root.querySelector('[data-decision-list]')?.insertBefore(draft, root.querySelector('[data-queue-empty]'));
      bindItem(draft);
    }
    if (draft) {
      draft.dataset.title = command;
      draft.dataset.summary = 'AI 只把你的自然语言整理成待检查的行动草稿；它尚未引用现实证据，也没有写入后台。选择"检查提案"后，需绑定真实证据才能创建正式工作项。';
      const title = draft.querySelector('h3');
      if (title) title.textContent = command;
      selectItem(draft);
    }
    // P0-D：AI 命令草稿无真实证据，按 hai-razor 只能是 proposal，且必须在绑定证据后才持久化。
    // 这里不再写 localStorage 伪造持久化；草稿仅停留在当前会话，刷新后清空。
  }, { signal });
  root.querySelectorAll<HTMLButtonElement>('[data-demo-create], [data-demo-clear]').forEach(button => {
    button.addEventListener('click', async () => {
      const status = root.querySelector<HTMLElement>('[data-demo-status]');
      const isCreate = button.hasAttribute('data-demo-create');
      button.disabled = true;
      if (status) status.textContent = isCreate ? '正在生成模拟场景…' : '正在清理模拟数据…';
      try {
        const res = await fetch('/api/admin/demo-scenario', { method: isCreate ? 'POST' : 'DELETE' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (status) status.textContent = `操作失败：${data.error || res.status}`;
          return;
        }
        if (status) status.textContent = isCreate ? '模拟闭环已生成，刷新后可在工作台查看。' : '模拟数据已清理，刷新后生效。';
      } catch {
        if (status) status.textContent = '网络异常，请重试。';
      } finally {
        button.disabled = false;
      }
    }, { signal });
  });
  return () => {
    abort.abort();
    if (executionTimer !== undefined) window.clearInterval(executionTimer);
  };
}
