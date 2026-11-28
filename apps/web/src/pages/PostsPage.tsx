/**
 * 文章目录（/posts）— Wiki 检索 + 三章筛选 + 按年归档；右上角进入脉络。
 * 章节与检索词都放在 URL（?c=see|use|make&q=...），单入口 navigate(replace) 同步，可分享可回退。
 */
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getBrowseItems } from '../content';
import { EntryList } from '../components/paper/EntryList';
import { CHAPTERS, chapterById, chapterOf, parseChapterId } from '../shared/chapters';
import { dualEntry } from '../shared/dual-entry';
import { parseIsoDate } from '../shared/format';
import { groupPostsByYear } from '../shared/posts-timeline';
import { CHAPTER_QUERY_KEY, WEB_ROUTES } from '../shared/routes';

export function PostsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const active = parseChapterId(params.get(CHAPTER_QUERY_KEY));
  const query = params.get('q') ?? '';
  const needle = query.trim().toLowerCase();

  const all = useMemo(
    () =>
      [...getBrowseItems()].sort(
        (a, b) => parseIsoDate(b.date).getTime() - parseIsoDate(a.date).getTime(),
      ),
    [],
  );
  const visible = useMemo(() => {
    const byChapter = active ? all.filter((item) => chapterOf(item) === active) : all;
    if (!needle) return byChapter;
    return byChapter.filter((item) => {
      const haystack = `${item.title} ${item.summary} ${item.series ?? ''} ${(item.tags ?? []).join(' ')} ${item.body}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [all, active, needle]);
  const byYear = useMemo(() => groupPostsByYear(visible), [visible]);

  const buildBrowseHref = (nextChapter?: string, nextQ = query) => {
    const next = new URLSearchParams();
    if (nextChapter) next.set(CHAPTER_QUERY_KEY, nextChapter);
    if (nextQ.trim()) next.set('q', nextQ);
    const search = next.toString();
    return search ? `${WEB_ROUTES.browse}?${search}` : WEB_ROUTES.browse;
  };

  const updateQuery = (nextQ: string) => {
    const next = new URLSearchParams();
    if (active) next.set(CHAPTER_QUERY_KEY, active);
    if (nextQ.trim()) next.set('q', nextQ);
    const search = next.toString();
    navigate({ pathname: WEB_ROUTES.browse, search: search ? `?${search}` : '' }, { replace: true });
  };

  return (
    <div className="measure">
      <header className="page-head">
        <h1 className="page-title">{dualEntry.browse.title}</h1>
        {active ? <p className="page-dek">{chapterById(active).dek}</p> : null}
      </header>

      <input
        type="search"
        className="wiki-filter"
        aria-label="检索 Wiki 条目"
        placeholder="搜索…"
        value={query}
        onChange={(event) => updateQuery(event.target.value)}
      />

      <nav className="tabs" aria-label="章节">
        <Link to={buildBrowseHref()} className="tab" aria-current={active ? undefined : 'page'}>
          全部
        </Link>
        {CHAPTERS.map((chapter) => (
          <Link
            key={chapter.id}
            to={buildBrowseHref(chapter.id)}
            className="tab"
            aria-current={active === chapter.id ? 'page' : undefined}
          >
            <span className="tab-no">{chapter.no}</span>
            {chapter.label}
          </Link>
        ))}
        <Link to={WEB_ROUTES.graph} className="tab tab-aside">
          脉络
        </Link>
      </nav>

      {byYear.length === 0 ? (
        <p className="empty-note">{needle ? '没有匹配的条目。' : '这一章还没有文章。'}</p>
      ) : (
        byYear.map(({ year, items }) => (
          <section key={year || 'unknown'} className="year-group" aria-label={`${year} 年`}>
            <h2 className="year-label">{year > 0 ? year : '—'}</h2>
            <EntryList items={items} />
          </section>
        ))
      )}
    </div>
  );
}
