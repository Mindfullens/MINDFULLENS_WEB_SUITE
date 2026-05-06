# STOP — DAM biblioteka + filmstrip Canvas (MVP)

**Data:** 2026-04-30  
**Zakres:** Inicjatywa poza numeracją etapów 1–18 ([`docs/hme/STAGES.md`](../../docs/hme/STAGES.md)); realizacja fragmentu planu Web DAM / filmstrip.

## Dostarczone

1. **Kontrakt danych** — [`docs/hme/DAM-PREVIEW-CONTRACT.md`](../../docs/hme/DAM-PREVIEW-CONTRACT.md): rozdział metadanych katalogu (IndexedDB) vs binaria OPFS; pole opcjonalne `asset.preview` (`embedded` | `standard`).
2. **Cache OPFS + LRU** — [`src/filmLab/opfs/filmLabOpfsPreviewCache.js`](../../src/filmLab/opfs/filmLabOpfsPreviewCache.js): zapis/odczyt JPEG, fallback `idb-keyval`, eksmisja przy budżecie z `navigator.storage.estimate()`.
3. **Generacja miniaturek** — [`src/filmLab/useFilmLabCatalogProLibraryWorkspace.js`](../../src/filmLab/useFilmLabCatalogProLibraryWorkspace.js): kolejka „embedded” przez [`filmLabEmbeddedPreviewQueue.js`](../../src/filmLab/dam/filmLabEmbeddedPreviewQueue.js) (stub → null), potem **standard** z zdekodowanego `imageUrl`; aktualizacja dokumentu katalogu po zapisie.
4. **Filmstrip Canvas** — [`src/filmLab/FilmLabFilmstripCanvas.jsx`](../../src/filmLab/FilmLabFilmstripCanvas.jsx): wirtualizacja (zakres indeksów + overscan), warstwa obramowań selekcji, scroll-to-primary, `createImageBitmap` z OPFS.
5. **UI Biblioteki** — [`src/FilmLabLibraryWorkspace.jsx`](../../src/FilmLabLibraryWorkspace.jsx): pas filmowy + siatka z miniaturami z cache; selekcja Primary / Shift·zakres / Ctrl·toggle; skróty przy aktywnej zakładce Biblioteka: strzałki, **1–5** ocena, **X** odrzucone (`rating` / `pick` w dokumencie katalogu).
6. **i18n** — `workspace.library.rejected` (PL/EN).

## Weryfikacja

- `npm run build` — PASS  
- `node scripts/check-i18n-parity.mjs` — OK  

## Terminologia

**Filmstrip UI** (pas miniaturek) ≠ **`frame: filmstrip`** w silniku (ramka estetyczna na obrazie).

## Backlog (nie w tym STOP)

- Rzeczywista ekstrakcja embedded JPEG z RAW w `tryExtractEmbeddedJpegFromRawFile`.  
- Skalowanie do wielu assetów spoza pojedynczej sesji pliku / import folderu.  
- Opcjonalnie: `createSyncAccessHandle` w workerze dla OPFS tam, gdzie przeglądarka to eksponuje.
