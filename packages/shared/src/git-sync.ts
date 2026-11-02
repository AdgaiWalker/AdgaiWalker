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
}

export interface ContentSyncPullResult {
  /** 拉取是否成功 */
  ok: boolean;
  /** 拉取的提交数 */
  pulledCommits: number;
  /** 本次拉取同步的具体文件 */
  incomingFiles: string[];
  /** 结果文案（如 "成功从 GitHub 同步 1 篇新文章"） */
  message: string;
  /** 原始 git 输出日志（排查用） */
  stdout?: string;
}

/**
 * 格式化同步状态的人读文案
 */
export function formatSyncStatusSummary(status: ContentSyncStatus | null | undefined): {
  state: 'synced' | 'behind' | 'ahead' | 'diverged' | 'dirty' | 'unknown';
  label: string;
  description: string;
} {
  if (!status || !status.available) {
    return {
      state: 'unknown',
      label: '同步状态未知',
      description: '无法获取 Git 远端状态',
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
      label: `存在 ${status.dirtyFiles.length} 篇未保存/未提交草稿`,
      description: '工作区有待发布的改动',
    };
  }

  return {
    state: 'synced',
    label: '与 GitHub 一致',
    description: '服务器与 GitHub 已完全同步',
  };
}
