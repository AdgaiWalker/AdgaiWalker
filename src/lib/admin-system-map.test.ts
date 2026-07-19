import { describe, expect, it } from 'vitest';
import { ADMIN_API_OWNERSHIP, ADMIN_MODULES, ADMIN_SECONDARY_NAV, resolveAdminModule } from './admin-system-map';

describe('admin system map', () => {
  it('固定为五个责任域，工作台不拥有第二份事实', () => {
    expect(ADMIN_MODULES.map(module => module.id)).toEqual(['workbench', 'needs', 'creation', 'assets', 'system']);
    expect(ADMIN_MODULES.find(module => module.id === 'workbench')?.ownsFacts).toBe(false);
    expect(ADMIN_MODULES.filter(module => module.id !== 'workbench').every(module => module.ownsFacts)).toBe(true);
  });

  it('路由只归属于一个一级模块', () => {
    expect(resolveAdminModule('/admin')).toBe('workbench');
    expect(resolveAdminModule('/admin/accounts/walker')).toBe('needs');
    expect(resolveAdminModule('/admin/hit-rate')).toBe('creation');
    expect(resolveAdminModule('/admin/skills')).toBe('assets');
    expect(resolveAdminModule('/admin/grants')).toBe('system');
  });

  it('每个模块同时声明导航与 API 归属', () => {
    for (const module of ADMIN_MODULES) {
      expect(ADMIN_SECONDARY_NAV[module.id].length).toBeGreaterThan(0);
      expect(ADMIN_API_OWNERSHIP[module.id].length).toBeGreaterThan(0);
    }
  });
});
