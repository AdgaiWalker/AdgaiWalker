/**
 * 账号角色 / 状态中文标签
 *
 * 在 frontmatter 和 client script 之间共享同一份纯函数，
 * 避免 roleLabel 在多个 admin 页面重复定义（DRY）。
 */

export type AccountRole = 'user' | 'admin' | 'owner';

/** 角色中文标签：owner=站主、admin=管理员、user=用户 */
export function roleLabel(role: string): string {
  if (role === 'owner') return '站主';
  if (role === 'admin') return '管理员';
  return '用户';
}
