/**
 * 身份芯片 — 客户端探测 /api/profile，统一更新页面所有 [data-auth-chip]。
 *
 * public → 显 [data-auth-login]
 * user / admin → 显 [data-auth-name]（账号入口，文本变体填充用户名/锚点）+ [data-auth-logout]
 *
 * 一个页面可能有多个芯片（侧栏 / 首页 ghost nav），统一刷新。
 */

async function syncAuthChips(): Promise<void> {
  const chips = document.querySelectorAll<HTMLElement>('[data-auth-chip]');
  if (chips.length === 0) return;

  let authed = false;
  let name = '账号';
  try {
    const res = await fetch('/api/profile', { headers: { 'Cache-Control': 'no-store' } });
    if (res.ok) {
      const data = (await res.json()) as {
        authState?: string;
        profile?: { personaAnchor?: string; nickname?: string; username?: string } | null;
      };
      if (data?.authState === 'admin') {
        authed = true;
        name = '站主';
      } else if (data?.authState === 'user') {
        authed = true;
        name = data.profile?.personaAnchor || data.profile?.nickname || data.profile?.username || '账号';
      }
    }
  } catch {
    /* 离线 / 探测失败：保持未登录态，不阻断页面 */
  }

  chips.forEach(chip => {
    chip.querySelectorAll<HTMLElement>('[data-auth-login]').forEach(el => {
      el.hidden = authed;
    });
    chip.querySelectorAll<HTMLElement>('[data-auth-name]').forEach(el => {
      el.hidden = !authed;
      if (el.hasAttribute('data-auth-fill')) el.textContent = name;
    });
    chip.querySelectorAll<HTMLElement>('[data-auth-logout]').forEach(el => {
      el.hidden = !authed;
    });
  });
}

function wireAuthLogout(): void {
  document.querySelectorAll<HTMLElement>('[data-auth-logout]').forEach(btn => {
    if (btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {
        /* ignore */
      }
      window.location.href = '/';
    });
  });
}

function initAuthChip(): void {
  syncAuthChips();
  wireAuthLogout();
}

initAuthChip();
document.addEventListener('astro:page-load', initAuthChip);
