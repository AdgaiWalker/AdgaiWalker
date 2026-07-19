/**
 * 将 TypeScript MCP server + content-query 打包成单个 JS 文件
 * 用法: node scripts/build-mcp.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function compile(filePath) {
  const code = fs.readFileSync(path.join(ROOT, filePath), 'utf-8');
  return ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
      esModuleInterop: true,
    },
  }).outputText;
}

const queryJS = compile('src/knowledge/content-query.ts');
const mcpJS = compile('src/mcp/index.ts');

// 去掉 MCP 里的 content-query import（已内联）
const mcpClean = mcpJS.replace(
  /import\s*\{[^}]*\}\s*from\s*['"]\.\.\/knowledge\/content-query(\.js)?['"];?\s*/g,
);

const outDir = path.join(ROOT, 'dist', 'mcp');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.mjs'), queryJS + '\n\n' + mcpClean);

console.log('✓ MCP server built → dist/mcp/index.mjs');
