import { useEffect, useRef } from 'react';
import { scheduleSmartPreviewGenerationIdle } from './dam/filmLabSmartPreview.js';
import { makeDevelopPreviewFrameKey } from './filmLabPreviewFrameCoherence.js';
import { dispatchFilmLabOpfsPreviewReady } from './filmLabOpfsPreviewReadyEvent.js';

const MAX_BLANK_RETRIES = 5;
const BLANK_RETRY_MS = 2000;
const PIPELINE_SETTLE_MS = 120;

/**
 * Z Develop (pełny pipeline WebGPU) → OPFS `standard` JPEG → `bumpPreviewEpoch` → Stykówka odczyta ten sam plik
 * (Lr: Biblioteka = cache podglądów, Develop = render z surowca).
 *
 * - **Ustabilizowany kadr:** gdy `!isAdjusting` i zmienia się `renderVersion`, zapis + invalidacja (debounce).
 * - **Zwolnienie suwaka:** przejście `isAdjusting` true→false czyści deduplikację — jeśli `renderVersion` nie podskoczył, i tak zapisujemy.
 * - **Wyjście z Develop:** cleanup zapisuje ostatni kadr (flush).
 *
 * Obsługiwane przypadki: WebGPU canvas bez `convertToBlob`, blank do czasu pierwszego draw, EXIF rotate dla proxy.
 */

function canvasHasContent(canvas) {
  try {
    const ctx2 = canvas.getContext('2d');
    if (!ctx2) {
      return true;
    }
    const cx = Math.floor(canvas.width / 2);
    const cy = Math.floor(canvas.height / 2);
    const size = Math.min(4, canvas.width, canvas.height);
    if (size < 1) {
      return false;
    }
    const data = ctx2.getImageData(Math.max(0, cx - 2), Math.max(0, cy - 2), size, size);
    let sum = 0;
    for (let i = 0; i < data.data.length; i += 4) {
      sum += data.data[i] + data.data[i + 1] + data.data[i + 2] + data.data[i + 3];
    }
    return sum > 0;
  } catch {
    return true;
  }
}

async function captureBlobFromCanvas(canvas) {
  if (typeof canvas.convertToBlob === 'function') {
    try {
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    } catch {
      // WebGPU canvas może nie obsługiwać convertToBlob — fallback
    }
  }
  if (typeof canvas.toBlob === 'function') {
    return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
  }
  return null;
}

async function rotateBlobIfNeeded(originalBlob, rotDeg) {
  if (!rotDeg || rotDeg === 0) {
    return originalBlob;
  }
  try {
    const bmp = await createImageBitmap(originalBlob);
    const needsSwap = rotDeg === 90 || rotDeg === 270;
    const ow = bmp.width;
    const oh = bmp.height;
    const cw = needsSwap ? oh : ow;
    const ch = needsSwap ? ow : oh;
    const offscreen =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(cw, ch)
        : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
    const ctx2d = offscreen.getContext('2d');
    if (!ctx2d) {
      bmp.close();
      return originalBlob;
    }
    ctx2d.translate(cw / 2, ch / 2);
    if (rotDeg === 90) ctx2d.rotate(Math.PI / 2);
    else if (rotDeg === 180) ctx2d.rotate(Math.PI);
    else if (rotDeg === 270) ctx2d.rotate(-Math.PI / 2);
    ctx2d.drawImage(bmp, -ow / 2, -oh / 2, ow, oh);
    bmp.close();
    if (typeof offscreen.convertToBlob === 'function') {
      return offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    }
    if (typeof offscreen.toBlob === 'function') {
      return new Promise((res) => offscreen.toBlob(res, 'image/jpeg', 0.82));
    }
    return originalBlob;
  } catch {
    return originalBlob;
  }
}

async function persistDevelopStandardJpeg({
  sessionId,
  assetId,
  canvas,
  exifRotationDegrees,
  patchAssetDamPreviewTier,
  bumpPreviewEpoch,
}) {
  if (!canvasHasContent(canvas)) {
    return { ok: false, reason: 'blank' };
  }
  const rawBlob = await captureBlobFromCanvas(canvas);
  if (!rawBlob) {
    return { ok: false, reason: 'no_blob' };
  }
  // Kadr w Develop (canvas) jest już zorientowany pionowo (odczyt z proxy / WebGL uwzględnił EXIF).
  // Podwójny obrót na blob wracałby go do poziomu lub obracał o 180 stopni.
  // JEDNAKŻE siatka biblioteki (FilmLabThumbCanvas) ZAWSZE nakłada orientację EXIF!
  // Musimy więc obrócić kadr Z POWROTEM (wstecz), aby siatka wyświetliła go poprawnie.
  const blob = await rotateBlobIfNeeded(rawBlob, -exifRotationDegrees);
  if (!blob) {
    return { ok: false, reason: 'rotate_failed' };
  }

  let width = canvas.width;
  let height = canvas.height;
  try {
    const measure = await createImageBitmap(blob);
    width = measure.width;
    height = measure.height;
    measure.close();
  } catch {
    // zostaw wymiary canvas
  }

  const { writeDamPreviewBlob } = await import('./opfs/filmLabOpfsPreviewCache.js');
  await writeDamPreviewBlob(sessionId, assetId, 'standard', blob);

  patchAssetDamPreviewTier?.(assetId, 'standard', {
    tier: 'standard',
    width,
    height,
    cachedAt: new Date().toISOString(),
    storage: 'opfs',
  });
  bumpPreviewEpoch?.();
  dispatchFilmLabOpfsPreviewReady(assetId);
  scheduleSmartPreviewGenerationIdle(sessionId, assetId, {
    force: true,
    onWritten: ({ width: sw, height: sh }) => {
      patchAssetDamPreviewTier?.(assetId, 'smart', {
        tier: 'smart',
        format: 'webp',
        width: sw,
        height: sh,
        cachedAt: new Date().toISOString(),
        storage: 'opfs',
      });
    },
  });
  return { ok: true };
}

export function useFilmLabDevelopOpfsThumbnailCapture({
  studioWorkspace,
  canvasRef,
  sessionId,
  assetId,
  hasImage,
  bumpPreviewEpoch,
  patchAssetDamPreviewTier,
  exifRotationDegrees = 0,
  renderVersion = 0,
  isAdjusting = false,
}) {
  const lastPipelineKeyRef = useRef('');
  const prevIsAdjustingRef = useRef(false);

  useEffect(() => {
    lastPipelineKeyRef.current = '';
  }, [assetId, sessionId]);

  const sessionIdRef = useRef(sessionId);
  const assetIdRef = useRef(assetId);
  const hasImageRef = useRef(hasImage);
  const canvasRefMirror = useRef(canvasRef);
  const exifRotRef = useRef(exifRotationDegrees);
  const patchRef = useRef(patchAssetDamPreviewTier);
  const bumpRef = useRef(bumpPreviewEpoch);
  sessionIdRef.current = sessionId;
  assetIdRef.current = assetId;
  hasImageRef.current = hasImage;
  canvasRefMirror.current = canvasRef;
  exifRotRef.current = exifRotationDegrees;
  patchRef.current = patchAssetDamPreviewTier;
  bumpRef.current = bumpPreviewEpoch;

  useEffect(() => {
    if (prevIsAdjustingRef.current && !isAdjusting) {
      lastPipelineKeyRef.current = '';
    }
    prevIsAdjustingRef.current = isAdjusting;
  }, [isAdjusting]);

  /** Pełny pipeline ustabilizowany: zapis + invalidacja miniatury w bibliotece. */
  useEffect(() => {
    if (studioWorkspace !== 'develop' || !hasImage || !assetId || !sessionId) {
      return undefined;
    }
    if (isAdjusting) {
      return undefined;
    }

    const pipelineKey = makeDevelopPreviewFrameKey({
      sessionId,
      assetId,
      renderVersion,
    });
    if (lastPipelineKeyRef.current === pipelineKey) {
      return undefined;
    }

    let cancelled = false;
    let blankAttempts = 0;
    let settleTimer = null;
    let blankTimer = null;

    const runPersist = async () => {
      if (cancelled) {
        return;
      }
      const canvas = canvasRef?.current;
      const sid = sessionIdRef.current;
      const aid = assetIdRef.current;
      if (!canvas || !sid || !aid) {
        return;
      }
      try {
        const res = await persistDevelopStandardJpeg({
          sessionId: sid,
          assetId: aid,
          canvas,
          exifRotationDegrees: exifRotRef.current,
          patchAssetDamPreviewTier: patchRef.current,
          bumpPreviewEpoch: bumpRef.current,
        });
        if (cancelled) {
          return;
        }
        if (res.ok) {
          lastPipelineKeyRef.current = pipelineKey;
          return;
        }
        if (res.reason === 'blank' && blankAttempts < MAX_BLANK_RETRIES) {
          blankAttempts += 1;
          blankTimer = window.setTimeout(() => {
            requestAnimationFrame(() => requestAnimationFrame(runPersist));
          }, BLANK_RETRY_MS);
        }
      } catch (e) {
        console.error('[FilmLab] develop canvas → OPFS thumbnail failed', e);
      }
    };

    settleTimer = window.setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(runPersist);
      });
    }, PIPELINE_SETTLE_MS);

    return () => {
      cancelled = true;
      if (settleTimer != null) {
        window.clearTimeout(settleTimer);
      }
      if (blankTimer != null) {
        window.clearTimeout(blankTimer);
      }
    };
  }, [
    studioWorkspace,
    sessionId,
    assetId,
    hasImage,
    canvasRef,
    bumpPreviewEpoch,
    patchAssetDamPreviewTier,
    exifRotationDegrees,
    renderVersion,
    isAdjusting,
  ]);

  /** Ostatni kadr przy opuszczeniu Develop (np. szybkie przełączenie zakładki). */
  useEffect(() => {
    if (studioWorkspace !== 'develop') {
      return undefined;
    }
    return () => {
      const sid = sessionIdRef.current;
      const aid = assetIdRef.current;
      if (!sid || !aid || !hasImageRef.current) {
        return;
      }
      const canvas = canvasRefMirror.current?.current;
      if (!canvas) {
        return;
      }
      void (async () => {
        try {
          await persistDevelopStandardJpeg({
            sessionId: sid,
            assetId: aid,
            canvas,
            exifRotationDegrees: exifRotRef.current,
            patchAssetDamPreviewTier: patchRef.current,
            bumpPreviewEpoch: bumpRef.current,
          });
        } catch (e) {
          console.error('[FilmLab] develop exit flush → OPFS thumbnail failed', e);
        }
      })();
    };
  }, [studioWorkspace]);
}
