/**
 * 模型供应商仓库端口
 * 职责：密文与模型列表的持久化；查询时 API Key 自动脱敏为 last4。
 */
export type ModelItem = {
  id: string;
  tags?: string[];
};

export type ModelProviderRow = {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  baseUrl: string;
  apiFormat: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  last4: string;
  modelsJson: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ModelProviderPublicRow = {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  baseUrl: string;
  apiFormat: string;
  last4: string;
  models: ModelItem[];
  updatedAt: Date;
};

export const MODEL_PROVIDER_REPOSITORY = Symbol('MODEL_PROVIDER_REPOSITORY');

export interface ModelProviderRepositoryPort {
  list(): Promise<ModelProviderPublicRow[]>;
  findById(id: string): Promise<ModelProviderRow | null>;
  save(row: Omit<ModelProviderRow, 'createdAt' | 'updatedAt'>): Promise<ModelProviderRow>;
  remove(id: string): Promise<void>;
}
