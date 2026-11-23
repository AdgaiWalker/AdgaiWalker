/**
 * Git 同步契约（双端写作与版本同步）
 * 覆盖：本地电脑 (Mac/Obsidian/VS Code) ⟷ GitHub ⟷ 云端网页后台 (admin.iwalk.pro)
 */

export interface ContentSyncStatus {
  /** git 状态可用性；若服务器无法连接远程或非 git 仓库为 false */
  available: boolean;
  /** 服务器落后远端提交数（待从 GitHub 拉取） */
  behind: number;
  /** 服务器超前远端提交数（未推送到 GitHub） */
  ahead: number;
  /** 服务器当前 HEAD 提交 hash */
  headCommit: string | null;
  /** GitHub 远端 origin/main 提交 hash */
  remoteCommit: string | null;
  /** 服务器当前未提交的内容文件（content/log） */
  dirtyFiles: string[];
  /** 远端待拉取的具体变更文件列表 */
  incomingFiles: string[];
  /** 最近一次成功检查或 fetch 的时间戳 */
  lastCheckedAt: string;
  /** 最近一次远端 fetch 失败原因（非空时绝不允许展示「已同步」假绿灯） */
  fetchError?: string | null;
  /** 存在同篇并发冲突的文件名列表（本地草稿与远端同时改了同一篇） */
  conflicts?: string[];
  /** 最近一次草稿备份到 drafts 分支的提交 hash */
  draftBackupCommit?: string | null;
}

export interface ContentSyncConflictDetail {
  /** 冲突文章 slug */
  slug: string;
  /** 冲突文件路径（相对仓库根，如 content/log/foo.md） */
  path: string;
  /** 本地保留的草稿正文（LF） */
  localHash: string;
  /** 远端最新正文哈希（LF） */
  remoteHash: string;
  /** 冲突副本路径（若已旁存远端版本供比对） */
  conflictFile?: string;
}

export interface ContentSyncPullResult {
  /** 拉取是否成功（若有同篇冲突则 ok=false，其余无冲突文件已安全更新） */
  ok: boolean;
  /** 拉取的提交数 */
  pulledCommits: number;
  /** 本次拉取同步的具体文件 */
  incomingFiles: string[];
  /** 结果文案（如 "成功从 GitHub 同步 1 篇新文章"） */
  message: string;
  /** 同篇并发冲突明细（保留本地草稿不覆盖） */
  conflicts?: ContentSyncConflictDetail[];
  /** 原始 git 输出日志（排查用） */
  stdout?: string;
}

export interface ContentDraftBackupResult {
  /** 备份是否成功 */
  ok: boolean;
  /** 备份目标分支（默认 drafts） */
  branch: string;
  /** 生成的备份提交 hash（无改动时为 null） */
  commit: string | null;
  /** 本次备份的草稿文件列表 */
  backedUpFiles: string[];
  /** 人读说明 */
  message: string;
}

/**
 * 格式化同步状态的人读文案（诚实原则：fetch 失败与同篇冲突优先暴露，绝不假绿灯）
 */
export function formatSyncStatusSummary(status: ContentSyncStatus | null | undefined): {
  state: 'synced' | 'behind' | 'ahead' | 'diverged' | 'dirty' | 'conflict' | 'error' | 'unknown';
  label: string;
  description: string;
} {
  if (!status || !status.available) {
    return {
      state: 'unknown',
      label: '同步状态未知',
      description: status?.fetchError ? `无法获取 Git 远端状态：${status.fetchError}` : '无法获取 Git 远端状态',
    };
  }

  if (status.fetchError) {
    return {
      state: 'error',
      label: '远端探测失败',
      description: `无法连接 GitHub 核对最新状态（${status.fetchError}），点击重试`,
    };
  }

  if (status.conflicts && status.conflicts.length > 0) {
    return {
      state: 'conflict',
      label: `存在 ${status.conflicts.length} 篇同篇冲突`,
      description: `两端同时修改了 ${status.conflicts.join('、')}，已保留本地草稿待核对`,
    };
  }

  if (status.behind > 0 && status.ahead > 0) {
    return {
      state: 'diverged',
      label: `分叉 (落后 ${status.behind} / 超前 ${status.ahead})`,
      description: '服务器与 GitHub 均有独立提交，建议先备份或手动核对',
    };
  }

  if (status.behind > 0) {
    const filesCount = status.incomingFiles.length;
    return {
      state: 'behind',
      label: `待从 GitHub 同步 (${status.behind})`,
      description: `GitHub 有 ${status.behind} 个新提交${filesCount ? `（涉及 ${filesCount} 个文件）` : ''}，点击一键同步到网页`,
    };
  }

  if (status.ahead > 0) {
    return {
      state: 'ahead',
      label: `有 ${status.ahead} 个本地提交未推送`,
      description: '网页端生成的提交尚未推送到 GitHub',
    };
  }

  if (status.dirtyFiles.length > 0) {
    return {
      state: 'dirty',
      label: `有 ${status.dirtyFiles.length} 篇草稿待发布/备份`,
      description: '工作区草稿不阻断单篇发布，可按需备份到 drafts 分支',
    };
  }

  return {
    state: 'synced',
    label: '与 GitHub 一致',
    description: '服务器与 GitHub 已完全同步',
  };
}
