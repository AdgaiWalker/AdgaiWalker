export interface WebsiteDeploymentVerifierPort {
  verify(url: string, expected: { title: string }): Promise<{ ok: boolean; reason?: string }>;
}

export const WEBSITE_DEPLOYMENT_VERIFIER = Symbol('WEBSITE_DEPLOYMENT_VERIFIER');
