import StaticHtmlPage from './StaticHtmlPage';
import filmLabHtml from './static-pages/film-lab.html?raw';

export default function FilmLabStaticPage() {
  return <StaticHtmlPage html={filmLabHtml} idPrefix="film-lab" hostClassName="film-lab-page-host" />;
}
