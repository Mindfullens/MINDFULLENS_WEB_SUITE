/** Recipe layers v0 — dodatkowe przejścia tonacji przez wybraną maskę ze stacku (po HME). */

export function createRecipeLayerV0(overrides = {}) {
  const id =
    typeof overrides.id === 'string' && overrides.id.length > 0
      ? overrides.id
      : `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const maskIndex = Number.isFinite(Number(overrides.maskIndex))
    ? Math.round(Number(overrides.maskIndex))
    : 0;
  return {
    id,
    name: typeof overrides.name === 'string' ? overrides.name : 'Warstwa',
    enabled: overrides.enabled !== false,
    maskIndex,
    /** Opcjonalne: domyślnie `mask_slot_{maskIndex}` w eksporcie recipe (MaskGraphIR). */
    maskGraphNodeId:
      typeof overrides.maskGraphNodeId === 'string' && overrides.maskGraphNodeId.trim() !== ''
        ? overrides.maskGraphNodeId.trim()
        : undefined,
    exposure: Number.isFinite(Number(overrides.exposure)) ? Number(overrides.exposure) : 25,
    opacity: Number.isFinite(Number(overrides.opacity)) ? Number(overrides.opacity) : 100,
    /** `normal` | `multiply` | `screen` — silnik normalizuje nieznane wartości. */
    blendMode: typeof overrides.blendMode === 'string' && overrides.blendMode.trim() !== '' ? overrides.blendMode.trim() : 'normal',
  };
}
