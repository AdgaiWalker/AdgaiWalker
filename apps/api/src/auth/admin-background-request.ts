/**
 * 「这次请求是不是自动的」：后台日志与运行监控共用的**唯一**判据。
 *
 * 为什么必须只有一份：两处各写一遍，迟早分叉——一处把某类轮询当人工操作、另一处不当，
 * 于是审计里多出噪音，或者真实的轮询被当成站主点过（"据此查错人"那类事故的亲兄弟）。
 *
 * 判据与既有行为完全一致（这次只是抽函数，不改语义）：
 * - 带 `x-admin-background-poll: 1` 的 GET；
 * - 带该头的发布预检 POST（只读的 POST，不是变更操作）。
 *
 * **变更方法永不算自动：不信任这个标记。**（既有中间件注释里的原话）
 */
export const ADMIN_BACKGROUND_POLL_HEADER = 'x-admin-background-poll';
export const CONTENT_RELEASE_PREFLIGHT_PATH = '/admin/content/release/preflight';

export function isBackgroundAdminRequest(input: {
  marker: string | undefined;
  method: string;
  path: string;
}): boolean {
  if (input.marker !== '1') return false;
  if (input.method === 'GET') return true;
  return input.method === 'POST' && input.path === CONTENT_RELEASE_PREFLIGHT_PATH;
}
