/** 赞赏配置端口 */
export type SupportConfig = {
  title: string;
  body: string;
  wechatQrUrl: string;
  alipayQrUrl: string;
  externalLinks: Array<{ label: string; url: string }>;
};

export interface SupportConfigRepositoryPort {
  get(): Promise<SupportConfig>;
  save(config: SupportConfig): Promise<SupportConfig>;
}

export const SUPPORT_CONFIG_REPOSITORY = Symbol('SUPPORT_CONFIG_REPOSITORY');

export const DEFAULT_SUPPORT_CONFIG: SupportConfig = {
  title: '支持 / 赞赏',
  body: '若内容对你有帮助，可通过赞赏支持持续创作。',
  wechatQrUrl: '',
  alipayQrUrl: '',
  externalLinks: [],
};
