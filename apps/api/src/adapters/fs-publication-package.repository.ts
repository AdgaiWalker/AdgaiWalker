import fs from 'node:fs/promises';
import path from 'node:path';
import type { PublicationPackageRepositoryPort, WechatPublicationPackage } from '../ports/publication-package.repository';

export class FsPublicationPackageRepository implements PublicationPackageRepositoryPort {
  private readonly root: string;
  constructor(root: string) { this.root = path.resolve(root); }
  async saveWechat(workId: string, value: WechatPublicationPackage) {
    if (!/^[a-zA-Z0-9_-]+$/.test(workId)) throw new Error('invalid-work-id');
    const dir = path.join(this.root, workId, 'publish');
    await fs.mkdir(dir, { recursive: true });
    const full = path.join(dir, 'wechat.json');
    const temp = `${full}.tmp`;
    await fs.writeFile(temp, JSON.stringify(value, null, 2), { flag: 'wx' });
    await fs.rename(temp, full);
    return { path: path.relative(this.root, full), value };
  }
}
