/**
 * Lekki indeks semantyczny / telemetria AI — uzupełniany bez pełnych masek (lazy).
 * Docelowo: subject/sky confidence przed generowaniem bitmapy.
 */

export const FILMLAB_AI_INDEX_SCHEMA = 'mindfullens.ai-index.snapshot-v1';

/**
 * Heurystyka nazwy presetu AI (do czasu osobnego pola `kind` w masce).
 */
function inferAiSlotKind(mask) {
  const explicit = String(mask?.ai?.kind ?? '').toLowerCase();
  if (explicit === 'sky' || explicit === 'subject') return explicit;
  const name = String(mask?.name ?? '').toLowerCase();
  if (name.includes('sky') || name.includes('niebo')) return 'sky';
  if (name.includes('subject') || name.includes('temat')) return 'subject';
  return 'unknown';
}

/**
 * @param {object | null | undefined} adjustments
 * @returns {Record<string, unknown>}
 */
export function buildAiIndexFromAdjustments(adjustments) {
  if (!adjustments || typeof adjustments !== 'object') {
    return {};
  }

  const stack = Array.isArray(adjustments.localMasks) ? adjustments.localMasks : [];
  const backend = String(adjustments.aiAssistBackend ?? 'none');
  const runs = Number(adjustments.aiAssistRuns ?? 0);
  /** @type {Record<string, object>} */
  const slotHints = {};

  for (let i = 0; i < stack.length; i += 1) {
    const m = stack[i];
    if (m && typeof m === 'object' && m.source === 'ai-assist') {
      slotHints[`slot_${i}`] = {
        kind: inferAiSlotKind(m),
        source: 'ai-assist',
        mode: String(m.mode ?? ''),
        enabled: m.enabled !== false,
        confidence: Number.isFinite(Number(m?.ai?.confidence)) ? Number(m.ai.confidence) : null,
        backend:
          typeof m?.ai?.backend === 'string' && m.ai.backend.trim() !== ''
            ? m.ai.backend
            : backend,
      };
    }
  }

  const hasHints = Object.keys(slotHints).length > 0;
  const hasRuns = Number.isFinite(runs) && runs > 0;
  const hasBackend = backend !== 'none';

  if (!hasHints && !hasRuns && !hasBackend) {
    return {};
  }

  return {
    schema: FILMLAB_AI_INDEX_SCHEMA,
    backend,
    runs: Number.isFinite(runs) ? runs : 0,
    latencyMs: {
      last: Number.isFinite(Number(adjustments.aiAssistLastLatencyMs))
        ? Number(adjustments.aiAssistLastLatencyMs)
        : null,
      total: Number.isFinite(Number(adjustments.aiAssistTotalLatencyMs))
        ? Number(adjustments.aiAssistTotalLatencyMs)
        : 0,
      best: Number.isFinite(Number(adjustments.aiAssistBestLatencyMs))
        ? Number(adjustments.aiAssistBestLatencyMs)
        : null,
      worst: Number.isFinite(Number(adjustments.aiAssistWorstLatencyMs))
        ? Number(adjustments.aiAssistWorstLatencyMs)
        : null,
      avg:
        Number.isFinite(runs) && runs > 0 && Number.isFinite(Number(adjustments.aiAssistTotalLatencyMs))
          ? Number((Number(adjustments.aiAssistTotalLatencyMs) / runs).toFixed(2))
          : null,
    },
    slotHints,
  };
}
