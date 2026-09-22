export const ADMIN_ROUTES = {
  contentPattern: "/content/:slug",
  agentPattern: "/agents/:id",
  runPattern: "/records/runs/:id",
  overview: "/overview",
  content: "/content",
  agents: "/agents",
  records: "/records",
  settings: "/settings",
  contentDetail: (slug: string) => `/content/${encodeURIComponent(slug)}`,
  agentDetail: (id: string) => `/agents/${encodeURIComponent(id)}`,
  runDetail: (id: string) => `/records/runs/${encodeURIComponent(id)}`,
};
