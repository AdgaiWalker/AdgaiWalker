export interface VerifyWebsiteDeploymentInput {
  title?: string;
  expectedHash?: string;
  slug?: string;
  manifestUrl?: string;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

export interface VerifyWebsiteDeploymentResult {
  ok: boolean;
  verifiedHash?: string | null;
  observedTitle?: string | null;
  manifestMatched?: boolean;
  htmlMatched?: boolean;
  reason?: string;
}

export interface WebsiteDeploymentVerifierPort {
  verify(url: string, expected: VerifyWebsiteDeploymentInput): Promise<VerifyWebsiteDeploymentResult>;
}

export const WEBSITE_DEPLOYMENT_VERIFIER = Symbol('WEBSITE_DEPLOYMENT_VERIFIER');
