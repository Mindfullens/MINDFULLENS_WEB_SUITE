/**
 * react-window v2 nie eksportuje już `FixedSizeList` — poziomy filmstrip to `Grid` (1 wiersz × N kolumn).
 * Named import z pakietu bywa problematyczny przy bundlerze; namespace jest stabilny.
 */
import * as ReactWindow from 'react-window';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  cancelImageWorkerRequest,
  getFilmstripThumbPriority,
  nextImageWorkerRequestId,
  scheduleOpfsDamPreviewDecode,
} from './filmLabImageWorkerBridge.js';
import { runQueuedDamPreviewDecode } from './dam/filmLabThumbnailQueueManager.js';
import { tryMainThreadDamPreviewThumbBitmap } from './dam/filmLabTryMainThreadDamThumb.js';
import { getCssTransformForExifOrientation } from './filmLabExifCssTransform.js';
import { isDamPreviewWebgpuPermanent, markDamPreviewWebgpuPermanent } from './filmLabDamPreviewWebgpuGate.js';
import { useI18n } from '../i18n';
import { FILMLAB_OPFS_PREVIEW_READY } from './filmLabOpfsPreviewReadyEvent.js';

const Grid = ReactWindow.Grid;

const CELL_W = 76;
const CELL_GAP = 6;
const THUMB_H = 64;
/** Szerokość slotu w poziomie (miniatura + margines/kąt między klatkami). */
const CELL_STRIDE = CELL_W + CELL_GAP;
const LIST_H = 68;
const DRAW_W = CELL_W - 4;
const DRAW_H = THUMB_H - 8;
const RW_OVERSCAN = 10;
/** Slot nie może wisieć bez końca na workerze / OPFS — race z timeoutem + placeholder. */
/** Miniatury RAW + sonda `source.bin` w workerze — 2 s bywało za mało → puste sloty / timeout. */
const FILMSTRIP_ASYNC_BUDGET_MS = 5500;

function filmstripAsyncBudget(promise, ms = FILMSTRIP_ASYNC_BUDGET_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error('filmstrip-async-timeout');
        err.code = 'FILMSTRIP_ASYNC_TIMEOUT';
        reject(err);
      }, ms);
    }),
  ]);
}

function paintFilmstripTimeoutPlaceholder(canvas) {
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const bw = DRAW_W;
  const bh = DRAW_H;
  canvas.width = Math.round(bw * dpr);
  canvas.height = Math.round(bh * dpr);
  canvas.style.width = `${bw}px`;
  canvas.style.height = `${bh}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(82,82,90,0.92)';
  ctx.fillRect(0, 0, bw, bh);
  const cx = bw / 2;
  const cy = bh / 2;
  const r = Math.min(bw, bh) * 0.18;
  ctx.strokeStyle = 'rgba(200,200,208,0.55)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200,200,208,0.88)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('◷', cx, cy);
}

/** L1: bufor RAM dla miniaturek (LRU) — szybki powrót przy przewijaniu bez ponownego OPFS. */
const L1_MAX = 200;
const filmstripL1 = new Map();

function l1Touch(key, entry) {
  if (filmstripL1.has(key)) {
    filmstripL1.delete(key);
  }
  filmstripL1.set(key, entry);
  while (filmstripL1.size > L1_MAX) {
    const oldestKey = filmstripL1.keys().next().value;
    const old = filmstripL1.get(oldestKey);
    filmstripL1.delete(oldestKey);
    if (old?.bitmap && typeof old.bitmap.close === 'function') {
      old.bitmap.close();
    }
  }
}

function l1Get(key) {
  const v = filmstripL1.get(key);
  if (!v) {
    return null;
  }
  filmstripL1.delete(key);
  filmstripL1.set(key, v);
  return v;
}

function l1ClearAll() {
  for (const [, e] of filmstripL1) {
    const bmp = e?.bitmap;
    if (bmp && typeof bmp.close === 'function') {
      bmp.close();
    }
  }
  filmstripL1.clear();
}

/** Jedna miniatura (np. świeży OPFS po edycji) — bez kasowania całego LRU. */
function l1EvictKey(key) {
  const k = String(key ?? '');
  if (!k) {
    return;
  }
  const old = filmstripL1.get(k);
  if (old?.bitmap && typeof old.bitmap.close === 'function') {
    old.bitmap.close();
  }
  filmstripL1.delete(k);
}

/**
 * Skalowanie „contain” w komórce — EXIF jako CSS na `.film-lab-filmstrip-cell-thumb-wrap`,
 * bez obracania pikseli na canvasie (RAW/JPEG jak zapisane w pliku).
 */
function paintCanvas(canvas, bitmap) {
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const bw = DRAW_W;
  const bh = DRAW_H;
  canvas.width = Math.round(bw * dpr);
  canvas.height = Math.round(bh * dpr);
  canvas.style.width = `${bw}px`;
  canvas.style.height = `${bh}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(90,90,96,0.45)';
  ctx.fillRect(0, 0, bw, bh);
  if (!bitmap) {
    return;
  }
  const iw = bitmap.width;
  const ih = bitmap.height;
  if (iw < 1 || ih < 1) {
    return;
  }
  const s = Math.min(bw / iw, bh / ih);
  const dw = iw * s;
  const dh = ih * s;
  const ox = (bw - dw) / 2;
  const oy = (bh - dh) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, ox, oy, dw, dh);
}

/** Miniaturny slot bez bitmapy (np. trwała blokada proxy WebGPU) — nie zostawiaj czarnego kwadratu. */
function paintRawSlotLabel(canvas, label = 'RAW') {
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const bw = DRAW_W;
  const bh = DRAW_H;
  canvas.width = Math.round(bw * dpr);
  canvas.height = Math.round(bh * dpr);
  canvas.style.width = `${bw}px`;
  canvas.style.height = `${bh}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = 'rgba(55,55,62,0.85)';
  ctx.fillRect(0, 0, bw, bh);
  ctx.fillStyle = 'rgba(200,200,208,0.92)';
  ctx.font = '600 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(label).slice(0, 8), bw / 2, bh / 2);
}

const FilmstripRow = memo(function FilmstripRow({ index, style, data }) {
  const {
    assets,
    sessionId,
    previewEpoch,
    primaryAssetId,
    selectedAssetIds,
    onPickAsset,
    allowedAssetIdsRef,
    filmstripDecodeInFlightRef,
    onPrioritizeRawEmbeddedExtract,
  } = data;
  const asset = assets[index];
  const id = String(asset?.id ?? '');
  const canvasRef = useRef(null);
  const [thumbOrient, setThumbOrient] = useState(1);
  const thumbWrapStyle = useMemo(
    () => ({
      transform: getCssTransformForExifOrientation(thumbOrient),
      transformOrigin: 'center center',
    }),
    [thumbOrient]
  );
  /** Inkrement zdarzenia OPFS dla tego assetId — bez timerów retry (poprzednio zatykało worker pool). */
  const [opfsReadyBump, setOpfsReadyBump] = useState(0);

  useEffect(() => {
    const onTierReady = (e) => {
      if (String(e?.detail?.assetId ?? '') === id) {
        setOpfsReadyBump((n) => n + 1);
      }
    };
    window.addEventListener(FILMLAB_OPFS_PREVIEW_READY, onTierReady);
    return () => window.removeEventListener(FILMLAB_OPFS_PREVIEW_READY, onTierReady);
  }, [id]);

  const isActive = id !== '' && id === String(primaryAssetId ?? '');
  const isSelected =
    id !== '' &&
    Array.isArray(selectedAssetIds) &&
    selectedAssetIds.some((s) => String(s) === id);

  let cellClass = 'film-lab-filmstrip-cell';
  if (isActive) {
    cellClass += ' film-lab-filmstrip-cell--active';
  } else if (isSelected) {
    cellClass += ' film-lab-filmstrip-cell--selected';
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !id || !asset) {
      return undefined;
    }

    let cancelled = false;
    const l1Key = `${sessionId}:${id}`;
    if (isDamPreviewWebgpuPermanent(sessionId, id)) {
      setThumbOrient(1);
      paintRawSlotLabel(canvas, 'RAW');
      return undefined;
    }
    const cached = l1Get(l1Key);
    if (cached?.bitmap) {
      setThumbOrient(cached.exifOrientation ?? 1);
      paintCanvas(canvas, cached.bitmap);
      return undefined;
    }

    const requestId = nextImageWorkerRequestId();
    const thumbAbort = new AbortController();
    const flightKey = `${sessionId}:${id}:${previewEpoch}`;
    /**
     * NIE wychodź wcześniej gdy `flightKey` już w secie (np. podwójny mount Strict Mode):
     * pierwszy efekt dodaje klucz i startuje async, drugi widziałby `has` → `return` bez `paintCanvas`
     * i **nigdy** by się nie odświeżył — cały filmstrip zostawał pusty.
     * Zduplikowany decode jest akceptowalny; `finally` usuwa klucz po każdej ścieżce.
     */
    filmstripDecodeInFlightRef?.current?.add(flightKey);

    void (async () => {
      try {
        if (!allowedAssetIdsRef.current.has(id)) {
          return;
        }
        if (isDamPreviewWebgpuPermanent(sessionId, id)) {
          setThumbOrient(1);
          paintRawSlotLabel(canvas, 'RAW');
          return;
        }
        const { hasDamPreview } = await import('./opfs/filmLabOpfsPreviewCache.js');
        const [hasStd, hasEmb] = await filmstripAsyncBudget(
          Promise.all([
            hasDamPreview(sessionId, id, 'standard'),
            hasDamPreview(sessionId, id, 'embedded'),
          ])
        );
        if (cancelled || !allowedAssetIdsRef.current.has(id)) {
          return;
        }
        if (!hasStd && !hasEmb) {
          paintRawSlotLabel(canvas, '…');
          try {
            onPrioritizeRawEmbeddedExtract?.(id);
          } catch {
            // noop
          }
          return;
        }
        let dec = null;
        try {
          const fast = await tryMainThreadDamPreviewThumbBitmap({
            sessionId,
            assetId: id,
            signal: thumbAbort.signal,
          });
          if (fast?.bitmap) {
            dec = { bitmap: fast.bitmap, exifOrientation: fast.exifOrientation ?? 1 };
          }
        } catch (fe) {
          if (fe?.name === 'AbortError' || thumbAbort.signal.aborted) {
            return;
          }
        }
        if (!dec?.bitmap) {
          dec = await runQueuedDamPreviewDecode({
            requestId,
            signal: thumbAbort.signal,
            runDecode: () =>
              scheduleOpfsDamPreviewDecode({
                sessionId,
                assetId: id,
                priority: getFilmstripThumbPriority(),
                requestId,
                /** Ten sam kształt co `useFilmLabLibraryLazyThumbs` — spójna rotacja z siatką (TIFF IFD / katalog). */
                catalogAssetMeta: {
                  sourceName: asset?.sourceName,
                  sourceLastModified: asset?.sourceLastModified,
                  orientationTag:
                    Number.isFinite(Number(asset?.exif?.orientationTag)) &&
                    Number(asset?.exif?.orientationTag) >= 1 &&
                    Number(asset?.exif?.orientationTag) <= 8
                      ? Math.round(Number(asset.exif.orientationTag))
                      : null,
                },
                skipSourceBin: true,
              }),
          });
        }
        if (cancelled || !allowedAssetIdsRef.current.has(id)) {
          dec?.bitmap?.close?.();
          return;
        }
        if (!dec?.bitmap) {
          setThumbOrient(1);
          paintRawSlotLabel(canvas, 'RAW');
          return;
        }
        const entry = {
          bitmap: dec.bitmap,
          exifOrientation: dec.exifOrientation ?? 1,
        };
        l1Touch(l1Key, entry);
        setThumbOrient(entry.exifOrientation);
        paintCanvas(canvas, dec.bitmap);
      } catch (err) {
        if (err?.name === 'AbortError' || cancelled) {
          return;
        }
        if (!allowedAssetIdsRef.current.has(id)) {
          return;
        }
        if (
          err &&
          typeof err === 'object' &&
          (err.code === 'FILMSTRIP_ASYNC_TIMEOUT' || err.code === 'THUMB_DECODE_WALL_TIMEOUT')
        ) {
          setThumbOrient(1);
          paintFilmstripTimeoutPlaceholder(canvas);
          return;
        }
        const msg = typeof err?.message === 'string' ? err.message : '';
        const isWebgpu = err && typeof err === 'object' && err.code === 'NEEDS_WEBGPU_DECODE';
        const isTransient =
          (msg && msg.includes('timeout')) ||
          err?.name === 'AbortError' ||
          /busy|queue|pool/i.test(msg);
        if (isWebgpu) {
          markDamPreviewWebgpuPermanent(sessionId, id);
          setThumbOrient(1);
          paintRawSlotLabel(canvas, 'RAW');
          return;
        }
        if (isTransient) {
          setThumbOrient(1);
          paintFilmstripTimeoutPlaceholder(canvas);
          return;
        }
        console.warn('[FilmLabFilmstrip] decode failed', id, err?.message ?? err);
        setThumbOrient(1);
        paintRawSlotLabel(canvas, 'RAW');
      } finally {
        filmstripDecodeInFlightRef?.current?.delete(flightKey);
      }
    })();

    return () => {
      cancelled = true;
      thumbAbort.abort();
      cancelImageWorkerRequest(requestId);
    };
  }, [id, sessionId, previewEpoch, asset, filmstripDecodeInFlightRef, opfsReadyBump]);

  const onPointerDown = useCallback(
    (e) => {
      if (!id) {
        return;
      }
      e.preventDefault();
      onPickAsset?.(asset.id, {
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
      });
    },
    [id, asset, onPickAsset]
  );

  if (!id) {
    return <div style={style} className={cellClass} />;
  }

  return (
    <div
      style={style}
      className={cellClass}
      role="option"
      aria-selected={isActive || isSelected}
      data-asset-id={id}
      onPointerDown={onPointerDown}
    >
      <div className="film-lab-filmstrip-cell-thumb-wrap" style={thumbWrapStyle}>
        <canvas ref={canvasRef} className="film-lab-filmstrip-cell-canvas" />
      </div>
    </div>
  );
});

/** Adapter: `Grid` przekazuje `columnIndex`; filmstrip to jeden wiersz → indeks assetu = kolumna. */
const FilmstripGridCell = memo(function FilmstripGridCell({ columnIndex, style, data }) {
  return <FilmstripRow index={columnIndex} style={style} data={data} />;
});

/**
 * Filmstrip (Develop / Library): pozioma lista wirtualna (`react-window`),
 * stały rozmiar komórki, overscan ≥ 10 — dekod Worker nie jest przerywany przy scrollu (współdzielony pool),
 * rozróżnienie aktywnej miniatury vs zaznaczenia (styl zbliżony do Lightroom).
 */
export default function FilmLabFilmstripCanvas({
  assets,
  sessionId,
  primaryAssetId,
  selectedAssetIds,
  previewEpoch = 0,
  onPickAsset,
  /** Zmiana zakładki shell (biblioteka ⟷ edycja) — ponowny pomiar, bo ukryta warstwa miała 0×0. */
  workspaceTabKey,
  onPrioritizeRawEmbeddedExtract,
}) {
  const { t } = useI18n();
  const emptyHint = t('workspace.library.filmstripEmpty');
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const allowedAssetIdsRef = useRef(new Set());
  /** Zapobiega podwójnemu `scheduleOpfsDamPreviewDecode` dla tego samego `(assetId, previewEpoch)`. */
  const filmstripDecodeInFlightRef = useRef(new Set());
  const primaryForEpochEvictRef = useRef(primaryAssetId);
  primaryForEpochEvictRef.current = primaryAssetId;

  const [viewportW, setViewportW] = useState(() =>
    typeof window !== 'undefined' ? Math.min(Math.max(window.innerWidth - 48, 320), 4096) : 1000
  );

  const assetIdsKey = useMemo(
    () => (Array.isArray(assets) ? assets.map((a) => String(a?.id ?? '')).join('|') : ''),
    [assets]
  );

  allowedAssetIdsRef.current = new Set(
    (Array.isArray(assets) ? assets : []).map((a) => String(a?.id ?? '')).filter(Boolean)
  );

  const cancelAndClearAll = useCallback(() => {
    l1ClearAll();
  }, []);

  useEffect(() => {
    return () => {
      cancelAndClearAll();
    };
  }, [cancelAndClearAll]);

  useEffect(() => {
    cancelAndClearAll();
  }, [assetIdsKey, sessionId, cancelAndClearAll]);

  /**
   * `previewEpoch++` po ekstraktach / powrocie z Develop — NIE czyść całego L1 (było „nuklearne”).
   * Odśwież tylko aktywne zdjęcie (nowy tier OPFS / miniatura po edycji).
   */
  useEffect(() => {
    const pid =
      primaryForEpochEvictRef.current != null ? String(primaryForEpochEvictRef.current) : '';
    if (!pid) {
      return;
    }
    l1EvictKey(`${sessionId}:${pid}`);
  }, [previewEpoch, sessionId]);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return undefined;
    }
    const measure = () => {
      const cw = root.clientWidth;
      const rw = Math.round(root.getBoundingClientRect?.().width ?? 0);
      let w = Math.max(0, Math.floor(Math.max(cw, rw)));
      if (w <= 0 && typeof window !== 'undefined') {
        w = Math.min(Math.max(window.innerWidth - 48, 320), 4096);
      }
      return w;
    };
    setViewportW(measure());
    const ro = new ResizeObserver(() => {
      setViewportW(measure());
    });
    ro.observe(root);
    const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => setViewportW(measure())) : 0;
    return () => {
      ro.disconnect();
      if (raf && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(raf);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (workspaceTabKey === undefined) {
      return undefined;
    }
    const root = containerRef.current;
    if (!root) {
      return undefined;
    }
    const measure = () => {
      const cw = root.clientWidth;
      const rw = Math.round(root.getBoundingClientRect?.().width ?? 0);
      let w = Math.max(0, Math.floor(Math.max(cw, rw)));
      if (w <= 0 && typeof window !== 'undefined') {
        w = Math.min(Math.max(window.innerWidth - 48, 320), 4096);
      }
      return w;
    };
    setViewportW(measure());
    const raf =
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame(() => {
            setViewportW(measure());
          })
        : 0;
    return () => {
      if (raf && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(raf);
      }
    };
  }, [workspaceTabKey]);

  useLayoutEffect(() => {
    const el = listRef.current?.element;
    if (!el || !Array.isArray(assets) || assets.length === 0) {
      return;
    }
    const maxScroll = Math.max(0, assets.length * CELL_STRIDE - el.clientWidth);
    if (el.scrollLeft > maxScroll) {
      el.scrollLeft = maxScroll;
    }
  }, [assetIdsKey, assets, viewportW]);

  const scrollFocusId =
    primaryAssetId != null
      ? String(primaryAssetId)
      : Array.isArray(selectedAssetIds) && selectedAssetIds.length > 0
        ? String(selectedAssetIds[selectedAssetIds.length - 1])
        : null;

  useLayoutEffect(() => {
    if (!listRef.current || !scrollFocusId || !Array.isArray(assets) || assets.length === 0) {
      return;
    }
    const idx = assets.findIndex((a) => String(a?.id ?? '') === scrollFocusId);
    if (idx >= 0) {
      listRef.current.scrollToColumn({ index: idx, align: 'smart' });
    }
  }, [scrollFocusId, assetIdsKey, assets, viewportW]);

  const itemData = useMemo(
    () => ({
      assets: Array.isArray(assets) ? assets : [],
      sessionId,
      previewEpoch,
      primaryAssetId,
      selectedAssetIds,
      onPickAsset,
      allowedAssetIdsRef,
      filmstripDecodeInFlightRef,
      onPrioritizeRawEmbeddedExtract,
    }),
    [
      assets,
      sessionId,
      previewEpoch,
      primaryAssetId,
      selectedAssetIds,
      onPickAsset,
      onPrioritizeRawEmbeddedExtract,
    ]
  );

  if (!Array.isArray(assets) || assets.length === 0) {
    return (
      <div
        key="filmstrip-empty"
        className="film-lab-filmstrip film-lab-filmstrip--empty"
        role="listbox"
        aria-label="Filmstrip"
        data-asset-ids=""
      >
        <div className="film-lab-filmstrip-empty-placeholder">{emptyHint}</div>
      </div>
    );
  }

  const listKey = `filmstrip-${assets.length}-${assetIdsKey}`;

  const listWidth =
    viewportW > 0
      ? viewportW
      : typeof window !== 'undefined'
        ? Math.min(Math.max(window.innerWidth - 48, 320), 4096)
        : 1000;

  return (
    <div
      ref={containerRef}
      key={listKey}
      className="film-lab-filmstrip film-lab-filmstrip--virtual"
      role="listbox"
      aria-label="Filmstrip"
      data-asset-count={assets.length}
    >
      <Grid
        key={`filmstrip-rw-${assetIdsKey}`}
        gridRef={listRef}
        className="film-lab-filmstrip-rw"
        columnCount={assets.length}
        columnWidth={CELL_STRIDE}
        rowCount={1}
        rowHeight={LIST_H}
        overscanCount={RW_OVERSCAN}
        cellComponent={FilmstripGridCell}
        cellProps={{ data: itemData }}
        style={{ height: LIST_H, width: listWidth }}
      />
    </div>
  );
}
