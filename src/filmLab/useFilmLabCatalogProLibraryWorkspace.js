import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearFilmLabCatalogDocument,
  loadFilmLabCatalogDocument,
  normalizeLoadedFilmLabCatalogDocument,
  saveFilmLabCatalogDocument,
} from '../engine/filmLabCatalogProPersist.js';
import {
  buildCatalogProDocument,
  withCatalogProFingerprint,
} from './catalogPro/filmLabCatalogProDocument.js';
import { appendCatalogImportFiles } from './catalogPro/filmLabCatalogAppendImport.js';
import { mergeCatalogDocumentWithPipelineSnapshot } from './catalogPro/filmLabCatalogPipelineMerge.js';
import { removeAssetsFromCatalogDocument } from './catalogPro/filmLabCatalogRemoveAssets.js';
import {
  deleteCatalogSourceFile,
  mimeFromFilename,
  readCatalogSourceFile,
} from './opfs/filmLabOpfsSourceFiles.js';
import {
  getDevelopFullSourcePriority,
  nextImageWorkerRequestId,
  scheduleOpfsCatalogSourceRead,
  scheduleOpfsDamPreviewDecode,
} from './filmLabImageWorkerBridge.js';
import {
  createFilmLabImageBitmap,
  FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE,
} from './filmLabImageBitmapOptions.js';
import {
  deleteDamPreviewForAsset,
  hasDamPreview,
} from './opfs/filmLabOpfsPreviewCache.js';
import {
  clearDamPreviewWebgpuPermanentSession,
  isDamPreviewWebgpuPermanent,
  markDamPreviewWebgpuPermanent,
} from './filmLabDamPreviewWebgpuGate.js';
import { scheduleSmartPreviewGenerationIdle } from './dam/filmLabSmartPreview.js';
import { isLikelyCameraRawFilename } from './dam/filmLabEmbeddedJpegExtract.js';
import { dispatchFilmLabOpfsPreviewReady } from './filmLabOpfsPreviewReadyEvent.js';

/** One persistent catalog per app / OPFS tree (Lightroom-style inbox), not per uploaded file. */
const FILM_LAB_CATALOG_SESSION_ID = 'film-lab-default-catalog-v1';

/**
 * Równoległość ekstrakcji embedded JPEG z RAW (`writeRawEmbeddedThumbnailIfPossible` na głównym wątku).
 * Bez limitu N plików = N× skan + presja pamięci. Wzór: min(4, max(2, 1+floor(hw/2))) — krótsza kolejka „OCZEKUJE”.
 */
function getRawEmbeddedExtractMaxParallel() {
  if (typeof navigator === 'undefined' || !Number.isFinite(Number(navigator.hardwareConcurrency))) {
    return 3;
  }
  const hc = Math.floor(Number(navigator.hardwareConcurrency));
  if (hc < 1) {
    return 1;
  }
  return Math.min(4, Math.max(2, 1 + Math.floor(hc / 2)));
}

function buildEmptyCatalogDocument() {
  return withCatalogProFingerprint(
    buildCatalogProDocument({
      sessionId: FILM_LAB_CATALOG_SESSION_ID,
      sourceFileMeta: null,
      hasDecodedFrame: false,
      activeCollectionId: 'inbox',
    })
  );
}

/** @param {'embedded' | 'standard' | 'smart'} tier */
function applyPreviewTierMeta(doc, assetId, tier, meta) {
  if (!doc?.assets?.length) {
    return doc;
  }
  const assets = doc.assets.map((a) => {
    if (a.id !== assetId) {
      return a;
    }
    const prevP = typeof a.preview === 'object' ? a.preview : { embedded: null, standard: null };
    return {
      ...a,
      preview: {
        ...prevP,
        [tier]: meta,
      },
    };
  });
  return { ...doc, assets };
}

export function useFilmLabCatalogProLibraryWorkspace({
  uploadedFile,
  hasImage,
  exifMeta,
  imageMeta,
  imageUrl = null,
  /** W Edycji wstrzymaj tło: kolejka embedded nie zjada workera/OPFS (priorytet Develop). */
  pauseBackgroundEmbeddedExtract = false,
}) {
  const [catalogDocument, setCatalogDocument] = useState(() => buildEmptyCatalogDocument());
  const [activeCollectionId, setActiveCollectionId] = useState('inbox');
  const [previewEpoch, setPreviewEpoch] = useState(0);

  const bumpPreviewEpoch = useCallback(() => {
    setPreviewEpoch((e) => e + 1);
  }, []);

  const sessionId = FILM_LAB_CATALOG_SESSION_ID;

  const sourceFileByAssetIdRef = useRef(new Map());
  const pauseBackgroundEmbeddedExtractRef = useRef(pauseBackgroundEmbeddedExtract);
  useEffect(() => {
    pauseBackgroundEmbeddedExtractRef.current = Boolean(pauseBackgroundEmbeddedExtract);
  }, [pauseBackgroundEmbeddedExtract]);

  const resolvedPreviewAssetId = useMemo(() => {
    const assets = catalogDocument?.assets;
    if (!Array.isArray(assets) || assets.length === 0) {
      return null;
    }
    if (uploadedFile instanceof File) {
      const byTriple = assets.find(
        (a) =>
          String(a?.sourceName ?? '') === uploadedFile.name &&
          Number(a?.sourceSize) === uploadedFile.size &&
          Number(a?.sourceLastModified) === uploadedFile.lastModified
      );
      if (byTriple?.id) {
        return String(byTriple.id);
      }
      const bySize = assets.find(
        (a) =>
          String(a?.sourceName ?? '') === uploadedFile.name && Number(a?.sourceSize) === uploadedFile.size
      );
      if (bySize?.id) {
        return String(bySize.id);
      }
    }
    return String(assets[0]?.id ?? '') || null;
  }, [catalogDocument?.assets, uploadedFile]);

  const pipelineEnrichmentKey = useMemo(
    () =>
      JSON.stringify({
        sid: sessionId,
        hi: Boolean(hasImage),
        w: imageMeta?.width ?? null,
        h: imageMeta?.height ?? null,
        pw: imageMeta?.previewWidth ?? null,
        ph: imageMeta?.previewHeight ?? null,
        iso: exifMeta?.iso ?? null,
        cm: exifMeta?.cameraMake ?? null,
        cmod: exifMeta?.cameraModel ?? null,
        lens: exifMeta?.lensModel ?? null,
        shut: exifMeta?.shutter ?? null,
        ap: exifMeta?.aperture ?? null,
        fl: exifMeta?.focalLength ?? null,
        dt: exifMeta?.dateTaken ?? null,
        ori: exifMeta?.orientationLabel ?? null,
        fn: uploadedFile?.name ?? null,
        fs: uploadedFile?.size ?? null,
        fm: uploadedFile?.lastModified ?? null,
      }),
    [sessionId, hasImage, imageMeta, exifMeta, uploadedFile]
  );

  const updateCatalogAsset = useCallback(
    (assetId, patch) => {
      setCatalogDocument((prev) => {
        if (!prev?.assets?.length) {
          return prev;
        }
        const assets = prev.assets.map((a) =>
          a.id === assetId
            ? { ...a, ...patch, updatedAt: new Date().toISOString() }
            : a
        );
        const next = withCatalogProFingerprint({ ...prev, assets });
        void saveFilmLabCatalogDocument(next, { sessionId });
        return next;
      });
    },
    [sessionId]
  );

  /** Scalanie `preview.embedded` / `preview.standard` bez kasowania drugiego tieru (np. proxy z Develop). */
  const patchAssetDamPreviewTier = useCallback(
    (assetId, tier, meta) => {
      setCatalogDocument((prev) => {
        const patched = applyPreviewTierMeta(prev, assetId, tier, meta);
        const next = withCatalogProFingerprint(patched);
        void saveFilmLabCatalogDocument(next, { sessionId });
        return next;
      });
    },
    [sessionId]
  );

  useEffect(() => {
    let cancelled = false;
    const fallbackDoc = buildEmptyCatalogDocument();

    (async () => {
      const raw = await loadFilmLabCatalogDocument({ sessionId });
      if (cancelled) {
        return;
      }
      const normalized = normalizeLoadedFilmLabCatalogDocument(raw);
      if (normalized?.document) {
        setCatalogDocument(withCatalogProFingerprint(normalized.document));
        setActiveCollectionId(String(normalized.document?.meta?.activeCollectionId ?? 'inbox'));
        return;
      }
      setCatalogDocument(fallbackDoc);
      setActiveCollectionId(String(fallbackDoc?.meta?.activeCollectionId ?? 'inbox'));
      void saveFilmLabCatalogDocument(fallbackDoc, { sessionId });
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    setCatalogDocument((prev) => {
      const merged = mergeCatalogDocumentWithPipelineSnapshot(prev, {
        uploadedFile,
        hasImage,
        exifMeta,
        imageMeta,
      });
      if (!merged) {
        return prev;
      }
      const next = withCatalogProFingerprint(merged);
      void saveFilmLabCatalogDocument(next, { sessionId });
      return next;
    });
  }, [pipelineEnrichmentKey, uploadedFile, hasImage, exifMeta, imageMeta, sessionId]);

  /**
   * Kolejka ekstrakcji embedded JPEG z RAW + ograniczona pula równoległych jobów.
   * Pełna równoległość N plików = N× skan + lawina pamięci. Tu: FIFO + max równoległych z `getRawEmbeddedExtractMaxParallel()`.
   * Po każdym jobie `requestIdleCallback` / setTimeout 50 ms uzupełnia wolne sloty.
   */
  const rawEmbeddedExtractQueueRef = useRef([]);
  const rawEmbeddedExtractActiveCountRef = useRef(0);

  const drainRawEmbeddedQueue = useCallback(() => {
    if (pauseBackgroundEmbeddedExtractRef.current) {
      return;
    }
    const maxParallel = getRawEmbeddedExtractMaxParallel();
    while (rawEmbeddedExtractActiveCountRef.current < maxParallel) {
      const next = rawEmbeddedExtractQueueRef.current.shift();
      if (!next) {
        return;
      }
      rawEmbeddedExtractActiveCountRef.current += 1;
      void (async () => {
      try {
        /**
         * `next.file` może być nieobecny przy cold-start (po reloadzie strony).
         * Wówczas wczytujemy `source.bin` z OPFS (bounded parallel — kilka odczytów naraz jest OK przy małym limicie).
         */
        let file = next.file instanceof File ? next.file : null;
        if (!file) {
          const meta = next.catalogAssetMeta ?? null;
          file = await readCatalogSourceFile(sessionId, next.id, meta);
          if (!file) {
            return;
          }
        }
        const { writeRawEmbeddedThumbnailIfPossible } = await import('./dam/filmLabEmbeddedPreviewQueue.js');
        const { ok, orientationTag } = await writeRawEmbeddedThumbnailIfPossible(
          sessionId,
          next.id,
          file
        );
        let wrotePreview = ok;
        if (
          !ok &&
          /\.dng$/i.test(String(file?.name ?? '')) &&
          !isDamPreviewWebgpuPermanent(sessionId, next.id)
        ) {
          const requestId = nextImageWorkerRequestId();
          try {
            const dec = await scheduleOpfsDamPreviewDecode({
              sessionId,
              assetId: next.id,
              priority: 200,
              requestId,
              catalogAssetMeta: {
                sourceName: file.name,
                sourceLastModified: file.lastModified,
              },
              skipSourceBin: false,
            });
            const bmp = dec?.bitmap;
            if (bmp) {
              const { writeDamPreviewBlob } = await import('./opfs/filmLabOpfsPreviewCache.js');
              const maxL = 2048;
              const bw = bmp.width;
              const bh = bmp.height;
              let w = bw;
              let h = bh;
              if (bw > maxL || bh > maxL) {
                if (bw >= bh) {
                  w = maxL;
                  h = Math.max(1, Math.round((bh * maxL) / bw));
                } else {
                  h = maxL;
                  w = Math.max(1, Math.round((bw * maxL) / bh));
                }
              }
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const c2 = canvas.getContext('2d');
              if (!c2) {
                bmp.close();
              } else {
                c2.drawImage(bmp, 0, 0, w, h);
                bmp.close();
                const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
                if (blob && blob.size > 0) {
                  const wOk = await writeDamPreviewBlob(sessionId, next.id, 'embedded', blob);
                  if (wOk) {
                    wrotePreview = true;
                    setCatalogDocument((prev) => {
                      if (!prev?.assets?.length) {
                        return prev;
                      }
                      const meta = {
                        tier: 'embedded',
                        width: w,
                        height: h,
                        cachedAt: new Date().toISOString(),
                        storage: 'opfs',
                      };
                      const patched = applyPreviewTierMeta(prev, next.id, 'embedded', meta);
                      const nextDoc = withCatalogProFingerprint(patched);
                      void saveFilmLabCatalogDocument(nextDoc, { sessionId });
                      return nextDoc;
                    });
                  }
                }
              }
            }
          } catch (e2) {
            const needsWebgpuDecode = e2 && typeof e2 === 'object' && e2.code === 'NEEDS_WEBGPU_DECODE';
            if (needsWebgpuDecode) {
              const already = isDamPreviewWebgpuPermanent(sessionId, next.id);
              markDamPreviewWebgpuPermanent(sessionId, next.id);
              if (import.meta.env?.DEV && !already) {
                console.warn('[FilmLab] DNG on-the-fly proxy failed', next.id, e2);
              }
            } else if (import.meta.env?.DEV) {
              console.warn('[FilmLab] DNG on-the-fly proxy failed', next.id, e2);
            }
          }
        }
        if (wrotePreview) {
          if (ok) {
            /**
             * Zapisz orientationTag z TIFF IFD do katalogu — embedded JPEG (np. Canon CR2) zwykle nie ma
             * własnego EXIF orientation. Bez tej adnotacji worker thumb renderuje sensorową orientację
             * (poziomo) zamiast poprawnej (np. pionowo).
             */
            if (Number.isFinite(Number(orientationTag)) && Number(orientationTag) >= 2) {
              setCatalogDocument((prev) => {
                if (!prev?.assets?.length) {
                  return prev;
                }
                const idx = prev.assets.findIndex((a) => a?.id === next.id);
                if (idx < 0) {
                  return prev;
                }
                const asset = prev.assets[idx];
                const exif = { ...(asset.exif || {}), orientationTag: Math.round(Number(orientationTag)) };
                const assets = prev.assets.slice();
                assets[idx] = { ...asset, exif, updatedAt: new Date().toISOString() };
                const patched = { ...prev, assets };
                const fingerprinted = withCatalogProFingerprint(patched);
                void saveFilmLabCatalogDocument(fingerprinted, { sessionId });
                return fingerprinted;
              });
            }
          }
          setPreviewEpoch((e) => e + 1);
          dispatchFilmLabOpfsPreviewReady(next.id);
          scheduleSmartPreviewGenerationIdle(sessionId, next.id, {
            onWritten: ({ width, height }) => {
              patchAssetDamPreviewTier(next.id, 'smart', {
                tier: 'smart',
                format: 'webp',
                width,
                height,
                cachedAt: new Date().toISOString(),
                storage: 'opfs',
              });
            },
          });
        }
      } catch (e) {
        console.warn('[FilmLab] RAW embedded extract failed', next.id, e);
      } finally {
        rawEmbeddedExtractActiveCountRef.current = Math.max(
          0,
          rawEmbeddedExtractActiveCountRef.current - 1
        );
        const continueWork = () => drainRawEmbeddedQueue();
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(continueWork, { timeout: 200 });
        } else {
          setTimeout(continueWork, 50);
        }
      }
    })();
    }
  }, [sessionId, patchAssetDamPreviewTier]);

  useEffect(() => {
    if (!pauseBackgroundEmbeddedExtract) {
      drainRawEmbeddedQueue();
    }
  }, [pauseBackgroundEmbeddedExtract, drainRawEmbeddedQueue]);

  /**
   * Widoczny kafelek bez tieru OPFS — przesuń ten asset na **początek** kolejki ekstrakcji embedded,
   * żeby nie czekał na FIFO całej paczki importu (stąd pion „po 30 s” i dziury w siatce).
   */
  const prioritizeRawEmbeddedExtract = useCallback(
    (assetId) => {
      const id = String(assetId ?? '');
      if (!id) {
        return;
      }
      const q = rawEmbeddedExtractQueueRef.current;
      const idx = q.findIndex((e) => String(e?.id) === id);
      if (idx >= 0) {
        const [row] = q.splice(idx, 1);
        q.unshift(row);
      } else {
        const list = assetsForColdStartRef.current ?? [];
        const asset = list.find((a) => String(a?.id) === id);
        if (!asset) {
          return;
        }
        const sourceName = String(asset?.sourceName ?? '');
        if (!sourceName || !isLikelyCameraRawFilename(sourceName)) {
          return;
        }
        const memFile = sourceFileByAssetIdRef.current.get(id);
        q.unshift(
          memFile instanceof File
            ? { id, file: memFile }
            : {
                id,
                file: null,
                catalogAssetMeta: {
                  sourceName: asset.sourceName,
                  sourceLastModified: asset.sourceLastModified,
                },
              }
        );
      }
      drainRawEmbeddedQueue();
    },
    [drainRawEmbeddedQueue]
  );

  /**
   * COLD-START re-extract pass.
   *
   * Po reloadzie strony `catalogDocument` jest wczytywany z IndexedDB z N assetami,
   * ale `sourceFileByAssetIdRef` jest pusty (in-memory File map nie przeżywa reloadu)
   * i `rawEmbeddedExtractQueueRef` też jest pusty (zasilany tylko w `importCatalogFiles`).
   *
   * Skutek: dla assetów zaimportowanych w poprzedniej sesji, których embedded.jpg nie
   * został zapisany w OPFS (np. import zakończony przed pełnym ekstrakcją albo
   * rozwalony przez bug w pipeline), miniatury pozostają na placeholderze „Wymaga
   * wywołania" w nieskończoność.
   *
   * Tu skanujemy wszystkie assety raz po załadowaniu i kolejkujemy ekstrakcję dla
   * każdego, który nie ma embedded ani standard. Konsument czyta `source.bin` z OPFS
   * w puli ograniczonej przez `getRawEmbeddedExtractMaxParallel()`.
   */
  /**
   * COLD-START re-extract — odpala się DOKŁADNIE RAZ, gdy katalog dostanie pierwszy
   * non-empty `assets`. NIE wisi na `catalogDocument?.assets` jako dep — bo `drainRawEmbeddedQueue`
   * po każdym sukcesie z orientationTag robi `setCatalogDocument(...)` → identity assets
   * się zmienia → efekt by się re-runował → cleanup `cancelled = true` → for-loop scan
   * przerywany w środku → scan ginie przy pierwszym pliku z EXIF orientationTag (np. ARW).
   *
   * Skanujemy snapshot za pomocą refa (assetsForColdStartRef), który refresh-ujemy w
   * osobnym useEffect bez side-effect-loopa.
   */
  const coldStartStartedRef = useRef(false);
  const assetsForColdStartRef = useRef(catalogDocument?.assets ?? []);
  useEffect(() => {
    assetsForColdStartRef.current = Array.isArray(catalogDocument?.assets)
      ? catalogDocument.assets
      : [];
  }, [catalogDocument?.assets]);

  useEffect(() => {
    if (coldStartStartedRef.current) {
      return undefined;
    }
    if ((assetsForColdStartRef.current?.length ?? 0) === 0) {
      return undefined;
    }
    coldStartStartedRef.current = true;

    void (async () => {
      const { isLikelyCameraRawFilename } = await import('./dam/filmLabEmbeddedJpegExtract.js');
      /** Pętla iteruje po ŚWIEŻYM snapshot z refa — nowo dodane assety też zostaną pokryte. */
      const seen = new Set();
      let queued = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const list = assetsForColdStartRef.current ?? [];
        let scanned = 0;
        for (const asset of list) {
          const id = String(asset?.id ?? '');
          if (!id || seen.has(id)) {
            continue;
          }
          seen.add(id);
          scanned += 1;
          const sourceName = String(asset?.sourceName ?? '');
          if (!sourceName || !isLikelyCameraRawFilename(sourceName)) {
            continue;
          }
          if (sourceFileByAssetIdRef.current.has(id)) {
            continue;
          }
          let hasEmb = false;
          let hasStd = false;
          try {
            [hasEmb, hasStd] = await Promise.all([
              hasDamPreview(sessionId, id, 'embedded'),
              hasDamPreview(sessionId, id, 'standard'),
            ]);
          } catch {
            // OPFS read failed — pchnij do kolejki, niech extract spróbuje (jeśli source.bin też brak, queue cicho odpadnie).
          }
          if (hasEmb || hasStd) {
            continue;
          }
          rawEmbeddedExtractQueueRef.current.push({
            id,
            file: null,
            catalogAssetMeta: {
              sourceName: asset.sourceName,
              sourceLastModified: asset.sourceLastModified,
            },
          });
          queued += 1;
          drainRawEmbeddedQueue();
        }
        /** Jeśli snapshot się nie powiększył od ostatniej iteracji — koniec. */
        if (scanned === 0) {
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      if (queued === 0) {
        return;
      }
      console.info('[FilmLab] cold-start re-extract queued', queued, 'assets');
    })();

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, drainRawEmbeddedQueue, catalogDocument?.assets?.length > 0]);

  const importCatalogFiles = useCallback(
    (files) => {
      if (!Array.isArray(files) || files.length === 0) {
        return;
      }
      setCatalogDocument((prev) => {
        const { doc: merged, added } = appendCatalogImportFiles(prev, files);
        if (!added.length) {
          return prev;
        }
        const next = withCatalogProFingerprint(merged);
        for (const { id, file } of added) {
          sourceFileByAssetIdRef.current.set(id, file);
          void import('./opfs/filmLabOpfsSourceFiles.js').then(({ writeCatalogSourceFile }) =>
            writeCatalogSourceFile(sessionId, id, file)
          );
          void import('./dam/filmLabRasterImportThumb.js').then(({ writeRasterImportThumbnailIfPossible }) =>
            writeRasterImportThumbnailIfPossible(sessionId, id, file).then((ok) => {
              if (ok) {
                setPreviewEpoch((e) => e + 1);
                dispatchFilmLabOpfsPreviewReady(id);
                scheduleSmartPreviewGenerationIdle(sessionId, id, {
                  onWritten: ({ width, height }) => {
                    patchAssetDamPreviewTier(id, 'smart', {
                      tier: 'smart',
                      format: 'webp',
                      width,
                      height,
                      cachedAt: new Date().toISOString(),
                      storage: 'opfs',
                    });
                  },
                });
              }
            })
          );
          rawEmbeddedExtractQueueRef.current.push({ id, file });
        }
        drainRawEmbeddedQueue();
        void saveFilmLabCatalogDocument(next, { sessionId });
        return next;
      });
    },
    [sessionId, drainRawEmbeddedQueue, patchAssetDamPreviewTier]
  );

  const resolveAssetFile = useCallback(
    async (assetId, options = {}) => {
      const id = String(assetId ?? '');
      const mem = sourceFileByAssetIdRef.current.get(id);
      if (mem instanceof File) {
        return mem;
      }
      const asset = catalogDocument?.assets?.find((a) => String(a?.id) === id);
      const overrideRid =
        typeof options?.requestId === 'string' && options.requestId.trim() !== ''
          ? options.requestId.trim()
          : '';
      const requestId = overrideRid || nextImageWorkerRequestId();
      try {
        const row = scheduleOpfsCatalogSourceRead({
          sessionId,
          assetId: id,
          catalogAssetMeta: asset
            ? { sourceName: asset.sourceName, sourceLastModified: asset.sourceLastModified }
            : null,
          priority: getDevelopFullSourcePriority(),
          requestId,
        });
        const result = await row;
        return new File([result.buffer], result.sourceName, {
          type: mimeFromFilename(result.sourceName),
          lastModified: result.sourceLastModified,
        });
      } catch (e) {
        if (e && typeof e === 'object' && (e.name === 'AbortError' || e.code === 20)) {
          return null;
        }
        /** Pełny `arrayBuffer()` źródła tylko w workerze — brak dublowania na głównym wątku (lag przy kliknięciu). */
        console.warn('[FilmLab] OPFS catalog source read failed (worker)', e);
        return null;
      }
    },
    [sessionId, catalogDocument?.assets]
  );

  const removeCatalogAssets = useCallback(
    (assetIds) => {
      const ids = [...new Set(assetIds.map((id) => String(id ?? '')).filter(Boolean))];
      if (ids.length === 0) {
        return;
      }
      for (const id of ids) {
        sourceFileByAssetIdRef.current.delete(id);
      }
      setCatalogDocument((prev) => {
        const removed = removeAssetsFromCatalogDocument(prev, ids);
        if (!removed) {
          return prev;
        }
        const next = withCatalogProFingerprint(removed);
        void saveFilmLabCatalogDocument(next, { sessionId });
        return next;
      });
      void (async () => {
        for (const id of ids) {
          await deleteCatalogSourceFile(sessionId, id);
          await deleteDamPreviewForAsset(sessionId, id);
        }
        setPreviewEpoch((e) => e + 1);
      })();
    },
    [sessionId]
  );

  const clearEntireCatalog = useCallback(async () => {
    const ids = (catalogDocument?.assets ?? []).map((a) => String(a?.id ?? '')).filter(Boolean);
    for (const id of ids) {
      sourceFileByAssetIdRef.current.delete(id);
    }
    const empty = buildEmptyCatalogDocument();
    setCatalogDocument(empty);
    setPrimaryAssetId(null);
    setSelectedAssetIds([]);
    await clearFilmLabCatalogDocument({ sessionId });
    clearDamPreviewWebgpuPermanentSession(sessionId);
    await saveFilmLabCatalogDocument(empty, { sessionId });
    for (const id of ids) {
      await deleteCatalogSourceFile(sessionId, id);
      await deleteDamPreviewForAsset(sessionId, id);
    }
    setPreviewEpoch((e) => e + 1);
  }, [catalogDocument?.assets, sessionId]);

  /** Tiered DAM previews: optional embedded (stub), then standard JPEG from decoded loupe image. */
  useEffect(() => {
    if (!hasImage || !imageUrl || !sessionId || !resolvedPreviewAssetId) {
      return undefined;
    }
    let cancelled = false;
    const assetId = resolvedPreviewAssetId;

    (async () => {
      const { readDamPreviewBlob, writeDamPreviewBlob } = await import('./opfs/filmLabOpfsPreviewCache.js');
      const { tryExtractEmbeddedJpegFromRawFile } = await import('./dam/filmLabEmbeddedPreviewQueue.js');

      const existingStd = await readDamPreviewBlob(sessionId, assetId, 'standard');
      if (existingStd && existingStd.size > 0) {
        if (!cancelled) {
          setPreviewEpoch((e) => e + 1);
          dispatchFilmLabOpfsPreviewReady(assetId);
        }
        return;
      }

      if (uploadedFile instanceof File) {
        const embRes = await tryExtractEmbeddedJpegFromRawFile(uploadedFile);
        const emb = embRes?.blob ?? null;
        if (emb && emb.size > 0 && !cancelled) {
          await writeDamPreviewBlob(sessionId, assetId, 'embedded', emb);
          dispatchFilmLabOpfsPreviewReady(assetId);
          let ew = 0;
          let eh = 0;
          try {
            const bmp = await createFilmLabImageBitmap(emb, FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE);
            ew = bmp.width;
            eh = bmp.height;
            bmp.close?.();
          } catch {
            // ignore
          }
          setCatalogDocument((prev) => {
            const meta = {
              tier: 'embedded',
              width: ew || null,
              height: eh || null,
              cachedAt: new Date().toISOString(),
              storage: 'opfs',
            };
            const patched = applyPreviewTierMeta(prev, assetId, 'embedded', meta);
            const next = withCatalogProFingerprint(patched);
            void saveFilmLabCatalogDocument(next, { sessionId });
            return next;
          });
        }
      }

      const img = new Image();
      if (typeof imageUrl === 'string' && !imageUrl.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      try {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageUrl;
        });
      } catch {
        return;
      }

      if (cancelled) {
        return;
      }

      const iw = img.naturalWidth || img.width || 1;
      const ih = img.naturalHeight || img.height || 1;

      /**
       * EXIF orientation z danych silnika — jeśli plik ma orientację sensora inną niż 1 (np. portret zdjęty
       * poziomą kamerą), `imageUrl` może zawierać obraz w orientacji sensora (landscape dla portretu).
       * Obróć proxy ręcznie przed zapisem, żeby miniatura w Bibliotece wyglądała poprawnie.
       */
      const exifRotDeg = Number(exifMeta?.orientationTransform?.rotationDegrees ?? 0) || 0;
      const needsRotation = exifRotDeg === 90 || exifRotDeg === 270;
      const maxEdge = 280;
      const sc = Math.min(1, maxEdge / Math.max(needsRotation ? ih : iw, needsRotation ? iw : ih));
      const tw = Math.max(1, Math.round((needsRotation ? ih : iw) * sc));
      const th = Math.max(1, Math.round((needsRotation ? iw : ih) * sc));
      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      if (needsRotation) {
        ctx.translate(tw / 2, th / 2);
        ctx.rotate(exifRotDeg === 90 ? Math.PI / 2 : -Math.PI / 2);
        ctx.drawImage(img, -iw * sc / 2, -ih * sc / 2, iw * sc, ih * sc);
      } else if (exifRotDeg === 180) {
        ctx.translate(tw / 2, th / 2);
        ctx.rotate(Math.PI);
        ctx.drawImage(img, -tw / 2, -th / 2, tw, th);
      } else {
        ctx.drawImage(img, 0, 0, tw, th);
      }
      const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85));
      if (!blob || cancelled) {
        return;
      }
      await writeDamPreviewBlob(sessionId, assetId, 'standard', blob);

      setCatalogDocument((prev) => {
        const meta = {
          tier: 'standard',
          width: tw,
          height: th,
          cachedAt: new Date().toISOString(),
          storage: 'opfs',
        };
        const patched = applyPreviewTierMeta(prev, assetId, 'standard', meta);
        const next = withCatalogProFingerprint(patched);
        void saveFilmLabCatalogDocument(next, { sessionId });
        return next;
      });
      if (!cancelled) {
        setPreviewEpoch((e) => e + 1);
        dispatchFilmLabOpfsPreviewReady(assetId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasImage, imageUrl, sessionId, uploadedFile, resolvedPreviewAssetId, exifMeta?.orientationTransform?.rotationDegrees]);

  const collections = Array.isArray(catalogDocument?.collections) ? catalogDocument.collections : [];
  const assets = Array.isArray(catalogDocument?.assets) ? catalogDocument.assets : [];

  const selectionAnchorRef = useRef(null);
  const [primaryAssetId, setPrimaryAssetId] = useState(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [libraryFilterQuery, setLibraryFilterQuery] = useState('');

  const activeCollection = useMemo(
    () => collections.find((entry) => entry?.id === activeCollectionId) ?? collections[0] ?? null,
    [collections, activeCollectionId]
  );

  const visibleAssetIds = useMemo(
    () => (Array.isArray(activeCollection?.assetIds) ? activeCollection.assetIds : []),
    [activeCollection]
  );

  const stripAssets = useMemo(() => {
    const vid = new Set(visibleAssetIds.map((x) => String(x ?? '')));
    return assets.filter((asset) => vid.has(String(asset?.id ?? '')));
  }, [assets, visibleAssetIds]);

  const filteredAssets = useMemo(() => {
    const raw = libraryFilterQuery.trim().toLowerCase();
    if (!raw) {
      return stripAssets;
    }
    return stripAssets.filter((asset) => {
      const name = String(asset?.sourceName ?? '').toLowerCase();
      const tags = Array.isArray(asset?.semanticIndex?.tags)
        ? asset.semanticIndex.tags.join(' ').toLowerCase()
        : '';
      return name.includes(raw) || tags.includes(raw);
    });
  }, [stripAssets, libraryFilterQuery]);

  const filteredIds = useMemo(() => filteredAssets.map((a) => String(a?.id ?? '')).join(','), [filteredAssets]);

  useEffect(() => {
    if (!filteredAssets.length) {
      setPrimaryAssetId(null);
      setSelectedAssetIds([]);
      return;
    }
    setPrimaryAssetId((prev) => {
      const p = prev == null ? null : String(prev);
      return p && filteredAssets.some((a) => String(a?.id ?? '') === p)
        ? p
        : (filteredAssets[0]?.id != null ? String(filteredAssets[0].id) : null);
    });
    setSelectedAssetIds((prev) => {
      const kept = prev.filter((id) =>
        filteredAssets.some((a) => String(a?.id ?? '') === String(id))
      );
      const first = filteredAssets[0]?.id;
      return kept.length > 0 ? kept : first != null ? [String(first)] : [];
    });
  }, [filteredIds, filteredAssets]);

  /** Refy żeby `pickAsset` był STABILNY — kliknięcie w miniaturę nie wpada w stary closure z odświeżania. */
  const stripAssetsRef = useRef(stripAssets);
  stripAssetsRef.current = stripAssets;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const pickAsset = useCallback((assetId, modifiers = {}, orderedIds) => {
    const stripNow = stripAssetsRef.current;
    const assetsNow = assetsRef.current;
    const order = Array.isArray(orderedIds) && orderedIds.length > 0
      ? orderedIds.map(String)
      : stripNow.map((a) => String(a?.id ?? '')).filter(Boolean);
    const id = String(assetId ?? '');
    if (!id) {
      return;
    }
    const idx = order.indexOf(id);
    /** Klik w miniaturę spoza `orderedIds` (kolaż + filtr, lub rozjazd list) — nadal zaznacz jeśli asset jest w katalogu. */
    if (idx < 0) {
      const inCatalog = assetsNow.some((a) => String(a?.id ?? '') === id);
      if (!inCatalog) {
        return;
      }
      if (modifiers.shiftKey || modifiers.metaKey || modifiers.ctrlKey) {
        return;
      }
      setPrimaryAssetId(id);
      setSelectedAssetIds([id]);
      selectionAnchorRef.current = id;
      return;
    }

    if (modifiers.shiftKey && selectionAnchorRef.current != null) {
      const anchor = String(selectionAnchorRef.current);
      const aIdx = order.indexOf(anchor);
      if (aIdx >= 0) {
        const lo = Math.min(aIdx, idx);
        const hi = Math.max(aIdx, idx);
        setSelectedAssetIds(order.slice(lo, hi + 1));
        setPrimaryAssetId(id);
        return;
      }
    }

    if (modifiers.metaKey || modifiers.ctrlKey) {
      setSelectedAssetIds((prev) => {
        const s = new Set(prev.map(String));
        if (s.has(id)) {
          s.delete(id);
        } else {
          s.add(id);
        }
        const next = [...s];
        return next.length ? next : [id];
      });
      setPrimaryAssetId(id);
      return;
    }

    setPrimaryAssetId(id);
    setSelectedAssetIds([id]);
    selectionAnchorRef.current = id;
  }, []);

  return {
    sessionId,
    catalogDocument,
    collections,
    assets,
    activeCollectionId,
    setActiveCollectionId,
    previewEpoch,
    bumpPreviewEpoch,
    updateCatalogAsset,
    libraryFilterQuery,
    setLibraryFilterQuery,
    stripAssets,
    filteredAssets,
    primaryAssetId,
    selectedAssetIds,
    pickAsset,
    selectionAnchorRef,
    importCatalogFiles,
    resolveAssetFile,
    removeCatalogAssets,
    clearEntireCatalog,
    patchAssetDamPreviewTier,
    prioritizeRawEmbeddedExtract,
  };
}
