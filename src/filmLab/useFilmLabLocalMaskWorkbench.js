import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeLocalMaskAiAssistPreset } from './localMaskAiAssist.js';

export const LOCAL_MASK_RESET_KEYS = [
  'brushMaskEnabled',
  'localMaskName',
  'localMaskEnabled',
  'localMaskSoloIndex',
  'localMaskMode',
  'localMaskShowOverlay',
  'localMaskOpacity',
  'localMaskBlend',
  'activeLocalMaskIndex',
  'localMasks',
  'brushMaskRadius',
  'brushMaskFeather',
  'brushMaskExposure',
  'brushMaskErase',
  'brushMaskEdgeSensitivity',
  'brushMaskStrokes',
  'linearMaskAngle',
  'linearMaskFeather',
  'linearMaskOffset',
  'radialMaskCenterX',
  'radialMaskCenterY',
  'radialMaskRadius',
  'radialMaskFeather',
  'lumaMaskMin',
  'lumaMaskMax',
  'lumaMaskFeather',
  'depthMaskMin',
  'depthMaskMax',
  'depthMaskFeather',
  'depthMapSource',
  'depthProxyDigest',
  'colorMaskHueCenter',
  'colorMaskHueWidth',
  'colorMaskFeather',
  'colorMaskChromaMin',
  'colorMaskChromaMax',
  'localMaskGraphEnabled',
  'localMaskGraphOp',
  'localMaskGraphIndexA',
  'localMaskGraphIndexB',
  'aiAssistBackend',
  'aiAssistRuns',
  'aiAssistLastLatencyMs',
  'aiAssistTotalLatencyMs',
  'aiAssistBestLatencyMs',
  'aiAssistWorstLatencyMs',
];

/**
 * Local mask stack + AI assist + brush/luma/hue modes — shared between Detal panel and Maski studio rails.
 */
export function useFilmLabLocalMaskWorkbench({
  adjustments,
  updateAdjustment,
  resetAdjustments,
  hasImage,
  activeCropRectNorm,
  renderSlider,
  depthOnnxInferenceUi,
}) {
  const updateAiAssistLatencyStats = useCallback(
    (latencyMs) => {
      const nextLatency = Number(latencyMs);
      if (!Number.isFinite(nextLatency) || nextLatency < 0) {
        return;
      }
      const safeLatency = Number(nextLatency.toFixed(2));
      const currentTotal = Number(adjustments.aiAssistTotalLatencyMs ?? 0);
      const nextTotal =
        (Number.isFinite(currentTotal) ? currentTotal : 0) + safeLatency;
      const currentBest = Number(adjustments.aiAssistBestLatencyMs);
      const currentWorst = Number(adjustments.aiAssistWorstLatencyMs);
      updateAdjustment('aiAssistLastLatencyMs', safeLatency);
      updateAdjustment('aiAssistTotalLatencyMs', Number(nextTotal.toFixed(2)));
      updateAdjustment(
        'aiAssistBestLatencyMs',
        Number.isFinite(currentBest) ? Math.min(currentBest, safeLatency) : safeLatency
      );
      updateAdjustment(
        'aiAssistWorstLatencyMs',
        Number.isFinite(currentWorst) ? Math.max(currentWorst, safeLatency) : safeLatency
      );
    },
    [
      adjustments.aiAssistBestLatencyMs,
      adjustments.aiAssistTotalLatencyMs,
      adjustments.aiAssistWorstLatencyMs,
      updateAdjustment,
    ]
  );

  const aiAssistRunRef = useRef(0);
  const [aiAssistState, setAiAssistState] = useState({ busy: false, label: '', confidence: null });
  useEffect(
    () => () => {
      aiAssistRunRef.current += 1;
    },
    []
  );

  const buildCurrentLocalMask = useCallback(() => {
    return {
      name: String(adjustments.localMaskName ?? 'Maska'),
      enabled: adjustments.localMaskEnabled !== false,
      mode: String(adjustments.localMaskMode ?? 'brush'),
      opacity: Number(adjustments.localMaskOpacity ?? 100),
      blend: String(adjustments.localMaskBlend ?? 'normal'),
      exposure: Number(adjustments.brushMaskExposure ?? 0),
      brush: {
        radius: Number(adjustments.brushMaskRadius ?? 80),
        feather: Number(adjustments.brushMaskFeather ?? 65),
        erase: Boolean(adjustments.brushMaskErase),
        edgeSensitivity: Math.max(0, Math.min(100, Number(adjustments.brushMaskEdgeSensitivity ?? 0))),
        strokes: Array.isArray(adjustments.brushMaskStrokes) ? adjustments.brushMaskStrokes : [],
      },
      linear: {
        angle: Number(adjustments.linearMaskAngle ?? 0),
        feather: Number(adjustments.linearMaskFeather ?? 55),
        offset: Number(adjustments.linearMaskOffset ?? 0),
      },
      radial: {
        centerX: Number(adjustments.radialMaskCenterX ?? 50),
        centerY: Number(adjustments.radialMaskCenterY ?? 50),
        radius: Number(adjustments.radialMaskRadius ?? 35),
        feather: Number(adjustments.radialMaskFeather ?? 55),
      },
      luma: {
        min: Number(adjustments.lumaMaskMin ?? 0),
        max: Number(adjustments.lumaMaskMax ?? 100),
        feather: Number(adjustments.lumaMaskFeather ?? 35),
      },
      color: {
        hueCenter: Number(adjustments.colorMaskHueCenter ?? 210),
        hueWidth: Number(adjustments.colorMaskHueWidth ?? 90),
        feather: Number(adjustments.colorMaskFeather ?? 35),
        chromaMin: Number(adjustments.colorMaskChromaMin ?? 0),
        chromaMax: Number(adjustments.colorMaskChromaMax ?? 100),
      },
      depth: {
        min: Number(adjustments.depthMaskMin ?? 0),
        max: Number(adjustments.depthMaskMax ?? 100),
        feather: Number(adjustments.depthMaskFeather ?? 35),
        mapSource: String(adjustments.depthMapSource ?? 'luminance'),
      },
    };
  }, [adjustments]);

  const applyLocalMaskToAdjustments = useCallback((mask) => {
    if (!mask) return;
    updateAdjustment('localMaskName', String(mask.name ?? 'Maska'));
    updateAdjustment('localMaskEnabled', mask.enabled !== false);
    updateAdjustment('localMaskMode', String(mask.mode ?? 'brush'));
    updateAdjustment('localMaskOpacity', Number(mask.opacity ?? 100));
    updateAdjustment('localMaskBlend', String(mask.blend ?? 'normal'));
    updateAdjustment('brushMaskExposure', Number(mask.exposure ?? 0));
    updateAdjustment('brushMaskRadius', Number(mask.brush?.radius ?? 80));
    updateAdjustment('brushMaskFeather', Number(mask.brush?.feather ?? 65));
    updateAdjustment('brushMaskErase', Boolean(mask.brush?.erase));
    updateAdjustment(
      'brushMaskEdgeSensitivity',
      Math.max(0, Math.min(100, Number(mask.brush?.edgeSensitivity ?? 0)))
    );
    updateAdjustment('brushMaskStrokes', Array.isArray(mask.brush?.strokes) ? mask.brush.strokes : []);
    updateAdjustment('linearMaskAngle', Number(mask.linear?.angle ?? 0));
    updateAdjustment('linearMaskFeather', Number(mask.linear?.feather ?? 55));
    updateAdjustment('linearMaskOffset', Number(mask.linear?.offset ?? 0));
    updateAdjustment('radialMaskCenterX', Number(mask.radial?.centerX ?? 50));
    updateAdjustment('radialMaskCenterY', Number(mask.radial?.centerY ?? 50));
    updateAdjustment('radialMaskRadius', Number(mask.radial?.radius ?? 35));
    updateAdjustment('radialMaskFeather', Number(mask.radial?.feather ?? 55));
    updateAdjustment('lumaMaskMin', Number(mask.luma?.min ?? 0));
    updateAdjustment('lumaMaskMax', Number(mask.luma?.max ?? 100));
    updateAdjustment('lumaMaskFeather', Number(mask.luma?.feather ?? 35));
    updateAdjustment('colorMaskHueCenter', Number(mask.color?.hueCenter ?? 210));
    updateAdjustment('colorMaskHueWidth', Number(mask.color?.hueWidth ?? 90));
    updateAdjustment('colorMaskFeather', Number(mask.color?.feather ?? 35));
    updateAdjustment('colorMaskChromaMin', Number(mask.color?.chromaMin ?? 0));
    updateAdjustment('colorMaskChromaMax', Number(mask.color?.chromaMax ?? 100));
    updateAdjustment('depthMaskMin', Number(mask.depth?.min ?? 0));
    updateAdjustment('depthMaskMax', Number(mask.depth?.max ?? 100));
    updateAdjustment('depthMaskFeather', Number(mask.depth?.feather ?? 35));
    updateAdjustment('depthMapSource', String(mask.depth?.mapSource ?? 'luminance'));
  }, [updateAdjustment]);

  const localMasks = Array.isArray(adjustments.localMasks) ? adjustments.localMasks : [];
  const localMaskSoloIndex = Number(adjustments.localMaskSoloIndex ?? -1);
  const localMaskActiveIndex = Math.max(
    0,
    Math.min(localMasks.length > 0 ? localMasks.length - 1 : 0, Number(adjustments.activeLocalMaskIndex ?? 0))
  );

  const commitCurrentMaskToStack = useCallback(() => {
    const nextMasks = localMasks.slice();
    const currentMask = buildCurrentLocalMask();
    if (nextMasks.length === 0) {
      nextMasks.push(currentMask);
    } else {
      nextMasks[localMaskActiveIndex] = currentMask;
    }
    updateAdjustment('localMasks', nextMasks);
    return nextMasks;
  }, [buildCurrentLocalMask, localMaskActiveIndex, localMasks, updateAdjustment]);

  const switchLocalMask = useCallback(
    (nextIndex) => {
      const nextMasks = commitCurrentMaskToStack();
      const clamped = Math.max(0, Math.min(nextMasks.length - 1, nextIndex));
      updateAdjustment('activeLocalMaskIndex', clamped);
      applyLocalMaskToAdjustments(nextMasks[clamped]);
    },
    [applyLocalMaskToAdjustments, commitCurrentMaskToStack, updateAdjustment]
  );

  const applyAiAssistMaskPreset = useCallback(
    async (kind) => {
      if (!hasImage || aiAssistState.busy) {
        return;
      }
      const runId = aiAssistRunRef.current + 1;
      aiAssistRunRef.current = runId;
      setAiAssistState({
        busy: true,
        label: kind === 'sky' ? 'AI analizuje niebo…' : 'AI analizuje temat…',
        confidence: null,
      });
      const nextMasks = commitCurrentMaskToStack();
      const startedAt = performance.now();
      try {
        const analysis = await analyzeLocalMaskAiAssistPreset({
          kind,
          maskIndex: nextMasks.length + 1,
          activeCropRectNorm,
        });
        if (aiAssistRunRef.current !== runId) {
          return;
        }
        const confidence = Number(analysis?.confidence ?? 0);
        const aiMask = {
          ...(analysis?.mask && typeof analysis.mask === 'object' ? analysis.mask : {}),
          source: 'ai-assist',
          ai: {
            kind: String(kind),
            confidence: Number.isFinite(confidence) ? confidence : 0,
            backend: String(analysis?.backend ?? 'fallback'),
          },
        };
        nextMasks.push(aiMask);
        const nextIndex = nextMasks.length - 1;
        updateAdjustment('localMasks', nextMasks);
        updateAdjustment('activeLocalMaskIndex', nextIndex);
        updateAdjustment('localMaskSoloIndex', -1);
        updateAdjustment('aiAssistBackend', String(analysis.backend ?? 'fallback'));
        updateAdjustment('aiAssistRuns', Number(adjustments.aiAssistRuns ?? 0) + 1);
        updateAiAssistLatencyStats(performance.now() - startedAt);
        applyLocalMaskToAdjustments(aiMask);
        setAiAssistState({
          busy: false,
          label: kind === 'sky' ? 'AI Sky gotowe' : 'AI Subject gotowe',
          confidence: Number.isFinite(confidence) ? confidence : 0,
        });
      } catch {
        if (aiAssistRunRef.current !== runId) {
          return;
        }
        updateAdjustment('aiAssistBackend', 'error');
        setAiAssistState({
          busy: false,
          label: kind === 'sky' ? 'AI Sky błąd' : 'AI Subject błąd',
          confidence: null,
        });
      }
    },
    [
      activeCropRectNorm,
      adjustments.aiAssistRuns,
      aiAssistState.busy,
      applyLocalMaskToAdjustments,
      commitCurrentMaskToStack,
      hasImage,
      updateAdjustment,
      updateAiAssistLatencyStats,
    ]
  );

  const resetLocalMaskFields = useCallback(() => {
    resetAdjustments(LOCAL_MASK_RESET_KEYS);
  }, [resetAdjustments]);

  return {
    adjustments,
    updateAdjustment,
    renderSlider,
    hasImage,
    buildCurrentLocalMask,
    applyLocalMaskToAdjustments,
    localMasks,
    localMaskSoloIndex,
    localMaskActiveIndex,
    commitCurrentMaskToStack,
    switchLocalMask,
    applyAiAssistMaskPreset,
    aiAssistState,
    resetLocalMaskFields,
    depthOnnxInferenceUi,
  };
}
