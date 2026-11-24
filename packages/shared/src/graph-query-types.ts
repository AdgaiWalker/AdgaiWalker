/**
 * 图谱查询 AST、输入文档与语法错误契约（仅依赖 `./graph-types.js`）。
 */
import type { GraphNodeKind } from './graph-types.js';

export const GRAPH_QUERY_OPERATORS = [
  'file',
  'path',
  'content',
  'tag',
  'line',
  'block',
  'section',
  'task',
  'task-todo',
  'task-done',
  'match-case',
  'ignore-case',
] as const;

export type GraphQueryOperator = (typeof GRAPH_QUERY_OPERATORS)[number];

export type GraphQueryField = 'any' | 'file' | 'path' | 'content' | 'tag';
export type GraphQueryScope =
  | 'line'
  | 'block'
  | 'section'
  | 'task'
  | 'task-todo'
  | 'task-done';

export type GraphQueryNode =
  | { kind: 'and'; children: GraphQueryNode[] }
  | { kind: 'or'; children: GraphQueryNode[] }
  | { kind: 'not'; child: GraphQueryNode }
  | {
      kind: 'match';
      field: GraphQueryField;
      raw: string;
      mode: 'text' | 'phrase' | 'regex';
      caseSensitive: boolean;
      /** 仅 mode='regex' 使用；i 由 caseSensitive 决定，g/y 被剔除以免 .test 带状态 */
      flags?: string;
    }
  | {
      kind: 'property';
      name: string;
      op: 'exists' | 'null' | 'eq' | 'lt' | 'gt';
      value: string;
      caseSensitive: boolean;
    }
  | { kind: 'scope'; scope: GraphQueryScope; child: GraphQueryNode };

/** 一个被查询的节点（由图谱节点 + 正文派生） */
export type GraphQueryDoc = {
  id: string;
  kind: GraphNodeKind;
  /** note / ghost 的 slug；tag 节点为空 */
  slug: string;
  title: string;
  /** 内容路径，如 content/log/ferry-theory.md */
  path: string;
  body: string;
  tags: readonly string[];
  /** tag 节点自身的标签名 */
  tag: string;
  props: Record<string, string | number | null>;
};

export type GraphQueryParseResult =
  | { ok: true; query: GraphQueryNode }
  | { ok: false; error: string };

export class GraphQuerySyntaxError extends Error {}
