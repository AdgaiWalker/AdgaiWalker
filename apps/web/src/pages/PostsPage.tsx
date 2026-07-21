import { Link } from 'react-router-dom';
import { getPublishedPosts } from '../content';
import { ItemList } from '../components/ItemList';
import { dualEntry } from '../shared/dual-entry';

export function PostsPage() {
  const posts = getPublishedPosts();
  return (
    <div>
      <h1 className="page-title">{dualEntry.browse.title}</h1>
      <p className="page-lead">
        共 {posts.length} 篇已发布笔记。卡住时也可直接{' '}
        <Link to={dualEntry.ask.path}>{dualEntry.ask.cta}</Link>。
      </p>
      <div className="surface-l2" style={{ padding: '0.5rem 1.25rem' }}>
        <ItemList items={posts} />
      </div>
    </div>
  );
}
