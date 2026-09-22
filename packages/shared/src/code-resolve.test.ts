/**
 * 代码图谱的模块解析（纯函数，无 IO）。
 *
 * 解析口径直接决定幽灵节点的数量：漏一条规则就会产出成百上千个假幽灵，
 * 而「解析不到的 import」正是本图谱的体检项之一。所以每条规则各有一个测试，
 * 而不是笼统测一个「能解析」。
 */
import { describe, expect, it } from 'vitest';
import {
  resolveCodeSpecifier,
  type ResolveContext,
  type WorkspacePackage,
} from './code-resolve.js';

const SHARED: WorkspacePackage = {
  dir: 'packages/shared',
  entries: ['packages/shared/src/index.ts'],
};

function context(
  files: readonly string[],
  packages: ReadonlyArray<[string, WorkspacePackage]> = [],
): ResolveContext {
  return { files: new Set(files), workspacePackages: new Map(packages) };
}

describe('相对路径解析', () => {
  it('`.js` 后缀映射回同名 `.ts`（本仓 55 处 ESM 风格导入，漏了会全成幽灵）', () => {
    const ctx = context(['packages/shared/src/index.ts', 'packages/shared/src/errors.ts']);
    const result = resolveCodeSpecifier('./errors.js', 'packages/shared/src/index.ts', ctx);
    expect(result.kind).toBe('relative');
    expect(result.outcome).toBe('code');
    expect(result.target).toBe('packages/shared/src/errors.ts');
  });

  it('省略后缀时按 精确 → `.ts` → `.tsx` → `index.ts` → `index.tsx` 顺序探测', () => {
    const ctx = context([
      'apps/web/src/components/graph/graph-view-model.ts',
      'apps/web/src/pages/GraphPage.tsx',
      'apps/web/src/components/index.ts',
    ]);
    expect(
      resolveCodeSpecifier('./graph-view-model', 'apps/web/src/components/graph/KnowledgeGraph.tsx', ctx)
        .target,
    ).toBe('apps/web/src/components/graph/graph-view-model.ts');
    expect(
      resolveCodeSpecifier('./pages/GraphPage', 'apps/web/src/App.tsx', ctx).target,
    ).toBe('apps/web/src/pages/GraphPage.tsx');
    expect(
      resolveCodeSpecifier('./components', 'apps/web/src/App.tsx', ctx).target,
    ).toBe('apps/web/src/components/index.ts');
  });

  it('上跳 `../` 会归一化，且允许跨出所在 app（本仓确实存在跨 app 导入）', () => {
    const ctx = context([
      'apps/web/src/shared/dual-entry.ts',
      'content/support-config.json',
    ]);
    // apps/admin/src/api → 仓库根需要 4 层
    const result = resolveCodeSpecifier(
      '../../../../content/support-config.json',
      'apps/admin/src/api/architecture-api.ts',
      ctx,
    );
    expect(result.outcome).toBe('attachment');
    expect(result.target).toBe('content/support-config.json');
  });

  it('解析到非代码文件时判为附件（css / json 有真实边，不是空开关）', () => {
    const ctx = context(['apps/web/src/main.tsx', 'apps/web/src/styles/walker.css']);
    const result = resolveCodeSpecifier('./styles/walker.css', 'apps/web/src/main.tsx', ctx);
    expect(result.outcome).toBe('attachment');
    expect(result.target).toBe('apps/web/src/styles/walker.css');
  });

  it('路径写错时判为解析不到（这是白捡的体检能力，不能静默丢掉）', () => {
    const ctx = context(['apps/web/src/main.tsx']);
    const result = resolveCodeSpecifier('./nope-not-here', 'apps/web/src/main.tsx', ctx);
    expect(result.outcome).toBe('unresolved');
    expect(result.target).toBeNull();
  });

  it('越过仓库根时判为解析不到，不无限向外探测', () => {
    const ctx = context(['apps/web/src/main.tsx']);
    const result = resolveCodeSpecifier(
      '../../../../../../etc/passwd',
      'apps/web/src/main.tsx',
      ctx,
    );
    expect(result.outcome).toBe('unresolved');
  });
});

describe('workspace 包解析', () => {
  it('包名命中 workspace 入口', () => {
    const ctx = context(
      ['apps/api/src/main.ts', 'packages/shared/src/index.ts'],
      [['@walker/shared', SHARED]],
    );
    const result = resolveCodeSpecifier('@walker/shared', 'apps/api/src/main.ts', ctx);
    expect(result.kind).toBe('workspace');
    expect(result.outcome).toBe('code');
    expect(result.target).toBe('packages/shared/src/index.ts');
  });

  it('子路径未声明 exports 时回落到包内 src 同名文件（本仓 exports 只有 "."）', () => {
    const ctx = context(
      ['apps/api/src/main.ts', 'packages/shared/src/content-load.ts'],
      [['@walker/shared', SHARED]],
    );
    const result = resolveCodeSpecifier(
      '@walker/shared/content-load',
      'apps/api/src/main.ts',
      ctx,
    );
    expect(result.outcome).toBe('code');
    expect(result.target).toBe('packages/shared/src/content-load.ts');
  });

  it('声明的子路径映射优先于回落探测', () => {
    const ctx = context(
      [
        'apps/api/src/main.ts',
        'packages/shared/src/index.ts',
        'packages/shared/src/legacy/content-load.ts',
        'packages/shared/src/content-load.ts',
      ],
      [
        [
          '@walker/shared',
          {
            ...SHARED,
            subpaths: new Map([['./content-load', ['packages/shared/src/legacy/content-load.ts']]]),
          },
        ],
      ],
    );
    const result = resolveCodeSpecifier(
      '@walker/shared/content-load',
      'apps/api/src/main.ts',
      ctx,
    );
    expect(result.target).toBe('packages/shared/src/legacy/content-load.ts');
  });

  it('workspace 包名写错或子路径不存在时判为解析不到', () => {
    const ctx = context(
      ['apps/api/src/main.ts', 'packages/shared/src/index.ts'],
      [['@walker/shared', SHARED]],
    );
    expect(
      resolveCodeSpecifier('@walker/nonexistent', 'apps/api/src/main.ts', ctx).outcome,
    ).toBe('unresolved');
    expect(
      resolveCodeSpecifier('@walker/shared/gone', 'apps/api/src/main.ts', ctx).outcome,
    ).toBe('unresolved');
  });
});

describe('外部包', () => {
  it('裸包名与 node: 内置模块判为外部：不建节点也不建边（照 Obsidian「外链不算边」）', () => {
    const ctx = context(['apps/web/src/main.tsx']);
    for (const specifier of ['react', 'lucide-react', '@nestjs/common', 'node:fs', 'fs']) {
      const result = resolveCodeSpecifier(specifier, 'apps/web/src/main.tsx', ctx);
      expect(result.kind).toBe('external');
      expect(result.outcome).toBe('external');
      expect(result.target).toBeNull();
    }
  });
});
