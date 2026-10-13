export const PUBLIC_ROUTE_BOUNDARY = Symbol('PUBLIC_ROUTE_BOUNDARY');

export type PublicRouteBoundaryResult = {
  matches: boolean;
  missingFromCaddy: string[];
  extraInCaddy: string[];
};

export interface PublicRouteBoundaryPort {
  check(): PublicRouteBoundaryResult;
}
