/**
 * 候选文件仓储端口 — 管理端与 Agent 独立候选文件持久化，依赖倒置。
 * 不强制单篇改稿先建完整多阶段流水线。
 */

export interface CandidateFileRecord {
  candidateId: string;
  candidateRef: string;
  hash: string;
  path: string;
  raw: string;
  createdAt: string;
}

export interface CandidateFileRepositoryPort {
  /**
   * 保存不可变候选文件。
   * 路径由服务端在受控候选目录下统一生成；相同 hash 重复保存幂等复用；不同 hash 冲突拒绝。
   */
  save(candidateId: string, raw: string): Promise<CandidateFileRecord>;

  /**
   * 按 opaque candidateRef 读取候选正文并核验 SHA-256 hash。
   * 不匹配/损坏抛出错误；不存在返回 null；严格防范路径穿越。
   */
  read(candidateRef: string): Promise<CandidateFileRecord | null>;
}

export const CANDIDATE_FILE_REPOSITORY = Symbol('CANDIDATE_FILE_REPOSITORY');
