# Kontrakt DAM: metadane katalogu vs podglądy binarne (Film Lab)

## Zakres

Biblioteka Film Lab ([`filmLabCatalogProDocument.js`](../../src/filmLab/catalogPro/filmLabCatalogProDocument.js)) przechowuje **metadane strukturalne** w IndexedDB przez [`filmLabCatalogProPersist.js`](../../src/engine/filmLabCatalogProPersist.js)). **Binaria miniaturek** (JPEG podglądu) nie mieszczą się w dokumencie katalogu — trafiają do **Origin Private File System (OPFS)** lub — przy braku OPFS — do **fallbacku IndexedDB** (`idb-keyval`), patrz [`filmLabOpfsPreviewCache.js`](../../src/filmLab/opfs/filmLabOpfsPreviewCache.js).

## Pole `asset.preview` (wersjonowane pole opcjonalne)

Na obiekcie zasobu w `document.assets[]`:

| Pole | Typ | Opis |
|------|-----|------|
| `preview.embedded` | `null \| PreviewTierMeta` | Miniatura wbudowana w RAW (planowana; nie generujemy w pierwszej iteracji bez osobnego ekstraktora). |
| `preview.standard` | `null \| PreviewTierMeta` | Skalowany JPEG z dekodowanego źródła (Loupe/Develop) — używany w siatce i filmstripu. |
| `preview.smart` | `null \| PreviewTierMeta` | WebP w OPFS (`smart.webp`), ~2560 px — idle po imporcie lub po zapisie Develop→`standard`; `format: 'webp'` w meta. |

`PreviewTierMeta`:

```ts
{
  tier: 'embedded' | 'standard' | 'smart',
  format?: 'webp', // przy tier smart
  width: number,
  height: number,
  cachedAt: string, // ISO
  storage: 'opfs' | 'idb-fallback'
}
```

**Ścieżki OPFS** są stabilnym kontraktem wewnętrznym modułu cache (`dam-previews/v1/...`), nie są duplikowane w JSON katalogu.

## Semantyka „filmstrip UI” vs silnik

- **Filmstrip UI**: poziomy pas miniaturek w zakładce Biblioteka ([`FilmLabFilmstripCanvas.jsx`](../../src/filmLab/FilmLabFilmstripCanvas.jsx)).
- **`frame: filmstrip` w silniku**: dekoracja kadru na obrazie ([`useFilmLabEngine.js`](../../src/engine/useFilmLabEngine.js)) — inny byt, bez relacji do DAM.

## Zgodność wsteczna

Katalogi bez pola `preview` są normalizowane przy odczycie (`preview` traktuj jako brakujące do czasu wygenerowania miniatury).
