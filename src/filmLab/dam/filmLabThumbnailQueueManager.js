/**
 * Transportowa kolejka dla dekodów miniaturek DAM (RAW/DNG): ogranicza ile żądań
 * jednocześnie przechodzi do `scheduleOpfsDamPreviewDecode` / worker bridge — redukcja
 * „Worker Starvation” przy dużej siatce + `Promise.race` z limitem ściennego czasu.
 *
 * Obiekty z `AbortSignal`: przy `abort()` zadanie jest **usuwane z poczekalni** zanim
 * wykona się `taskFn` (nie obciążamy CPU/WASM dla kafelków poza viewportem).
 */

import { cancelImageWorkerRequest } from '../filmLabImageWorkerBridge.js';

/** Domyślny limit równoległych „pasów” decode — brak `navigator` (SSR/test): 4. */
const FALLBACK_CONCURRENCY = 4;
/** Górny limit — pulę workerów i tak cechuje POOL_SIZE; wyżej = zbędne oczekujące Promise. */
const MAX_CONCURRENCY_CAP = 8;

/** Ścienny limit (kolejka + slot workera); kill-switch workera = 5000 ms osobno w bridge. */
export const FILMLAB_THUMB_DECODE_WALL_MS = 12000;

export function getFilmLabThumbnailDecodeConcurrency() {
  if (typeof navigator === 'undefined') {
    return FALLBACK_CONCURRENCY;
  }
  const hc = Number(navigator.hardwareConcurrency);
  if (!Number.isFinite(hc) || hc < 1) {
    return FALLBACK_CONCURRENCY;
  }
  return Math.min(MAX_CONCURRENCY_CAP, Math.max(1, Math.floor(hc)));
}

export class FilmLabThumbnailQueueManager {
  /**
   * @param {number} concurrencyLimit
   */
  constructor(concurrencyLimit) {
    this.concurrencyLimit = concurrencyLimit;
    this.activeCount = 0;
    /** @type {Array<{ taskFn: () => Promise<unknown>, resolve: Function, reject: Function, signal?: AbortSignal, onAbort?: () => void }>} */
    this.queue = [];
  }

  /**
   * @template T
   * @param {() => Promise<T>} taskFn
   * @param {{ signal?: AbortSignal }} [options]
   * @returns {Promise<T>}
   */
  enqueue(taskFn, options = {}) {
    const { signal } = options;
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }

      const entry = {
        taskFn,
        resolve,
        reject,
      };

      const onAbort = () => {
        const idx = this.queue.indexOf(entry);
        if (idx >= 0) {
          this.queue.splice(idx, 1);
          reject(new DOMException('aborted', 'AbortError'));
        }
      };

      if (signal) {
        entry.signal = signal;
        entry.onAbort = onAbort;
        signal.addEventListener('abort', onAbort, { once: true });
      }

      this.queue.push(entry);
      this.pump();
    });
  }

  pump() {
    while (this.activeCount < this.concurrencyLimit && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) {
        break;
      }
      if (task.signal && task.onAbort) {
        task.signal.removeEventListener('abort', task.onAbort);
      }
      this.activeCount += 1;
      Promise.resolve()
        .then(() => task.taskFn())
        .then(task.resolve, task.reject)
        .finally(() => {
          this.activeCount -= 1;
          this.pump();
        });
    }
  }
}

let singletonQueue = null;

export function getFilmLabThumbnailDecodeQueue() {
  if (!singletonQueue) {
    singletonQueue = new FilmLabThumbnailQueueManager(getFilmLabThumbnailDecodeConcurrency());
  }
  return singletonQueue;
}

/**
 * Kolejka + twardy limit czasu ścienny (wlicza oczekiwanie w kolejce transportowej i pracę workera).
 * Przy timeout: `cancelImageWorkerRequest` — zwalnia slot w bridge (zgodnie z kontraktem pool).
 *
 * @template T
 * @param {object} opts
 * @param {string} opts.requestId
 * @param {() => Promise<T>} opts.runDecode
 * @param {number} [opts.wallClockMs]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<T>}
 */
export async function runQueuedDamPreviewDecode({
  requestId,
  runDecode,
  wallClockMs = FILMLAB_THUMB_DECODE_WALL_MS,
  signal,
}) {
  const rid = String(requestId ?? '');
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error('thumb-decode-wall-timeout');
      err.code = 'THUMB_DECODE_WALL_TIMEOUT';
      reject(err);
    }, wallClockMs);
  });

  const queue = getFilmLabThumbnailDecodeQueue();
  try {
    return await Promise.race([
      queue.enqueue(runDecode, { signal }),
      timeoutPromise,
    ]);
  } catch (e) {
    if (e && typeof e === 'object' && e.code === 'THUMB_DECODE_WALL_TIMEOUT' && rid) {
      cancelImageWorkerRequest(rid);
    }
    throw e;
  } finally {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
  }
}
