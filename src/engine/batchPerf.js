import { readEnvFlag } from '../filmLab/runtimeEnv.js';

export const IS_BATCH_PERF_ENABLED = readEnvFlag(import.meta?.env?.VITE_FILMLAB_BATCH_PERF);

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

let lastBatchPerfSnapshot = null;

function setLastBatchPerfSnapshot(snapshot) {
  lastBatchPerfSnapshot = snapshot;
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    try {
      window.dispatchEvent(new CustomEvent('filmlab-batch-perf', { detail: snapshot }));
    } catch {
      // Ignore CustomEvent issues in non-browser environments.
    }
  }
}

export function getLastBatchPerfSnapshot() {
  return lastBatchPerfSnapshot;
}

export function buildBatchPerfContext({ label, sizeProfile, totalFiles, filmName }) {
  if (!IS_BATCH_PERF_ENABLED) {
    return null;
  }

  return {
    label,
    startedAtMs: nowMs(),
    sizeProfile: String(sizeProfile ?? 'full'),
    totalFiles: Number(totalFiles) || 0,
    filmName: String(filmName ?? ''),
    perFile: [],
  };
}

export function recordBatchPerfFile(ctx, entry) {
  if (!ctx || !IS_BATCH_PERF_ENABLED) {
    return;
  }
  ctx.perFile.push(entry);
}

export function logBatchPerfSummary(ctx, { zipMs = null, addedCount = 0, aborted = false } = {}) {
  if (!ctx || !IS_BATCH_PERF_ENABLED) {
    return;
  }

  const endedAtMs = nowMs();
  const totalMs = Math.max(0, endedAtMs - ctx.startedAtMs);
  const perFileTotalMs = ctx.perFile.reduce((acc, item) => {
    const ms = item?.ms && typeof item.ms === 'object' ? item.ms : null;
    const total = ms && Number.isFinite(Number(ms.total)) ? Number(ms.total) : 0;
    return acc + total;
  }, 0);

  const payload = {
    label: ctx.label,
    filmName: ctx.filmName,
    sizeProfile: ctx.sizeProfile,
    totalFiles: ctx.totalFiles,
    addedCount,
    aborted,
    timingsMs: {
      total: Number(totalMs.toFixed(3)),
      zip: zipMs == null ? null : Number(zipMs.toFixed(3)),
      sumPerFile: Number(perFileTotalMs.toFixed(3)),
    },
    perFile: ctx.perFile,
  };

  setLastBatchPerfSnapshot({
    schema: 'mindfullens.batch-perf.v1',
    generatedAt: new Date().toISOString(),
    enabled: true,
    ...payload,
  });

  // Keep logs structured for copy/paste into issues/benchmark notes.
  console.log('[FilmLab][BatchPerf] summary', payload);
}

/**
 * @template T
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<{ result: T, ms: number }>}
 */
export async function measureAsync(fn) {
  if (!IS_BATCH_PERF_ENABLED) {
    return { result: await fn(), ms: 0 };
  }
  const startedAt = nowMs();
  const result = await fn();
  return { result, ms: Math.max(0, nowMs() - startedAt) };
}
