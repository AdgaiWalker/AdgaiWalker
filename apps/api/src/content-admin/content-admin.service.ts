/**
 * 管理端内容应用服务 — 编排 ContentFileRepositoryPort；保存后尝试 content:gen
 */
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ApiError } from '../common/http-error';
import {
  CONTENT_FILE_REPOSITORY,
  type ContentFileRepositoryPort,
} from '../ports/content-file.repository';

@Injectable()
export class ContentAdminService {
  private readonly log = new Logger(ContentAdminService.name);

  constructor(
    @Inject(CONTENT_FILE_REPOSITORY)
    private readonly files: ContentFileRepositoryPort,
  ) {}

  list() {
    return this.files.list();
  }

  async get(slug: string) {
    const doc = await this.files.get(slug);
    if (!doc) {
      throw new ApiError(
        'content-not-found',
        HttpStatus.NOT_FOUND,
        '内容不存在',
      );
    }
    return doc;
  }

  async save(slug: string, raw: string) {
    try {
      const saved = await this.files.save(slug, raw);
      this.scheduleContentGen();
      return saved;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'save-failed';
      if (msg === 'invalid-slug') {
        throw new ApiError(
          'invalid-slug',
          HttpStatus.BAD_REQUEST,
          'slug 须为小写 ascii 短横线',
        );
      }
      if (msg === 'invalid-frontmatter') {
        throw new ApiError(
          'invalid-frontmatter',
          HttpStatus.BAD_REQUEST,
          '正文须以 YAML frontmatter --- 开头',
        );
      }
      if (msg === 'content-log-unavailable') {
        throw new ApiError(
          'content-log-unavailable',
          HttpStatus.SERVICE_UNAVAILABLE,
          '内容目录不可用',
        );
      }
      throw new ApiError(
        'content-save-failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
        msg,
      );
    }
  }

  /**
   * 异步触发 monorepo content:gen，失败只记日志不阻断保存。
   * cwd 用 pnpm-workspace.yaml 定位 monorepo 根（「存在 package.json」会误中 app 目录，
   * 那里没有 content:gen 脚本）；非零退出同样记录，不再静默吞掉。
   */
  private scheduleContentGen(): void {
    if (process.env.CONTENT_GEN_ON_SAVE === 'false') return;
    let dir: string | undefined = process.cwd();
    while (dir && !fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      const parent = path.dirname(dir);
      if (parent === dir) {
        dir = undefined;
        break;
      }
      dir = parent;
    }
    if (!dir) {
      this.log.warn('content:gen skipped: monorepo 根未找到（无 pnpm-workspace.yaml）');
      return;
    }

    const child = spawn('pnpm', ['content:gen'], {
      cwd: dir,
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    });
    child.unref();
    child.on('error', (err) => {
      this.log.warn(`content:gen spawn failed: ${err.message}`);
    });
    child.on('close', (code) => {
      if (code !== 0) this.log.warn(`content:gen exited with ${code ?? 'signal'}`);
    });
  }
}
