# Assets `reference-set-v1`

Każdy katalog `rs-v1-NNN` odpowiada jednej pozycji w `../REFERENCE-SET-MANIFEST.json`.

**Pliki źródłowe** (nazwa = `assetRelativePath`) możesz skopiować z archiwum Mindfullens, np.  
`/Volumes/LS10X/MULTIMEDIA/Zdjęcia/RAW MINDFULLENS/` (lub inna ustalona ścieżka DAM).

**Git:** zawartość `rs-v1-*` poza `.gitkeep` jest w `.gitignore` — klon repozytorium nie pobiera RAW-ów; po `git clone` skopiuj pliki pod wskazane ścieżki albo użyj Git LFS, jeśli polityka projektu to przewiduje.

**Skrypt (jeden katalog źródłowy, np. DAM):**

```bash
npm run reference-set:sync-assets -- --from "/Volumes/LS10X/MULTIMEDIA/Zdjęcia/RAW MINDFULLENS"
```

Opcjonalnie: `MINDFULLENS_RAW_ROOT=... npm run reference-set:sync-assets`. Flaga `--dry-run` tylko wypisze mapowanie. Potem: `npm run test:reference-set-v1-assets`.

Po skopiowaniu: zweryfikuj ingest w Film Lab i ewentualnie dopisz ISO / ogniskową w notatkach manifestu.
