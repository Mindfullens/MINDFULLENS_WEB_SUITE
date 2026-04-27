export const VIEWPORT_BUILD_MARKER = 'VP-20260425-243-film-lab-wgpu-rb0-parity-diag';
export const SERVICE_BUILD_DATE = '2026.04.25';
export const SERVICE_BUILD_SEQ = 243;
export const SERVICE_BUILD_TAG = `sv-${SERVICE_BUILD_DATE}-${String(SERVICE_BUILD_SEQ).padStart(3, '0')}`;

const _serviceBuildLabelBase = `wersja serwisowa · ${SERVICE_BUILD_TAG}`;

function serviceBuildLabelDevSuffix() {
  if (!import.meta.env.DEV) {
    return '';
  }
  const sha = String(import.meta.env.VITE_FILM_LAB_GIT_SHA || '').trim();
  const stamp = new Date().toLocaleString('pl-PL', {
    hour12: false,
    dateStyle: 'short',
    timeStyle: 'medium',
  });
  return ` · dev · ${stamp}${sha ? ` · ${sha}` : ''}`;
}

/** W Vite `dev` dopisuje czas załadowania modułu i skrót SHA z repo; w `build` produkcyjny tylko baza. */
export const SERVICE_BUILD_LABEL = _serviceBuildLabelBase + serviceBuildLabelDevSuffix();
