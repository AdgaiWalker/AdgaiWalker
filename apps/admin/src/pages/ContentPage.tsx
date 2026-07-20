import { useEffect, useState } from 'react';

interface Item {
  slug: string;
  title: string;
  type: string;
}

/** 内容列表只读（GitHub 编辑未迁，标明） */
export function ContentPage() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    // 开发态：从 web 同源无此数据；admin 仅展示说明 + 可选 fetch 公开站生成物不可用
    // 用 metrics 健康与说明代替整包编辑器
    setItems([]);
  }, []);

  return (
    <div>
      <h1>内容列表</h1>
      <div className="panel">
        <p>
          站内 Markdown 真相源：<code>src/content/log</code>
        </p>
        <p className="muted">
          就地编辑 / GitHub 回写：<strong>未迁</strong>（Stage 1 不整迁旧 Admin
          编辑器）。请在仓库或现网 Astro 对照流编辑。
        </p>
        <p className="muted">公开阅读请用 web：/posts/:slug</p>
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
