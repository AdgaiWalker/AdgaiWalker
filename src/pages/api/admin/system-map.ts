import type { APIRoute } from 'astro';
import { isAdmin } from '@/lib/admin-auth';
import { ADMIN_API_OWNERSHIP, ADMIN_MODULES, ADMIN_RELATIONSHIPS, ADMIN_SECONDARY_NAV } from '@/lib/admin-system-map';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  if (!isAdmin(request)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  return Response.json({
    ok: true,
    version: 1,
    contract: 'Evidence -> Decision -> Action -> Outcome -> Capability',
    modules: ADMIN_MODULES.map(module => ({
      ...module,
      navigation: ADMIN_SECONDARY_NAV[module.id],
      apiPrefixes: ADMIN_API_OWNERSHIP[module.id],
    })),
    relationships: ADMIN_RELATIONSHIPS,
  });
};
