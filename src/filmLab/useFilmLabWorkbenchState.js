import { useRef, useState } from 'react';
import {
  createZeroCalibrationState,
  createZeroColorGradeState,
  createZeroHslState,
} from './colorGradingState.js';
import { cloneCurves } from './curvesCanvas.js';
import { DEFAULT_ADJUSTMENTS } from './defaultAdjustments.js';
import { DEFAULT_CURVES } from './defaultCurves.js';
import { resolveInitialPanelFromLocation } from './panelAndGradeTabs.js';
import { resolveInitialStudioWorkspaceFromLocation } from './studioWorkspaceTabs.js';
import { useDevicePixelRatio } from './useDevicePixelRatio.js';
import { FIT_UI_ZOOM, ZOOM_MODE } from './viewportZoom.js';

export function useFilmLabWorkbenchState() {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [activeFilmIndex, setActiveFilmIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePanel, setActivePanel] = useState(() => resolveInitialPanelFromLocation());
  const [studioWorkspace, setStudioWorkspace] = useState(() => resolveInitialStudioWorkspaceFromLocation());
  const [historyRevision, setHistoryRevision] = useState(0);
  const [activeCurveCh, setActiveCurveCh] = useState('rgb');
  const [isStraightenToolArmed, setIsStraightenToolArmed] = useState(false);
  const [straightenGuide, setStraightenGuide] = useState(null);
  const [cropLiveRect, setCropLiveRect] = useState(null);
  const [activeMixerGroup, setActiveMixerGroup] = useState('saturation');
  const [activeGradeZone, setActiveGradeZone] = useState('midtones');
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS);
  const [userCurves, setUserCurves] = useState(cloneCurves(DEFAULT_CURVES));
  const [colorMixer, setColorMixer] = useState(() => createZeroHslState());
  const [colorGrading, setColorGrading] = useState(() => createZeroColorGradeState());
  const [colorCalibration, setColorCalibration] = useState(() => createZeroCalibrationState());
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [interactionKind, setInteractionKind] = useState('idle');
  const [zoom, setZoom] = useState(FIT_UI_ZOOM);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [zoomMode, setZoomMode] = useState(ZOOM_MODE.CLASSIC);
  const [showRuntimeStatus, setShowRuntimeStatus] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [isMetadataPanelOpen, setIsMetadataPanelOpen] = useState(false);
  const devicePixelRatio = useDevicePixelRatio();
  const viewMode = 'workspace';
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [pendingBatchFiles, setPendingBatchFiles] = useState(null);
  const [clipboardFeedback, setClipboardFeedback] = useState(null);
  const [sessionRestoreNotice, setSessionRestoreNotice] = useState(null);
  const [sessionRestorePrompt, setSessionRestorePrompt] = useState(null);
  const [metadataViewMode, setMetadataViewMode] = useState('full');
  const [exifMeta, setExifMeta] = useState(null);
  /** Podgląd z OPFS (DAM) zanim pełny pipeline wczyta RAW — dekodowanie w workerze */
  const [developFastPreviewBitmap, setDevelopFastPreviewBitmap] = useState(null);
  /** EXIF 1–8 dla warstwy proxy (spójna z miniaturową ścieżką workera, niezależna od głównego canvas). */
  const [developFastPreviewExifOrientation, setDevelopFastPreviewExifOrientation] = useState(1);
  /** Tier smart WebP (~2560) — pixel-peep / Loupe (RAM). */
  const [developSmartPreviewBitmap, setDevelopSmartPreviewBitmap] = useState(null);
  /** Aktualne punkty krzywej podczas przeciągania — poza cyklem Reacta; silnik czyta dla 1D LUT. */
  const curveInteractionLiveRef = useRef(null);

  return {
    uploadedFile,
    setUploadedFile,
    imageUrl,
    setImageUrl,
    activeFilmIndex,
    setActiveFilmIndex,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    activePanel,
    setActivePanel,
    studioWorkspace,
    setStudioWorkspace,
    historyRevision,
    setHistoryRevision,
    activeCurveCh,
    setActiveCurveCh,
    isStraightenToolArmed,
    setIsStraightenToolArmed,
    straightenGuide,
    setStraightenGuide,
    cropLiveRect,
    setCropLiveRect,
    activeMixerGroup,
    setActiveMixerGroup,
    activeGradeZone,
    setActiveGradeZone,
    adjustments,
    setAdjustments,
    userCurves,
    setUserCurves,
    colorMixer,
    setColorMixer,
    colorGrading,
    setColorGrading,
    colorCalibration,
    setColorCalibration,
    isAdjusting,
    setIsAdjusting,
    interactionKind,
    setInteractionKind,
    zoom,
    setZoom,
    panOffset,
    setPanOffset,
    isPanning,
    setIsPanning,
    zoomMode,
    setZoomMode,
    showRuntimeStatus,
    setShowRuntimeStatus,
    isShortcutHelpOpen,
    setIsShortcutHelpOpen,
    isMetadataPanelOpen,
    setIsMetadataPanelOpen,
    devicePixelRatio,
    viewMode,
    isExportModalOpen,
    setIsExportModalOpen,
    pendingBatchFiles,
    setPendingBatchFiles,
    clipboardFeedback,
    setClipboardFeedback,
    sessionRestoreNotice,
    setSessionRestoreNotice,
    sessionRestorePrompt,
    setSessionRestorePrompt,
    metadataViewMode,
    setMetadataViewMode,
    exifMeta,
    setExifMeta,
    developFastPreviewBitmap,
    setDevelopFastPreviewBitmap,
    developFastPreviewExifOrientation,
    setDevelopFastPreviewExifOrientation,
    developSmartPreviewBitmap,
    setDevelopSmartPreviewBitmap,
    curveInteractionLiveRef,
  };
}
