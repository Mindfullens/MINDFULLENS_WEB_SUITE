/**
 * Pula workerów (domyślnie 4) + semafor + kolejka priorytetowa.
 * Maks. **POOL_SIZE** równoległych zadań OPFS/decode — reszta czeka w `jobQueue` (bez lawiny wątków I/O).
 * Viewport / Develop = wyższy `priority` (np. 200), tło = niższy (np. 20).
 */

import { touchDamPreviewLruFromWorkerPing } from './opfs/filmLabOpfsPreviewCache.js';

const POOL_SIZE = 4;
let poolInited = false;
/** @type {Worker[]} */
const workers = [];
/** @type {Set<number>} */
const idleWorkerIndices = new Set();
/** Slot workera → `requestId` aktywnego joba (po `postMessage`), do recycle przy timeoutcie. */
/** @type {Map<number, string>} */
const workerActiveJobId = new Map();
let reqCounter = 0;

/** @type {Map<string, { resolve: Function, reject: Function }>} */
const pending = new Map();
/** Timeout jobów Worker — brak wiszącego Promise bez końca. */
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingTimeouts = new Map();

const WORKER_JOB_TIMEOUT_MS = 10000;
/** Miniatury OPFS + `createImageBitmap` na RAW — dłużej niż domyślny job, krócej niż „wiszenie” bez końca. */
const WORKER_DAM_PREVIEW_JOB_TIMEOUT_MS = 22000;

function clearWorkerJobTimeout(requestId) {
  const key = String(requestId ?? '');
  const h = pendingTimeouts.get(key);
  if (h != null) {
    clearTimeout(h);
    pendingTimeouts.delete(key);
  }
}
/** @type {Array<{ priority: number; requestId: string; message: object; transfer: Transferable[]; timeoutMs: number }>} */
const jobQueue = [];

export function nextImageWorkerRequestId() {
  reqCounter += 1;
  return `req-${reqCounter}-${Date.now().toString(36)}`;
}

function wireFilmLabImageWorker(w, idx) {
  w.addEventListener('message', (ev) => {
    try {
      handleAnyWorkerMessage(ev, idx);
    } catch (error) {
      console.error('[Worker Bridge FATAL ERROR]', error);
      releaseWorker(idx);
    }
  });
  w.addEventListener('messageerror', (ev) => {
    console.error('[Worker Bridge FATAL ERROR]', 'messageerror', ev?.data ?? ev);
  });
}

/**
 * Zabija zawieszonego workera (np. natywny dekoder) i odtwarza slot — inaczej cała pula ginie na timeout.
 * Odrzuca nadal wiszący `pending` dla joba, który był przypisany do tego slotu (inaczej Promise bez końca).
 * @param {number} idx
 */
function replaceWorkerSlot(idx) {
  const stuckRid = workerActiveJobId.get(idx);
  if (stuckRid) {
    const sid = String(stuckRid);
    const entry = pending.get(sid);
    if (entry) {
      pending.delete(sid);
      clearWorkerJobTimeout(sid);
      entry.reject(new Error('Film Lab image worker slot recycled (decode stall or pool recovery)'));
    }
  }
  try {
    workers[idx]?.terminate?.();
  } catch {
    // noop
  }
  const w = new Worker(new URL('./imageWorker.js', import.meta.url), { type: 'module' });
  wireFilmLabImageWorker(w, idx);
  workers[idx] = w;
  workerActiveJobId.delete(idx);
  idleWorkerIndices.add(idx);
  pumpJobQueue();
}

function initPool() {
  if (poolInited || typeof Worker === 'undefined') {
    return;
  }
  try {
    for (let i = 0; i < POOL_SIZE; i += 1) {
      const w = new Worker(new URL('./imageWorker.js', import.meta.url), { type: 'module' });
      wireFilmLabImageWorker(w, i);
      workers.push(w);
      idleWorkerIndices.add(i);
    }
    poolInited = true;
    pumpJobQueue();
  } catch (e) {
    console.warn('[FilmLab] image worker pool init failed', e);
  }
}

function handleAnyWorkerMessage(ev, workerIdx) {
  const data = ev.data;
  if (!data || typeof data !== 'object') {
    releaseWorker(workerIdx);
    return;
  }
  const { type, id } = data;

  if (type === 'lruPing') {
    void touchDamPreviewLruFromWorkerPing({
      sessionId: data.sessionId,
      assetId: data.assetId,
      tier: data.tier,
      bytes: data.bytes,
    });
    return;
  }

  const entry = id != null ? pending.get(String(id)) : null;

  if (type === 'ready' && data.bitmap instanceof ImageBitmap) {
    if (entry) {
      pending.delete(String(id));
      const o = Number(data.orientation);
      entry.resolve({
        bitmap: data.bitmap,
        exifOrientation:
          Number.isFinite(o) && o >= 1 && o <= 8 ? Math.floor(o) : 1,
      });
    } else {
      data.bitmap.close();
    }
    releaseWorker(workerIdx);
    return;
  }

  if (type === 'arrayBufferReady' && data.buffer instanceof ArrayBuffer) {
    if (entry) {
      pending.delete(String(id));
      entry.resolve(data.buffer);
    }
    releaseWorker(workerIdx);
    return;
  }

  if (type === 'sourceReady' && data.buffer instanceof ArrayBuffer) {
    if (entry) {
      pending.delete(String(id));
      entry.resolve({
        buffer: data.buffer,
        sourceName: typeof data.sourceName === 'string' ? data.sourceName : 'source.bin',
        sourceLastModified: Number.isFinite(Number(data.sourceLastModified))
          ? Number(data.sourceLastModified)
          : Date.now(),
      });
    }
    releaseWorker(workerIdx);
    return;
  }

  if (type === 'error') {
    if (entry) {
      pending.delete(String(id));
      const err = new Error(typeof data.message === 'string' ? data.message : 'worker error');
      if (data.damPreviewNeedsProxyDecode) {
        err.damPreviewNeedsProxyDecode = true;
      }
      if (data.needsWebgpuDecode) {
        err.needsWebgpuDecode = true;
        err.code = 'NEEDS_WEBGPU_DECODE';
      }
      if (typeof data.firstMarker === 'string') {
        err.firstMarker = data.firstMarker;
      }
      entry.reject(err);
    }
    releaseWorker(workerIdx);
    return;
  }

  releaseWorker(workerIdx);
}

function releaseWorker(workerIdx) {
  idleWorkerIndices.add(workerIdx);
  workerActiveJobId.delete(workerIdx);
  pumpJobQueue();
}

/** Zadania develop (≥200) wypychają z kolejki tło (miniatury prefetch), żeby nie blokować slotów poolu. */
const PRIORITY_DEVELOP_PURGE = 200;

function purgeQueuedLowPriorityJobsForDevelop(incomingPriority) {
  if (incomingPriority < PRIORITY_DEVELOP_PURGE) {
    return;
  }
  for (let i = jobQueue.length - 1; i >= 0; i -= 1) {
    const j = jobQueue[i];
    if (j.priority >= PRIORITY_DEVELOP_PURGE) {
      continue;
    }
    jobQueue.splice(i, 1);
    const pe = pending.get(j.requestId);
    if (pe) {
      pending.delete(j.requestId);
      clearWorkerJobTimeout(j.requestId);
      pe.reject(new DOMException('aborted', 'AbortError'));
    }
    for (let wi = 0; wi < workers.length; wi += 1) {
      try {
        workers[wi].postMessage({ type: 'cancel', id: j.requestId, cancelScope: 'damPreview' });
      } catch {
        // noop
      }
    }
  }
}

function enqueueJobPart(job) {
  purgeQueuedLowPriorityJobsForDevelop(job.priority);
  jobQueue.push(job);
  jobQueue.sort((a, b) => b.priority - a.priority);
  pumpJobQueue();
}

function pumpJobQueue() {
  initPool();
  if (!workers.length) {
    return;
  }
  while (jobQueue.length > 0 && idleWorkerIndices.size > 0) {
    const iter = idleWorkerIndices.values();
    const first = iter.next();
    if (first.done) {
      break;
    }
    const workerIdx = first.value;
    idleWorkerIndices.delete(workerIdx);
    const job = jobQueue.shift();
    if (!job) {
      idleWorkerIndices.add(workerIdx);
      break;
    }
    try {
      workers[workerIdx].postMessage(job.message, job.transfer);
      workerActiveJobId.set(workerIdx, job.requestId);
      /**
       * Timer ZACZYNA się dopiero po `postMessage` (job dostał slot workera).
       * Wcześniej job mógł czekać w `jobQueue` 5+ s gdy 4 workery były zajęte
       * — co przy 8 s timeoutcie kończyło się fałszywym timeoutem dla joba,
       * który ledwo zaczął się dekodować.
       */
      const t = job.timeoutMs;
      if (Number.isFinite(t) && t > 0) {
        const rid = String(job.requestId);
        if (pending.has(rid)) {
          clearWorkerJobTimeout(rid);
          const timer = setTimeout(() => onWorkerJobTimeout(rid, t), t);
          pendingTimeouts.set(rid, timer);
        }
      }
    } catch (e) {
      idleWorkerIndices.add(workerIdx);
      console.error('[Worker Bridge FATAL ERROR]', e instanceof Error ? e : new Error(String(e)), {
        requestId: job.requestId,
      });
      const entry = pending.get(job.requestId);
      if (entry) {
        pending.delete(job.requestId);
        clearWorkerJobTimeout(job.requestId);
        entry.reject(e instanceof Error ? e : new Error(String(e)));
      }
      pumpJobQueue();
    }
  }
}

function onWorkerJobTimeout(rid, jobTimeoutMs) {
  clearWorkerJobTimeout(rid);
  const entry = pending.get(rid);
  if (!entry) {
    return;
  }
  pending.delete(rid);
  cancelImageWorkerRequest(rid);
  let recycledSlot = null;
  let recoveryMode = 'none';
  for (let wi = 0; wi < workers.length; wi += 1) {
    if (workerActiveJobId.get(wi) === rid) {
      replaceWorkerSlot(wi);
      recycledSlot = wi;
      recoveryMode = 'direct';
      break;
    }
  }
  const err = new Error(`Worker job timeout (${jobTimeoutMs}ms)`);
  console.warn('[Worker Bridge] timeout (recoverable)', {
    requestId: rid,
    recycledWorkerSlot: recycledSlot,
    recoveryMode,
  });
  entry.reject(err);
}

function runWithPool({ priority, requestId, message, transfer, timeoutMs }) {
  initPool();
  if (!workers.length) {
    return Promise.reject(new Error('no worker'));
  }
  const rid = String(requestId ?? '');
  const jobTimeoutMs =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : WORKER_JOB_TIMEOUT_MS;
  /** Zawsze ten sam `id` co klucz `pending` (unik rozjazdu typu / serializacji). */
  const outbound = message && typeof message === 'object' ? { ...message, id: rid } : message;
  return new Promise((resolve, reject) => {
    const wrapResolve = (val) => {
      clearWorkerJobTimeout(rid);
      resolve(val);
    };
    const wrapReject = (err) => {
      clearWorkerJobTimeout(rid);
      reject(err);
    };
    pending.set(rid, { resolve: wrapResolve, reject: wrapReject });
    /**
     * NIE startujemy `setTimeout` tutaj. Job może czekać w `jobQueue`
     * dowolnie długo, bo 4 workery są zajęte dłuższymi zadaniami.
     * Timer startujemy w `pumpJobQueue` po `postMessage` — to mierzy
     * faktyczny czas pracy workera, nie czas oczekiwania w kolejce.
     */
    enqueueJobPart({
      priority,
      requestId: rid,
      message: outbound,
      transfer,
      timeoutMs: jobTimeoutMs,
    });
  });
}

/**
 * Anuluje żądanie (wszystkim workerom — id jest unikalne).
 * @param {string} requestId
 */
export function cancelImageWorkerRequest(requestId) {
  const id = String(requestId ?? '');
  if (!id) {
    return;
  }
  /** Worker dodaje `id` do `cancelled` (także dla `opfsCatalogSourceRead` — ten sam pul requestów). */
  const payload = { type: 'cancel', id, cancelScope: 'damPreview' };
  for (let i = 0; i < workers.length; i += 1) {
    try {
      workers[i].postMessage(payload);
    } catch {
      // noop
    }
  }
  const entry = pending.get(id);
  if (entry) {
    pending.delete(id);
    clearWorkerJobTimeout(id);
    entry.reject(new DOMException('aborted', 'AbortError'));
  }
  const idx = jobQueue.findIndex((j) => j.requestId === id);
  if (idx >= 0) {
    jobQueue.splice(idx, 1);
  }
}

/**
 * ≥ PRIORITY_DEVELOP_PURGE (200) — inaczej `purgeQueuedLowPriorityJobsForDevelop` usuwa kolejkę
 * miniaturek biblioteki przy każdym jobie develop (≥200) i siatka/filmstrip zostają w „OCZEKUJE”.
 */
const PRIORITY_VIEWPORT_THUMB = 200;
const PRIORITY_PREFETCH_THUMB = 200;
const PRIORITY_DEVELOP_FAST = 220;
/**
 * Odczyt source.bin z OPFS dla Develop — MUSI być ≥ PRIORITY_DEVELOP_PURGE (200),
 * inaczej job develop fast preview (220) lub filmstrip (200) usuwa ten job z kolejki
 * (`purgeQueuedLowPriorityJobsForDevelop`) i ingest wpada w nieskończoną pętlę z UI.
 */
const PRIORITY_CATALOG_SOURCE_OPFS = 240;
/**
 * Musi być **>= PRIORITY_DEVELOP_PURGE (200)** — inaczej `purgeQueuedLowPriorityJobsForDevelop`
 * (wywoływane przy każdym jobie develop ≥200) wyrzuca z kolejki wszystkie joby filmstripu
 * (było 90) i miniatury na dolnym pasku nigdy się nie dekodują.
 */
const PRIORITY_FILMSTRIP = 200;

export function getThumbViewportPriority() {
  return PRIORITY_VIEWPORT_THUMB;
}

export function getThumbPrefetchPriority() {
  return PRIORITY_PREFETCH_THUMB;
}

export function getDevelopFastPreviewPriority() {
  return PRIORITY_DEVELOP_FAST;
}

export function getDevelopFullSourcePriority() {
  return PRIORITY_CATALOG_SOURCE_OPFS;
}

/** Alias jawny: pełny plik z OPFS nie jest „thumb background”. */
export function getCatalogOpfsSourceReadPriority() {
  return PRIORITY_CATALOG_SOURCE_OPFS;
}

export function getFilmstripThumbPriority() {
  return PRIORITY_FILMSTRIP;
}

/**
 * Odczyt OPFS + dekod w workerze → ImageBitmap (bez I/O na main).
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {string} opts.assetId
 * @param {number} [opts.priority]
 * @param {string} opts.requestId
 * @param {{ sourceName?: string, sourceLastModified?: number } | null} [opts.catalogAssetMeta] — do odczytu `source.bin` gdy brak tierów embedded/standard
 */
export function scheduleOpfsDamPreviewDecode({
  sessionId,
  assetId,
  priority = 50,
  requestId,
  catalogAssetMeta = null,
  skipSourceBin = false,
}) {
  const rid = String(requestId ?? '');
  return runWithPool({
    priority,
    requestId: rid,
    message: {
      type: 'opfsDamPreviewDecode',
      id: rid,
      sessionId: String(sessionId),
      assetId: String(assetId),
      catalogAssetMeta,
      skipSourceBin: Boolean(skipSourceBin),
    },
    transfer: [],
    timeoutMs: skipSourceBin
      ? Math.min(WORKER_DAM_PREVIEW_JOB_TIMEOUT_MS, 8000)
      : WORKER_DAM_PREVIEW_JOB_TIMEOUT_MS,
  });
}

/**
 * Odczyt pliku źródłowego z OPFS w workerze → ArrayBuffer (transfer) + meta.
 * @param {object} opts
 * @param {string|null|undefined} opts.catalogAssetMeta — zserializowane pola katalogu
 */
/** Odczyt dużego pliku (np. 50 MB RAW) — `Blob.arrayBuffer()` tylko w workerze. */
const PRIORITY_FILE_TO_ARRAYBUFFER = 45;

/**
 * Worker wczytuje `Blob` → `ArrayBuffer`, potem `postMessage(..., [buffer])` (transferable).
 * Promise na main rozwiązuje się tym samym buforem — bez drugiej kopii po stronie JS.
 * @param {Blob} file
 * @param {string} requestId
 * @param {number} [priority=PRIORITY_FILE_TO_ARRAYBUFFER]
 * @returns {Promise<ArrayBuffer>}
 */
/**
 * @param {Blob} file
 * @param {string} requestId
 * @param {number} [priority=PRIORITY_FILE_TO_ARRAYBUFFER]
 * @param {{ maxBytes?: number }} [options]
 */
export function scheduleFileArrayBufferRead(file, requestId, priority = PRIORITY_FILE_TO_ARRAYBUFFER, options = {}) {
  if (!(file instanceof Blob)) {
    return Promise.reject(new Error('expected Blob'));
  }
  initPool();
  if (!workers.length) {
    return file.arrayBuffer();
  }
  const rid = String(requestId ?? '');
  const maxBytes = Number.isFinite(Number(options?.maxBytes)) && Number(options.maxBytes) > 0
    ? Number(options.maxBytes)
    : 0;
  return runWithPool({
    priority,
    requestId: rid,
    message: { type: 'fileArrayBuffer', id: rid, file, maxBytes },
    transfer: [],
    /** Embedded extraction reads mogą trwać dla dużych RAW (50–80 MB). 25 s daje margines bez wieszania UI. */
    timeoutMs: 25000,
  });
}

export function scheduleOpfsCatalogSourceRead({
  sessionId,
  assetId,
  catalogAssetMeta = null,
  priority = 80,
  requestId,
}) {
  const rid = String(requestId ?? '');
  return runWithPool({
    priority,
    requestId: rid,
    message: {
      type: 'opfsCatalogSourceRead',
      id: rid,
      sessionId: String(sessionId),
      assetId: String(assetId),
      catalogAssetMeta,
    },
    transfer: [],
  });
}

/**
 * @param {ArrayBuffer} buffer
 * @param {string} [mimeType]
 * @param {number} priority
 * @param {string} requestId
 */
export function scheduleDecodeImageBitmapFromBuffer(buffer, mimeType, priority, requestId) {
  const rid = String(requestId ?? '');
  return runWithPool({
    priority,
    requestId: rid,
    message: { type: 'fromArrayBuffer', id: rid, buffer, mimeType },
    transfer: [buffer],
  });
}

/**
 * @param {string} url
 * @param {RequestInit} [requestInit]
 * @param {number} priority
 * @param {string} requestId
 */
export function scheduleFetchImageBitmap(url, requestInit, priority, requestId) {
  const rid = String(requestId ?? '');
  return runWithPool({
    priority,
    requestId: rid,
    message: { type: 'fetchBlob', id: rid, url, requestInit },
    transfer: [],
  });
}
