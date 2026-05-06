/**
 * Skrócone statystyki recipe — cache invalidation, batch reporting, debug.
 */

export const FILMLAB_RECIPE_STATS_SCHEMA = 'mindfullens.recipe-stats.v1';

/**
 * @param {object | null | undefined} adjustments
 */
export function buildRecipeStatsFromAdjustments(adjustments) {
  if (!adjustments || typeof adjustments !== 'object') {
    return {
      schema: FILMLAB_RECIPE_STATS_SCHEMA,
      maskSlotCount: 0,
      aiMaskCount: 0,
      layerCount: 0,
      brushStrokeCount: 0,
      maskGraphCombineEnabled: false,
      aiAssistRuns: 0,
      aiAssistLatencyAvgMs: null,
      aiAssistLatencyBestMs: null,
      aiAssistLatencyWorstMs: null,
      aiAssistKpi100MsOk: null,
      generativeStubIntent: false,
    };
  }

  const masks = Array.isArray(adjustments.localMasks) ? adjustments.localMasks : [];
  const layers = Array.isArray(adjustments.recipeLayersV0) ? adjustments.recipeLayersV0 : [];
  const strokes = Array.isArray(adjustments.brushMaskStrokes) ? adjustments.brushMaskStrokes : [];
  const aiAssistRuns = Number(adjustments.aiAssistRuns ?? 0);
  const aiAssistTotalLatencyMs = Number(adjustments.aiAssistTotalLatencyMs);
  const aiAssistBestLatencyMs = Number(adjustments.aiAssistBestLatencyMs);
  const aiAssistWorstLatencyMs = Number(adjustments.aiAssistWorstLatencyMs);
  const aiAssistLastLatencyMs = Number(adjustments.aiAssistLastLatencyMs);
  const aiAssistLatencyAvgMs =
    aiAssistRuns > 0 && Number.isFinite(aiAssistTotalLatencyMs)
      ? Number((aiAssistTotalLatencyMs / aiAssistRuns).toFixed(2))
      : null;
  const aiMaskCount = masks.filter((mask) => mask?.source === 'ai-assist').length;

  return {
    schema: FILMLAB_RECIPE_STATS_SCHEMA,
    maskSlotCount: masks.length,
    aiMaskCount,
    layerCount: layers.length,
    brushStrokeCount: strokes.length,
    maskGraphCombineEnabled: Boolean(adjustments.localMaskGraphEnabled),
    aiAssistRuns: Number.isFinite(aiAssistRuns) ? aiAssistRuns : 0,
    aiAssistLatencyAvgMs,
    aiAssistLatencyBestMs: Number.isFinite(aiAssistBestLatencyMs) ? aiAssistBestLatencyMs : null,
    aiAssistLatencyWorstMs: Number.isFinite(aiAssistWorstLatencyMs) ? aiAssistWorstLatencyMs : null,
    aiAssistKpi100MsOk: Number.isFinite(aiAssistLastLatencyMs) ? aiAssistLastLatencyMs <= 100 : null,
    generativeStubIntent: Boolean(adjustments.generativeAiStubIntent),
  };
}
