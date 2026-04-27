import { useCallback, useState } from 'react';
import {
  RAW_BACKEND_MODE_LABELS,
  RAW_BACKEND_MODES,
  RAW_LINEAR_STAGE_MODE_LABELS,
  RAW_LINEAR_STAGE_MODES,
} from './workbenchConstants.js';

export function useFilmLabRawPipelinePreferences() {
  const [rawBackendMode, setRawBackendMode] = useState(() => {
    try {
      const saved = localStorage.getItem('mindfullens_raw_backend_override');
      const normalized = String(saved ?? 'auto').trim().toLowerCase();
      return RAW_BACKEND_MODES.includes(normalized) ? normalized : 'auto';
    } catch {
      return 'auto';
    }
  });
  const [rawLinearStageMode, setRawLinearStageMode] = useState(() => {
    try {
      const saved = localStorage.getItem('mindfullens_raw_linear_stage_override');
      const normalized = String(saved ?? 'auto').trim().toLowerCase();
      return RAW_LINEAR_STAGE_MODES.includes(normalized) ? normalized : 'auto';
    } catch {
      return 'auto';
    }
  });

  const rawBackendPreference = rawBackendMode === 'auto' ? null : rawBackendMode;
  const rawBackendModeLabel = RAW_BACKEND_MODE_LABELS[rawBackendMode] ?? 'AUTO';
  const isRawBackendForced = rawBackendMode !== 'auto';
  const rawLinearStageOverride =
    rawLinearStageMode === 'on' ? true : rawLinearStageMode === 'off' ? false : null;
  const rawLinearStageModeLabel = RAW_LINEAR_STAGE_MODE_LABELS[rawLinearStageMode] ?? 'AUTO';
  const isRawLinearStageForced = rawLinearStageMode !== 'auto';

  const cycleRawLinearStageMode = useCallback(() => {
    setRawLinearStageMode((current) => {
      const currentIndex = RAW_LINEAR_STAGE_MODES.indexOf(current);
      if (currentIndex < 0) {
        return RAW_LINEAR_STAGE_MODES[0];
      }
      return RAW_LINEAR_STAGE_MODES[(currentIndex + 1) % RAW_LINEAR_STAGE_MODES.length];
    });
  }, []);

  return {
    rawBackendMode,
    setRawBackendMode,
    rawLinearStageMode,
    setRawLinearStageMode,
    rawBackendPreference,
    rawBackendModeLabel,
    isRawBackendForced,
    rawLinearStageOverride,
    rawLinearStageModeLabel,
    isRawLinearStageForced,
    cycleRawLinearStageMode,
  };
}
