/**
 * 图谱查询语法 —— 照抄 Obsidian Search 语法（权威：docs/PRD-KNOWLEDGE-GRAPH.md §4）。
 *
 * Filters 的 `Search files` 与 Groups 的 query 共用本解析器：解析成 AST 后再对节点求值。
 * 纯函数、无 IO；非法语法返回 { ok: false }，调用方据此降级为「无匹配 + 提示」，不得抛错崩画布。
 *
 * 已知范围限制（诚实记账，见 PRD §8-D7）：属性查询不支持子查询与正则，
 * 仅支持 `[prop]` / `[prop:val]` / `[prop:null]` / `[prop:<n]` / `[prop:>n]`。
 */
import {
  GRAPH_QUERY_OPERATORS,
  GraphQuerySyntaxError,
  type GraphQueryDoc,
  type GraphQueryField,
  type GraphQueryNode,
  type GraphQueryOperator,
  type GraphQueryParseResult,
  type GraphQueryScope,
} from './graph-query-types.js';
import { evaluateGraphQuery } from './graph-query-eval.js';

export * from './graph-query-types.js';
export { evaluateGraphQuery } from './graph-query-eval.js';

const OPERATORS = new Set<string>(GRAPH_QUERY_OPERATORS);
const FIELD_OPERATORS = new Set(['file', 'path', 'content', 'tag']);
const SCOPE_OPERATORS = new Set([
  'line',
  'block',
  'section',
  'task',
  'task-todo',
  'task-done',
]);

// ---------------------------------------------------------------- tokenizer

type Token =
  | { type: 'word'; value: string }
  | { type: 'phrase'; value: string }
  | { type: 'regex'; value: string; flags: string }
  | { type: 'property'; value: string }
  | { type: 'operator'; value: GraphQueryOperator }
  | { type: 'not' }
  | { type: 'or' }
  | { type: 'paren-open' }
  | { type: 'paren-close' };

function readQuoted(input: string, start: number): { value: string; end: number } {
  let out = '';
  let i = start + 1;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === '\\' && i + 1 < input.length) {
      out += input[i + 1]!;
      i += 2;
      continue;
    }
    if (ch === '"') return { value: out, end: i + 1 };
    out += ch;
    i += 1;
  }
  throw new GraphQuerySyntaxError('引号没有闭合');
}

function readBracketed(input: string, start: number): { value: string; end: number } {
  let depth = 0;
  let i = start;
  let quote = false;
  while (i < input.length) {
    const ch = input[i]!;
    if (quote) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') quote = false;
      i += 1;
      continue;
    }
    if (ch === '"') quote = true;
    else if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        return { value: input.slice(start + 1, i), end: i + 1 };
      }
    }
    i += 1;
  }
  throw new GraphQuerySyntaxError('方括号没有闭合');
}

function readRegex(input: string, start: number): { value: string; flags: string; end: number } | null {
  let i = start + 1;
  let pattern = '';
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === '\\' && i + 1 < input.length) {
      pattern += ch + input[i + 1]!;
      i += 2;
      continue;
    }
    if (ch === '/') {
      let j = i + 1;
      let flags = '';
      while (j < input.length && /[imsu]/.test(input[j]!)) {
        flags += input[j]!;
        j += 1;
      }
      return { value: pattern, flags, end: j };
    }
    pattern += ch;
    i += 1;
  }
  return null;
}

export function tokenizeGraphQuery(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const isBreak = (ch: string) => /\s/.test(ch) || ch === '(' || ch === ')';

  outer: while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'paren-open' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'paren-close' });
      i += 1;
      continue;
    }
    if (ch === '[') {
      const read = readBracketed(input, i);
      tokens.push({ type: 'property', value: read.value });
      i = read.end;
      continue;
    }
    if (ch === '"') {
      const read = readQuoted(input, i);
      tokens.push({ type: 'phrase', value: read.value });
      i = read.end;
      continue;
    }
    if (ch === '/') {
      const read = readRegex(input, i);
      if (read) {
        tokens.push({ type: 'regex', value: read.value, flags: read.flags });
        i = read.end;
        continue;
      }
    }
    if (ch === '-') {
      tokens.push({ type: 'not' });
      i += 1;
      continue;
    }

    // 标识符段：遇到 `操作符:` 立即切分，值交给主循环（可能是引号串/正则/括号组）
    const start = i;
    while (i < input.length) {
      const current = input[i]!;
      if (isBreak(current)) break;
      if (current === ':') {
        const name = input.slice(start, i);
        if (OPERATORS.has(name)) {
          tokens.push({ type: 'operator', value: name as GraphQueryOperator });
          i += 1;
          continue outer;
        }
      }
      i += 1;
    }
    const word = input.slice(start, i);
    if (!word) {
      throw new GraphQuerySyntaxError(`无法解析的位置：${input.slice(i, i + 8)}`);
    }
    if (word === 'OR') tokens.push({ type: 'or' });
    else tokens.push({ type: 'word', value: word });
  }
  return tokens;
}

// ------------------------------------------------------------------- parser

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private next(): Token | undefined {
    return this.tokens[this.index++];
  }

  parse(): GraphQueryNode {
    const node = this.parseOr();
    if (this.index < this.tokens.length) {
      throw new GraphQuerySyntaxError('表达式尾部有多余内容');
    }
    return node;
  }

  private parseOr(): GraphQueryNode {
    const children = [this.parseAnd()];
    while (this.peek()?.type === 'or') {
      this.next();
      children.push(this.parseAnd());
    }
    return children.length === 1 ? children[0]! : { kind: 'or', children };
  }

  private parseAnd(): GraphQueryNode {
    const children: GraphQueryNode[] = [];
    for (;;) {
      const token = this.peek();
      if (!token || token.type === 'or' || token.type === 'paren-close') break;
      children.push(this.parseUnary());
    }
    if (children.length === 0) throw new GraphQuerySyntaxError('表达式缺少数值');
    return children.length === 1 ? children[0]! : { kind: 'and', children };
  }

  private parseUnary(): GraphQueryNode {
    const token = this.peek();
    if (token?.type === 'not') {
      this.next();
      return { kind: 'not', child: this.parseUnary() };
    }
    return this.parseAtom();
  }

  private parseAtom(): GraphQueryNode {
    const token = this.next();
    if (!token) throw new GraphQuerySyntaxError('表达式意外结束');
    switch (token.type) {
      case 'paren-open': {
        const inner = this.parseOr();
        const close = this.next();
        if (close?.type !== 'paren-close') {
          throw new GraphQuerySyntaxError('括号没有闭合');
        }
        return inner;
      }
      case 'word':
        return { kind: 'match', field: 'any', raw: token.value, mode: 'text', caseSensitive: false };
      case 'phrase':
        return { kind: 'match', field: 'any', raw: token.value, mode: 'phrase', caseSensitive: false };
      case 'regex':
        return {
          kind: 'match',
          field: 'any',
          raw: token.value,
          mode: 'regex',
          caseSensitive: false,
          flags: token.flags,
        };
      case 'property':
        return parsePropertyToken(token.value);
      case 'operator':
        return this.parseOperator(token.value);
      default:
        throw new GraphQuerySyntaxError('表达式结构非法');
    }
  }

  private parseOperator(name: GraphQueryOperator): GraphQueryNode {
    const child = this.parseOperand();
    if (SCOPE_OPERATORS.has(name)) {
      return { kind: 'scope', scope: name as GraphQueryScope, child };
    }
    if (name === 'match-case') return withCase(child, true);
    if (name === 'ignore-case') return withCase(child, false);
    if (FIELD_OPERATORS.has(name)) return withField(child, name as GraphQueryField);
    throw new GraphQuerySyntaxError(`未知操作符：${name}`);
  }

  private parseOperand(): GraphQueryNode {
    const token = this.peek();
    if (!token) throw new GraphQuerySyntaxError('操作符后面没有值');
    if (token.type === 'not') {
      this.next();
      return { kind: 'not', child: this.parseOperand() };
    }
    return this.parseAtom();
  }
}

function withCase(node: GraphQueryNode, caseSensitive: boolean): GraphQueryNode {
  switch (node.kind) {
    case 'match':
    case 'property':
      return { ...node, caseSensitive };
    case 'and':
    case 'or':
      return { ...node, children: node.children.map((child) => withCase(child, caseSensitive)) };
    case 'not':
      return { ...node, child: withCase(node.child, caseSensitive) };
    case 'scope':
      return { ...node, child: withCase(node.child, caseSensitive) };
  }
}

function withField(node: GraphQueryNode, field: GraphQueryField): GraphQueryNode {
  switch (node.kind) {
    case 'match':
      return { ...node, field };
    case 'and':
    case 'or':
      return { ...node, children: node.children.map((child) => withField(child, field)) };
    case 'not':
      return { ...node, child: withField(node.child, field) };
    case 'scope':
      return { ...node, child: withField(node.child, field) };
    default:
      return node;
  }
}

function parsePropertyToken(raw: string): GraphQueryNode {
  const trimmed = raw.trim();
  if (!trimmed) throw new GraphQuerySyntaxError('属性名为空');
  const cut = trimmed.indexOf(':');
  if (cut === -1) {
    return { kind: 'property', name: trimmed, op: 'exists', value: '', caseSensitive: false };
  }
  const name = trimmed.slice(0, cut).trim();
  let value = trimmed.slice(cut + 1).trim();
  if (!name) throw new GraphQuerySyntaxError('属性名为空');
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    value = value.slice(1, -1);
  }
  if (value.toLowerCase() === 'null') {
    return { kind: 'property', name, op: 'null', value: '', caseSensitive: false };
  }
  const compare = /^([<>])\s*(-?\d+(?:\.\d+)?)$/.exec(value);
  if (compare) {
    return {
      kind: 'property',
      name,
      op: compare[1] === '<' ? 'lt' : 'gt',
      value: compare[2]!,
      caseSensitive: false,
    };
  }
  if (value === '') {
    return { kind: 'property', name, op: 'null', value: '', caseSensitive: false };
  }
  return { kind: 'property', name, op: 'eq', value, caseSensitive: false };
}

export function parseGraphQuery(input: string): GraphQueryParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: '空查询' };
  try {
    const tokens = tokenizeGraphQuery(trimmed);
    if (tokens.length === 0) return { ok: false, error: '空查询' };
    return { ok: true, query: new Parser(tokens).parse() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : '语法错误',
    };
  }
}

/** 便捷入口：解析 + 求值；语法错误一律返回 false（画布不因用户输入崩溃） */
export function matchesGraphQueryText(query: string, doc: GraphQueryDoc): boolean {
  const parsed = parseGraphQuery(query);
  if (!parsed.ok) return false;
  return evaluateGraphQuery(parsed.query, doc);
}
