import { describe, it, expect } from 'vitest';
import {
  TOOL_MANIFEST,
  PUBLIC_STATS_FIELDS,
  toolsByPermission,
  type ToolPermission,
} from './tools-manifest';

const VALID_PERMISSIONS: ToolPermission[] = ['public', 'user', 'admin', 'system', 'server-only'];
const REQUIRED_FIELDS = ['name', 'endpoint', 'description', 'input', 'output', 'failureReturn'] as const;

describe('tools-manifest (U8 工具契约清单)', () => {
  it('每个工具声明所有必填字段且类型合法', () => {
    expect(TOOL_MANIFEST.length).toBeGreaterThanOrEqual(15);
    for (const tool of TOOL_MANIFEST) {
      for (const field of REQUIRED_FIELDS) {
        expect(tool[field], `${tool.name} 缺字段 ${field}`).toBeTruthy();
      }
      expect(typeof tool.retryable).toBe('boolean');
      expect(typeof tool.writesData).toBe('boolean');
      expect(VALID_PERMISSIONS).toContain(tool.permission);
    }
  });

  it('endpoint 唯一', () => {
    const endpoints = TOOL_MANIFEST.map(t => t.endpoint);
    expect(new Set(endpoints).size).toBe(endpoints.length);
  });

  it('MCP walker_* 工具默认 public 且只读（除 insights）', () => {
    const mcpReadTools = TOOL_MANIFEST.filter(
      t => t.endpoint.startsWith('mcp:walker_') && t.name !== 'walker_insights',
    );
    expect(mcpReadTools.length).toBe(4);
    for (const tool of mcpReadTools) {
      expect(tool.permission, `${tool.name} 应 public`).toBe('public');
      expect(tool.writesData, `${tool.name} 不应写数据`).toBe(false);
    }
  });

  it('walker_insights 默认私有（system 权限）', () => {
    const insights = TOOL_MANIFEST.find(t => t.name === 'walker_insights');
    expect(insights?.permission).toBe('system');
    expect(insights?.writesData).toBe(false);
  });

  it('callGateway 仅服务端、不暴露 key', () => {
    const gw = TOOL_MANIFEST.find(t => t.name === 'callGateway');
    expect(gw?.permission).toBe('server-only');
  });

  it('写类 admin 工具正确标注 writesData', () => {
    const mustWriteEndpoints = ['/api/admin/content', '/api/admin/gateway', '/api/admin/rules', '/api/admin/experience', '/api/admin/skills', '/api/admin/review'];
    for (const tool of TOOL_MANIFEST) {
      if (mustWriteEndpoints.some(ep => tool.endpoint.startsWith(ep))) {
        expect(tool.permission, `${tool.name} 应 admin`).toBe('admin');
        expect(tool.writesData, `${tool.name} 应标注 writesData`).toBe(true);
      }
    }
  });

  it('match 工具需受邀会话且写会话数据', () => {
    const match = TOOL_MANIFEST.find(t => t.name === 'match');
    expect(match?.permission).toBe('user');
    expect(match?.writesData).toBe(true);
  });

  it('公开统计白名单严格收口（不含敏感字段）', () => {
    expect(PUBLIC_STATS_FIELDS).toEqual(['matchCount', 'contentCount', 'topCategories']);
    const allFields = PUBLIC_STATS_FIELDS.join(',').toLowerCase();
    const sensitive = ['session', 'message', 'rawneed', 'ip', 'token', 'key', 'profile', 'feedback'];
    for (const s of sensitive) {
      expect(allFields, `白名单泄露 ${s}`).not.toContain(s);
    }
  });

  it('toolsByPermission 正确分组', () => {
    for (const permission of VALID_PERMISSIONS) {
      const group = toolsByPermission(permission);
      expect(group.every(t => t.permission === permission)).toBe(true);
    }
    expect(toolsByPermission('admin').length).toBeGreaterThan(0);
    expect(toolsByPermission('public').length).toBeGreaterThan(0);
  });
});
