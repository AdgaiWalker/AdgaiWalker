import { describe, expect, it } from 'vitest';
import {
  evaluateGraphQuery,
  matchesGraphQueryText,
  parseGraphQuery,
  type GraphQueryDoc,
} from './graph-query.js';

function doc(overrides: Partial<GraphQueryDoc> = {}): GraphQueryDoc {
  return {
    id: 'note:ferry-theory',
    kind: 'note',
    slug: 'ferry-theory',
    title: 'Ferry · 差距驱动行动',
    path: 'content/log/ferry-theory.md',
    body: '## 两个视图\n\ncos 是模糊区，sin 是具体任务。\n\n- [ ] 读一遍 subtraction-dialogue\n',
    tags: ['AI', '方法论'],
    tag: '',
    props: {
      hall: 'showcase',
      type: 'project',
      series: 'Ferry',
      seriesOrder: 1,
      level: 'AI-4',
      empty: '',
    },
    ...overrides,
  };
}

function match(query: string, target: GraphQueryDoc = doc()): boolean {
  const parsed = parseGraphQuery(query);
  if (!parsed.ok) throw new Error(`解析失败：${query} → ${parsed.error}`);
  return evaluateGraphQuery(parsed.query, target);
}

describe('查询解析', () => {
  it('空查询与语法错误返回 ok=false，不抛错', () => {
    expect(parseGraphQuery('   ').ok).toBe(false);
    expect(parseGraphQuery('((a').ok).toBe(false);
    expect(parseGraphQuery('tag:').ok).toBe(false);
    expect(parseGraphQuery('"未闭合').ok).toBe(false);
  });

  it('AND / OR / 括号 / 否定 组合成正确结构', () => {
    const parsed = parseGraphQuery('a b OR c');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.query.kind).toBe('or');
  });

  it('语法错误时 matchesGraphQueryText 返回 false（画布不崩）', () => {
    expect(matchesGraphQueryText('((a', doc())).toBe(false);
  });
});

describe('字段操作符', () => {
  it('裸词匹配文件名与正文，默认忽略大小写', () => {
    expect(match('ferry')).toBe(true);
    expect(match('FERRY')).toBe(true);
    expect(match('submarine')).toBe(false);
  });

  it('file: 只匹配 slug/title，content: 只匹配正文', () => {
    expect(match('file:ferry-theory')).toBe(true);
    expect(match('file:两个视图')).toBe(false);
    expect(match('content:两个视图')).toBe(true);
    expect(match('content:ferry-theory')).toBe(false);
  });

  it('path: 匹配内容路径', () => {
    expect(match('path:content/log')).toBe(true);
    expect(match('path:"content/log/ferry-theory.md"')).toBe(true);
    expect(match('path:nope')).toBe(false);
  });

  it('tag: 带与不带 # 等价', () => {
    expect(match('tag:#AI')).toBe(true);
    expect(match('tag:AI')).toBe(true);
    expect(match('tag:不存在')).toBe(false);
  });
});

describe('属性查询', () => {
  it('[prop] 判存在、[prop:val] 判等值、[prop:null] 判空', () => {
    expect(match('[series]')).toBe(true);
    expect(match('[nope]')).toBe(false);
    expect(match('[series:Ferry]')).toBe(true);
    expect(match('[series:ferry]')).toBe(true);
    expect(match('[empty:null]')).toBe(true);
    expect(match('[series:null]')).toBe(false);
  });

  it('[prop:<n] / [prop:>n] 数值比较', () => {
    expect(match('[seriesOrder:<3]')).toBe(true);
    expect(match('[seriesOrder:>3]')).toBe(false);
    expect(match('[seriesOrder:<abc]')).toBe(false);
  });
});

describe('范围操作符', () => {
  it('line: 要求同一行内同时命中', () => {
    expect(match('line:(cos sin)')).toBe(true);
    expect(match('line:(cos 读一遍)')).toBe(false);
  });

  it('section: 在同一标题区间内命中', () => {
    expect(match('section:(cos 读一遍)')).toBe(true);
  });

  it('block: 在同一段落内命中', () => {
    expect(match('block:(cos sin)')).toBe(true);
    expect(match('block:(cos 读一遍)')).toBe(false);
  });

  it('task: / task-todo: / task-done: 按任务状态', () => {
    expect(match('task:读一遍')).toBe(true);
    expect(match('task-todo:读一遍')).toBe(true);
    expect(match('task-done:读一遍')).toBe(false);
  });
});

describe('大小写与正则', () => {
  it('match-case: 只影响其操作数', () => {
    expect(match('match-case:Ferry')).toBe(true);
    expect(match('match-case:FERRY')).toBe(false);
    expect(match('ignore-case:FERRY')).toBe(true);
  });

  it('正则按 JavaScript 风格，非法正则不匹配也不抛错', () => {
    expect(match('/\\(cos\\)?|sin/')).toBe(true);
    expect(match('/[unclosed/')).toBe(false);
  });
});

describe('否定与逻辑组合', () => {
  it('否定字段查询', () => {
    expect(match('-path:content/log')).toBe(false);
    expect(match('-content:两个视图')).toBe(false);
    expect(match('-content:不存在的词')).toBe(true);
  });

  it('AND 需要全部命中，OR 只需一个', () => {
    expect(match('cos sin')).toBe(true);
    expect(match('cos 不存在的词')).toBe(false);
    expect(match('不存在的词 OR sin')).toBe(true);
    expect(match('(cos OR 不存在的词) sin')).toBe(true);
    expect(match('(cos OR 不存在的词) 也不存在')).toBe(false);
  });
});
