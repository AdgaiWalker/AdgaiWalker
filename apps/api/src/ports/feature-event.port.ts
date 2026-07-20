export interface FeatureEventPort {
  record(input: {
    id: string;
    featureKey: string;
    event: 'expose' | 'attempt' | 'success' | 'fail';
    actorType: 'guest' | 'user' | 'owner';
    failCode?: string | null;
    props?: Record<string, unknown> | null;
  }): Promise<void>;
  listRecent(limit: number): Promise<
    Array<{
      id: string;
      featureKey: string;
      event: string;
      actorType: string;
      failCode: string | null;
      at: Date;
    }>
  >;
  aggregate(): Promise<{
    byFeature: Record<string, { attempt: number; success: number; fail: number }>;
    failCodes: Record<string, number>;
  }>;
}

export const FEATURE_EVENT = Symbol('FEATURE_EVENT');
