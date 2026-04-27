# Mindfullens Film Lab (web)

## Szybki start

Node **20** (np. `nvm use` — plik [`.nvmrc`](.nvmrc)). Potem:

```bash
npm install
npm start
```

Równoważne `npm run dev` (Vite, port 4174). Pomiary batch: `npm run dev:perf`; samo otwarcie `/film-lab` w przeglądarce: `npm run dev:open`. Otwórz [http://127.0.0.1:4174/film-lab](http://127.0.0.1:4174/film-lab) po starcie. Szczegóły w [docs/README.md](docs/README.md); w IDE: **Run Task** → `Film Lab: …` ([`.vscode/tasks.json`](.vscode/tasks.json)) — m.in. **`Film Lab: ci / check`** (to samo co `npm run ci`: testy, Vite `build`, `npm audit`), **Run and Debug** / F5: [`.vscode/launch.json`](.vscode/launch.json). Podstawy IntelliSense: [`jsconfig.json`](jsconfig.json), [`src/vite-env.d.ts`](src/vite-env.d.ts) (`import.meta.env`), rozszerzenia: [`.vscode/extensions.json`](.vscode/extensions.json).

## Inne

- `npm run build` / `npm run preview` — build produkcyjny lokalnie (po `build` uruchamia się `postbuild` → `test:dist-outputs`. Surowe `npx vite build` omija `postbuild` — użyj `npm run build`; zob. [docs/DEPLOY.md](docs/DEPLOY.md)).
- `npm run build:preview:perf` — **diagnostyczny** build z pomiarami batch + `preview` (nie ten sam co czysty deploy). `npm run preview:perf` — szybki `preview` z otwarciem `/film-lab`, gdy `dist` już zbudowałeś z `VITE_FILMLAB_BATCH_PERF=1`.
- `npm test` — regresja + testy skryptów (m.in. `gh-pages-base`, `static-deploy-assets`, `env-example-parity`, `vite-toolchain` — wersja Vite 6+), bez builda / ESLinta.
- `npm run preflight` — **lint + `npm test`** (bez Vite build; szybki check przed commitem/PR).
- `npm run ci` (alias **`npm run check`**) — `lint`, `npm test`, `vite build`, `npm audit` (tak jest w [CI](.github/workflows/ci.yml); możesz też odpalić workflow ręcznie: *workflow_dispatch*).
- `npm run lint:fix` — ESLint z `--fix`.
- `npm run clean` — usuwa `dist`, `.eslintcache`, `.vite`, `coverage`, `.turbo`, `.cache` (świeży build / czysty cache).
- `npm run audit` — podgląd [npm audit](https://docs.npmjs.com/cli/v10/commands/npm-audit); zob. [docs/README.md](docs/README.md) (Vite 6, plugin React).
- `npm run ci:smoke` — jak `ci`, plus weryfikacja źródeł profili (lokalny „pełny gate”, wymaga drzewa wtyczki).
- **Deploy (Vercel / Netlify / Cloudflare / GHP):** [docs/DEPLOY.md](docs/DEPLOY.md) — pliki `public/_redirects`, `vercel.json`, `netlify.toml`, [GitHub Actions → Pages](.github/workflows/pages.yml) (ręczny run; pole **Vite public base** opcjonalne), lokalnie pod *project page*: `GH_PAGES_REPO=nazwa-repo npm run build:gh-pages`; **podgląd** `dist` z tym samym `base`: `… npm run preview:gh-pages` (z tą samą `VITE_BASE` / `GH_PAGES_REPO`).

## Troubleshooting (lokalnie)

- **Port 4174 zajęty** — `dev` używa `strictPort`: zwolnij port albo tymczasowo `vite --port …` w innym poleceniu.
- **ESLint dziwnie pamięta** — `npm run clean` (usuwa m.in. [`.eslintcache`](.eslintcache) i `dist`) albo skasuj `.eslintcache` ręcznie, potem `npm run lint`.
- **Brak odpowiedzi na** `http://127.0.0.1:4174/...` **—** najpierw `npm start` (lub `dev:open` / `dev:perf`); to musi być serwer Vite, nie otwieraj samych plików z `dist` przez `file://`.
- **Dostęp z innego urządzenia w LAN** (`http://192.168.x.x:4174/film-lab`) **—** Vite musi działać **na tej samej maszynie** co wpisany adres IP; w logu startupu użyj linii **Network**; zapora musi przepuszczać port **4174**. Pełna checklista: [docs/README.md](docs/README.md) (sekcja o LAN i opcjonalnie watch poll na zewnętrznym wolumenie).
- **GitHub Pages: pusta strona albo 404 po odświeżeniu** `/film-lab` **—** zwykle zły `base` (build z `VITE_BASE` / `GH_PAGES_REPO` musi odpowiadać segmentowi URL `…io/NAZWA/`). Zob. [docs/DEPLOY.md](docs/DEPLOY.md) i ręczny workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) (pole *Vite public base* przy forku).
