# Wdrożenie statyczne (Film Lab, Vite SPA)

Aplikacja to **rejestrowana po stronie klienta** nawigacja w `App.jsx` (bez `react-router`); asety i HTML buduje **Vite**. Poniżej: typowe hosty i jedna decyzja: **czy strona wisi pod podkatalogem** (GitHub *project pages*).

## Wspólne

- Pliki tego rozdziału są **sprawdzane w CI** (`npm run test:static-deploy-assets` + kopię w `dist/` w `test:dist-outputs`), żeby przypadkowo nie usunąć reguł SPA / workflow GHP. W [`index.html`](../index.html) musi być `rel="icon"` z `href="/favicon.svg"`; [`public/favicon.svg`](../public/favicon.svg) i [`public/robots.txt`](../public/robots.txt) trafiają do odpowiedników w `dist/` (Vite kopiując `public/`). [`public/_headers`](../public/_headers) — te same podstawowe nagłówki co w [`vercel.json`](../vercel.json) (Netlify / **Cloudflare Pages** czytają `dist/_headers`).
- Build: `npm ci` (lub `npm install`), potem **`npm run build`** (nie surowe `npx vite build` — omija `postbuild` / `test:dist-outputs`) — wynik w `dist/`. **Po każdym** `npm run build` uruchamia się `postbuild` → `test:dist-outputs` (m.in. `404.html` = `index.html` z [pluginu w `vite.config.js`](../vite.config.js), `public/_redirects`, `public/_headers`, `public/robots.txt`, `public/favicon.svg`, [`public/manifest.webmanifest`](../public/manifest.webmanifest)) — jeśli to padnie, zobacz poniżej.
- Ścieżki typu `/film-lab` muszą na serwerze trafiać do tego samego `index.html` (SPA), inaczej odświeżenie strony zwróci 404.
- W buildzie włączana jest kopia **`dist/index.html` → `dist/404.html`** (plugin w `vite.config.js`) — to obsługa **GitHub Pages**: nieznany URL serwuje `404.html`, a ta kopia ładuje tę samą aplikację co główna strona (klient czyta `location.pathname`).

## Vercel

- W repozytorium jest root [`vercel.json`](../vercel.json) (`rewrites` → `index.html`).
- Build command: `npm run build`, output: `dist` (domyślne wykrywanie Vite / ustawienia projektu).

## Netlify

- `public/_redirects` trafia do `dist/_redirects` (reguła SPA); `public/_headers` → `dist/_headers` (nagłówki). [`netlify.toml`](../netlify.toml) — `command` + `publish = "dist"`.

## Cloudflare Pages

- `public/_redirects` (SPA) i `public/_headers` (nagłówki) w `dist/`; ewentualnie reguła rewrite w panelu zamiast `_redirects`. Publish katalog: `dist`.

## GitHub Pages

### Strona użytkownika / organizacji (adres w **korzeniu domeny**)

- Przykład: `https://nazwa.github.io/` — **`base` musi być `/`** (domyślne, bez `VITE_BASE`).
- Wdróż zawartość `dist` (gałąź `gh-pages`, folder `docs` z Pages, albo *GitHub Actions* — poniżej).

### *Project page* (adres z **prefixem repozytorium**)

- Przykład: `https://nazwa.github.io/MINDFULLENS_WEB_SUITE/film-lab` — trzeba zbudować z **`base` = `/<nazwa-repo>/`**, żeby skrypty i CSS ładowały się z właściwej ścieżki.

Trzy równoważne sposoby:

```bash
# 1) Zmienna środowiskowa (też w workflow .github/workflows/pages.yml)
VITE_BASE=/MINDFULLENS_WEB_SUITE/ npm run build

# 2) Flaga Vite
npm run build -- --base /MINDFULLENS_WEB_SUITE/

# 3) Skrypt — wygodnie, gdy znasz tylko „slug” repozytorium
GH_PAGES_REPO=MINDFULLENS_WEB_SUITE npm run build:gh-pages
```

**Podgląd lokalny tego samego `dist`:** serwer `vite preview` musi dostać **ten sam** `VITE_BASE` co przy buildzie (inaczej asety 404). Użyj tej samej pary zmiennych co wyżej:

```bash
# Po build:gh-pages (lub równoważnym VITE_BASE=... npm run build)
GH_PAGES_REPO=MINDFULLENS_WEB_SUITE npm run preview:gh-pages
```

Otworzy `/…/film-lab` zgodnie z `ML_DEV_OPEN` (zob. `scripts/preview-gh-pages.mjs`).

Nazwę katalogu dopasuj do **nazwy repozytorium** na GitHub (wielkość liter w URL bywa znormalizowana — trzymaj się dokładnie tej ścieżki, którą pokazują *Pages*).

Pierwsze uruchomienie: **Settings → Pages → Build and deployment — Source: GitHub Actions** (albo klasyczne „Deploy from a branch” — wtedy generujesz `dist` lokalnie i wypychasz, albo używasz tylko workflow).

### Workflow (ręczny deploy)

- Plik: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) — tylko **`workflow_dispatch`**. W formularzu *Run workflow* opcjonalne pole **„Vite public base”**:
  - **puste** — ustawiane jest `VITE_BASE=/nazwa-repozytorium/` (ta sama etykieta co w URL `https://user.github.io/NAZWA/`);
  - **wypełnione** — używane dosłownie (np. fork z inną nazwą w URL niż lokalne `repo`).

Po skonfigurowaniu Pages: *Actions* → *GitHub Pages (manual)* → *Run workflow*.

Gdy wolisz całkowicie ręczny upload `dist` (zamiast tego workflo­wa), lokalnie: `npm run build:gh-pages` albo `VITE_BASE=… npm run build`, potem wgraj katalog.

## Gdy w CI (lub lokalnie) coś z deployem nie przechodzi

| Objaw | Gdzie szukać |
|--------|----------------|
| Błąd `test:static-deploy-assets` | Przywróć skopiowane pliki: `public/_redirects`, `public/_headers`, `public/manifest.webmanifest`, `vercel.json`, `netlify.toml`, [`.github/workflows/pages.yml`](../.github/workflows/pages.yml). |
| Błąd `test:env-example-parity` (w `npm test` / `ci`) | Dopasuj [`.env.example`](../.env.example) do [`src/vite-env.d.ts`](../src/vite-env.d.ts): każde pole `VITE_*` w `ImportMetaEnv` musi wystąpić w szablonie (nazwa w komentarzu lub przykładowa linia). |
| Błąd `test:dist-outputs` po `npm run build` | Brak plików w `dist/` (`index.html`, `404.html`, `_redirects`, `_headers`, `robots.txt`, `favicon.svg`, `manifest.webmanifest`), albo `404.html` ≠ `index.html` (plugin w `vite.config.js`), albo brak plików z `public/` wymienionych wyżej. Błąd `test:static-deploy-assets` (wcześniej, w `npm test`) często oznacza brak `public/favicon.svg` albo zły tag ikony w `index.html` — to blokuje spójny `dist/`. Używaj `npm run build`, nie `npx vite build` (bez `postbuild`). Nie wycinaj ręcznie `dist/`. Pojedyncze sprawdzenie: `npm run test:dist-outputs` (gdy `dist/` już istnieje). |

## Produkcja: nie mieszaj profilu `batch-perf`

Diagnostyka: `VITE_FILMLAB_BATCH_PERF=1`, `build:preview:perf` itd. — zobacz [README główne — „Inne”](../README.md) i sekcję pomiarów w [docs/README.md](README.md). Do zwykłego deployu użyj zwykłego `npm run build` **bez** tej flagi.
