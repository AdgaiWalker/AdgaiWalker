/**
 * Agent 工坊与模型装配 (Agent Workbench & Model Settings)
 *
 * 职责：
 * 1. 实体智能体角色切换与增减 (小影内置保护 + 自定义角色)
 * 2. 角色系统提示词 (Persona) 管理与一键复制 (Apple HUD 触感反馈)
 * 3. 1:1 DeepSeek Harness API 提供方与模型目录配置 (Base URL, 协议, Key, 目录)
 * 4. Markdown 本地文件直调与 B 处运行轨迹 (Trace 甘特图、时序指标、工具审计)
 */

import { useCallback, useEffect, useState } from 'react';
import {
  adminApi,
  type AgentRunResult,
  type AgentUnitRecord,
  type ModelProviderRecord,
} from '../api/admin-api';
import {
  Activity,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FileCode,
  PenTool,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { AppleSheetModal } from '../components/AppleSheetModal';

// ============================================================================
// 常量与配置 (P4: 消除魔法数字)
// ============================================================================
export const TOAST_DURATION_MS = 2500;
export const COPY_RESET_DELAY_MS = 2200;
export const PING_SIMULATION_DELAY_MS = 500;
export const RUN_SIMULATION_DELAY_MS = 700;

export const TIMELINE_SEGMENTS = [
  { key: 'input', label: '输入装载 (120ms)', width: '8%', className: 'seg-input' },
  { key: 'model1', label: '思考链推理 (620ms)', width: '48%', className: 'seg-model' },
  { key: 'tool1', label: 'tool-fs 文件抓取 (180ms)', width: '14%', className: 'seg-tool' },
  { key: 'model2', label: '文本生成 (340ms)', width: '20%', className: 'seg-model' },
  { key: 'tool2', label: 'tool-editor 校验 (160ms)', width: '10%', className: 'seg-tool' },
] as const;

// P5: 图标映射表取代嵌套三元运算符
const ICON_MAP = {
  bot: Bot,
  'pen-tool': PenTool,
  sparkles: Sparkles,
} as const;

export interface ModelItem {
  id: string;
  tags: string[];
}

export interface AgentUnit {
  id: string;
  name: string;
  isSystem: boolean;
  icon: keyof typeof ICON_MAP;
  prompt: string;
  providerId?: string | null;
  baseUrl: string;
  apiProtocol: 'openai-completions' | 'deepseek-native' | 'anthropic-messages';
  apiKey: string;
  activeModel: string;
  models: ModelItem[];
}

export const INITIAL_AGENTS: Record<string, AgentUnit> = {
  xiaoying: {
    id: 'xiaoying',
    name: '小影 (系统内置)',
    isSystem: true,
    icon: 'bot',
    prompt:
      '你是小影，个人站 Walker 的专属管家与站内助手。以第三人称介绍 duola 与这个站，回答基于 content/log 真实文章，不捏造事实。引用必须包含真实文章 slug。',
    baseUrl: 'https://api.deepseek.com/v1',
    apiProtocol: 'deepseek-native',
    apiKey: 'sk-dsh-production-mock-key-xiaoying',
    activeModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', tags: ['通用', '128K'] },
      { id: 'deepseek-reasoner', tags: ['思考', 'R1推理'] },
    ],
  },
  artisan: {
    id: 'artisan',
    name: '文章工匠',
    isSystem: false,
    icon: 'pen-tool',
    prompt:
      '你是文章工匠，专门协助站主精修 Markdown 长文，专注于逻辑挑刺、金句提炼与行文结构重构。遇到论述漏洞请直截了当指出，并给出代码块式修改补丁。',
    baseUrl: 'https://api.stepfun.com/step_plan',
    apiProtocol: 'anthropic-messages',
    apiKey: 'sk-step-mock-key-artisan',
    activeModel: 'step-3.7-flash',
    models: [{ id: 'step-3.7-flash', tags: ['长文本', '256K'] }],
  },
};

/**
 * 将后端返回的智能体与供应商记录转换为前端 AgentUnit 字典
 */
export function buildAgentUnitMap(
  remoteAgents: AgentUnitRecord[],
  remoteProviders: ModelProviderRecord[],
): Record<string, AgentUnit> {
  if (!remoteAgents || remoteAgents.length === 0) {
    return INITIAL_AGENTS;
  }

  const providerMap: Record<string, ModelProviderRecord> = {};
  for (const p of remoteProviders) {
    providerMap[p.id] = p;
  }
  const defaultProvider = remoteProviders[0];

  const agentMap: Record<string, AgentUnit> = {};
  for (const a of remoteAgents) {
    const provider = a.providerId ? providerMap[a.providerId] : defaultProvider;
    const models: ModelItem[] =
      provider?.models && provider.models.length > 0
        ? provider.models.map((m) => ({ id: m.id, tags: m.tags || ['通用'] }))
        : [{ id: a.modelId || 'deepseek-chat', tags: ['通用'] }];

    const iconKey = (
      a.icon && a.icon in ICON_MAP ? a.icon : 'bot'
    ) as keyof typeof ICON_MAP;

    agentMap[a.id] = {
      id: a.id,
      name: a.name,
      isSystem: Boolean(a.isSystem),
      icon: iconKey,
      prompt: a.prompt || '',
      providerId: a.providerId ?? provider?.id ?? null,
      baseUrl: provider?.baseUrl || 'https://api.deepseek.com/v1',
      apiProtocol:
        (provider?.apiFormat as AgentUnit['apiProtocol']) || 'deepseek-native',
      apiKey: provider?.last4
        ? provider.last4.startsWith('sk-')
          ? provider.last4
          : `sk-****${provider.last4}`
        : '',
      activeModel: a.modelId || models[0]?.id || 'deepseek-chat',
      models,
    };
  }
  return agentMap;
}

/**
 * 确定激活的智能体 ID（优先小影，或指定 ID，或首位）
 */
export function selectInitialAgentId(
  agentMap: Record<string, AgentUnit>,
  preferredId?: string,
): string {
  if (preferredId && agentMap[preferredId]) {
    return preferredId;
  }
  if (agentMap.xiaoying) {
    return 'xiaoying';
  }
  const keys = Object.keys(agentMap);
  return keys[0] || 'xiaoying';
}

// ============================================================================
// 子组件 1: 顶部角色药丸切换栏 (P1 拆分 + P2/P5 命名与映射)
// ============================================================================
interface AgentCapsuleBarProps {
  agents: AgentUnit[];
  currentAgentId: string;
  onSelectAgent: (id: string) => void;
  onOpenNewAgentModal: () => void;
}

function AgentCapsuleBar({
  agents,
  currentAgentId,
  onSelectAgent,
  onOpenNewAgentModal,
}: AgentCapsuleBarProps) {
  return (
    <div className="agent-capsule-bar">
      {agents.map((agent) => {
        const isActive = agent.id === currentAgentId;
        const IconComponent = ICON_MAP[agent.icon] ?? Bot;
        return (
          <div
            key={agent.id}
            className={`agent-pill${isActive ? ' active' : ''}`}
            onClick={() => onSelectAgent(agent.id)}
          >
            <div className="agent-pill-icon">
              <IconComponent size={16} />
            </div>
            <div className="agent-pill-meta">
              <div className="agent-pill-name">{agent.name}</div>
              <div className="agent-pill-model">{agent.activeModel}</div>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="agent-pill agent-pill-add"
        onClick={onOpenNewAgentModal}
      >
        <Plus size={15} />
        <span>新增角色</span>
      </button>
    </div>
  );
}

// ============================================================================
// 子组件 2: 角色提示词卡片 (P1 拆分 + P2 命名)
// ============================================================================
interface AgentPersonaCardProps {
  currentAgent: AgentUnit;
  isCopied: boolean;
  onUpdatePrompt: (prompt: string) => void;
  onCopyPrompt: () => void;
}

function AgentPersonaCard({
  currentAgent,
  isCopied,
  onUpdatePrompt,
  onCopyPrompt,
}: AgentPersonaCardProps) {
  return (
    <div className="persona-box">
      <div className="persona-header">
        <span className="persona-label">
          <Sparkles size={14} style={{ color: '#8b5cf6' }} />
          角色提示词 (系统 Persona)
        </span>
        <div className="persona-actions">
          <button
            type="button"
            className={`btn-copy-prompt${isCopied ? ' copied' : ''}`}
            onClick={onCopyPrompt}
            title="复制提示词直接发送给外部 AI (ChatGPT/Claude/DeepSeek) 接入"
          >
            {isCopied ? <Check size={13} /> : <Copy size={13} />}
            <span>{isCopied ? '已复制到剪贴板' : '复制提示词'}</span>
          </button>
        </div>
      </div>
      <textarea
        className="persona-textarea"
        rows={3}
        value={currentAgent.prompt}
        onChange={(e) => onUpdatePrompt(e.target.value)}
        placeholder="定义 Agent 的角色定位、回答准则与方法论..."
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '0.4rem',
          paddingTop: '0.4rem',
          borderTop: '1px solid rgba(0, 0, 0, 0.05)',
        }}
      >
        <span className="persona-stats">{currentAgent.prompt.length} 字</span>
        <span style={{ fontSize: '0.69rem', color: 'var(--adm-muted)' }}>
          支持系统级 Markdown 与外部 AI 直连
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件 3: 1:1 DSH 模型与提供方配置 (P1 拆分 + P2 命名)
// ============================================================================
interface ModelCatalogSectionProps {
  currentAgent: AgentUnit;
  isPinging: boolean;
  onUpdateAgent: (patch: Partial<AgentUnit>) => void;
  onSetActiveModel: (modelId: string) => void;
  onRemoveModel: (index: number) => void;
  onOpenAddModelModal: () => void;
  onPingModel: () => void;
  onSaveSettings: () => void;
}

function ModelCatalogSection({
  currentAgent,
  isPinging,
  onUpdateAgent,
  onSetActiveModel,
  onRemoveModel,
  onOpenAddModelModal,
  onPingModel,
  onSaveSettings,
}: ModelCatalogSectionProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="dsh-provider-section">
      <div className="dsh-provider-header">
        <span>模型与提供方配置 (DSH 原生)</span>
        <button
          type="button"
          className="apple-btn apple-btn-secondary apple-btn-sm"
          onClick={onPingModel}
          disabled={isPinging}
        >
          {isPinging ? (
            <Activity size={13} className="spin" />
          ) : (
            <Zap size={13} style={{ color: '#f97316' }} />
          )}
          <span>{isPinging ? '探测中…' : '探测接口'}</span>
        </button>
      </div>

      {/* API 地址 (Base URL) */}
      <div className="field-group">
        <label className="field-label">API 地址 (Base URL)</label>
        <input
          type="text"
          className="apple-input"
          value={currentAgent.baseUrl}
          onChange={(e) => onUpdateAgent({ baseUrl: e.target.value })}
          placeholder="https://api.deepseek.com/v1"
        />
      </div>

      {/* API 协议 & API 密钥 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr', gap: '0.65rem' }}>
        <div className="field-group">
          <label className="field-label">API 协议</label>
          <select
            className="apple-select"
            value={currentAgent.apiProtocol}
            onChange={(e) =>
              onUpdateAgent({
                apiProtocol: e.target.value as AgentUnit['apiProtocol'],
              })
            }
          >
            <option value="openai-completions">openai-completions</option>
            <option value="deepseek-native">deepseek-native</option>
            <option value="anthropic-messages">anthropic-messages</option>
          </select>
        </div>
        <div className="field-group">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <label className="field-label" style={{ margin: 0 }}>
              API 密钥
            </label>
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '0 2px',
                color: 'var(--adm-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '2px',
                fontSize: '0.68rem',
              }}
              title={showKey ? '隐藏密钥' : '显示密钥'}
            >
              {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
              <span>{showKey ? '隐藏' : '显示'}</span>
            </button>
          </div>
          <input
            type={showKey ? 'text' : 'password'}
            className="apple-input"
            value={currentAgent.apiKey}
            onChange={(e) => onUpdateAgent({ apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </div>
      </div>

      {/* 模型目录 (1:1 DSH Model Catalog) */}
      <div className="field-group" style={{ marginBottom: '0.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.35rem',
          }}
        >
          <label className="field-label" style={{ margin: 0 }}>
            模型目录
          </label>
          <span className="field-hint">点击设为当前调用模型</span>
        </div>
        <div className="dsh-catalog-box">
          {currentAgent.models.map((model, index) => {
            const isActive = model.id === currentAgent.activeModel;
            return (
              <div
                key={model.id}
                className={`dsh-model-row${isActive ? ' is-active' : ''}`}
              >
                <div
                  className="dsh-model-left"
                  onClick={() => onSetActiveModel(model.id)}
                  title="点击设为默认调用模型"
                >
                  <span className="active-dot" />
                  <span className="dsh-model-id">{model.id}</span>
                  {isActive ? (
                    <span className="dsh-badge active-badge">当前启用</span>
                  ) : null}
                  {model.tags.map((tag) => (
                    <span key={tag} className="dsh-badge">
                      {tag}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="apple-btn apple-btn-secondary apple-btn-sm"
                  onClick={() => onRemoveModel(index)}
                  title="删除此模型"
                  style={{ border: 'none', padding: '3px 5px', background: 'transparent' }}
                >
                  <Trash2 size={13} style={{ color: 'var(--adm-muted)' }} />
                </button>
              </div>
            );
          })}
        </div>

        {/* + 添加模型 (1:1 DSH 按钮) */}
        <button
          type="button"
          className="apple-btn apple-btn-secondary"
          onClick={onOpenAddModelModal}
          style={{ width: '100%', height: '32px', fontSize: '0.76rem' }}
        >
          <Plus size={14} /> 添加模型
        </button>
      </div>

      {/* 保存配置按钮 */}
      <div style={{ marginTop: '0.9rem' }}>
        <button
          type="button"
          className="apple-btn apple-btn-dark"
          onClick={onSaveSettings}
          style={{ width: '100%', height: '38px' }}
        >
          <Check size={15} /> 保存模型配置
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 子组件 4: 右栏文件直调与 Trace 轨迹展示 (P1 拆分 + P4 数据驱动甘特图)
// ============================================================================
interface TraceRunnerSectionProps {
  targetFile: string;
  instruction: string;
  currentAgentName: string;
  currentAgentId: string;
  isRunning: boolean;
  isJsonlVisible: boolean;
  availableFiles?: string[];
  latestRun?: AgentRunResult | null;
  rawJsonlText?: string;
  onChangeTargetFile: (file: string) => void;
  onChangeInstruction: (instruction: string) => void;
  onRunAgent: () => void;
  onToggleJsonl: () => void;
}

function TraceRunnerSection({
  targetFile,
  instruction,
  currentAgentName,
  currentAgentId,
  isRunning,
  isJsonlVisible,
  availableFiles,
  latestRun,
  rawJsonlText,
  onChangeTargetFile,
  onChangeInstruction,
  onRunAgent,
  onToggleJsonl,
}: TraceRunnerSectionProps) {
  const fileList =
    availableFiles && availableFiles.length > 0
      ? availableFiles
      : [
          'content/log/2026-09-08-agent-workbench.md',
          'content/log/2026-09-03-one-person-sustainable.md',
        ];

  return (
    <div className="apple-card">
      <div className="card-header-row">
        <h3 className="card-title">
          <Activity size={17} style={{ color: 'var(--adm-ok)' }} />
          <span>运行轨迹与结果 (Trace · B 处可观测)</span>
        </h3>
        <button
          type="button"
          className="apple-btn apple-btn-secondary apple-btn-sm"
          onClick={onToggleJsonl}
          title="查看底层 append-only JSONL"
        >
          <FileCode size={13} /> trace.jsonl
        </button>
      </div>

      {/* DSH 极简悬浮式执行条 */}
      <div className="runner-composer">
        <div className="runner-composer-top">
          <select
            className="runner-file-select"
            value={targetFile}
            onChange={(e) => onChangeTargetFile(e.target.value)}
          >
            {fileList.map((file) => (
              <option key={file} value={file}>
                📁 {file.replace(/^content\/log\//, '')}
              </option>
            ))}
          </select>
          <span style={{ fontSize: '0.73rem', color: 'var(--adm-muted)' }}>
            当前角色：<strong style={{ color: 'var(--adm-fg)' }}>{currentAgentName}</strong>
          </span>
        </div>
        <textarea
          className="runner-input"
          rows={2}
          value={instruction}
          onChange={(e) => onChangeInstruction(e.target.value)}
          placeholder="输入针对选中文档的具体任务指令..."
        />
        <div className="runner-composer-bottom">
          <span>只读沙盒 · 进程随叫随起 · 跑完即焚</span>
          <button
            type="button"
            className="apple-btn apple-btn-primary apple-btn-sm"
            onClick={onRunAgent}
            disabled={isRunning}
          >
            {isRunning ? <Activity size={13} className="spin" /> : <Play size={13} />}
            <span>{isRunning ? '运行中…' : '立即执行'}</span>
          </button>
        </div>
      </div>

      {/* 时序流甘特图 (W1-6: 真实 timeline 数据驱动) */}
      <div className="timeline-card">
        {latestRun && latestRun.timeline && latestRun.timeline.length > 0 ? (
          <>
            <div className="timeline-header">
              <span>
                <strong>时序分解</strong> · 总耗时 {latestRun.elapsedMs}ms
              </span>
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  fontSize: '0.71rem',
                  flexWrap: 'wrap',
                }}
              >
                {latestRun.timeline.map((seg) => (
                  <span key={seg.key}>
                    <span style={{ color: seg.color }}>■</span> {seg.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="timeline-track">
              {latestRun.timeline.map((segment) => (
                <div
                  key={segment.key}
                  style={{
                    width: `${segment.percent}%`,
                    backgroundColor: segment.color,
                    height: '100%',
                    transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  title={`${segment.label}: ${segment.elapsedMs}ms (${segment.percent}%)`}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="timeline-header">
              <span>
                <strong>时序分解</strong> · 总耗时 1,420ms (初始样例)
              </span>
              <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.71rem' }}>
                <span>
                  <span style={{ color: '#3b82f6' }}>■</span> 输入 120ms
                </span>
                <span>
                  <span style={{ color: '#8b5cf6' }}>■</span> 模型推理 1,120ms
                </span>
                <span>
                  <span style={{ color: '#f97316' }}>■</span> 工具 180ms
                </span>
              </div>
            </div>
            <div className="timeline-track">
              {TIMELINE_SEGMENTS.map((segment) => (
                <div
                  key={segment.key}
                  className={segment.className}
                  style={{ width: segment.width }}
                  title={segment.label}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 遥测指标 (Apple Activity Grid, W1-6 真实指标回显) */}
      <div className="metrics-grid">
        <div className="metric-cell">
          <div className="metric-title">总执行耗时</div>
          <div className="metric-num">
            {latestRun ? `${latestRun.elapsedMs} ms` : '1,420 ms'}
          </div>
        </div>
        <div className="metric-cell">
          <div className="metric-title">执行步数</div>
          <div className="metric-num">
            {latestRun
              ? `${latestRun.metrics.turns} 轮 · ${latestRun.metrics.steps} 步`
              : '2 轮 · 4 步'}
          </div>
        </div>
        <div className="metric-cell">
          <div className="metric-title">吐字速率</div>
          <div className="metric-num">
            {latestRun ? `${latestRun.metrics.tokPerSec} tok/s` : '62 tok/s'}
          </div>
        </div>
        <div className="metric-cell">
          <div className="metric-title">Prompt 缓存命中</div>
          <div
            className={`metric-num${
              (latestRun?.metrics?.cacheHitPercent ?? 87.5) >= 70 ? ' green' : ''
            }`}
          >
            {latestRun ? `${latestRun.metrics.cacheHitPercent}%` : '87.5%'}
          </div>
        </div>
      </div>

      {/* 逐轮审计卡片 */}
      <div className="audit-turn">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.71rem',
            color: 'var(--adm-muted)',
            marginBottom: '0.3rem',
          }}
        >
          <span>
            <strong style={{ color: '#f97316' }}>tool-fs</strong> 读取本地 Markdown 文件
          </span>
          <span>
            耗时{' '}
            {latestRun?.timeline?.find((t) => t.key === 'tool_fs')?.elapsedMs ?? 32}
            ms · 成功
          </span>
        </div>
        <div
          style={{
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            fontSize: '0.74rem',
            background: '#fbfbfd',
            padding: '0.4rem 0.6rem',
            borderRadius: '6px',
            color: 'var(--adm-muted)',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        >
          {`tool-fs { path: "${latestRun?.targetFile || targetFile}" } ➔ 沙盒安全拦截与只读返回`}
        </div>
      </div>

      <div className="audit-turn">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.71rem',
            color: 'var(--adm-muted)',
            marginBottom: '0.3rem',
          }}
        >
          <span>
            <strong style={{ color: '#8b5cf6' }}>{currentAgentName}</strong> 助手思考与产出
          </span>
          <span>
            耗时{' '}
            {latestRun?.timeline?.find((t) => t.key === 'model_infer')?.elapsedMs ??
              620}
            ms
          </span>
        </div>
        <div
          style={{
            fontSize: '0.79rem',
            lineHeight: 1.55,
            color: 'var(--adm-fg)',
            whiteSpace: 'pre-wrap',
            maxHeight: '220px',
            overflowY: 'auto',
          }}
        >
          {latestRun ? (
            latestRun.output
          ) : (
            <>
              <strong>提炼金句：</strong>
              <br />
              1. 「以 Agent 为第一等公民，配置自然下沉为随身工具。」
              <br />
              2. 「一人可养的系统，守住 2C2G 底线，进程随叫随起、跑完即焚。」
              <br />
              3. 「Markdown 文本是唯一真相源，不进数据库倒腾。」
            </>
          )}
        </div>
      </div>

      {/* JSONL 原生文本查看器 */}
      {isJsonlVisible ? (
        <div>
          {latestRun?.traceLogPath ? (
            <div
              style={{
                fontSize: '0.68rem',
                color: 'var(--adm-muted)',
                marginTop: '0.45rem',
                fontFamily: 'ui-monospace, "SF Mono", monospace',
              }}
            >
              落盘日志：<code>{latestRun.traceLogPath}</code>
            </div>
          ) : null}
          <div
            style={{
              background: '#111111',
              color: '#f5f5f7',
              fontFamily: 'ui-monospace, "SF Mono", monospace',
              fontSize: '0.72rem',
              padding: '0.75rem',
              borderRadius: '8px',
              marginTop: '0.35rem',
              maxHeight: '160px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.45,
            }}
          >
            {rawJsonlText ||
              `{"timestamp":"${new Date().toISOString()}","event":"run_start","runId":"${latestRun?.runId || 'run_dsh_88912'}","agent":"${currentAgentId}","file":"${targetFile}"}
{"timestamp":"${new Date().toISOString()}","event":"tool_call","tool":"tool-fs","params":{"path":"${targetFile}"},"durationMs":32}
{"timestamp":"${new Date().toISOString()}","event":"model_chunk","tokens":340,"promptTokens":1850,"cachedTokens":1620,"cacheHitRate":0.875}
{"timestamp":"${new Date().toISOString()}","event":"run_finish","status":"success","totalMs":1420,"costTokens":2190}`}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// 子组件 5: 新建角色弹窗 (P1 状态内聚 + P3 复用通用 AppleSheetModal)
// ============================================================================
interface NewAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, model: string) => void;
}

function NewAgentModal({ isOpen, onClose, onConfirm }: NewAgentModalProps) {
  const [name, setName] = useState('');
  const [model, setModel] = useState('deepseek-chat');

  const handleConfirm = () => {
    onConfirm(name, model);
    setName('');
    setModel('deepseek-chat');
  };

  return (
    <AppleSheetModal
      isOpen={isOpen}
      onClose={onClose}
      title="创建新 Agent 角色"
      description="为 Walker 工作流添加专属智能体，可独立设定 Persona 与模型端点。"
      actions={
        <>
          <button
            type="button"
            className="apple-btn apple-btn-secondary"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="apple-btn apple-btn-primary"
            onClick={handleConfirm}
          >
            创建并切换
          </button>
        </>
      }
    >
      <div className="field-group">
        <label className="field-label">角色名称</label>
        <input
          type="text"
          className="apple-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：小红书文案精修、架构评审官"
        />
      </div>
      <div className="field-group">
        <label className="field-label">默认调用模型</label>
        <input
          type="text"
          className="apple-input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="如 deepseek-chat, step-3.7-flash"
        />
      </div>
    </AppleSheetModal>
  );
}

// ============================================================================
// 子组件 6: 添加模型弹窗 (P1 状态内聚 + P3 复用通用 AppleSheetModal)
// ============================================================================
interface AddModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (modelId: string, tags: string) => void;
}

function AddModelModal({ isOpen, onClose, onConfirm }: AddModelModalProps) {
  const [modelId, setModelId] = useState('');
  const [tags, setTags] = useState('通用, 128K');

  const handleConfirm = () => {
    onConfirm(modelId, tags);
    setModelId('');
    setTags('通用, 128K');
  };

  return (
    <AppleSheetModal
      isOpen={isOpen}
      onClose={onClose}
      title="添加模型到目录"
      description="注册提供方支持的模型 ID 与上下文能力标签。"
      actions={
        <>
          <button
            type="button"
            className="apple-btn apple-btn-secondary"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="apple-btn apple-btn-primary"
            onClick={handleConfirm}
          >
            确认添加
          </button>
        </>
      }
    >
      <div className="field-group">
        <label className="field-label">模型 ID (Model ID)</label>
        <input
          type="text"
          className="apple-input"
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
          placeholder="例如：deepseek-reasoner, gpt-4o, claude-3-7-sonnet"
        />
      </div>
      <div className="field-group">
        <label className="field-label">特性标签 (逗号分隔)</label>
        <input
          type="text"
          className="apple-input"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="如 思考, 256K, 视觉"
        />
      </div>
    </AppleSheetModal>
  );
}

// ============================================================================
// 主组件: AgentWorkbenchPage (仅负责装配与核心领域状态)
// ============================================================================
export function AgentWorkbenchPage() {
  const [agents, setAgents] = useState<Record<string, AgentUnit>>(INITIAL_AGENTS);
  const [currentAgentId, setCurrentAgentId] = useState<string>('xiaoying');
  const [availableLogFiles, setAvailableLogFiles] = useState<string[]>([
    'content/log/2026-09-08-agent-workbench.md',
    'content/log/2026-09-03-one-person-sustainable.md',
  ]);
  const [, setIsLoading] = useState<boolean>(true);

  // Runner 状态 (P2: 命名重构)
  const [targetFile, setTargetFile] = useState<string>(
    'content/log/2026-09-08-agent-workbench.md',
  );
  const [instruction, setInstruction] = useState<string>(
    '请通读这篇文章，挑出 3 个最有洞察力的金句并指出一处论述漏洞。',
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isJsonlVisible, setIsJsonlVisible] = useState<boolean>(false);

  // 加载远程智能体、模型提供方与文档文件列表
  const loadRemoteData = useCallback(async () => {
    try {
      const [remoteAgents, remoteProviders, logFiles] = await Promise.all([
        adminApi.agents.list().catch(() => [] as AgentUnitRecord[]),
        adminApi.modelProviders.list().catch(() => [] as ModelProviderRecord[]),
        adminApi.agents.logFiles().catch(() => [] as string[]),
      ]);

      if (logFiles && logFiles.length > 0) {
        setAvailableLogFiles(logFiles);
        setTargetFile((prev) => (logFiles.includes(prev) ? prev : logFiles[0]));
      }

      if (remoteAgents && remoteAgents.length > 0) {
        const mapped = buildAgentUnitMap(remoteAgents, remoteProviders);
        setAgents(mapped);
        setCurrentAgentId((prev) => selectInitialAgentId(mapped, prev));
      }
    } catch (err) {
      console.error('Failed to load agents dynamic data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRemoteData();
  }, [loadRemoteData]);

  // 探测状态与复制状态 (P2: 命名重构)
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // 弹窗可见性 (内部打字状态已下沉至弹窗内部，P1)
  const [isNewAgentModalOpen, setIsNewAgentModalOpen] = useState<boolean>(false);
  const [isAddModelModalOpen, setIsAddModelModalOpen] = useState<boolean>(false);

  // Apple Dynamic Island HUD Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, TOAST_DURATION_MS);
  }, []);

  const currentAgent = agents[currentAgentId] ?? agents.xiaoying;

  // 更新当前 Agent 属性
  const updateCurrentAgent = useCallback(
    (patch: Partial<AgentUnit>) => {
      setAgents((prev) => ({
        ...prev,
        [currentAgentId]: {
          ...prev[currentAgentId],
          ...patch,
        },
      }));
    },
    [currentAgentId],
  );

  // 功能 4: 复制提示词 (Apple 触感反馈 + Dynamic Island HUD 胶囊)
  const handleCopyPrompt = useCallback(async () => {
    if (!currentAgent.prompt.trim()) {
      showToast('提示词为空，无可复制内容');
      return;
    }
    try {
      await navigator.clipboard.writeText(currentAgent.prompt);
      setIsCopied(true);
      showToast(
        `已复制【${currentAgent.name}】系统提示词，可直接粘贴给外部 AI 接入！`,
      );
      setTimeout(() => setIsCopied(false), COPY_RESET_DELAY_MS);
    } catch {
      showToast('剪贴板写入失败，请检查浏览器权限');
    }
  }, [currentAgent.name, currentAgent.prompt, showToast]);

  // 功能 1: 设为当前调用模型
  const handleSetActiveModel = useCallback(
    (modelId: string) => {
      updateCurrentAgent({ activeModel: modelId });
      showToast(`已将【${modelId}】设为当前调用模型`);
    },
    [showToast, updateCurrentAgent],
  );

  // 功能 1: 移除模型
  const handleRemoveModel = useCallback(
    (index: number) => {
      if (currentAgent.models.length <= 1) {
        showToast('至少需要保留一个可用模型');
        return;
      }
      const updated = [...currentAgent.models];
      const [removed] = updated.splice(index, 1);
      const newActive =
        currentAgent.activeModel === removed.id
          ? updated[0].id
          : currentAgent.activeModel;
      updateCurrentAgent({ models: updated, activeModel: newActive });
      showToast(`已从目录移除【${removed.id}】`);
    },
    [currentAgent.activeModel, currentAgent.models, showToast, updateCurrentAgent],
  );

  // 功能 1: 添加模型确认
  const handleConfirmAddModel = useCallback(
    (modelId: string, tagsString: string) => {
      const trimmedId = modelId.trim();
      if (!trimmedId) {
        showToast('请输入有效的模型 ID');
        return;
      }
      const tags = tagsString
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = [
        ...currentAgent.models,
        { id: trimmedId, tags: tags.length ? tags : ['通用'] },
      ];
      updateCurrentAgent({ models: updated });
      setIsAddModelModalOpen(false);
      showToast(`已添加模型【${trimmedId}】到目录`);
    },
    [currentAgent.models, showToast, updateCurrentAgent],
  );

  // 功能 3: 新增角色确认 (W1-4: 持久化落库)
  const handleConfirmNewAgent = useCallback(
    async (name: string, model: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        showToast('角色名称不能为空');
        return;
      }
      const trimmedModel = model.trim() || 'deepseek-chat';
      const id = `custom_${Date.now()}`;
      const defaultPrompt = `你是${trimmedName}，专门负责站主的专属创作与评审任务。`;

      try {
        await adminApi.agents.save({
          id,
          name: trimmedName,
          icon: 'sparkles',
          providerId: currentAgent.providerId ?? null,
          modelId: trimmedModel,
          prompt: defaultPrompt,
        });

        const newUnit: AgentUnit = {
          id,
          name: trimmedName,
          isSystem: false,
          icon: 'sparkles',
          prompt: defaultPrompt,
          providerId: currentAgent.providerId ?? null,
          baseUrl: currentAgent.baseUrl,
          apiProtocol: currentAgent.apiProtocol,
          apiKey: currentAgent.apiKey,
          activeModel: trimmedModel,
          models: currentAgent.models.some((m) => m.id === trimmedModel)
            ? currentAgent.models
            : [...currentAgent.models, { id: trimmedModel, tags: ['自定义'] }],
        };
        setAgents((prev) => ({ ...prev, [id]: newUnit }));
        setCurrentAgentId(id);
        setIsNewAgentModalOpen(false);
        showToast(`已成功创建角色【${trimmedName}】并持久化落库`);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : '创建角色失败，请检查服务状态';
        showToast(msg);
      }
    },
    [currentAgent, showToast],
  );

  // 功能 3: 删除角色 (W1-4: 接口调用与自愈回退)
  const handleDeleteCurrentAgent = useCallback(async () => {
    if (currentAgent.isSystem) {
      showToast('系统内置角色受保护，不可删除');
      return;
    }
    if (!window.confirm(`确定删除角色【${currentAgent.name}】吗？`)) return;

    try {
      await adminApi.agents.remove(currentAgentId);
      setAgents((prev) => {
        const next = { ...prev };
        delete next[currentAgentId];
        return next;
      });
      setCurrentAgentId('xiaoying');
      showToast(`已删除角色【${currentAgent.name}】`);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : '删除角色失败，请检查操作权限';
      showToast(msg);
    }
  }, [currentAgent.isSystem, currentAgent.name, currentAgentId, showToast]);

  // 接口探测 (W1-5: 调用后端真实连通性探测)
  const handlePingModel = useCallback(async () => {
    setIsPinging(true);
    const providerId = currentAgent.providerId || 'deepseek';
    try {
      const res = await adminApi.modelProviders.ping(providerId);
      if (res.ok) {
        showToast(`模型接口探测连通正常 (HTTP 200 OK · ${res.latencyMs}ms)`);
      } else {
        showToast(
          `接口探测失败: ${res.statusText || '连接异常'} (${res.latencyMs}ms)`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '接口探测请求失败';
      showToast(`接口探测异常: ${msg}`);
    } finally {
      setIsPinging(false);
    }
  }, [currentAgent.providerId, showToast]);

  // 保存设置 (W1-5: 持久化提供方与智能体，API Key AES-256 加密)
  const handleSaveSettings = useCallback(async () => {
    try {
      const providerId = currentAgent.providerId || 'deepseek';
      const keyTrimmed = currentAgent.apiKey.trim();
      const apiKeyToSend =
        keyTrimmed && !keyTrimmed.includes('****') ? keyTrimmed : undefined;

      await Promise.all([
        adminApi.agents.save({
          id: currentAgent.id,
          name: currentAgent.name,
          icon: currentAgent.icon,
          providerId: currentAgent.providerId ?? null,
          modelId: currentAgent.activeModel,
          prompt: currentAgent.prompt,
        }),
        adminApi.modelProviders.update(providerId, {
          name: `${currentAgent.name} 默认提供方`,
          baseUrl: currentAgent.baseUrl,
          apiFormat: currentAgent.apiProtocol,
          apiKey: apiKeyToSend,
          modelsJson: JSON.stringify(currentAgent.models),
        }),
      ]);

      showToast(
        `已保存智能体【${currentAgent.name}】配置（AES-256-GCM 强加密）`,
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : '保存配置失败，请检查网络或权限';
      showToast(`保存失败: ${msg}`);
    }
  }, [currentAgent, showToast]);

  const [latestRun, setLatestRun] = useState<AgentRunResult | null>(null);
  const [rawJsonlText, setRawJsonlText] = useState<string>('');

  // 运行文件 (W1-6: 真实单次隔离直调与 trace.jsonl 管道)
  const handleRunAgentOnFile = useCallback(async () => {
    setIsRunning(true);
    try {
      const res = await adminApi.agents.runFile(currentAgent.id, {
        targetFile,
        instruction,
      });
      setLatestRun(res);
      showToast(`执行完成，耗时 ${res.elapsedMs}ms，时序与指标已更新`);

      // 异步获取落盘的 trace.jsonl 记录
      try {
        const trace = await adminApi.agents.trace(res.runId);
        if (trace && trace.length > 0) {
          setRawJsonlText(trace.map((item) => JSON.stringify(item)).join('\n'));
        }
      } catch (e) {
        console.warn('Failed to prefetch trace:', e);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '直调执行失败';
      showToast(`直调失败: ${msg}`);
    } finally {
      setIsRunning(false);
    }
  }, [currentAgent.id, instruction, showToast, targetFile]);

  const handleToggleJsonl = useCallback(async () => {
    setIsJsonlVisible((prev) => !prev);
    if (!rawJsonlText && latestRun) {
      try {
        const trace = await adminApi.agents.trace(latestRun.runId);
        if (trace && trace.length > 0) {
          setRawJsonlText(trace.map((item) => JSON.stringify(item)).join('\n'));
        }
      } catch (e) {
        console.warn('Failed to fetch trace:', e);
      }
    }
  }, [latestRun, rawJsonlText]);

  return (
    <div style={{ padding: '0.5rem 0 2.5rem' }}>
      {/* 页面标题 */}
      <header className="page-head" style={{ marginBottom: '1.2rem' }}>
        <h1>
          <Bot size={22} aria-hidden />
          Agent 工坊
        </h1>
        <p className="page-lead">
          智能体模型配置、系统角色提示词与 Markdown 文件直调轨迹 (B 处可观测)。
        </p>
      </header>

      {/* 顶部 Agent 角色药丸栏 (P1: 子组件) */}
      <AgentCapsuleBar
        agents={Object.values(agents)}
        currentAgentId={currentAgentId}
        onSelectAgent={setCurrentAgentId}
        onOpenNewAgentModal={() => setIsNewAgentModalOpen(true)}
      />

      {/* 双栏主体 */}
      <div className="agent-grid-container">
        {/* 左栏：Agent 提示词 + 照抄 DSH 的 API 配置 */}
        <div className="apple-card">
          <div className="card-header-row">
            <h3 className="card-title">
              <SlidersHorizontal size={17} style={{ color: 'var(--adm-brand)' }} />
              <span>角色设置 · {currentAgent.name}</span>
            </h3>
            {!currentAgent.isSystem ? (
              <button
                type="button"
                className="apple-btn apple-btn-danger-outline apple-btn-sm"
                onClick={handleDeleteCurrentAgent}
              >
                <Trash2 size={13} /> 删除此角色
              </button>
            ) : null}
          </div>

          {/* 功能 2: 角色提示词卡片 (P1: 子组件) */}
          <AgentPersonaCard
            currentAgent={currentAgent}
            isCopied={isCopied}
            onUpdatePrompt={(prompt) => updateCurrentAgent({ prompt })}
            onCopyPrompt={() => void handleCopyPrompt()}
          />

          {/* 功能 1: 1:1 DSH 模型与提供方配置 (P1: 子组件) */}
          <ModelCatalogSection
            currentAgent={currentAgent}
            isPinging={isPinging}
            onUpdateAgent={updateCurrentAgent}
            onSetActiveModel={handleSetActiveModel}
            onRemoveModel={handleRemoveModel}
            onOpenAddModelModal={() => setIsAddModelModalOpen(true)}
            onPingModel={handlePingModel}
            onSaveSettings={handleSaveSettings}
          />
        </div>

        {/* 右栏：本地 Markdown 文件直调与运行轨迹 (P1: 子组件) */}
        <TraceRunnerSection
          targetFile={targetFile}
          instruction={instruction}
          currentAgentName={currentAgent.name}
          currentAgentId={currentAgent.id}
          isRunning={isRunning}
          isJsonlVisible={isJsonlVisible}
          availableFiles={availableLogFiles}
          latestRun={latestRun}
          rawJsonlText={rawJsonlText}
          onChangeTargetFile={setTargetFile}
          onChangeInstruction={setInstruction}
          onRunAgent={handleRunAgentOnFile}
          onToggleJsonl={handleToggleJsonl}
        />
      </div>

      {/* Apple Dynamic Island / HUD Capsule Toast */}
      <div className={`apple-hud-toast${toastMessage ? ' show' : ''}`}>
        <CheckCircle2 size={15} style={{ color: '#4ade80' }} />
        <span>{toastMessage}</span>
      </div>

      {/* Apple Sheet Modals (P1: 状态内聚 + P3: 通用组件复用) */}
      <NewAgentModal
        isOpen={isNewAgentModalOpen}
        onClose={() => setIsNewAgentModalOpen(false)}
        onConfirm={handleConfirmNewAgent}
      />

      <AddModelModal
        isOpen={isAddModelModalOpen}
        onClose={() => setIsAddModelModalOpen(false)}
        onConfirm={handleConfirmAddModel}
      />
    </div>
  );
}
