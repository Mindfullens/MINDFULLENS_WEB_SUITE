import StaticHtmlPage from './StaticHtmlPage';
import ciemniaHtml from './static-pages/ciemnia.html?raw';

export default function CiemniaStaticPage() {
  return <StaticHtmlPage html={ciemniaHtml} idPrefix="ciemnia" hostClassName="ciemnia-page-host" />;
}
