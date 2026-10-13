import type { ContentChange } from '@walker/shared';
import type { ContentFileDetail } from './content-file.repository';

export const CONTENT_MUTATION_SERVICE = Symbol('CONTENT_MUTATION_SERVICE');

export type ContentMutationInput = {
  changeId: string;
  candidateRaw?: string;
  actor: string;
  requestId: string;
};

export type ContentProposeInput = {
  slug: string;
  agentId: string;
  instruction: string;
  grantId: string;
  requestKey: string;
  actor: string;
};

export type ContentApproveInput = {
  changeId: string;
  grantId: string;
  actor: string;
};

export interface ContentMutationPort {
  propose(input: ContentProposeInput): Promise<ContentChange>;
  approve(input: ContentApproveInput): Promise<ContentChange>;
  apply(input: ContentMutationInput): Promise<ContentChange>;
  reconcile(input: ContentMutationInput): Promise<ContentChange>;
  saveManual(input: {
    slug: string;
    raw: string;
    expectedHash: string | null;
    actor: string;
    requestId: string;
  }): Promise<ContentFileDetail>;
}
