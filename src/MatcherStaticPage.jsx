import StaticHtmlPage from './StaticHtmlPage';
import matcherHtml from './static-pages/matcher.html?raw';

export default function MatcherStaticPage() {
  return <StaticHtmlPage html={matcherHtml} idPrefix="matcher" hostClassName="matcher-page-host" />;
}
