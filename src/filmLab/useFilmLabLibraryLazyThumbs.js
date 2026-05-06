import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  cancelImageWorkerRequest,
  getThumbPrefetchPriority,
  getThumbViewportPriority,
  nextImageWorkerRequestId,
  scheduleOpfsDamPreviewDecode,
} from './filmLabImageWorkerBridge.js';
import { runQueuedDamPreviewDecode } from './dam/filmLabThumbnailQueueManager.js';
import { tryMainThreadDamPreviewThumbBitmap } from './dam/filmLabTryMainThreadDamThumb.js';
import {
  isDamPreviewWebgpuPermanent,
  listDamPreviewWebgpuPermanentIds,
  markDamPreviewWebgpuPermanent,
  pruneDamPreviewWebgpuPermanent,
} from './filmLabDamPreviewWebgpuGate.js';
import { FILMLAB_OPFS_PREVIEW_READY } from './filmLabOpfsPreviewReadyEvent.js';

/**
 * Miniatury: widoczność (IO) + wyłącznie worker (OPFS read + decode ImageBitmap).
 * Main: kompozycja canvas / React — bez I/O OPFS.
 */

const IO_MARGIN = '280px 0px';
/** Strażnik UI w React — niezależnie od workera; kończy „OCZEKUJE” bez wiecznego wiszenia. */
const REACT_THUMB_GUARD_MS = 3000;

function clampExifOrientation(o) {
  const n = Number(o);
  return Number.isFinite(n) && n >= 1 && n <= 8 ? Math.floor(n) : 1;
}

/** Nie pozwól workerowi (Orient. 1) nadpisać wcześniejszej sensownej orientacji z podglądu. */
function mergeThumbOrientation(prevO, incomingO) {
  const p = clampExifOrientation(prevO);
  const n = clampExifOrientation(incomingO);
  if (p > 1 && n === 1) {
    return p;
  }
  return n > 1 ? n : p;
}

export function useFilmLabLibraryLazyThumbs({
  sessionId,
  previewEpoch,
  assetsForThumbs,
  viewportRootRef,
  enabled = true,
  layoutObserverKey = '',
  /** Inkrementowane tylko przy powrocie Develop→Biblioteka — kasuje jedną miniaturę z RAM (świeży OPFS). */
  thumbRamInvalidateNonce = 0,
  thumbRamInvalidateAssetId = null,
  /** Kolejka ekstrakcji embedded — priorytet assetów widocznych na siatce (FIFO importu inaczej ~kilkadziesiąt s). */
  onPrioritizeRawEmbeddedExtract,
}) {
  const [thumbBitmaps, setThumbBitmaps] = useState(() => new Map());
  /** Asset IDs where worker decode / OPFS nie dostarczyły bitmapy (RAW bez JPEG, korupcja). */
  const [thumbFailedIds, setThumbFailedIds] = useState(() => new Set());
  const thumbBitmapsRef = useRef(thumbBitmaps);
  thumbBitmapsRef.current = thumbBitmaps;

  /** SYNCHRONICZNIE: miniatura wymaga WebGPU — zero kolejnych `scheduleOpfsDamPreviewDecode` (unik pętli + spamu workera). */
  const terminalWebgpuIdsRef = useRef(new Set());
  /**
   * Tylko twarde porażki (np. `NEEDS_WEBGPU_DECODE` + webgpu placeholder) — NIE timeout/kolejka.
   * Blokuje powtórne `loadThumb` aż do `previewEpoch` / odblokowania.
   */
  const thumbPermanentFailIdsRef = useRef(new Set());

  const activeByAssetRef = useRef(new Map());
  /**
   * Bariera „decode w toku” per `assetId` (zsynchronizowana z `activeByAssetRef`)
   * — jawna semantyka `isFetching` + szybki test przed startem kolejnego joba.
   */
  const isFetchingRef = useRef(new Set());
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const ramInvalidateIdRef = useRef(thumbRamInvalidateAssetId);
  ramInvalidateIdRef.current = thumbRamInvalidateAssetId;
  const thumbRamInvalidateAppliedNonceRef = useRef(thumbRamInvalidateNonce);

  /**
   * Zbiór asset ID, które były w `terminalWebgpuIdsRef` PRZED ostatnią zmianą `previewEpoch`.
   * Po bumpu epoki próbujemy je wczytać (może być już proxy), ale z flagą `skipSourceBin = true`
   * → jeśli proxy nie istnieje → od razu powrót do terminalWebgpuIdsRef bez 22-sekundowego timeoutu.
   */
  const prevTerminalIdsRef = useRef(new Set());

  const allowedIds = useMemo(
    () => new Set(assetsForThumbs.map((a) => String(a?.id ?? '')).filter(Boolean)),
    [assetsForThumbs]
  );

  useEffect(() => {
    setThumbBitmaps((prev) => {
      const next = new Map(prev);
      for (const [id, entry] of prev) {
        if (!allowedIds.has(id)) {
          entry?.bitmap?.close?.();
          next.delete(id);
        }
      }
      return next;
    });
    setThumbFailedIds((prev) => {
      const next = new Set();
      for (const id of prev) {
        if (allowedIds.has(id)) {
          next.add(id);
        }
      }
      return next;
    });
    for (const id of [...activeByAssetRef.current.keys()]) {
      if (!allowedIds.has(id)) {
        const prev = activeByAssetRef.current.get(id);
        if (prev) {
          prev.ac.abort();
          cancelImageWorkerRequest(prev.requestId);
          activeByAssetRef.current.delete(id);
          isFetchingRef.current.delete(id);
        }
      }
    }
    for (const wid of [...terminalWebgpuIdsRef.current]) {
      if (!allowedIds.has(wid)) {
        terminalWebgpuIdsRef.current.delete(wid);
      }
    }
    for (const wid of [...thumbPermanentFailIdsRef.current]) {
      if (!allowedIds.has(wid)) {
        thumbPermanentFailIdsRef.current.delete(wid);
      }
    }
    pruneDamPreviewWebgpuPermanent(sessionIdRef.current, allowedIds);
  }, [allowedIds]);

  useEffect(() => {
    if (thumbRamInvalidateNonce === thumbRamInvalidateAppliedNonceRef.current) {
      return;
    }
    thumbRamInvalidateAppliedNonceRef.current = thumbRamInvalidateNonce;
    const id = ramInvalidateIdRef.current != null ? String(ramInvalidateIdRef.current) : '';
    if (!id || !allowedIds.has(id)) {
      return;
    }
    setThumbBitmaps((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Map(prev);
      const old = next.get(id);
      old?.bitmap?.close?.();
      next.delete(id);
      return next;
    });
    terminalWebgpuIdsRef.current.delete(id);
    thumbPermanentFailIdsRef.current.delete(id);
  }, [thumbRamInvalidateNonce, allowedIds]);

  useEffect(() => {
    /**
     * KRYTYCZNE: NIE czyścimy bitmap, NIE abortujemy aktywnych decode jobs.
     *
     * `previewEpoch++` odpala się po każdym ekstrakcie embedded JPEG (sequencyjnie).
     * Przy 80 plikach RAW dostajemy 80 bumpów w ciągu ~50 s. Wcześniejsze:
     *   1) wycieranie bitmap → miniatura #1 znikała gdy embedded #2 się zakończył,
     *   2) abortowanie aktywnych jobów → decoder ledwo zaczynał, był cancelowany,
     *      restartował się, znów cancel — żaden decode nie kończył się w czasie.
     *
     * Co czyścimy:
     * - `terminalWebgpuIdsRef` / `thumbPermanentFailIdsRef`: TAK — embedded mógł
     *   się właśnie pojawić, więc daj `loadThumb` (uruchamiany przez IO observer
     *   reattach lub initial prefetch) szansę spróbować ponownie dla nowo dostępnych
     *   tierów.
     * - `thumbBitmaps`: NIE — już załadowane bitmapy są nadal valid.
     * - `thumbFailedIds`: NIE — failed = realny błąd, nie zmieni się przez epoch bump.
     * - aktywne joby: NIE — niech dokończą i zapiszą bitmapę. Idempotentne; jeśli
     *   ten sam asset jest re-triggerowany przez IO observer, sync gate
     *   `if (existingEntry?.bitmap)` przerwie nową próbę.
     */
    prevTerminalIdsRef.current = new Set(terminalWebgpuIdsRef.current);
    terminalWebgpuIdsRef.current.clear();
    thumbPermanentFailIdsRef.current.clear();
    const sid = sessionIdRef.current;
    for (const id of listDamPreviewWebgpuPermanentIds(sid)) {
      if (allowedIds.has(id)) {
        terminalWebgpuIdsRef.current.add(id);
        thumbPermanentFailIdsRef.current.add(id);
      }
    }
  }, [previewEpoch, allowedIds]);

  const abortAllThumbDecodes = useCallback(() => {
    for (const [, prev] of activeByAssetRef.current) {
      prev.ac.abort();
      cancelImageWorkerRequest(prev.requestId);
    }
    activeByAssetRef.current.clear();
    isFetchingRef.current.clear();
  }, []);

  useEffect(() => {
    if (enabled) {
      return undefined;
    }
    abortAllThumbDecodes();
    return undefined;
  }, [enabled, abortAllThumbDecodes]);

  const loadThumb = useCallback(
    async (assetId, options = {}) => {
      const prefetch = Boolean(options.prefetch);
      const id = String(assetId ?? '');
      if (!id || !allowedIds.has(id)) {
        return;
      }
      if (isDamPreviewWebgpuPermanent(sessionIdRef.current, id)) {
        return;
      }
      if (terminalWebgpuIdsRef.current.has(id)) {
        return;
      }
      if (thumbPermanentFailIdsRef.current.has(id)) {
        return;
      }
      let existingEntry = thumbBitmapsRef.current.get(id);
      if (existingEntry?.bitmap) {
        return;
      }
      /**
       * `webgpu-required` = terminal (worker wprost zwrócił needs-webgpu-decode dla tego pliku).
       * `awaiting-embedded` = tymczasowy placeholder gdy embedded ekstrakt jeszcze trwa
       *  — pozwól na retry, bo `previewEpoch++` po ekstrakcie wyczyścił już terminal/permanent sety.
       */
      if (existingEntry?.thumbStatus === 'webgpu-required') {
        return;
      }

      /** Jedna aktywna dekodacja na asset — bez kolejnego joba / flickera. */
      if (isFetchingRef.current.has(id)) {
        return;
      }
      const superseded = activeByAssetRef.current.get(id);
      if (superseded) {
        return;
      }

      const ac = new AbortController();
      const requestId = nextImageWorkerRequestId();
      activeByAssetRef.current.set(id, { requestId, ac });
      isFetchingRef.current.add(id);

      const priority = prefetch ? getThumbPrefetchPriority() : getThumbViewportPriority();

      /**
       * MAIN-THREAD GATE: ZAWSZE sprawdzamy najpierw czy embedded/standard.jpg w ogóle istnieją w OPFS.
       * Powód: worker pool może być zatkany przez file-array-buffer reads (priority 45, 16 MB chunk każdy).
       * Mimo że thumb requesty mają priority 100 (jump queue), nie wyprzedzą AKTYWNIE pracującego workera
       * (brak preempcji w Web Workers). 4 workery × ~500 ms na chunk = nawet 2 s blokady puli per chunk.
       * Z 12 importowanymi RAW = 24 s saturacji → 22 s timeouty.
       *
       * Sprawdzenie OPFS na main thread: ~10 ms na asset, totalnie ~120 ms dla 12 assetów. Jeśli nie ma
       * tieru → natychmiast webgpu placeholder bez requestu workera. Jeśli jest → idziemy do workera
       * (worker dostaje natychmiast slot bo nikt inny nie czeka na embedded.jpg w OPFS — sprawdzenie
       * było main-thread).
       */
      try {
        const { hasDamPreview } = await import('./opfs/filmLabOpfsPreviewCache.js');
        const [hasStd, hasEmb] = await Promise.all([
          hasDamPreview(sessionIdRef.current, id, 'standard'),
          hasDamPreview(sessionIdRef.current, id, 'embedded'),
        ]);
        if (ac.signal.aborted) {
          const curAb = activeByAssetRef.current.get(id);
          if (curAb?.requestId === requestId) {
            activeByAssetRef.current.delete(id);
            isFetchingRef.current.delete(id);
          }
          return;
        }
        existingEntry = thumbBitmapsRef.current.get(id);
        if (existingEntry?.bitmap) {
          const cur0 = activeByAssetRef.current.get(id);
          if (cur0?.requestId === requestId) {
            activeByAssetRef.current.delete(id);
            isFetchingRef.current.delete(id);
          }
          return;
        }

        if (!hasStd && !hasEmb) {
          /**
           * Brak embedded/standard w OPFS — to NIE jest terminal failure!
           * `drainRawEmbeddedQueue` — ograniczona pula równoległych ekstraktów; kolejka FIFO importu
           * może schować ten plik na końcu — `onPrioritizeRawEmbeddedExtract` przesuwa widoczne assety na przód.
           * — embedded.jpg pojawi się po sekundach. Pokaż placeholder (loading), ale NIE
           * dodawaj do `terminalWebgpuIdsRef` ani `thumbPermanentFailIdsRef` — inaczej
           * po `bumpPreviewEpoch` (gdy embedded jest gotowy) `loadThumb` od razu wyjdzie
           * przez synchroniczne gate'y i nigdy nie sięgnie do OPFS po świeży tier.
           *
           * Po następnym `previewEpoch++` ten asset zostanie ponownie sprawdzony
           * w `hasDamPreview` — jeśli embedded jest, ścieżka workera pójdzie dalej.
           */
          setThumbBitmaps((prev) => {
            const old = prev.get(id);
            if (old?.thumbPlaceholder === 'webgpu' && !old?.bitmap) {
              return prev;
            }
            const next = new Map(prev);
            next.set(id, {
              thumbPlaceholder: 'webgpu',
              thumbStatus: 'awaiting-embedded',
              exifOrientation: mergeThumbOrientation(old?.exifOrientation, 1),
            });
            return next;
          });
          try {
            onPrioritizeRawEmbeddedExtract?.(id);
          } catch {
            // noop
          }
          const cur = activeByAssetRef.current.get(id);
          if (cur?.requestId === requestId) {
            activeByAssetRef.current.delete(id);
            isFetchingRef.current.delete(id);
          }
          return;
        }
        // przynajmniej jeden tier istnieje → kontynuuj normalną ścieżką workera
      } catch (e) {
        console.warn('[FilmLab] hasDamPreview check failed', id, e);
      }

      try {
        if (ac.signal.aborted) {
          return;
        }

        existingEntry = thumbBitmapsRef.current.get(id);
        if (existingEntry?.bitmap) {
          const curB = activeByAssetRef.current.get(id);
          if (curB?.requestId === requestId) {
            activeByAssetRef.current.delete(id);
            isFetchingRef.current.delete(id);
          }
          return;
        }

        let decoded = null;
        let reactGuardTimer = null;
        try {
          decoded = await Promise.race([
            (async () => {
              let fast = null;
              try {
                fast = await tryMainThreadDamPreviewThumbBitmap({
                  sessionId: sessionIdRef.current,
                  assetId: id,
                  signal: ac.signal,
                });
              } catch (fastErr) {
                if (fastErr?.name === 'AbortError' || ac.signal.aborted) {
                  throw fastErr;
                }
              }
              if (fast?.bitmap) {
                return {
                  bitmap: fast.bitmap,
                  exifOrientation: fast.exifOrientation ?? 1,
                };
              }
              const assetRow = assetsForThumbs.find((a) => String(a?.id ?? '') === id);
              const catalogAssetMeta =
                assetRow != null
                  ? {
                      sourceName: assetRow.sourceName,
                      sourceLastModified: assetRow.sourceLastModified,
                      orientationTag:
                        Number.isFinite(Number(assetRow.exif?.orientationTag)) &&
                        Number(assetRow.exif?.orientationTag) >= 1 &&
                        Number(assetRow.exif?.orientationTag) <= 8
                          ? Math.round(Number(assetRow.exif.orientationTag))
                          : null,
                    }
                  : null;
              return await runQueuedDamPreviewDecode({
                requestId,
                signal: ac.signal,
                runDecode: () =>
                  scheduleOpfsDamPreviewDecode({
                    sessionId: sessionIdRef.current,
                    assetId: id,
                    priority,
                    requestId,
                    catalogAssetMeta,
                    skipSourceBin: true,
                  }),
              });
            })(),
            new Promise((_, reject) => {
              reactGuardTimer = setTimeout(() => {
                ac.abort();
                cancelImageWorkerRequest(requestId);
                const err = new Error('react-thumb-guard-timeout');
                err.code = 'REACT_THUMB_GUARD_TIMEOUT';
                reject(err);
              }, REACT_THUMB_GUARD_MS);
            }),
          ]);
        } catch (e) {
          if (e?.name === 'AbortError' || ac.signal.aborted) {
            return;
          }
          const msg = typeof e?.message === 'string' ? e.message : '';
          const reactUiGuard = e && typeof e === 'object' && e.code === 'REACT_THUMB_GUARD_TIMEOUT';
          if (reactUiGuard) {
            setThumbBitmaps((prev) => {
              const next = new Map(prev);
              const old = next.get(id);
              next.set(id, {
                thumbPlaceholder: 'react-guard',
                thumbStatus: 'react-thumb-guard-timeout',
                exifOrientation: mergeThumbOrientation(old?.exifOrientation, 1),
              });
              return next;
            });
            setThumbFailedIds((prev) => {
              const n = new Set(prev);
              n.add(id);
              return n;
            });
            return;
          }
          const wallOrWorkerTimeout =
            (e && typeof e === 'object' && e.code === 'THUMB_DECODE_WALL_TIMEOUT') ||
            (msg.includes('Worker job timeout') &&
              (msg.includes('5000') || msg.includes('8000')));
          if (wallOrWorkerTimeout) {
            setThumbBitmaps((prev) => {
              const next = new Map(prev);
              const old = next.get(id);
              next.set(id, {
                thumbPlaceholder: 'raw-timeout',
                thumbStatus: 'raw-preview-timeout',
                exifOrientation: mergeThumbOrientation(old?.exifOrientation, 1),
              });
              return next;
            });
            setThumbFailedIds((prev) => {
              const n = new Set(prev);
              n.add(id);
              return n;
            });
            return;
          }
          const needsWebgpuDecode = e && typeof e === 'object' && e.code === 'NEEDS_WEBGPU_DECODE';
          if (needsWebgpuDecode) {
            markDamPreviewWebgpuPermanent(sessionIdRef.current, id);
            terminalWebgpuIdsRef.current.add(id);
            prevTerminalIdsRef.current.delete(id);
            thumbPermanentFailIdsRef.current.add(id);
            setThumbBitmaps((prev) => {
              const next = new Map(prev);
              const old = next.get(id);
              next.set(id, {
                thumbPlaceholder: 'webgpu',
                thumbStatus: 'webgpu-required',
                exifOrientation: mergeThumbOrientation(old?.exifOrientation, 1),
              });
              return next;
            });
            return;
          }
          console.warn('[FilmLab] thumb worker decode', e);
          setThumbFailedIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
          return;
        } finally {
          if (reactGuardTimer != null) {
            clearTimeout(reactGuardTimer);
          }
        }

        if (!decoded?.bitmap) {
          setThumbFailedIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
          return;
        }

        if (ac.signal.aborted) {
          decoded.bitmap?.close?.();
          return;
        }

        const cur = activeByAssetRef.current.get(id);
        if (!cur || cur.requestId !== requestId) {
          decoded.bitmap.close();
          return;
        }

        setThumbBitmaps((prev) => {
          const next = new Map(prev);
          const old = next.get(id);
          old?.bitmap?.close?.();
          next.set(id, {
            bitmap: decoded.bitmap,
            exifOrientation: mergeThumbOrientation(old?.exifOrientation, decoded.exifOrientation ?? 1),
          });
          return next;
        });
        setThumbFailedIds((prev) => {
          if (!prev.has(id)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch (e) {
        if (e?.name !== 'AbortError' && !ac.signal.aborted) {
          console.warn('[FilmLab] thumb decode', e);
          setThumbFailedIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }
      } finally {
        const cur = activeByAssetRef.current.get(id);
        if (cur?.requestId === requestId) {
          activeByAssetRef.current.delete(id);
          isFetchingRef.current.delete(id);
        }
      }
    },
    [allowedIds, assetsForThumbs, onPrioritizeRawEmbeddedExtract]
  );

  /**
   * Po zapisie tieru w OPFS — jedno żądanie `loadThumb` dla tego assetId (bez lawiny retry/timerów).
   */
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const onOpfsReady = (e) => {
      const aid = String(e?.detail?.assetId ?? '');
      if (!aid || !allowedIds.has(aid)) {
        return;
      }
      if (terminalWebgpuIdsRef.current.has(aid) || thumbPermanentFailIdsRef.current.has(aid)) {
        return;
      }
      void loadThumb(aid, { prefetch: true });
    };
    window.addEventListener(FILMLAB_OPFS_PREVIEW_READY, onOpfsReady);
    return () => window.removeEventListener(FILMLAB_OPFS_PREVIEW_READY, onOpfsReady);
  }, [enabled, allowedIds, loadThumb]);

  useLayoutEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const root = viewportRootRef?.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    /** Debounce: szybki scroll zgłasza dziesiątki intersectionów w jednej klatce — jedna fala `loadThumb`. */
    const pendingIntersectIds = new Set();
    let debounceTimer = null;
    const IO_DEBOUNCE_MS = 48;

    const flushIntersect = () => {
      debounceTimer = null;
      const ids = [...pendingIntersectIds];
      pendingIntersectIds.clear();
      for (const hid of ids) {
        void loadThumb(hid, { prefetch: false });
      }
    };

    const onIntersect = (entries) => {
      for (const ent of entries) {
        const hid = ent.target.getAttribute?.('data-asset-thumb-id');
        if (!hid) {
          continue;
        }
        if (!ent.isIntersecting) {
          const active = activeByAssetRef.current.get(hid);
          if (active) {
            active.ac.abort();
            cancelImageWorkerRequest(active.requestId);
            activeByAssetRef.current.delete(hid);
            isFetchingRef.current.delete(hid);
          }
          continue;
        }
        pendingIntersectIds.add(hid);
      }
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(flushIntersect, IO_DEBOUNCE_MS);
    };

    const io = new IntersectionObserver(onIntersect, {
      root,
      rootMargin: IO_MARGIN,
      threshold: 0.01,
    });

    root.querySelectorAll('[data-asset-thumb-id]').forEach((n) => io.observe(n));

    return () => {
      io.disconnect();
      if (debounceTimer != null) {
        clearTimeout(debounceTimer);
      }
      pendingIntersectIds.clear();
    };
  }, [enabled, viewportRootRef, loadThumb, layoutObserverKey]);

  useEffect(
    () => () => {
      for (const [, prev] of activeByAssetRef.current) {
        prev.ac.abort();
        cancelImageWorkerRequest(prev.requestId);
      }
      activeByAssetRef.current.clear();
      isFetchingRef.current.clear();
      terminalWebgpuIdsRef.current.clear();
      thumbPermanentFailIdsRef.current.clear();
      prevTerminalIdsRef.current.clear();
      setThumbBitmaps((prev) => {
        for (const entry of prev.values()) {
          entry?.bitmap?.close?.();
        }
        return new Map();
      });
      setThumbFailedIds(new Set());
    },
    []
  );

  const prefetchThumb = useCallback(
    (assetId) => {
      void loadThumb(assetId, { prefetch: true });
    },
    [loadThumb]
  );

  return { thumbBitmaps, thumbFailedIds, prefetchThumb, abortAllThumbDecodes };
}
