import { useEffect, useState } from 'react';

interface Item {
  slug: string;
  title: string;
  type: string;
}

/** 内容只读说明：编辑器未迁，真相源在仓库 content/log */
export function ContentPage() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    setItems([]);
  }, []);

  return (
    <div>
      <h1>内容列表</h1>
      <div className="panel">
        <p>
          Markdown 真相源：<code>content/log</code>
        </p>
        <p className="muted">
          就地编辑 / GitHub 回写：<strong>未迁</strong>。改文请直接编辑仓库{' '}
          <code>content/log</code>，构建期经 <code>pnpm content:gen</code> 进入公开站。
        </p>
        <p className="muted">公开阅读：web <code>/posts/:slug</code></p>
        {items.length === 0 ? null : (
          <ul>
            {items.map((i) => (
              <li key={i.slug}>
                {i.title} · {i.type}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
