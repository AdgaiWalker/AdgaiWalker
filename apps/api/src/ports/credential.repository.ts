/**
 * 凭据仓库端口（规则/适配层共用）
 * 职责：密文行的存取；明文只在 Service 的加解密边界出现。
 */
export type CredentialRow = {
  id: string;
  name: string;
  provider: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  last4: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CredentialPublicRow = {
  id: string;
  name: string;
  provider: string;
  last4: string;
  note: string | null;
  updatedAt: Date;
};

export const CREDENTIAL_REPOSITORY = Symbol('CREDENTIAL_REPOSITORY');

export interface CredentialRepositoryPort {
  list(): Promise<CredentialPublicRow[]>;
  findByName(name: string): Promise<CredentialRow | null>;
  findById(id: string): Promise<CredentialRow | null>;
  save(row: Omit<CredentialRow, 'createdAt' | 'updatedAt'>): Promise<CredentialRow>;
  remove(id: string): Promise<void>;
}
