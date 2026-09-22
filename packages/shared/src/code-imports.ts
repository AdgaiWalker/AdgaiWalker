/**
 * 源文件引用的语法层抽取 —— 纯函数，无 IO，**只在 gen 期跑**。
 *
 * 为什么不在 `index.ts` 里导出：本模块依赖 typescript 编译器 API（体积大），
 * 与 `content-load`（Node fs）同一处理 —— 消费方按相对路径显式引入，勿进浏览器 bundle。
 *
 * 只用语法树、不做类型检查：要抽的是「文件里写了什么引用」这一事实，
 * 不是「类型从哪来」。于是 410 个文件是单遍遍历，也不受类型错误影响。
 */
import ts from 'typescript';

/** `static` = import / export-from / `import type`；`dynamic` = `import()` */
export type ImportForm = 'static' | 'dynamic';

export type ParsedImport = {
  /** 原始说明符，如 `./errors.js` / `@walker/shared` / `react` */
  specifier: string;
  form: ImportForm;
};

export type ParsedCodeFile = {
  imports: ParsedImport[];
  /**
   * `new URL('<相对路径>', import.meta.url)` —— 打包器识别的 worker / 资源引用。
   * 它不是 import 语句，但确实是依赖：漏了会让 `graph.worker.ts` 变成假死文件。
   */
  assetRefs: string[];
  /**
   * 「看起来像路径」的字符串字面量（如 `'scripts/prerender-web.ts'`）。
   * 只有一个用途：识别**按名被直接执行**的文件（`tsx scripts/xxx.ts` 之流），
   * 让它们成为可达性入口，而不是假死文件。
   *
   * 注意：import 说明符**不计入**此处。否则每条相对导入都会把自己变成入口，
   * 死文件体检会被整体架空 —— 这是本文件最要紧的一条不变式。
   */
  pathLikeStrings: string[];
};

/**
 * 像路径的字符串：以 `./` `../` `/` 开头，或带一个像扩展名的尾巴。
 * 故意宽松（后面还要拿真实文件表去核），因为「像路径」只用来缩小候选范围。
 */
const PATH_LIKE =
  /^(?:\.{1,2}\/|\/)|\.(?:ts|tsx|mts|cts|js|mjs|cjs|json|css|md|html|svg|png|jpe?g|webp|toml|ya?ml)$/i;

function scriptKindOf(fileName: string): ts.ScriptKind {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.m?js$/i.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** 是否是 `import.meta.url` */
function isImportMetaUrl(node: ts.Node): boolean {
  if (!ts.isPropertyAccessExpression(node)) return false;
  if (node.name.text !== 'url') return false;
  const target = node.expression;
  return (
    ts.isMetaProperty(target) && target.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

/** `new URL('./x', import.meta.url)` → `'./x'`；不是该形式返回 null */
function assetRefOf(node: ts.NewExpression): string | null {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== 'URL') return null;
  const args = node.arguments;
  if (!args || args.length < 2) return null;
  const first = args[0];
  const second = args[1];
  if (!first || !ts.isStringLiteral(first)) return null;
  if (!second || !isImportMetaUrl(second)) return null;
  return first.text;
}

/**
 * 抽出一个源文件的全部引用。
 *
 * 识别的形式（其余一律忽略，例如 `require(variableName)` 这种静态求不出来的）：
 * 1. `import ... from 'x'` / `import 'x'` / `import type ... from 'x'`
 * 2. `export ... from 'x'` / `export * from 'x'`
 * 3. `import('x')`
 * 4. `new URL('x', import.meta.url)`
 * 5. 像路径的字符串字面量（仅用于入口判定）
 */
export function parseCodeFile(source: string, fileName: string): ParsedCodeFile {
  const parsed = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    scriptKindOf(fileName),
  );

  const imports: ParsedImport[] = [];
  const assetRefs: string[] = [];
  const pathLike: string[] = [];

  const visit = (node: ts.Node): void => {
    // 1) / 2) 静态引用。命中即返回，不深入说明符 —— 否则它会被当成「按名引用」
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = node.moduleSpecifier;
      if (specifier && ts.isStringLiteral(specifier)) {
        imports.push({ specifier: specifier.text, form: 'static' });
      }
      return;
    }

    // 3) 动态 import()
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first)) {
        imports.push({ specifier: first.text, form: 'dynamic' });
      }
      return;
    }

    // 3b) **类型位置**的 import 类型表达式：`(config: import('./config.port').AppConfigPort) =>`
    //     它在语法树里既不是 ImportDeclaration 也不是 CallExpression，而是 ImportTypeNode。
    //     漏了它，说明符会掉进「像路径的字符串」里被误判成入口（本仓 kernel.module.ts 就是如此）。
    if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
        imports.push({ specifier: argument.literal.text, form: 'static' });
      }
      return;
    }

    // 4) worker / 资源 URL 引用
    if (ts.isNewExpression(node)) {
      const ref = assetRefOf(node);
      if (ref) {
        assetRefs.push(ref);
        return;
      }
    }

    // 5) 像路径的字符串字面量（含插值的模板串静态求不出来，跳过）
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (PATH_LIKE.test(node.text)) pathLike.push(node.text);
      return;
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(parsed, visit);

  return {
    imports,
    assetRefs: [...new Set(assetRefs)],
    pathLikeStrings: [...new Set(pathLike)],
  };
}
