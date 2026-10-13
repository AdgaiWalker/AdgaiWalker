export const PUBLIC_READINESS_GATE_KEYS = [
  'verifiedSnapshot',
  'memberPermissions',
  'runtimeIsolation',
  'logRetention',
  'deletionRecovery',
  'publicRoutes',
  'resourceHeadroom',
] as const;

export type PublicReadinessGateKey = (typeof PUBLIC_READINESS_GATE_KEYS)[number];

export function isPublicReadinessGateKey(value: unknown): value is PublicReadinessGateKey {
  return typeof value === 'string' && (PUBLIC_READINESS_GATE_KEYS as readonly string[]).includes(value);
}

export type PublicReadinessGate = {
  key: PublicReadinessGateKey;
  state: 'ready' | 'blocked';
  reason: string;
  details: string[];
};

export type PublicDeploymentReadiness = {
  deploymentId: string;
  placementKey: string;
  scopeSlug: string;
  enabled: boolean;
  checkedAt: string;
  canEnable: boolean;
  gates: PublicReadinessGate[];
};

export function isDeploymentReady(readiness: PublicDeploymentReadiness): boolean {
  return readiness.canEnable && readiness.gates.every((g) => g.state === 'ready');
}
