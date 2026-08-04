export interface WechatPublicationPackage {
  title: string;
  summary: string;
  author: string;
  html: string;
  images: string[];
  landscapeCover: string;
  portraitCover: string;
  fieldChecklist: string[];
  artifactHash: string;
}

export interface PublicationPackageRepositoryPort {
  saveWechat(workId: string, value: WechatPublicationPackage): Promise<{ path: string; value: WechatPublicationPackage }>;
}

export const PUBLICATION_PACKAGE_REPOSITORY = Symbol('PUBLICATION_PACKAGE_REPOSITORY');
