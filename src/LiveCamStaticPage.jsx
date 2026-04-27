import StaticHtmlPage from './StaticHtmlPage';
import liveCamHtml from './static-pages/live.html?raw';

export default function LiveCamStaticPage() {
  return <StaticHtmlPage html={liveCamHtml} idPrefix="live-cam" hostClassName="live-cam-page-host" />;
}
