import { lazy, Suspense } from 'react';
import { useI18n } from './i18n';
import LandingPage from './LandingPage';

const TimeMachinePage = lazy(() => import('./TimeMachinePage'));
const AnalogSignaturePage = lazy(() => import('./AnalogSignaturePage'));
const FilmLab = lazy(() => import('./FilmLab'));
const CiemniaStaticPage = lazy(() => import('./CiemniaStaticPage'));
const LiveCamStaticPage = lazy(() => import('./LiveCamStaticPage'));
const MatcherStaticPage = lazy(() => import('./MatcherStaticPage'));

function RouteLoadingFallback() {
  const { t } = useI18n();
  return (
    <div
      className="grid min-h-[100dvh] place-items-center bg-[#0a0a0a] text-[rgba(255,255,255,0.78)] text-[0.9rem] font-sans tracking-[0.02em]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {t('app.loading')}
    </div>
  );
}

function normalizePath(pathname) {
  let trimmed = pathname.replace(/\/+$/, '') || '/';
  const rawBase = import.meta.env.BASE_URL || '/';
  const base = String(rawBase).replace(/\/+$/, '');
  if (base && trimmed.startsWith(base)) {
    trimmed = trimmed.slice(base.length) || '/';
    if (!trimmed.startsWith('/')) trimmed = `/${trimmed}`;
  }
  return trimmed;
}

export default function App() {
  const path = normalizePath(window.location.pathname);
  let PageComponent = LandingPage;

  if (path === '/' || path === '/index.html') {
    PageComponent = LandingPage;
  } else if (path === '/timemachine') {
    PageComponent = TimeMachinePage;
  } else if (path === '/analog-signature') {
    PageComponent = AnalogSignaturePage;
  } else if (path === '/film-lab' || path.startsWith('/film-lab/')) {
    PageComponent = FilmLab;
  } else if (path === '/ciemnia') {
    PageComponent = CiemniaStaticPage;
  } else if (path === '/live') {
    PageComponent = LiveCamStaticPage;
  } else if (path === '/landing') {
    PageComponent = LandingPage;
  } else if (path === '/matcher') {
    PageComponent = MatcherStaticPage;
  }

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <PageComponent />
    </Suspense>
  );
}
