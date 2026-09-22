/**
 * 语法层引用抽取（纯函数）。
 *
 * 每条形式各有一个测试，因为它们各自决定一类节点/边的真假：
 * 漏 `export ... from` 会少掉一批边，漏 `new URL` 会让 worker 变成假死文件，
 * 而**把 import 说明符当成「按名引用」**（最后一条不变式）会一次性架空死文件体检。
 */
import { describe, expect, it } from 'vitest';
import { parseCodeFile } from './code-imports.js';

const parse = (source: string, fileName = 'apps/web/src/sample.ts') =>
  parseCodeFile(source, fileName);

/** 只取说明符，便于断言 */
const specifiers = (source: string) => parse(source).imports.map((entry) => entry.specifier);

describe('静态引用', () => {
  it('import 默认/具名/命名空间/副作用导入都算', () => {
    expect(
      specifiers(`
        import a from 'react';
        import { b } from './b';
        import * as c from '../c';
        import 'normalize.css';
      `),
    ).toEqual(['react', './b', '../c', 'normalize.css']);
  });

  it('`import type` 也算边（Obsidian 语义：链接就是链接）', () => {
    const result = parse(`import type { GraphNode } from './graph.js';`);
    expect(result.imports).toEqual([{ specifier: './graph.js', form: 'static' }]);
  });

  it('export-from 与 export * 都算（漏了会少掉一批真实依赖）', () => {
    const result = parse(`
      export * from './errors.js';
      export { a } from './a';
      export type { B } from './b';
      export * as ns from './ns';
      export const local = 1;
    `);
    expect(result.imports.map((entry) => entry.specifier)).toEqual([
      './errors.js',
      './a',
      './b',
      './ns',
    ]);
  });
});

describe('类型位置的 import 类型表达式', () => {
  it('`import(\'./x\')` 出现在类型位置时算静态引用，且不得掉进按名引用', () => {
    const result = parse(`
      export const providers = [
        {
          useFactory: (config: import('./config/config.port').AppConfigPort) =>
            new Runner(config),
        },
      ];
    `);
    expect(result.imports).toEqual([
      { specifier: './config/config.port', form: 'static' },
    ]);
    expect(result.pathLikeStrings).toEqual([]);
  });
});

describe('动态引用', () => {
  it('动态 import() 记为 dynamic（渲染成虚线，与静态导入区分）', () => {
    const result = parse(`const mod = await import('./heavy.js');`);
    expect(result.imports).toEqual([{ specifier: './heavy.js', form: 'dynamic' }]);
  });

  it('插值模板与变量参数静态求不出来，不产出引用（宁可少报也不猜）', () => {
    const result = parse(`
      const a = await import(\`./locale/\${lang}.js\`);
      const b = require(pkgName);
    `);
    expect(result.imports).toEqual([]);
  });
});

describe('worker / 资源 URL 引用', () => {
  it('new URL(..., import.meta.url) 记为资源引用（Vite worker 的唯一写法）', () => {
    const result = parse(`
      this.worker = new Worker(new URL('./graph.worker.ts', import.meta.url), { type: 'module' });
    `);
    expect(result.assetRefs).toEqual(['./graph.worker.ts']);
    expect(result.imports).toEqual([]);
  });

  it('普通 new URL 与其它 new 表达式不算引用', () => {
    const result = parse(`
      const a = new URL('https://example.com/x');
      const b = new URL('./x', location.href);
      const c = new Map();
    `);
    expect(result.assetRefs).toEqual([]);
  });
});

describe('按名引用的字符串（入口判定用）', () => {
  it('像路径的字符串被收集（`tsx scripts/prerender-web.ts` 这类 spawn 依据）', () => {
    const result = parse(`
      runOrExit('pnpm', ['exec', 'tsx', 'scripts/prerender-web.ts']);
      const css = './styles/walker.css';
    `);
    expect(result.pathLikeStrings).toEqual([
      'scripts/prerender-web.ts',
      './styles/walker.css',
    ]);
  });

  it('不像路径的字符串不收集（避免把普通文案灌进入口候选）', () => {
    const result = parse(`
      const label = '关系图谱';
      runOrExit('pnpm', ['--filter', '@walker/web', 'build']);
      const dir = 'apps/web/dist';
    `);
    expect(result.pathLikeStrings).toEqual([]);
  });

  it('字符串去重', () => {
    const result = parse(`const a = 'scripts/x.ts'; const b = 'scripts/x.ts';`);
    expect(result.pathLikeStrings).toEqual(['scripts/x.ts']);
  });

  it('注释里的字符串不算引用（语法树天然免疫）', () => {
    const result = parse(`
      // import x from './fake-in-comment';
      /* const y = 'scripts/also-fake.ts'; */
      const real = 1;
    `);
    expect(result.imports).toEqual([]);
    expect(result.pathLikeStrings).toEqual([]);
  });
});

describe('不变式：import 说明符不得同时被当成「按名引用」', () => {
  it('相对导入的说明符不进入 pathLikeStrings（否则每条导入都把自己变成入口，死文件体检即失效）', () => {
    const result = parse(`
      import { x } from './neighbour';
      import type { Y } from '../up/y.js';
      export * from './re-export';
      const lazy = await import('./lazy');
    `);
    expect(result.imports).toHaveLength(4);
    expect(result.pathLikeStrings).toEqual([]);
  });
});

describe('文件类型', () => {
  it('tsx 按 TSX 解析（否则 JSX 会被当成类型断言，引用也随之漏掉）', () => {
    const result = parseCodeFile(
      `import { useState } from 'react';\nexport const C = () => <div a={1} />;`,
      'apps/web/src/C.tsx',
    );
    expect(result.imports).toEqual([{ specifier: 'react', form: 'static' }]);
  });

  it('不产出任何引用的文件返回空表（不是抛错）', () => {
    const result = parseCodeFile('const a = 1;', 'scripts/plain.ts');
    expect(result).toEqual({ imports: [], assetRefs: [], pathLikeStrings: [] });
  });
});
