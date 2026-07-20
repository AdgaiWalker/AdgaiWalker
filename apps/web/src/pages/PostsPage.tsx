import { getPublishedPosts } from '../content';
import { ItemList } from '../components/ItemList';

export function PostsPage() {
  const posts = getPublishedPosts();
  return (
    <div>
      <h1 className="page-title">文章</h1>
      <p className="page-lead">共 {posts.length} 篇 · 来自 src/content/log</p>
      <div className="panel-glass" style={{ padding: '0.5rem 1.25rem', borderRadius: 24 }}>
        <ItemList items={posts} />
      </div>
    </div>
  );
}
