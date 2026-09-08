/**
 * HomeChrome — 首页顶栏只保留品牌名。搜索/提问入口是壳层 AskBar（右下），不在本栏。
 */
import { Link } from 'react-router-dom';
import { WEB_ROUTES } from '../../shared/routes';

export function HomeChrome() {
  return (
    <div className="home-chrome">
      <Link to={WEB_ROUTES.home} className="home-mobile-brand" aria-label="Walker 首页">
        Walker
      </Link>
    </div>
  );
}
