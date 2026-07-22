/**
 * 学习深链（页）
 * 职责：旧 guide/track/slug → 已发布内容；无第二套 guide 实体。
 *
 * 依赖：content 门面
 * 调用：无 HTTP
 * 触发：/learn/guide|track|:slug
 * 实现：Navigate 到逛详情
 */
import { Navigate, useParams } from 'react-router-dom';
import { getByType, getPostBySlug } from '../content';
import { dualEntry } from '../shared/dual-entry';
import { WEB_ROUTES } from '../shared/routes';

export function LearnGuideRedirectPage() {
  const { level, tool, slug, id } = useParams();
  const key = (tool || slug || id || '').trim();

  if (key) {
    const bySlug = getPostBySlug(key);
    if (bySlug) {
      return (
        <Navigate
          to={`${dualEntry.browse.path}/${encodeURIComponent(bySlug.slug)}`}
          replace
        />
      );
    }
  }

  if (level) {
    const match = getByType('learn').find(
      (g) =>
        g.level === level &&
        (!key || g.slug === key || g.tags.includes(key)),
    );
    if (match) {
      return (
        <Navigate
          to={`${dualEntry.browse.path}/${encodeURIComponent(match.slug)}`}
          replace
        />
      );
    }
  }

  return <Navigate to={WEB_ROUTES.learn} replace />;
}
