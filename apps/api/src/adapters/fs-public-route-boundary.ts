import fs from 'node:fs';
import path from 'node:path';
import { compareCaddyPublicRoutes } from '../auth/public-route-contract';
import type { PublicRouteBoundaryPort, PublicRouteBoundaryResult } from '../ports/public-route-boundary.port';

export class FsPublicRouteBoundary implements PublicRouteBoundaryPort {
  constructor(private readonly caddyfile = process.env.WALKER_CADDYFILE_PATH?.trim() ||
    path.resolve(__dirname, '../../../..', 'ops/windows/Caddyfile')) {}

  check(): PublicRouteBoundaryResult {
    try {
      return compareCaddyPublicRoutes(fs.readFileSync(this.caddyfile, 'utf8'));
    } catch {
      return { matches: false, missingFromCaddy: [], extraInCaddy: [] };
    }
  }
}
