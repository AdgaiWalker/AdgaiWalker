import type { ContentApproval, ContentChange, ContentTarget } from '@walker/shared';

export const CONTENT_CHANGE_REPOSITORY = Symbol('CONTENT_CHANGE_REPOSITORY');

export type NewContentChange = {
  id: string;
  target: ContentTarget;
  baseHash: string;
  candidateHash: string;
  candidateRef: string;
  sourceRunId: string | null;
  requestKey: string;
};

export type ContentApplyOutcome = 'APPLIED' | 'CONFLICT' | 'UNKNOWN';

export interface ContentChangeRepositoryPort {
  /** Idempotent proposal creation. Reusing requestKey for different candidate facts is a conflict. */
  createOnce(input: NewContentChange): Promise<ContentChange>;
  /** Persist one immutable apply-candidate approval and move PROPOSED to APPROVED. */
  recordApproval(input: { id: string; approval: ContentApproval<'apply-candidate'> }): Promise<ContentChange>;
  /** Atomically consume an approved candidate and persist its write intent plus audit. */
  beginApply(input: { id: string; actor: string; requestId: string }): Promise<ContentChange>;
  /** Atomically persist observed file outcome and its audit after the filesystem side effect. */
  finishApply(input: {
    id: string;
    actor: string;
    requestId: string;
    outcome: ContentApplyOutcome;
    observedHash: string | null;
  }): Promise<ContentChange>;
  findById(id: string): Promise<ContentChange | null>;
  findByRequestKey(requestKey: string): Promise<ContentChange | null>;
  list(filter?: { slug?: string; limit?: number }): Promise<ContentChange[]>;
}
