# Dokumentacja (MindfulLens Film Lab) — mapa planów

## Film Lab: kanoniczne plany

- [`MINDFULLENS_FILM_LAB_PLAN_V3_1.md`](MINDFULLENS_FILM_LAB_PLAN_V3_1.md): aktywna roadmapa strategiczno-wdrożeniowa (poza nią nie trzymaj równoległego "master planu").
- [`PLAN_SPRINTOWY_90_DNI.md`](PLAN_SPRINTOWY_90_DNI.md): horyzont 90 dni, zsynchronizowany z repozytorium (statusy sprintów, hardening, KPI: jak mierzyć vs co jest celem).
- [`SPRINT_1_EXECUTION.md`](SPRINT_1_EXECUTION.md): wykonanie Sprintu 1 (stabilizacja podglądu / skróty / diagnostyka / regresje); u góry dokumentu jest też krótka **aktualizacja po S1** z odsyłaczem do baseline A/B (v3.1 §9.12).

## Inne (nie zastępują roadmapy Film Lab)

- [`CROP_TOOL_ARCHITEKTURA_I_IMPLEMENTACJA.md`](CROP_TOOL_ARCHITEKTURA_I_IMPLEMENTACJA.md): architektura narzędzia crop (osobny moduł).

## Szybkie odniesienia do "gate" jakości w kodzie

- Skrypty: zobacz sekcję `scripts` w `package.json` (m.in. `lint:fix`, **`clean`** — usuwa `dist`, `.eslintcache`, `.vite`, `coverage`, `.turbo`, `.cache`). `lint` obejmuje też root [`vite.config.js`](../vite.config.js) i [`eslint.config.mjs`](../eslint.config.mjs) (React, **`eslint-plugin-react-hooks`** — *Rules of Hooks*); używa **cache** ESLint (szybsze powtórne uruchomienia; w [workflow CI](../.github/workflows/ci.yml) jest krok *Cache ESLint* z [`actions/cache`](https://github.com/actions/cache), klucz m.in. po `eslint.config.mjs` + `vite.config.js`).
- **Node:** w repozytorium jest [`.nvmrc`](../.nvmrc) (zgodny z CI); użyj `nvm use` / `fnm use` itd.
- **Edytor (JavaScript, bez TypeScriptu):** [`jsconfig.json`](../jsconfig.json) — ułatwia nawigację i importy w VS Code / Cursor. [`src/vite-env.d.ts`](../src/vite-env.d.ts) — typy `import.meta.env` (Vite + flagi `VITE_FILMLAB_*` itd.).
- **Zależności:** [Dependabot](https://docs.github.com/en/code-security/dependabot) — [`.github/dependabot.yml`](../.github/dependabot.yml) (comiesięczne PR z `npm` [grupy *development* / *production*] i `github-actions`).
- **`npm audit`:** stack dev: **Vite 6.4.2+** (zob. `package.json`), `@vitejs/plugin-react` 4.4+; `npm audit fix` dla reszty (np. `postcss`). Po zmianach warto `npm run audit` przed releasem.
- **Deploy:** [Szczegółowy przewodnik (Vercel, Netlify, Cloudflare, GitHub Pages, `VITE_BASE` / project pages)](DEPLOY.md). Lokalny build pod *project page*: `GH_PAGES_REPO=nazwa-repo npm run build:gh-pages` (w Cursor/VS Code: *Tasks* → *Film Lab: build for GitHub Pages*). Podgląd `dist` z tym samym `base`: to samo `GH_PAGES_REPO=… npm run preview:gh-pages` (task *Film Lab: preview for GitHub Pages*). Po `npm run build` działa `postbuild` — `test:dist-outputs` (task *Film Lab: test dist outputs*; wymaga świeżego `dist/`).
- **`npm test`** — skryptowe testy (`regression` + `crop-geometry` + `deep-audit` + `gh-pages-base` + `static-deploy-assets` + `env-example-parity` + `vite-toolchain`); szybsze niż `ci` (bez ESLinta i Vite build). Wycinek: `npm run test:gh-pages-base`, `test:static-deploy-assets`, `test:env-example-parity`, `test:vite-toolchain`.
- **`npm run preflight`** — `lint` + `npm test` (bez `vite build`); szybki check przed PR.
- **`npm run ci`** (to samo co **`npm run check`**) — `lint` → testy skryptowe + **`test:raw-reference`** (gate RAW reference, quality + recovery2d) → `vite build` → **`npm audit`** (tak jest w GitHub Actions; na końcu udanych runów [job summary](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#adding-a-job-summary)); bez pełnego drzewa wtyczki Lightroom. Samo `preflight` (`lint` + `npm test`) nie uruchamia builda ani auditu.
- **`npm run ci:smoke`** — to samo co `ci`, plus `profiles:verify-source` (wymaga plików źródeł profili w `MindfulLens_System_Master/...`).
- Inne: `raw:release:check`, itd.
- **Auto-kalibracja manifestu RAW:** `npm run raw:manifest:build:suggested` uzupełnia sugerowane progi **quality** (`maxDeltaEMean`, `maxDeltaEP95`, `minSsim`) oraz **recovery2d** (`maxRecoveryPostHighlightClipRatio`, `maxRecoveryPostShadowClipRatio`) tam, gdzie raport zawiera odpowiednie metryki.
- W Cursor / VS Code: **Tasks** (polecenia `Film Lab:…`) — [`.vscode/tasks.json`](../.vscode/tasks.json); m.in. **baseline A/B main preview WebGPU:** task `Film Lab: dev + WebGPU proxy + main preview A/B + open /film-lab` (to samo co `npm run dev:webgpu:main-ab`) oraz build+preview: `Film Lab: build + preview (WebGPU proxy + main A/B, baseline)` → `build:preview:webgpu:main-ab`. Do debugowania w Chrome: [`.vscode/launch.json`](../.vscode/launch.json) (najpierw uruchom Vite, np. `npm run dev` / `dev:open` / `dev:perf` — F5 tylko otwiera `http://127.0.0.1:4174/film-lab`); zalecane rozszerzenia: ESLint + Tailwind CSS IntelliSense ([`.vscode/extensions.json`](../.vscode/extensions.json)).
- **`http://127.0.0.1:4174/film-lab` „nie działa” (brak strony / connection refused):** Vite **musi** być uruchomiony w tym repozytorium — `npm run dev` albo `npm start` (port `4174`, `strictPort`). Bez tego port jest pusty. Podgląd z zbudowanego `dist/` (bez HMR): `npm run build && npm run preview`.
- **Dostęp z innego urządzenia w LAN (np. `http://192.168.x.x:4174/film-lab`):** (1) Uruchom `npm run dev` **na tej samej maszynie**, której adres IP wpisujesz w przeglądarce. (2) W logu Vite powinny być adresy **Network** — użyj dokładnie tego hosta i portu `4174`. (3) Zapora systemowa (macOS **Firewall**, router) musi **zezwalać na przychodzące połączenia Node/Vite** na porcie 4174; w przeciwnym razie będzie *connection refused* lub timeout. (4) W `vite.config.js` jest `server.host: true` oraz `server.allowedHosts: true`, żeby uniknąć odpowiedzi **403 Blocked request** dla IP lub nazw typu `*.local`. (5) Suwak RAW z innego komputera uderza w ten sam dev-serwer — most `__raw` działa na hoście, gdzie działa Vite (na macOS nadal wymaga lokalnych narzędzi do dekodu).
- **Repo na zewnętrznym lub sieciowym wolumenie (`/Volumes/…`):** jeśli **HMR nie odświeża** po zapisie plików, ustaw **`VITE_FILMLAB_DEV_WATCH_POLL=1`** (`.env`) albo uruchom **`npm run dev:open:poll`** / **`npm run dev:webgpu:main-ab:poll`** — patrz `.env.example` i *Tasks* „watch poll”.
- **Film Lab — worker proxy vs rozdzielczość preview (debug / §5.1 planu):** `npm run dev:match-proxy` ustawia `VITE_FILMLAB_PROXY_MATCH_PREVIEW=1` i otwiera `/film-lab` — worker nie dobija drugiego downscale poniżej bufora preview (droższy drag; panel Render Debug pokaże „match bufora preview”). Wariant z WebGPU w workerze: `npm run dev:match-proxy:webgpu` (łączy z `VITE_FILMLAB_PROXY_GPU` + `VITE_FILMLAB_WEBGPU_PROXY`).

## Pomiary wydajności / mikro-benchmarki (to nie jest end-to-end UI)

- `npm run test:deep-audit` uruchamia `scripts/deep-audit-film-lab.mjs` i na koniec wypisuje JSON m.in. z percentylami czasu budowania payloadu szybkiego podglądu (`fuzz.p50Ms`, `p95Ms`, ...). To jest twarde, powtarzalne i idzie do `npm test` / `ci`, ale mierzy warstwę "fast preview math", a nie pełny pipeline renderu w przeglądarce.
- **Baseline A/B głównego podglądu (WebGPU vs WebGL w UI):** opis sesji, pola DIAG do porównań i szablon arkusza — [`MINDFULLENS_FILM_LAB_PLAN_V3_1.md`](MINDFULLENS_FILM_LAB_PLAN_V3_1.md) §9.12. Skróty: `npm run dev:webgpu:main-ab`, `npm run build:preview:webgpu:main-ab` (szczegóły w `package.json` / `.env.example`).

## Pomiary batch export (ZIP) — realny pipeline w przeglądarce

- Najprościej: **`npm run dev:perf`** (włącza `VITE_FILMLAB_BATCH_PERF=1`, opcjonalnie otwiera przeglądarkę w **`/film-lab`** dzięki `ML_DEV_OPEN` — w CI pomijane) — w tym `predev` / profile.
- **Build produkcyjny z pomiarami + preview:** **`npm run build:preview:perf`** — `vite build` z `VITE_FILMLAB_BATCH_PERF=1` (w bundlu jest pomiar; `console` nie jest obcinany przez esbuild) → `vite preview` z otwarciem `/film-lab`. **Nie wypuszczaj** tego buildu na produkcję docelową (w środku włączony batch-perf + logi); to profil „diagnostyczny”.
- **Szybki re-preview** (ten sam `dist`, bez przebudowy): **`npm run preview:perf`** — ma sens dopiero, jeśli `dist` powstał z `VITE_FILMLAB_BATCH_PERF=1` (czyli po `build:preview:perf` albo ręcznie: `VITE_FILMLAB_BATCH_PERF=1 npm run build`).
- Czysty build deployowy: `npm run build` **bez** `VITE_FILMLAB_BATCH_PERF` (upewnij się, że nie masz jej w `.env` jeśli nie chcesz jej w release).
- Alternatywnie: skopiuj `.env.example` → `.env` / `.env.local` albo ustaw `VITE_FILMLAB_BATCH_PERF=1` w linii komend, potem grupowy eksport jak zwykle.
- **Gdzie czytać wynik:** konsola — `[FilmLab][BatchPerf] summary` (per plik: ingest → `toImageData` → `renderToContext` → JPEG/EXIF + ZIP); w UI — **Render Debug → „Batch ZIP”** (Kopiuj JSON); w pliku z **eksportu diagnostycznego (JSON)** — `performance.lastBatchZip` i `flags.env.batchPerf` (czy build miał włączoną flagę).
- Implementacja: `src/engine/batchProcessor.js` + `src/engine/batchPerf.js` (zero narzutu gdy flaga jest wyłączona).
