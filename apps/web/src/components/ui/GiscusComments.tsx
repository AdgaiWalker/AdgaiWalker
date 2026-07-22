/**
 * Giscus 评论展示 — 仅当配置了仓库 env 时挂载。
 * 触发：详情页挂载；依赖：window 脚本加载。
 */
import { useEffect, useRef } from 'react';

function readGiscusConfig(): {
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
} | null {
  const env = import.meta.env;
  const repo = (env.VITE_GISCUS_REPO as string | undefined)?.trim();
  const repoId = (env.VITE_GISCUS_REPO_ID as string | undefined)?.trim();
  const category = (env.VITE_GISCUS_CATEGORY as string | undefined)?.trim();
  const categoryId = (env.VITE_GISCUS_CATEGORY_ID as string | undefined)?.trim();
  if (!repo || !repoId || !category || !categoryId) return null;
  return { repo, repoId, category, categoryId };
}

export function GiscusComments({ term }: { term: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cfg = readGiscusConfig();

  useEffect(() => {
    if (!cfg || !hostRef.current || !term) return;
    const host = hostRef.current;
    host.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-repo', cfg.repo);
    script.setAttribute('data-repo-id', cfg.repoId);
    script.setAttribute('data-category', cfg.category);
    script.setAttribute('data-category-id', cfg.categoryId);
    script.setAttribute('data-mapping', 'specific');
    script.setAttribute('data-term', term);
    script.setAttribute('data-strict', '1');
    script.setAttribute('data-reactions-enabled', '1');
    script.setAttribute('data-emit-metadata', '0');
    script.setAttribute('data-input-position', 'bottom');
    script.setAttribute('data-theme', 'preferred_color_scheme');
    script.setAttribute('data-lang', 'zh-CN');
    host.appendChild(script);

    return () => {
      host.innerHTML = '';
    };
  }, [cfg, term]);

  if (!cfg) return null;

  return (
    <section
      className="surface-l2"
      style={{ marginTop: '1.25rem', padding: '1rem 1.1rem' }}
      aria-label="评论"
    >
      <div ref={hostRef} />
    </section>
  );
}
