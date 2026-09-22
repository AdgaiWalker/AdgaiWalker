/** 凭据 runtime 池。键只含供应商编号和修订号，不含密钥。 */
export function runtimePoolKey(providerId: string, credentialRevision: number): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(providerId)) throw new Error('invalid-provider');
  if (!Number.isSafeInteger(credentialRevision) || credentialRevision < 0) throw new Error('invalid-revision');
  return `${providerId}:${credentialRevision}`;
}

type Slot = { retired: boolean; inflight: number };

export class CredentialRuntimePool {
  generation = 0;
  private current = new Map<string, number>();
  private slots = new Map<string, Slot>();

  publish(providerId: string, credentialRevision: number): string {
    const key = runtimePoolKey(providerId, credentialRevision);
    this.current.set(providerId, credentialRevision);
    return key;
  }

  claim(providerId: string, credentialRevision: number): string {
    const key = runtimePoolKey(providerId, credentialRevision);
    const current = this.current.get(providerId);
    if (current !== undefined && current !== credentialRevision) throw new Error('credential-revision-retired');
    const slot = this.slots.get(key);
    if (slot?.retired) throw new Error('credential-revision-retired');
    this.slots.set(key, { retired: false, inflight: (slot?.inflight ?? 0) + 1 });
    return key;
  }

  release(providerId: string, credentialRevision: number): void {
    const slot = this.slots.get(runtimePoolKey(providerId, credentialRevision));
    if (slot) slot.inflight = Math.max(0, slot.inflight - 1);
  }

  retire(providerId: string, credentialRevision: number): { key: string; inflight: number } {
    const key = runtimePoolKey(providerId, credentialRevision);
    const slot = this.slots.get(key) ?? { retired: false, inflight: 0 };
    slot.retired = true;
    this.slots.set(key, slot);
    this.generation += 1;
    return { key, inflight: slot.inflight };
  }
}

export const credentialPool = new CredentialRuntimePool();
