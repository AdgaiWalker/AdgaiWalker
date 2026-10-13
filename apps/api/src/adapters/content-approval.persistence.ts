import { createHash } from 'node:crypto';
import {
  contentApprovalBindingKey,
  contentApprovalBindingMatches,
  isContentApprovalBinding,
  isContentOpaqueId,
  isContentSha256,
  type ContentApproval,
  type ContentApprovalAction,
  type ContentApprovalBinding,
} from '@walker/shared';

const APPROVAL_KEYS = ['id', 'binding', 'bindingHash', 'approvedBy', 'approvedAt'];

export function contentApprovalHash(binding: ContentApprovalBinding): string {
  return createHash('sha256').update(contentApprovalBindingKey(binding)).digest('hex');
}

export function isPersistableContentApproval<Action extends ContentApprovalAction>(
  value: unknown,
  expectedBinding: ContentApprovalBinding & { action: Action },
): value is ContentApproval<Action> {
  if (!isContentApprovalBinding(expectedBinding) || !isRecord(value)) return false;
  const date = typeof value.approvedAt === 'string' ? new Date(value.approvedAt) : null;
  const dateIsCanonical = date !== null && !Number.isNaN(date.getTime()) && date.toISOString() === value.approvedAt;
  return Object.keys(value).length === APPROVAL_KEYS.length &&
    Object.keys(value).every((key) => APPROVAL_KEYS.includes(key)) &&
    isContentOpaqueId(value.id) && isContentOpaqueId(value.approvedBy) &&
    isContentSha256(value.bindingHash) && value.bindingHash === contentApprovalHash(expectedBinding) &&
    dateIsCanonical && contentApprovalBindingMatches(value.binding, expectedBinding);
}

export function samePersistedContentApproval<Action extends ContentApprovalAction>(
  existing: ContentApproval<Action> | null,
  approval: ContentApproval<Action>,
): boolean {
  return existing !== null && existing.id === approval.id && existing.bindingHash === approval.bindingHash &&
    existing.approvedBy === approval.approvedBy && existing.approvedAt === approval.approvedAt &&
    contentApprovalBindingMatches(existing.binding, approval.binding);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
