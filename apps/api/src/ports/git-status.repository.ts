/**
 * git 状态端口（PRD A3 / TECH-DESIGN §6.3）
 * 纪律：content/log 的一次工作区状态 + 一次 HEAD 即 O(1)；禁止逐文件 git log（会线性 spawn 进程）。
 * 不可用它不编造：available=false 交给前端显示「未知」。
 */

export interface ContentLogGitStatus {
  /** git 是否可用；false 表示工作区事实缺失（不得据此断言「已上线」） */
  available: boolean;
  /** content/log 下脏文件名（含未跟踪），形如 `foo.md` */
  dirtyFiles: string[];
  /** HEAD 完整提交 id；不可用为 null */
  headCommit: string | null;
}

export interface GitFileStatus {
  path: string;
  staged: boolean;
  dirty: boolean;
  statusCode: string;
}

export interface WorkspaceGitStatus {
  available: boolean;
  headCommit: string | null;
  files: GitFileStatus[];
  dirtyFiles: string[];
}

export interface GitStatusPort {
  snapshot(): Promise<ContentLogGitStatus>;
  workspaceSnapshot?(): Promise<WorkspaceGitStatus>;
  hasCommit?(commit: string): Promise<boolean>;
}

export const GIT_STATUS = Symbol('GIT_STATUS');
