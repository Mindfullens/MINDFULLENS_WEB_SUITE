/**
 * Wspólna logika `VITE_BASE` / `GH_PAGES_REPO` dla buildu i podglądu GHP.
 * @see docs/DEPLOY.md
 */
export function normalizeViteBase(raw) {
  let s = String(raw ?? '').trim().replace(/\/+/g, '/');
  if (!s || s === '/') {
    return '/';
  }
  const withLead = s.startsWith('/') ? s : `/${s}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
}

/** Zwraca znormalizowany `base` albo `null` (trzeba wypisać błąd i wyjść w wywołującym). */
export function resolveViteBaseFromProcessEnv() {
  const explicit = (process.env.VITE_BASE ?? '').trim();
  const repoSlug = (process.env.GH_PAGES_REPO ?? '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (explicit) {
    return normalizeViteBase(explicit);
  }
  if (repoSlug) {
    return normalizeViteBase(repoSlug);
  }
  return null;
}

export function filmLabOpenPathForBase(viteBase) {
  const b = normalizeViteBase(viteBase);
  if (b === '/') {
    return '/film-lab';
  }
  return `${b.replace(/\/$/, '')}/film-lab`;
}
