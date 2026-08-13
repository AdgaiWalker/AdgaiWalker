/** 配置端口：用例依赖接口，不直接读 process.env 散落各处 */
export interface AppConfigPort {
  getDatabaseUrl(): string | undefined;
  isAiEnabled(): boolean;
  getHost(): string;
  getPort(): number;
  getNodeEnv(): string;
  getWorkRootDir(): string;
  getWorkMaxUploadBytes(): number;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
