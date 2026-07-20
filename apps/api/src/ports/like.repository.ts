export interface LikeRepositoryPort {
  getCount(path: string): Promise<number>;
  increment(path: string): Promise<number>;
}

export const LIKE_REPOSITORY = Symbol('LIKE_REPOSITORY');
