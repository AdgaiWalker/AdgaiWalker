/**
 * 图谱查询 AST 求值器 —— 纯函数，仅依赖 `./graph-query-types.js`。
 */
import type {
  GraphQueryDoc,
  GraphQueryField,
  GraphQueryNode,
  GraphQueryScope,
} from './graph-query-types.js';

function includes(haystack: string, needle: string, caseSensitive: boolean): boolean {
  if (!needle) return false;
  return caseSensitive
    ? haystack.includes(needle)
    : haystack.toLowerCase().includes(needle.toLowerCase());
}

function fieldHaystack(doc: GraphQueryDoc, field: GraphQueryField, body: string): string {
  switch (field) {
    case 'file':
      return `${doc.slug}\n${doc.title}`;
    case 'path':
      return doc.path;
    case 'content':
      return body;
    case 'tag':
      return doc.tags.join('\n');
    default:
      return `${doc.slug}\n${doc.title}\n${body}\n${doc.tags.join('\n')}\n${doc.tag}`;
  }
}

function segmentsFor(doc: GraphQueryDoc, scope: GraphQueryScope): string[] {
  const body = doc.body;
  switch (scope) {
    case 'line':
      return body.split('\n');
    case 'block':
      return body.split(/\n\s*\n/);
    case 'section': {
      const sections: string[] = [];
      let current: string[] = [];
      for (const line of body.split('\n')) {
        if (/^#{1,6}\s/.test(line) && current.length) {
          sections.push(current.join('\n'));
          current = [];
        }
        current.push(line);
      }
      sections.push(current.join('\n'));
      return sections;
    }
    case 'task':
      return body.split('\n').filter((line) => /^\s*[-*+]\s+\[[ xX]\]/.test(line));
    case 'task-todo':
      return body.split('\n').filter((line) => /^\s*[-*+]\s+\[ \]/.test(line));
    case 'task-done':
      return body.split('\n').filter((line) => /^\s*[-*+]\s+\[[xX]\]/.test(line));
  }
}

function matchesProperty(doc: GraphQueryDoc, node: Extract<GraphQueryNode, { kind: 'property' }>): boolean {
  const present = Object.prototype.hasOwnProperty.call(doc.props, node.name);
  const value = doc.props[node.name];
  switch (node.op) {
    case 'exists':
      return present && value !== undefined;
    case 'null':
      return present && (value === null || value === '');
    case 'eq': {
      if (!present || value === null || value === undefined) return false;
      if (Array.isArray(value)) {
        return value.some((entry) => includes(String(entry), node.value, node.caseSensitive));
      }
      return node.caseSensitive
        ? String(value) === node.value
        : String(value).toLowerCase() === node.value.toLowerCase();
    }
    case 'lt':
    case 'gt': {
      if (!present || value === null || value === undefined) return false;
      const left = Number(value);
      const right = Number(node.value);
      if (Number.isNaN(left) || Number.isNaN(right)) return false;
      return node.op === 'lt' ? left < right : left > right;
    }
  }
}

export function evaluateGraphQuery(node: GraphQueryNode, doc: GraphQueryDoc): boolean {
  switch (node.kind) {
    case 'and':
      return node.children.every((child) => evaluateGraphQuery(child, doc));
    case 'or':
      return node.children.some((child) => evaluateGraphQuery(child, doc));
    case 'not':
      return !evaluateGraphQuery(node.child, doc);
    case 'property':
      return matchesProperty(doc, node);
    case 'scope': {
      const segments = segmentsFor(doc, node.scope);
      if (segments.length === 0) return false;
      return segments.some((segment) =>
        evaluateGraphQuery(node.child, { ...doc, body: segment }),
      );
    }
    case 'match': {
      const haystack = fieldHaystack(doc, node.field, doc.body);
      // Obsidian 的 tag: 查询写作 tag:#work；本站标签值不带 #，故取值时剥掉前导 #
      const needle =
        node.field === 'tag' ? node.raw.replace(/^#/, '') : node.raw;
      if (node.mode === 'regex') {
        try {
          const base = (node.flags ?? '').replace(/i/g, '');
          const regex = new RegExp(node.raw, base + (node.caseSensitive ? '' : 'i'));
          return regex.test(haystack);
        } catch {
          return false;
        }
      }
      return includes(haystack, needle, node.caseSensitive);
    }
  }
}
