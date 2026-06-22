/**
 * Admin 对话框 / 通知 薄封装
 *
 * 复用 AdminLayout 注入的 window.WalkerAdminUI（confirm / notify），
 * 统一各 admin 页的 ask / tell 模式，避免重复定义与不一致的默认文案。
 * 未注入（如首次加载 race）时降级为 window.confirm / 不操作。
 */

/** 危险操作二次确认；返回是否确认执行 */
export function confirmAdminAction(
  message: string,
  options: { title?: string; confirmText?: string } = {},
): Promise<boolean> {
  const { title = '确认账号操作', confirmText = '确认执行' } = options;
  return window.WalkerAdminUI?.confirm({ title, message, tone: 'danger', confirmText })
    ?? Promise.resolve(false);
}

/** 操作结果通知（成功 / 失败信息均用此通道） */
export function notifyAdminResult(
  message: string,
  options: { title?: string } = {},
): Promise<void> {
  const { title = '操作结果' } = options;
  return window.WalkerAdminUI?.notify({ title, message }) ?? Promise.resolve();
}
