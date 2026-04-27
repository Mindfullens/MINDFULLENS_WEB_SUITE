import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filmStocks } from '../src/engine/filmProfiles.js';
import { mapKelvinToTemperature } from '../src/engine/sliderResponseMap.js';
import { resolveWhiteBalanceGains } from '../src/engine/whiteBalance.js';
import {
  applyAnchoredZoom,
  clampPanToBoundsForSize,
  resolveFittedSizeForAspect,
} from '../src/engine/previewGeometry.js';
import { resolveShortcutAction, SHORTCUT_KEYS } from '../src/engine/shortcutActions.js';
import { __FILMLAB_INTERNALS } from '../src/engine/useFilmLabEngine.js';

const {
  buildWorkerAdjustmentsPayload,
  buildFastPreviewAdjustments,
  IDENTITY_CURVES,
} = __FILMLAB_INTERNALS;

const PROFILE_READY = 'ready';
const PROFILE_FAILED = 'failed';

function createIdentityCurves() {
  return {
    rgb: IDENTITY_CURVES.rgb.map((point) => [...point]),
    r: IDENTITY_CURVES.r.map((point) => [...point]),
    g: IDENTITY_CURVES.g.map((point) => [...point]),
    b: IDENTITY_CURVES.b.map((point) => [...point]),
  };
}

function createBaselineAdjustments(overrides = {}) {
  return {
    strength: 100,
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    temp: 0,
    tint: 0,
    saturation: 0,
    vibrance: 0,
    fade: 0,
    clarity: 0,
    dehaze: 0,
    userGrain: 0,
    userGrainSize: 10,
    userVignette: 0,
    chromAb: 0,
    bloom: 0,
    halation: 0,
    halRadius: 30,
    halThresh: 200,
    halHue: 0,
    anamorph: 0,
    streakLen: 50,
    showClipping: false,
    isAdjusting: false,
    interactionKind: 'idle',
    curveLumaMix: 72,
    userCurves: createIdentityCurves(),
    userHsl: null,
    userColorGrade: null,
    userCalibration: null,
    ...overrides,
  };
}

function hasNonIdentityCurves(curves) {
  if (!curves) {
    return false;
  }
  const channels = ['rgb', 'r', 'g', 'b'];
  return channels.some((channel) => {
    const points = curves[channel];
    if (!Array.isArray(points) || points.length !== 2) {
      return true;
    }
    return !(
      points[0]?.[0] === 0 &&
      points[0]?.[1] === 0 &&
      points[1]?.[0] === 255 &&
      points[1]?.[1] === 255
    );
  });
}

function formatOk(label) {
  console.log(`OK  ${label}`);
}

function runKeyboardShortcutGuard() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const scriptsDirectory = path.dirname(currentFilePath);
  const filmLabSourcePath = path.resolve(scriptsDirectory, '../src/FilmLabPro.jsx');
  const filmLabEntryPath = path.resolve(scriptsDirectory, '../src/FilmLab.jsx');
  const filmLabShellContainerPath = path.resolve(scriptsDirectory, '../src/FilmLabShellContainer.jsx');
  const workbenchConstantsPath = path.resolve(scriptsDirectory, '../src/filmLab/workbenchConstants.js');
  const metadataPanelPath = path.resolve(scriptsDirectory, '../src/FilmLabCanvasMetadataPanel.jsx');
  const toolbarPath = path.resolve(scriptsDirectory, '../src/FilmLabToolbar.jsx');
  const renderDebugPath = path.resolve(scriptsDirectory, '../src/FilmLabRenderDebugPanel.jsx');
  const shortcutActionsPath = path.resolve(scriptsDirectory, '../src/engine/shortcutActions.js');
  const globalKeydownPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabGlobalKeydown.js');
  const shellGlobalKeydownPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabShellGlobalKeydown.js');
  const shellPropBundlePath = path.resolve(scriptsDirectory, '../src/filmLab/buildFilmLabShellPropBundle.js');
  const imageSourceEffectsPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabImageSourceEffects.js');
  const previewAndSourceEffectsPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabPreviewAndSourceEffects.js');
  const metadataItemsHookPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabMetadataItems.js');
  const exportDebugReportHookPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabExportDebugReport.js');
  const engineSidecarPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabEngineSidecar.js');
  const chromeLayoutPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabChromeLayout.js');
  const filmCatalogPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabFilmCatalog.js');
  const engineAdjustmentsPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabEngineAdjustments.js');
  const imageIdentityKeyPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabImageIdentityKey.js');
  const cropOverlayFlagsPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabCropOverlayInteractionFlags.js');
  const panelNavigationPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabPanelNavigation.js');
  const cropLayoutEffectsPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabCropLayoutEffects.js');
  const sessionPersistencePath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabSessionPersistence.js');
  const clipboardSessionClusterPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabClipboardSessionCluster.js');
  const undoHistoryClusterPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabUndoHistoryCluster.js');
  const autoDevelopColorGradeClusterPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabAutoDevelopAndColorGradeCluster.js');
  const captureUploadRestoreClusterPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabCaptureAndUploadRestoreCluster.js');
  const viewportDebugKeydownUnmountClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabViewportDebugKeydownUnmountCluster.js'
  );
  const curveWorkbenchShellOverlayClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabCurveWorkbenchShellOverlayCluster.js'
  );
  const catalogEngineCropGeometryClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabCatalogEngineCropGeometryCluster.js'
  );
  const catalogCropGeometryEngineSidecarClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabCatalogCropGeometryAndEngineSidecarCluster.js'
  );
  const chromeLayoutCropStraightenRefClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabChromeLayoutAndCropStraightenRefCluster.js'
  );
  const chromeLayoutAndCatalogEngineClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabChromeLayoutAndCatalogEngineCluster.js'
  );
  const chromeCatalogEngineAndViewportRefsPreviewSprocketClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabChromeCatalogEngineAndViewportRefsPreviewSprocketCluster.js'
  );
  const filmViewCropRectApplyClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabFilmViewAndCropRectApplyCluster.js'
  );
  const filmViewCropRectApplyAndDragLayoutClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabFilmViewCropRectApplyAndDragLayoutCluster.js'
  );
  const cropDragLayoutEffectsClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabCropDragAndLayoutEffectsCluster.js'
  );
  const straightenDragOutsideCropClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabStraightenDragAndOutsideCropResetCluster.js'
  );
  const straightenDragOutsideCropAndPanelNavigationClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabStraightenDragOutsideCropAndPanelNavigationCluster.js'
  );
  const filmViewCropDragStraightenAndPanelClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabFilmViewCropDragStraightenAndPanelCluster.js'
  );
  const canvasViewportIdentityOverlayClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabCanvasViewportIdentityAndOverlayCluster.js'
  );
  const canvasViewportWithDebugKeydownUnmountClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabCanvasViewportWithDebugKeydownUnmountCluster.js'
  );
  const canvasViewportDebugAndCurveWorkbenchShellOverlayClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabCanvasViewportDebugAndCurveWorkbenchShellOverlayCluster.js'
  );
  const viewportRefsPreviewSourceSprocketClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabViewportRefsPreviewSourceSprocketCluster.js'
  );
  const undoHistorySliderWorkbenchClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabUndoHistorySliderWorkbenchCluster.js'
  );
  const undoSliderWorkbenchAutoDevelopClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabUndoSliderWorkbenchAutoDevelopCluster.js'
  );
  const captureUploadUndoSliderAutoDevelopClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabCaptureUploadAndUndoSliderAutoDevelopCluster.js'
  );
  const captureUploadUndoWorkbenchClipboardClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabCaptureUploadUndoWorkbenchClipboardCluster.js'
  );
  const workbenchStateRawPipelineClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabWorkbenchStateAndRawPipelineCluster.js'
  );
  const workbenchRefsSliderDragClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabWorkbenchRefsAndSliderDragActivationCluster.js'
  );
  const workbenchStateAndRefsSliderDragActivationClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabWorkbenchStateAndRefsSliderDragActivationCluster.js'
  );
  const workbenchStateRefsAndChromeCatalogViewportPreviewSprocketClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabWorkbenchStateRefsAndChromeCatalogViewportPreviewSprocketCluster.js'
  );
  const workbenchChromeViewportAndCaptureClipboardClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabWorkbenchChromeViewportAndCaptureClipboardCluster.js'
  );
  const workbenchChromeCaptureAndFilmCropStraightenPanelClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabWorkbenchChromeCaptureAndFilmCropStraightenPanelCluster.js'
  );
  const workbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellClusterPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster.js'
  );
  const useFilmLabFilmLabProPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabFilmLabPro.js');
  const filmLabFilmLabProClusterArgFactoriesPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/filmLabFilmLabProClusterArgFactories.js'
  );
  const buildFilmLabShellContainerBundleArgsPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/buildFilmLabShellContainerBundleArgs.js'
  );
  const filmLabFilmLabProBuildCanvasViewportDebugCurveShellArgsPath = path.resolve(
    scriptsDirectory,
    '../src/filmLab/filmLabFilmLabProBuildCanvasViewportDebugCurveShellArgs.js'
  );
  const cropStraightenLiveRefsPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabCropStraightenLiveRefs.js');
  const viewportStateRefsPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabViewportStateRefs.js');
  const workbenchRefsPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabWorkbenchRefs.js');
  const straightenOutsideCropResetPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabStraightenOutsideCropReset.js');
  const workbenchStatePath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabWorkbenchState.js');
  const source = fs.readFileSync(filmLabSourcePath, 'utf8');
  const filmLabEntrySource = fs.readFileSync(filmLabEntryPath, 'utf8');
  const filmLabShellContainerSource = fs.readFileSync(filmLabShellContainerPath, 'utf8');
  const engineSidecarSource = fs.readFileSync(engineSidecarPath, 'utf8');
  const chromeLayoutSource = fs.readFileSync(chromeLayoutPath, 'utf8');
  const filmCatalogSource = fs.readFileSync(filmCatalogPath, 'utf8');
  const engineAdjustmentsSource = fs.readFileSync(engineAdjustmentsPath, 'utf8');
  const imageIdentityKeySource = fs.readFileSync(imageIdentityKeyPath, 'utf8');
  const cropOverlayFlagsSource = fs.readFileSync(cropOverlayFlagsPath, 'utf8');
  const panelNavigationSource = fs.readFileSync(panelNavigationPath, 'utf8');
  const cropLayoutEffectsSource = fs.readFileSync(cropLayoutEffectsPath, 'utf8');
  const sessionPersistenceSource = fs.readFileSync(sessionPersistencePath, 'utf8');
  const clipboardSessionClusterSource = fs.readFileSync(clipboardSessionClusterPath, 'utf8');
  const undoHistoryClusterSource = fs.readFileSync(undoHistoryClusterPath, 'utf8');
  const autoDevelopColorGradeClusterSource = fs.readFileSync(autoDevelopColorGradeClusterPath, 'utf8');
  const captureUploadRestoreClusterSource = fs.readFileSync(captureUploadRestoreClusterPath, 'utf8');
  const viewportDebugKeydownUnmountClusterSource = fs.readFileSync(viewportDebugKeydownUnmountClusterPath, 'utf8');
  const curveWorkbenchShellOverlayClusterSource = fs.readFileSync(curveWorkbenchShellOverlayClusterPath, 'utf8');
  const catalogEngineCropGeometryClusterSource = fs.readFileSync(catalogEngineCropGeometryClusterPath, 'utf8');
  const catalogCropGeometryEngineSidecarClusterSource = fs.readFileSync(catalogCropGeometryEngineSidecarClusterPath, 'utf8');
  const chromeLayoutCropStraightenRefClusterSource = fs.readFileSync(chromeLayoutCropStraightenRefClusterPath, 'utf8');
  const chromeLayoutAndCatalogEngineClusterSource = fs.readFileSync(chromeLayoutAndCatalogEngineClusterPath, 'utf8');
  const chromeCatalogEngineAndViewportRefsPreviewSprocketClusterSource = fs.readFileSync(
    chromeCatalogEngineAndViewportRefsPreviewSprocketClusterPath,
    'utf8'
  );
  const filmViewCropRectApplyClusterSource = fs.readFileSync(filmViewCropRectApplyClusterPath, 'utf8');
  const filmViewCropRectApplyAndDragLayoutClusterSource = fs.readFileSync(filmViewCropRectApplyAndDragLayoutClusterPath, 'utf8');
  const cropDragLayoutEffectsClusterSource = fs.readFileSync(cropDragLayoutEffectsClusterPath, 'utf8');
  const straightenDragOutsideCropClusterSource = fs.readFileSync(straightenDragOutsideCropClusterPath, 'utf8');
  const straightenDragOutsideCropAndPanelNavigationClusterSource = fs.readFileSync(
    straightenDragOutsideCropAndPanelNavigationClusterPath,
    'utf8'
  );
  const filmViewCropDragStraightenAndPanelClusterSource = fs.readFileSync(
    filmViewCropDragStraightenAndPanelClusterPath,
    'utf8'
  );
  const canvasViewportIdentityOverlayClusterSource = fs.readFileSync(canvasViewportIdentityOverlayClusterPath, 'utf8');
  const canvasViewportWithDebugKeydownUnmountClusterSource = fs.readFileSync(canvasViewportWithDebugKeydownUnmountClusterPath, 'utf8');
  const canvasViewportDebugAndCurveWorkbenchShellOverlayClusterSource = fs.readFileSync(
    canvasViewportDebugAndCurveWorkbenchShellOverlayClusterPath,
    'utf8'
  );
  const viewportRefsPreviewSourceSprocketClusterSource = fs.readFileSync(viewportRefsPreviewSourceSprocketClusterPath, 'utf8');
  const undoHistorySliderWorkbenchClusterSource = fs.readFileSync(undoHistorySliderWorkbenchClusterPath, 'utf8');
  const undoSliderWorkbenchAutoDevelopClusterSource = fs.readFileSync(undoSliderWorkbenchAutoDevelopClusterPath, 'utf8');
  const captureUploadUndoSliderAutoDevelopClusterSource = fs.readFileSync(captureUploadUndoSliderAutoDevelopClusterPath, 'utf8');
  const captureUploadUndoWorkbenchClipboardClusterSource = fs.readFileSync(captureUploadUndoWorkbenchClipboardClusterPath, 'utf8');
  const workbenchStateRawPipelineClusterSource = fs.readFileSync(workbenchStateRawPipelineClusterPath, 'utf8');
  const workbenchRefsSliderDragClusterSource = fs.readFileSync(workbenchRefsSliderDragClusterPath, 'utf8');
  const workbenchStateAndRefsSliderDragActivationClusterSource = fs.readFileSync(
    workbenchStateAndRefsSliderDragActivationClusterPath,
    'utf8'
  );
  const workbenchStateRefsAndChromeCatalogViewportPreviewSprocketClusterSource = fs.readFileSync(
    workbenchStateRefsAndChromeCatalogViewportPreviewSprocketClusterPath,
    'utf8'
  );
  const workbenchChromeViewportAndCaptureClipboardClusterSource = fs.readFileSync(
    workbenchChromeViewportAndCaptureClipboardClusterPath,
    'utf8'
  );
  const workbenchChromeCaptureAndFilmCropStraightenPanelClusterSource = fs.readFileSync(
    workbenchChromeCaptureAndFilmCropStraightenPanelClusterPath,
    'utf8'
  );
  const workbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellClusterSource = fs.readFileSync(
    workbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellClusterPath,
    'utf8'
  );
  const useFilmLabFilmLabProSource = fs.readFileSync(useFilmLabFilmLabProPath, 'utf8');
  const filmLabFilmLabProClusterArgFactoriesSource = fs.readFileSync(
    filmLabFilmLabProClusterArgFactoriesPath,
    'utf8'
  );
  const buildFilmLabShellContainerBundleArgsSource = fs.readFileSync(buildFilmLabShellContainerBundleArgsPath, 'utf8');
  const filmLabFilmLabProBuildCanvasViewportDebugCurveShellArgsSource = fs.readFileSync(
    filmLabFilmLabProBuildCanvasViewportDebugCurveShellArgsPath,
    'utf8'
  );
  const filmLabProStateBundle = `${source}\n${useFilmLabFilmLabProSource}\n${filmLabFilmLabProClusterArgFactoriesSource}\n${buildFilmLabShellContainerBundleArgsSource}\n${filmLabFilmLabProBuildCanvasViewportDebugCurveShellArgsSource}`;
  const cropStraightenLiveRefsSource = fs.readFileSync(cropStraightenLiveRefsPath, 'utf8');
  const viewportStateRefsSource = fs.readFileSync(viewportStateRefsPath, 'utf8');
  const workbenchRefsSource = fs.readFileSync(workbenchRefsPath, 'utf8');
  const straightenOutsideCropResetSource = fs.readFileSync(straightenOutsideCropResetPath, 'utf8');
  const workbenchStateSource = fs.readFileSync(workbenchStatePath, 'utf8');
  const metadataItemsHookSource = fs.readFileSync(metadataItemsHookPath, 'utf8');
  const exportDebugReportHookSource = fs.readFileSync(exportDebugReportHookPath, 'utf8');
  const globalKeydownSource = fs.readFileSync(globalKeydownPath, 'utf8');
  const shellGlobalKeydownSource = fs.readFileSync(shellGlobalKeydownPath, 'utf8');
  const shellPropBundleSource = fs.readFileSync(shellPropBundlePath, 'utf8');
  const imageSourceEffectsSource = fs.readFileSync(imageSourceEffectsPath, 'utf8');
  const previewAndSourceEffectsSource = fs.readFileSync(previewAndSourceEffectsPath, 'utf8');
  const workbenchConstantsSource = fs.readFileSync(workbenchConstantsPath, 'utf8');
  const filmLabWorkbenchBundle = `${source}\n${workbenchConstantsSource}\n${useFilmLabFilmLabProSource}\n${filmLabFilmLabProClusterArgFactoriesSource}\n${buildFilmLabShellContainerBundleArgsSource}\n${filmLabFilmLabProBuildCanvasViewportDebugCurveShellArgsSource}`;
  const metadataPanelSource = fs.readFileSync(metadataPanelPath, 'utf8');
  const toolbarSource = fs.readFileSync(toolbarPath, 'utf8');
  const renderDebugSource = fs.readFileSync(renderDebugPath, 'utf8');
  const shortcutActionsSource = fs.readFileSync(shortcutActionsPath, 'utf8');
  const renderDebugBundle = `${source}\n${renderDebugSource}`;
  const toolbarBundle = `${source}\n${toolbarSource}`;

  assert.match(shortcutActionsSource, /full:\s*'F'/, 'Full preview shortcut key should be centralized');
  assert.match(shortcutActionsSource, /clipping:\s*'J'/, 'Clipping shortcut key should be centralized');
  assert.match(shortcutActionsSource, /fit:\s*'0'/, 'Fit shortcut key should be centralized');
  assert.match(shortcutActionsSource, /help:\s*'\?'/, 'Help shortcut key should be centralized');
  assert.match(shortcutActionsSource, /metadata:\s*'I'/, 'Metadata shortcut key should be centralized');
  assert.match(shortcutActionsSource, /metadataMode:\s*'M'/, 'Metadata mode shortcut key should be centralized');
  assert.match(shortcutActionsSource, /rawLinearStage:\s*'L'/, 'RAW linear stage shortcut key should be centralized');
  assert.match(shortcutActionsSource, /zoomIn:\s*'\+'/, 'Zoom-in shortcut key should be centralized');
  assert.match(shortcutActionsSource, /zoomOut:\s*'-'/, 'Zoom-out shortcut key should be centralized');
  assert.match(filmLabEntrySource, /filmLabPage\.css/, 'FilmLab entry should import page styles');
  assert.match(filmLabEntrySource, /\.\/FilmLabPro\.jsx/, 'FilmLab entry should re-export FilmLabPro');
  assert.match(
    `${source}\n${globalKeydownSource}`,
    /resolveShortcutAction\(/,
    'Film Lab key handling should use centralized shortcut action resolver'
  );
  assert.match(
    source,
    /useFilmLabFilmLabPro/,
    'FilmLab entry (FilmLabPro) should wire useFilmLabFilmLabPro for primary workbench + shell bundle'
  );
  assert.match(
    useFilmLabFilmLabProSource,
    /useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster/,
    'useFilmLabFilmLabPro should delegate to workbench+crop+viewport debug/curve shell cluster'
  );
  assert.match(
    useFilmLabFilmLabProSource,
    /filmLabFilmLabProClusterArgFactories/,
    'useFilmLabFilmLabPro should import cluster arg factories'
  );
  assert.match(
    filmLabFilmLabProClusterArgFactoriesSource,
    /export const filmLabFilmLabProClusterArgFactories/,
    'Cluster arg factories module should export the shared factory object'
  );
  assert.match(
    filmLabFilmLabProClusterArgFactoriesSource,
    /buildCanvasViewportDebugAndCurveWorkbenchShellOverlayArgs/,
    'Cluster arg factories should include viewport+curve workbench/shell arg builder'
  );
  assert.match(
    filmLabFilmLabProClusterArgFactoriesSource,
    /filmLabFilmLabProBuildCanvasViewportDebugCurveShellArgs/,
    'Cluster arg factories should import canvas viewport+curve/shell arg builder module'
  );
  assert.match(
    filmLabFilmLabProBuildCanvasViewportDebugCurveShellArgsSource,
    /export function buildCanvasViewportDebugAndCurveWorkbenchShellOverlayArgs/,
    'Canvas viewport+curve/shell arg builder module should export the builder function'
  );
  assert.match(
    useFilmLabFilmLabProSource,
    /buildFilmLabShellContainerBundleArgs/,
    'useFilmLabFilmLabPro should import shell container bundle arg builder'
  );
  assert.match(
    buildFilmLabShellContainerBundleArgsSource,
    /export function buildFilmLabShellContainerBundleArgs/,
    'Shell bundle builder module should export buildFilmLabShellContainerBundleArgs'
  );
  assert.match(
    buildFilmLabShellContainerBundleArgsSource,
    /metadataViewMode: s\.metadataViewMode/,
    'Shell bundle builder should pass metadata view mode into shell bundle'
  );
  assert.match(
    workbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellClusterSource,
    /useFilmLabWorkbenchChromeCaptureAndFilmCropStraightenPanelCluster/,
    'FilmLabPro primary cluster should delegate to workbench+chrome+capture+film crop/straighten/panel cluster'
  );
  assert.match(
    workbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellClusterSource,
    /useFilmLabCanvasViewportDebugAndCurveWorkbenchShellOverlayCluster/,
    'FilmLabPro primary cluster should delegate to viewport+debug + curve workbench/shell overlay cluster'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster\(/,
    'FilmLabPro.jsx should not call workbench+crop+viewport... cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabWorkbenchChromeCaptureAndFilmCropStraightenPanelCluster\(/,
    'FilmLab should not call workbench+capture+film crop/panel cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCanvasViewportDebugAndCurveWorkbenchShellOverlayCluster\(/,
    'FilmLab should not call viewport+debug + curve workbench/shell cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    canvasViewportDebugAndCurveWorkbenchShellOverlayClusterSource,
    /useFilmLabCanvasViewportWithDebugKeydownUnmountCluster/,
    'Viewport+curve mega cluster should delegate to viewport+debug/keydown/unmount cluster'
  );
  assert.match(
    canvasViewportDebugAndCurveWorkbenchShellOverlayClusterSource,
    /useFilmLabCurveWorkbenchShellOverlayCluster/,
    'Viewport+curve mega cluster should delegate to curve workbench + shell overlay cluster'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCanvasViewportWithDebugKeydownUnmountCluster\(/,
    'FilmLab should not call viewport+debug cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCurveWorkbenchShellOverlayCluster\(/,
    'FilmLab should not call curve workbench/shell overlay cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    canvasViewportWithDebugKeydownUnmountClusterSource,
    /useFilmLabCanvasViewportIdentityAndOverlayCluster/,
    'Viewport+debug cluster should delegate to canvas viewport identity+overlay cluster hook'
  );
  assert.match(
    canvasViewportWithDebugKeydownUnmountClusterSource,
    /useFilmLabViewportDebugKeydownUnmountCluster/,
    'Viewport+debug cluster should delegate to viewport debug/keydown/unmount cluster hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCanvasViewportIdentityAndOverlayCluster\(/,
    'FilmLab should not call canvas viewport identity+overlay cluster hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabViewportDebugKeydownUnmountCluster\(/,
    'FilmLab should not call viewport debug/keydown/unmount cluster hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(viewportDebugKeydownUnmountClusterSource, /useFilmLabViewportDebugExpose/, 'Viewport cluster should wire viewport debug expose hook');
  assert.match(viewportDebugKeydownUnmountClusterSource, /useFilmLabShellGlobalKeydown/, 'Viewport cluster should wire shell global keydown hook');
  assert.match(viewportDebugKeydownUnmountClusterSource, /useFilmLabUnmountCleanup/, 'Viewport cluster should wire unmount cleanup hook');
  assert.match(shellGlobalKeydownSource, /useFilmLabGlobalKeydown/, 'Shell global keydown should delegate to keydown hook');
  assert.match(
    shellGlobalKeydownSource,
    /buildFilmLabGlobalKeydownProps/,
    'Shell global keydown should build props via helper'
  );
  assert.match(source, /FilmLabShellContainer/, 'FilmLab should render shell layout via container');
  assert.match(filmLabShellContainerSource, /buildFilmLabShellPropBundle/, 'Shell container should build layout props via bundle');
  assert.match(
    shellPropBundleSource,
    /shellPropBuilders/,
    'Shell prop bundle should import unified shell prop builders'
  );
  assert.match(shellPropBundleSource, /buildFilmLabToolbarProps/, 'Shell prop bundle should compose toolbar props');
  assert.match(shellPropBundleSource, /buildFilmLabCanvasAreaProps/, 'Shell prop bundle should compose canvas props');
  assert.match(shellPropBundleSource, /buildFilmLabRightPanelProps/, 'Shell prop bundle should compose right panel props');
  assert.match(shellPropBundleSource, /buildFilmLabProfilesSidebarProps/, 'Shell prop bundle should compose profiles sidebar props');
  assert.match(shellPropBundleSource, /buildFilmLabShortcutHelpProps/, 'Shell prop bundle should compose shortcut help props');
  assert.match(
    shellPropBundleSource,
    /buildFilmLabSessionRestorePromptProps/,
    'Shell prop bundle should compose session restore prompt props'
  );
  assert.match(shellPropBundleSource, /buildFilmLabExportModalProps/, 'Shell prop bundle should compose export modal props');
  assert.match(
    `${source}\n${metadataPanelSource}`,
    /Metadane zdjęcia/,
    'FilmLab metadata panel should render metadata frame title'
  );
  assert.match(
    `${source}\n${metadataPanelSource}`,
    /displayedMetadataItems\.map|metadataItems\.map/,
    'FilmLab should render metadata entries from metadata source list'
  );
  assert.match(
    filmLabProStateBundle,
    /isMetadataPanelOpen/,
    'FilmLab should keep metadata panel toggle state'
  );
  assert.match(
    workbenchChromeCaptureAndFilmCropStraightenPanelClusterSource,
    /useFilmLabWorkbenchChromeViewportAndCaptureClipboardCluster/,
    'Workbench+chrome+capture+film crop/straighten panel mega cluster should delegate to workbench+chrome+capture cluster'
  );
  assert.match(
    workbenchChromeCaptureAndFilmCropStraightenPanelClusterSource,
    /useFilmLabFilmViewCropDragStraightenAndPanelCluster/,
    'Workbench+chrome+capture+film crop/straighten panel mega cluster should delegate to film view+straighten panel cluster'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabWorkbenchChromeViewportAndCaptureClipboardCluster\(/,
    'FilmLab should not call workbench+chrome+capture cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabFilmViewCropDragStraightenAndPanelCluster\(/,
    'FilmLab should not call film view+straighten panel cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    workbenchChromeViewportAndCaptureClipboardClusterSource,
    /useFilmLabWorkbenchStateRefsAndChromeCatalogViewportPreviewSprocketCluster/,
    'Workbench+chrome+capture mega cluster should delegate to workbench+chrome+viewport cluster'
  );
  assert.match(
    workbenchChromeViewportAndCaptureClipboardClusterSource,
    /useFilmLabCaptureUploadUndoWorkbenchClipboardCluster/,
    'Workbench+chrome+capture mega cluster should delegate to capture+undo+clipboard cluster'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabWorkbenchStateRefsAndChromeCatalogViewportPreviewSprocketCluster\(/,
    'FilmLab should not call workbench+chrome+viewport cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCaptureUploadUndoWorkbenchClipboardCluster\(/,
    'FilmLab should not call capture+undo+clipboard cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    workbenchStateRefsAndChromeCatalogViewportPreviewSprocketClusterSource,
    /useFilmLabWorkbenchStateAndRefsSliderDragActivationCluster/,
    'Workbench+chrome+viewport cluster should delegate to workbench state+refs cluster'
  );
  assert.match(
    workbenchStateRefsAndChromeCatalogViewportPreviewSprocketClusterSource,
    /useFilmLabChromeCatalogEngineAndViewportRefsPreviewSprocketCluster/,
    'Workbench+chrome+viewport cluster should delegate to chrome+catalog+viewport preview cluster'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabWorkbenchStateAndRefsSliderDragActivationCluster\(/,
    'FilmLab should not call workbench state+refs cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabChromeCatalogEngineAndViewportRefsPreviewSprocketCluster\(/,
    'FilmLab should not call chrome+catalog+viewport preview cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    chromeCatalogEngineAndViewportRefsPreviewSprocketClusterSource,
    /useFilmLabChromeLayoutAndCatalogEngineCluster/,
    'Chrome+catalog+viewport preview cluster should delegate to chrome layout + catalog/engine cluster'
  );
  assert.match(
    chromeCatalogEngineAndViewportRefsPreviewSprocketClusterSource,
    /useFilmLabViewportRefsPreviewSourceSprocketCluster/,
    'Chrome+catalog+viewport preview cluster should delegate to viewport refs + preview/sprocket cluster'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabChromeLayoutAndCatalogEngineCluster\(/,
    'FilmLab should not call chrome+catalog engine cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabChromeLayoutAndCropStraightenRefCluster\(/,
    'FilmLab should not call chrome layout + crop straighten ref cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCatalogCropGeometryAndEngineSidecarCluster\(/,
    'FilmLab should not call catalog+sidecar cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    chromeLayoutAndCatalogEngineClusterSource,
    /useFilmLabChromeLayoutAndCropStraightenRefCluster/,
    'Chrome+catalog engine cluster should delegate to chrome layout + crop straighten ref cluster'
  );
  assert.match(
    chromeLayoutAndCatalogEngineClusterSource,
    /useFilmLabCatalogCropGeometryAndEngineSidecarCluster/,
    'Chrome+catalog engine cluster should delegate to catalog/crop geometry + engine sidecar cluster'
  );
  assert.match(
    chromeLayoutCropStraightenRefClusterSource,
    /useFilmLabChromeLayout/,
    'Chrome layout + crop straighten ref cluster should delegate to useFilmLabChromeLayout'
  );
  assert.match(
    chromeLayoutCropStraightenRefClusterSource,
    /useFilmLabCropStraightenLiveRefs/,
    'Chrome layout + crop straighten ref cluster should delegate to useFilmLabCropStraightenLiveRefs'
  );
  assert.match(
    catalogCropGeometryEngineSidecarClusterSource,
    /useFilmLabCatalogEngineCropGeometryCluster/,
    'Catalog+sidecar cluster should delegate to catalog/engine/crop geometry cluster hook'
  );
  assert.match(
    catalogCropGeometryEngineSidecarClusterSource,
    /useFilmLabEngineSidecar/,
    'Catalog+sidecar cluster should delegate to engine sidecar hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCatalogEngineCropGeometryCluster\(/,
    'FilmLab should not call catalog/engine/crop geometry cluster hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabEngineSidecar\(/,
    'FilmLab should not call engine sidecar hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(catalogEngineCropGeometryClusterSource, /useFilmLabFilmCatalog/, 'Catalog/engine/crop cluster should wire film catalog hook');
  assert.match(catalogEngineCropGeometryClusterSource, /useFilmLabEngineAdjustments/, 'Catalog/engine/crop cluster should wire engine adjustments hook');
  assert.match(catalogEngineCropGeometryClusterSource, /useFilmLabCropDerivedGeometry/, 'Catalog/engine/crop cluster should wire crop derived geometry hook');
  assert.match(filmCatalogSource, /getDisplayFilm/, 'Film catalog should resolve display films');
  assert.match(engineAdjustmentsSource, /cropBypass/, 'Engine adjustments should preserve crop bypass flag');
  assert.match(
    canvasViewportIdentityOverlayClusterSource,
    /useFilmLabImageIdentityKey/,
    'Viewport identity+overlay cluster should delegate to image identity key hook'
  );
  assert.match(
    canvasViewportIdentityOverlayClusterSource,
    /useFilmLabCanvasViewport/,
    'Viewport identity+overlay cluster should delegate to canvas viewport hook'
  );
  assert.match(
    canvasViewportIdentityOverlayClusterSource,
    /useFilmLabCropOverlayInteractionFlags/,
    'Viewport identity+overlay cluster should delegate to crop overlay interaction flags hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabImageIdentityKey\(/,
    'FilmLab should not call image identity key hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCanvasViewport\(/,
    'FilmLab should not call canvas viewport hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCropOverlayInteractionFlags\(/,
    'FilmLab should not call crop overlay flags hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(imageIdentityKeySource, /buildImageIdentityKey/, 'Image identity hook should build stable source key');
  assert.match(
    filmViewCropDragStraightenAndPanelClusterSource,
    /useFilmLabFilmViewCropRectApplyAndDragLayoutCluster/,
    'Film view+straighten mega cluster should delegate to film view + crop drag/layout cluster'
  );
  assert.match(
    filmViewCropDragStraightenAndPanelClusterSource,
    /useFilmLabStraightenDragOutsideCropAndPanelNavigationCluster/,
    'Film view+straighten mega cluster should delegate to straighten + panel navigation cluster'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabFilmViewCropRectApplyAndDragLayoutCluster\(/,
    'FilmLab should not call film view + crop drag/layout cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabStraightenDragOutsideCropAndPanelNavigationCluster\(/,
    'FilmLab should not call straighten + panel cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    straightenDragOutsideCropAndPanelNavigationClusterSource,
    /useFilmLabStraightenDragAndOutsideCropResetCluster/,
    'Straighten+panel cluster should delegate to straighten drag + outside-crop cluster'
  );
  assert.match(
    straightenDragOutsideCropAndPanelNavigationClusterSource,
    /useFilmLabPanelNavigation/,
    'Straighten+panel cluster should delegate to panel navigation hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabStraightenDragAndOutsideCropResetCluster\(/,
    'FilmLab should not call straighten outside-crop cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabPanelNavigation\(/,
    'FilmLab should not call panel navigation hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(panelNavigationSource, /useLastNonCropPanelRef/, 'Panel navigation should track last non-crop panel');
  assert.match(panelNavigationSource, /handlePanelTabChange/, 'Panel navigation should expose tab change handler');
  assert.match(
    filmViewCropRectApplyAndDragLayoutClusterSource,
    /useFilmLabFilmViewAndCropRectApplyCluster/,
    'Film view + drag/layout cluster should delegate to film view + crop rect apply cluster hook'
  );
  assert.match(
    filmViewCropRectApplyAndDragLayoutClusterSource,
    /useFilmLabCropDragAndLayoutEffectsCluster/,
    'Film view + drag/layout cluster should delegate to crop drag + layout effects cluster hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabFilmViewAndCropRectApplyCluster\(/,
    'FilmLab should not call film view + crop rect apply cluster hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCropDragAndLayoutEffectsCluster\(/,
    'FilmLab should not call crop drag + layout effects cluster hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    cropDragLayoutEffectsClusterSource,
    /useFilmLabCropDrag/,
    'Crop drag + layout effects cluster should delegate to useFilmLabCropDrag'
  );
  assert.match(
    cropDragLayoutEffectsClusterSource,
    /useFilmLabCropLayoutEffects/,
    'Crop drag + layout effects cluster should delegate to useFilmLabCropLayoutEffects'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCropDrag\(/,
    'FilmLab should not call crop drag hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCropLayoutEffects\(/,
    'FilmLab should not call crop layout effects hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(cropLayoutEffectsSource, /useResetCropLiveOnStraightenOrLeaveCrop/, 'Crop layout effects should reset live crop on straighten/leave');
  assert.match(cropLayoutEffectsSource, /useClearCropGeometryKeyOutsideCrop/, 'Crop layout effects should clear geometry key outside crop');
  assert.match(cropLayoutEffectsSource, /useFilmLabCropAspectLayoutSync/, 'Crop layout effects should sync aspect layout');
  assert.match(cropLayoutEffectsSource, /useStopCropDragOnUnmount/, 'Crop layout effects should stop crop drag on unmount');
  assert.match(cropOverlayFlagsSource, /shouldRenderCropOverlay/, 'Crop overlay flags hook should expose render gate');
  assert.match(cropOverlayFlagsSource, /isOverlayInteractionEnabled/, 'Crop overlay flags hook should expose interaction gate');
  assert.match(chromeLayoutSource, /useFilmLabPreviewFullscreen/, 'Chrome layout should wire preview fullscreen hook');
  assert.match(chromeLayoutSource, /useChromeBoxInsets/, 'Chrome layout should wire chrome box insets hook');
  assert.match(chromeLayoutSource, /useCanvasStageSize/, 'Chrome layout should wire canvas stage size hook');
  assert.match(engineSidecarSource, /useFilmLabEngine\(/, 'Engine sidecar should run the film lab engine hook');
  assert.match(engineSidecarSource, /useFilmLabMetadataItems/, 'Engine sidecar should wire metadata items hook');
  assert.match(engineSidecarSource, /useFilmLabMetadataClipboard/, 'Engine sidecar should wire metadata clipboard hook');
  assert.match(engineSidecarSource, /useFilmLabExportDebugReport/, 'Engine sidecar should wire export debug report hook');
  assert.match(
    engineSidecarSource,
    /renderDebugInfo,\s*\n\s*runtimeStatusBadge,/,
    'Engine sidecar should pass runtimeStatusBadge into export debug report',
  );
  assert.match(captureUploadRestoreClusterSource, /useFilmLabCaptureCurrentSnapshot/, 'Capture/upload cluster should wire capture snapshot hook');
  assert.match(captureUploadRestoreClusterSource, /useFilmLabUploadedSourceRestore/, 'Capture/upload cluster should wire uploaded source restore hook');
  assert.match(autoDevelopColorGradeClusterSource, /useFilmLabColorGradeLiveUpdates/, 'Auto/color cluster should wire color grade live updates hook');
  assert.match(autoDevelopColorGradeClusterSource, /useFilmLabAutoDevelopActions/, 'Auto/color cluster should wire auto develop actions hook');
  assert.match(clipboardSessionClusterSource, /useFilmLabEditClipboard/, 'Clipboard/session cluster should wire edit clipboard hook');
  assert.match(clipboardSessionClusterSource, /useFilmLabClipboardShortcuts/, 'Clipboard/session cluster should wire clipboard shortcuts hook');
  assert.match(clipboardSessionClusterSource, /useFilmLabSessionPersistence/, 'Clipboard/session cluster should wire session persistence hook');
  assert.match(sessionPersistenceSource, /useFilmLabSessionPersistenceBundle/, 'Session persistence should delegate to bundle hook');
  assert.match(sessionPersistenceSource, /useFilmLabSessionPersistenceEffects/, 'Session persistence should delegate to effects hook');
  assert.doesNotMatch(
    source,
    /useFilmLabCropStraightenLiveRefs/,
    'FilmLab should not call crop/straighten live ref sync hook directly (use cluster)'
  );
  assert.match(cropStraightenLiveRefsSource, /useClearRefWhenNullish/, 'Crop/straighten live refs should clear crop ref when nullish');
  assert.match(cropStraightenLiveRefsSource, /useSyncStateToRef/, 'Crop/straighten live refs should mirror straighten guide to ref');
  assert.doesNotMatch(
    source,
    /useFilmLabViewportRefsPreviewSourceSprocketCluster\(/,
    'FilmLab should not call viewport refs + preview/sprocket cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    viewportRefsPreviewSourceSprocketClusterSource,
    /useFilmLabViewportStateRefs/,
    'Viewport refs cluster should delegate to viewport state refs hook'
  );
  assert.match(
    viewportRefsPreviewSourceSprocketClusterSource,
    /useFilmLabPreviewAndSourceEffects/,
    'Viewport refs cluster should delegate to preview and source effects hook'
  );
  assert.match(
    viewportRefsPreviewSourceSprocketClusterSource,
    /useClearRawSprocketFrame/,
    'Viewport refs cluster should delegate to clear raw sprocket frame hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabViewportStateRefs\(/,
    'FilmLab should not call viewport state refs hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabPreviewAndSourceEffects\(/,
    'FilmLab should not call preview and source effects hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useClearRawSprocketFrame\(/,
    'FilmLab should not call clear raw sprocket frame hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(viewportStateRefsSource, /useSyncStateToRef/, 'Viewport state refs should mirror zoom and pan to refs');
  assert.match(
    workbenchStateAndRefsSliderDragActivationClusterSource,
    /useFilmLabWorkbenchStateAndRawPipelineCluster/,
    'Workbench state+refs cluster should delegate to workbench state + raw pipeline cluster'
  );
  assert.match(
    workbenchStateAndRefsSliderDragActivationClusterSource,
    /useFilmLabWorkbenchRefsAndSliderDragActivationCluster/,
    'Workbench state+refs cluster should delegate to workbench refs + slider drag cluster'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabWorkbenchStateAndRawPipelineCluster\(/,
    'FilmLab should not call workbench state + raw pipeline cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabWorkbenchRefsAndSliderDragActivationCluster\(/,
    'FilmLab should not call workbench refs + slider drag cluster directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    workbenchRefsSliderDragClusterSource,
    /useFilmLabWorkbenchRefs/,
    'Workbench refs cluster should delegate to workbench refs hook'
  );
  assert.match(
    workbenchRefsSliderDragClusterSource,
    /useFilmLabSliderDragActivation/,
    'Workbench refs cluster should delegate to slider drag activation hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabWorkbenchRefs\(/,
    'FilmLab should not call workbench refs hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabSliderDragActivation\(/,
    'FilmLab should not call slider drag activation hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(workbenchRefsSource, /fileInputRef/, 'Workbench refs should expose file input ref');
  assert.match(workbenchRefsSource, /straightenDragStateRef/, 'Workbench refs should expose straighten drag state ref');
  assert.match(
    straightenDragOutsideCropClusterSource,
    /useFilmLabStraightenDrag/,
    'Straighten cluster should delegate to useFilmLabStraightenDrag'
  );
  assert.match(
    straightenDragOutsideCropClusterSource,
    /useFilmLabStraightenOutsideCropReset/,
    'Straighten cluster should delegate to useFilmLabStraightenOutsideCropReset'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabStraightenDrag\(/,
    'FilmLab should not call straighten drag hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabStraightenOutsideCropReset\(/,
    'FilmLab should not call straighten outside-crop reset hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(straightenOutsideCropResetSource, /useResetStraightenOutsideCrop/, 'Straighten outside-crop reset should delegate to reset hook');
  assert.doesNotMatch(source, /useResetStraightenOutsideCrop\(/, 'FilmLab should not call straighten reset hook directly');
  assert.match(
    workbenchStateRawPipelineClusterSource,
    /useFilmLabWorkbenchState/,
    'Workbench state cluster should delegate to workbench state hook'
  );
  assert.match(
    workbenchStateRawPipelineClusterSource,
    /useFilmLabRawPipelinePreferences/,
    'Workbench state cluster should delegate to raw pipeline preferences hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabWorkbenchState\(/,
    'FilmLab should not call workbench state hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabRawPipelinePreferences\(/,
    'FilmLab should not call raw pipeline preferences hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(workbenchStateSource, /resolveInitialPanelFromLocation/, 'Workbench state should resolve initial panel from location');
  assert.match(workbenchStateSource, /useDevicePixelRatio/, 'Workbench state should wire device pixel ratio hook');
  assert.match(curveWorkbenchShellOverlayClusterSource, /useFilmLabCurveAndSliderWorkbench/, 'Curve/overlay cluster should wire curve and slider workbench hook');
  assert.match(curveWorkbenchShellOverlayClusterSource, /useFilmLabShellOverlayProps/, 'Curve/overlay cluster should wire shell overlay props hook');
  assert.match(
    captureUploadUndoWorkbenchClipboardClusterSource,
    /useFilmLabCaptureUploadAndUndoSliderAutoDevelopCluster/,
    'Capture+clipboard mega cluster should delegate to capture+undo workbench cluster hook'
  );
  assert.match(
    captureUploadUndoWorkbenchClipboardClusterSource,
    /useFilmLabClipboardSessionCluster/,
    'Capture+clipboard mega cluster should delegate to clipboard and session cluster hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCaptureUploadAndUndoSliderAutoDevelopCluster\(/,
    'FilmLab should not call capture+undo workbench cluster hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabClipboardSessionCluster\(/,
    'FilmLab should not call clipboard and session cluster hook directly (wire useFilmLabFilmLabPro in Film Lab entry)'
  );
  assert.match(
    captureUploadUndoSliderAutoDevelopClusterSource,
    /useFilmLabCaptureAndUploadRestoreCluster/,
    'Capture+undo workbench cluster should delegate to capture and upload-restore cluster hook'
  );
  assert.match(
    captureUploadUndoSliderAutoDevelopClusterSource,
    /useFilmLabUndoSliderWorkbenchAutoDevelopCluster/,
    'Capture+undo workbench cluster should delegate to undo/slider/workbench/auto-develop cluster hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCaptureAndUploadRestoreCluster\(/,
    'FilmLab should not call capture and upload-restore cluster hook directly (use mega cluster)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabUndoSliderWorkbenchAutoDevelopCluster\(/,
    'FilmLab should not call undo/slider/workbench/auto-develop cluster hook directly (use mega cluster)'
  );
  assert.match(
    undoSliderWorkbenchAutoDevelopClusterSource,
    /useFilmLabUndoHistorySliderWorkbenchCluster/,
    'Undo/slider/workbench/auto-develop cluster should delegate to undo/slider/workbench cluster hook'
  );
  assert.match(
    undoSliderWorkbenchAutoDevelopClusterSource,
    /useFilmLabAutoDevelopAndColorGradeCluster/,
    'Undo/slider/workbench/auto-develop cluster should delegate to auto develop and color grade cluster hook'
  );
  assert.match(
    undoHistorySliderWorkbenchClusterSource,
    /useFilmLabUndoHistoryCluster/,
    'Undo/slider/workbench cluster should delegate to undo history cluster hook'
  );
  assert.match(
    undoHistorySliderWorkbenchClusterSource,
    /useFilmLabSliderWorkbench/,
    'Undo/slider/workbench cluster should delegate to slider workbench hook'
  );
  assert.match(
    undoHistorySliderWorkbenchClusterSource,
    /useFilmLabWorkbenchUndoAwareActions/,
    'Undo/slider/workbench cluster should delegate to workbench undo-aware actions hook'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabUndoHistoryCluster\(/,
    'FilmLab should not call undo history cluster hook directly (use mega cluster)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabSliderWorkbench\(/,
    'FilmLab should not call slider workbench hook directly (use mega cluster)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabWorkbenchUndoAwareActions\(/,
    'FilmLab should not call workbench undo-aware actions hook directly (use mega cluster)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabUndoHistorySliderWorkbenchCluster\(/,
    'FilmLab should not call undo/slider/workbench cluster hook directly (use mega cluster)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabAutoDevelopAndColorGradeCluster\(/,
    'FilmLab should not call auto develop and color grade cluster hook directly (use mega cluster)'
  );
  assert.match(undoHistoryClusterSource, /useFilmLabUndoRedo/, 'Undo/history cluster should wire undo/redo hook');
  assert.match(undoHistoryClusterSource, /useFilmLabFullHistoryTimeline/, 'Undo/history cluster should wire full history timeline hook');
  assert.match(
    filmViewCropRectApplyClusterSource,
    /useFilmLabFilmViewAndCropHandlers/,
    'Film view + crop rect apply cluster should delegate to useFilmLabFilmViewAndCropHandlers'
  );
  assert.match(
    filmViewCropRectApplyClusterSource,
    /useFilmLabCropRectApplyAndPending/,
    'Film view + crop rect apply cluster should delegate to useFilmLabCropRectApplyAndPending'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabFilmViewAndCropHandlers/,
    'FilmLab should not call film view and crop handlers hook directly (use cluster)'
  );
  assert.doesNotMatch(
    source,
    /useFilmLabCropRectApplyAndPending/,
    'FilmLab should not call crop rect apply and pending hook directly (use cluster)'
  );
  assert.match(filmLabShellContainerSource, /FilmLabShell/, 'Shell container should render FilmLabShell');
  assert.match(
    `${source}\n${toolbarSource}`,
    /Panel metadanych/,
    'FilmLab UI should expose metadata panel toggle button'
  );
  const filmLabMetadataLabels = `${source}\n${metadataItemsHookSource}`;
  assert.match(filmLabMetadataLabels, /Data zdjęcia/, 'FilmLab metadata should include EXIF date label');
  assert.match(filmLabMetadataLabels, /Aparat/, 'FilmLab metadata should include camera label');
  assert.match(filmLabMetadataLabels, /Przysłona/, 'FilmLab metadata should include aperture label');
  assert.match(
    imageSourceEffectsSource,
    /parseExifMetadataFromFile\(/,
    'Film Lab image source path should use unified metadata parser for uploaded files'
  );
  assert.match(previewAndSourceEffectsSource, /useFilmLabPreviewCanvasEffects/, 'Preview/source bundle should wire preview canvas effects');
  assert.match(previewAndSourceEffectsSource, /useFilmLabImageSourceEffects/, 'Preview/source bundle should wire image source effects');
  assert.doesNotMatch(
    source,
    /isLikelyJpeg/,
    'FilmLab metadata parsing should not be limited to JPEG only'
  );
  assert.match(
    filmLabWorkbenchBundle,
    /METADATA_VIEW_MODES/,
    'FilmLab should define metadata view modes'
  );
  assert.match(
    `${source}\n${metadataPanelSource}`,
    /Tryb:\s*\{metadataViewModeLabels/,
    'FilmLab should render metadata mode label in UI'
  );
  assert.match(
    filmLabProStateBundle,
    /metadataViewMode/,
    'FilmLab should keep metadata view mode toggle state'
  );
  assert.match(
    filmLabWorkbenchBundle,
    /Kompakt/,
    'FilmLab should expose compact metadata mode toggle'
  );
  assert.match(
    `${source}\n${exportDebugReportHookSource}`,
    /rawBackendComparison/,
    'Debug JSON export should include raw backend comparison block'
  );
  assert.match(
    `${source}\n${exportDebugReportHookSource}`,
    /mindfullens\.render-debug\.v3/,
    'Debug JSON export schema should be bumped to v3 after RAW QA additions'
  );
  assert.match(
    renderDebugBundle,
    /RAW A\/B/,
    'Render debug panel should expose RAW A/B summary block'
  );
  assert.match(
    renderDebugBundle,
    /RAW QA/,
    'Render debug panel should expose RAW QA summary block'
  );
  assert.match(
    `${source}\n${exportDebugReportHookSource}`,
    /qualityQa/,
    'Debug JSON export should include RAW QA diagnostics block'
  );
  assert.match(
    `${source}\n${exportDebugReportHookSource}`,
    /rawColorimetry/,
    'Debug JSON export should include pipeline.rawColorimetry (RAW DCP/ICC diagnostics)'
  );
  assert.match(
    `${source}\n${exportDebugReportHookSource}`,
    /mindfullens\.raw-colorimetry\.v1/,
    'RAW colorimetry export should declare mindfullens.raw-colorimetry.v1 schema'
  );
  assert.match(
    renderDebugBundle,
    /Diff mean ΔL/,
    'Render debug panel should expose RAW A/B diff heatmap diagnostics'
  );
  assert.match(
    renderDebugBundle,
    /FORCE WINNER/,
    'Render debug panel should expose force winner backend action'
  );
  assert.match(
    filmLabProStateBundle,
    /rawBackendMode/,
    'FilmLab should keep raw backend override mode state'
  );
  assert.match(
    filmLabProStateBundle,
    /rawBackendPreference/,
    'FilmLab should pass raw backend preference into debug/export and engine'
  );
  assert.match(
    filmLabProStateBundle,
    /rawLinearStageMode/,
    'FilmLab should keep RAW linear stage override mode state'
  );
  assert.match(
    filmLabProStateBundle,
    /rawLinearStageOverride/,
    'FilmLab should pass RAW linear stage override into debug/export and engine'
  );
  assert.match(
    renderDebugBundle,
    /LINEAR AUTO|LINEAR ON|LINEAR OFF/,
    'Render debug panel should expose RAW linear stage override controls'
  );
  assert.match(
    renderDebugBundle,
    /Shift\+\$\{SHORTCUT_KEYS\.rawLinearStage\}/,
    'Render debug panel should expose Shift+L hint for RAW linear stage cycle'
  );
  assert.doesNotMatch(
    source,
    /zoom > 1\.001 \? 'cover' : previewFitMode/,
    'Zoom should not switch fit mode dynamically (breaks cursor anchoring)'
  );
  assert.match(
    toolbarBundle,
    /title=\{`Przed\/Po \(\$\{SHORTCUT_KEYS\.compare\.primary\} lub \$\{SHORTCUT_KEYS\.compare\.fallback\}\)`\}/,
    'Toolbar tooltip should include compare shortcut mapping'
  );
  assert.match(
    toolbarBundle,
    /title=\{`Widok pełny \(\$\{SHORTCUT_KEYS\.full\}\)`\}/,
    'Toolbar tooltip should include full mode shortcut'
  );
  assert.match(
    toolbarBundle,
    /title=\{`Podgląd clippingu świateł\/cieni \(\$\{SHORTCUT_KEYS\.clipping\}\)`\}/,
    'Toolbar tooltip should include clipping shortcut'
  );

  formatOk('Keyboard shortcut guard keeps mapping (F, \\, J, 0, +, -)');
}

function runInteractiveEffectsGuard() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const scriptsDirectory = path.dirname(currentFilePath);
  const enginePath = path.resolve(scriptsDirectory, '../src/engine/useFilmLabEngine.js');
  const source = fs.readFileSync(enginePath, 'utf8');

  assert.match(
    source,
    /PRESERVE_FULL_EFFECT_STACK_DURING_ADJUST\s*=\s*true/,
    'Engine should enforce full effect stack preservation while adjusting'
  );
  assert.match(
    source,
    /hasDeferredPreviewEffects\(film,\s*adjustments\)/,
    'Fast preview path should gate on deferred effects'
  );
  assert.match(
    source,
    /!isInteractivePreview\s*\|\|\s*PRESERVE_FULL_EFFECT_STACK_DURING_ADJUST/,
    'Preview effect block should remain active while adjusting'
  );

  formatOk('Interactive effects guard keeps full effect stack during slider drag');
}

function runRawBackendAbGuard() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const scriptsDirectory = path.dirname(currentFilePath);
  const rawWorkerPath = path.resolve(
    scriptsDirectory,
    '../src/engine/pipeline/raw/rawDecode.worker.js'
  );
  const source = fs.readFileSync(rawWorkerPath, 'utf8');

  assert.match(
    source,
    /computeDecodeQualityScore\(/,
    'RAW worker should compute decode quality score for backend A/B profiling'
  );
  assert.match(
    source,
    /backendAbTest/,
    'RAW worker should expose backend A/B diagnostics in payload'
  );
  assert.match(
    source,
    /AB_SCORE_SWITCH_THRESHOLD/,
    'RAW worker should define switch threshold for backend quality decisions'
  );
  assert.match(
    source,
    /quality-score|quality-tie-break|suspected-black-frame/,
    'RAW worker should keep explicit A/B decision reasons'
  );
  assert.match(
    source,
    /decodeRawWithConfiguredAdapter/,
    'RAW worker should route decode through rawDecodeAdapter (Etap 2A)'
  );
  assert.match(
    source,
    /withRawDecodeAdapterTelemetry/,
    'RAW worker should tag probe/capabilities with rawDecodeAdapter'
  );
  assert.match(
    source,
    /finalizeProbeCapabilities/,
    'RAW worker should finalize probe when libraw-wasm adapter is active'
  );
  assert.match(
    source,
    /rawDecodeInlineWasm/,
    'RAW worker should flag inline WASM probe metadata'
  );

  const adapterPath = path.resolve(scriptsDirectory, '../src/engine/pipeline/raw/rawDecodeAdapter.js');
  const adapterSource = fs.readFileSync(adapterPath, 'utf8');
  assert.match(
    adapterSource,
    /getRawDecodeAdapterIdFromEnv/,
    'rawDecodeAdapter: env-driven adapter id'
  );
  assert.match(
    adapterSource,
    /decodeRawWithLibrawWasm/,
    'rawDecodeAdapter: delegates libraw-wasm to rawDecodeLibrawWasm'
  );

  const librawWasmPath = path.resolve(scriptsDirectory, '../src/engine/pipeline/raw/rawDecodeLibrawWasm.js');
  const librawWasmSource = fs.readFileSync(librawWasmPath, 'utf8');
  assert.match(
    librawWasmSource,
    /RAW_LIBRAW_DECODE_FAILED/,
    'rawDecodeLibrawWasm: structured failure code for LibRaw errors'
  );
  assert.match(
    librawWasmSource,
    /encodeRgb8ToPngBuffer/,
    'rawDecodeLibrawWasm: RGB buffer to PNG for ingest pipeline'
  );
  assert.match(
    librawWasmSource,
    /pickLibrawMetadataSummary/,
    'rawDecodeLibrawWasm: metadata summary for panel/DIAG'
  );

  formatOk('RAW backend A/B guard (quality scoring + winner diagnostics)');
}

function runRawColorPipelineGuards() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const scriptsDirectory = path.dirname(currentFilePath);
  const rawWorkerPath = path.resolve(
    scriptsDirectory,
    '../src/engine/pipeline/raw/rawDecode.worker.js'
  );
  const ingestPath = path.resolve(scriptsDirectory, '../src/engine/pipeline/ingestSource.js');
  const enginePath = path.resolve(scriptsDirectory, '../src/engine/useFilmLabEngine.js');
  const filmLabSourcePath = path.resolve(scriptsDirectory, '../src/FilmLabPro.jsx');
  const metadataItemsHookPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabMetadataItems.js');
  const viteConfigPath = path.resolve(scriptsDirectory, '../vite.config.js');
  const phpBridgeLibPath = path.resolve(scriptsDirectory, '../public/raw/raw_bridge_lib.php');
  const phpDecodePath = path.resolve(scriptsDirectory, '../public/raw/decode.php');

  const rawWorkerSource = fs.readFileSync(rawWorkerPath, 'utf8');
  const ingestSource = fs.readFileSync(ingestPath, 'utf8');
  const engineSource = fs.readFileSync(enginePath, 'utf8');
  const filmLabSource = fs.readFileSync(filmLabSourcePath, 'utf8');
  const metadataItemsHookSource = fs.readFileSync(metadataItemsHookPath, 'utf8');
  const viteConfigSource = fs.readFileSync(viteConfigPath, 'utf8');
  const phpBridgeLibSource = fs.readFileSync(phpBridgeLibPath, 'utf8');
  const phpDecodeSource = fs.readFileSync(phpDecodePath, 'utf8');

  assert.match(
    rawWorkerSource,
    /DEFAULT_RAW_COLOR_PIPELINE/,
    'RAW worker should define default RAW color pipeline metadata'
  );
  assert.match(
    rawWorkerSource,
    /x-raw-color-stage|x-raw-input-encoding|x-raw-output-encoding/,
    'RAW worker should parse bridge color pipeline headers'
  );
  assert.match(
    ingestSource,
    /Color pipeline:/,
    'RAW ingest status message should include color pipeline summary'
  );
  assert.match(
    ingestSource,
    /rawProbeSnapshot/,
    'RAW ingest should attach probe snapshot next to decode capabilities (DIAG)'
  );
  assert.match(
    engineSource,
    /rawLinearStageEnabled/,
    'Render engine should gate RAW linear stage with pipeline capability flag'
  );
  assert.match(
    engineSource,
    /rawLinearStageOverride/,
    'Render engine should support RAW linear stage runtime override'
  );
  assert.match(
    `${filmLabSource}\n${metadataItemsHookSource}`,
    /RAW Color Pipeline/,
    'FilmLab metadata panel should show RAW color pipeline row'
  );
  assert.match(
    metadataItemsHookSource,
    /label:\s*'LibRaw'/,
    'FilmLab metadata panel should include LibRaw metadata row'
  );
  assert.match(
    viteConfigSource,
    /RAW_COLOR_PIPELINE/,
    'Vite RAW bridge should define RAW color pipeline capabilities'
  );
  assert.match(
    viteConfigSource,
    /X-Raw-Color-Stage|X-Raw-Input-Encoding|X-Raw-Output-Encoding/,
    'Vite RAW decode endpoint should expose color pipeline headers'
  );
  assert.match(
    phpBridgeLibSource,
    /'colorPipeline'\s*=>/,
    'PHP RAW probe should expose RAW color pipeline capabilities'
  );
  assert.match(
    phpDecodeSource,
    /X-Raw-Color-Stage|X-Raw-Input-Encoding|X-Raw-Output-Encoding/,
    'PHP RAW decode endpoint should expose color pipeline headers'
  );

  formatOk('RAW color pipeline guards (linear->display metadata + stage gating)');
}

function runClipboardAndBatchGuards() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const scriptsDirectory = path.dirname(currentFilePath);
  const filmLabSourcePath = path.resolve(scriptsDirectory, '../src/FilmLabPro.jsx');
  const clipboardShortcutsPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabClipboardShortcuts.js');
  const toolbarPath = path.resolve(scriptsDirectory, '../src/FilmLabToolbar.jsx');
  const renderDebugPath = path.resolve(scriptsDirectory, '../src/FilmLabRenderDebugPanel.jsx');
  const batchProcessorPath = path.resolve(scriptsDirectory, '../src/engine/batchProcessor.js');
  const enginePath = path.resolve(scriptsDirectory, '../src/engine/useFilmLabEngine.js');
  const filmLabSource = fs.readFileSync(filmLabSourcePath, 'utf8');
  const clipboardShortcutsSource = fs.readFileSync(clipboardShortcutsPath, 'utf8');
  const filmLabClipboardBundle = `${filmLabSource}\n${clipboardShortcutsSource}`;
  const toolbarSource = fs.readFileSync(toolbarPath, 'utf8');
  const renderDebugSource = fs.readFileSync(renderDebugPath, 'utf8');
  const filmLabUiSource = `${filmLabSource}\n${toolbarSource}\n${renderDebugSource}`;
  const batchSource = fs.readFileSync(batchProcessorPath, 'utf8');
  const engineSource = fs.readFileSync(enginePath, 'utf8');

  assert.match(
    filmLabClipboardBundle,
    /handleCopyPasteShortcuts/,
    'Film Lab should register keyboard copy/paste shortcut handler'
  );
  assert.match(
    filmLabSource,
    /useFilmLabFilmLabPro/,
    'FilmLab should wire clipboard/session via useFilmLabFilmLabPro hook'
  );
  assert.match(
    filmLabClipboardBundle,
    /pressed\s*===\s*'c'/,
    'Film Lab should handle Cmd/Ctrl+C for settings copy'
  );
  assert.match(
    filmLabClipboardBundle,
    /pressed\s*===\s*'v'/,
    'Film Lab should handle Cmd/Ctrl+V for settings paste'
  );
  assert.match(
    filmLabUiSource,
    /htmlFor="batchFileInput"/,
    'Batch button should open native file picker via htmlFor'
  );
  assert.doesNotMatch(
    filmLabUiSource,
    /batchFileInputRef\.current\?\.click\(/,
    'Batch picker should not be triggered manually (avoids double open)'
  );

  assert.match(
    batchSource,
    /import\s+\{\s*ingestUploadSource\s*\}\s+from\s+'\.\/pipeline\/ingestSource\.js'/,
    'Batch processor should use shared ingest pipeline (RAW aware)'
  );
  assert.match(
    batchSource,
    /ingestUploadSource\(/,
    'Batch processor should call ingestUploadSource for file loading'
  );
  assert.match(
    batchSource,
    /rawBackendPreference\s*=\s*null/,
    'Batch processor should accept RAW backend override for ingest'
  );
  assert.match(
    batchSource,
    /renderIntent:\s*'full'[\s\S]*rawBackendPreference/,
    'Batch ingest should forward RAW backend preference'
  );
  assert.match(
    engineSource,
    /runBatch\(\{[\s\S]*rawBackendPreference/,
    'Batch runtime should pass RAW backend override from current Film-Lab mode'
  );
  assert.match(
    filmLabUiSource,
    /setRawBackendMode\('auto'\)/,
    'RAW A/B controls should allow return from forced backend to AUTO mode'
  );
  assert.match(
    filmLabUiSource,
    /setRawBackendMode\(rawBackendAbSummary\.winnerMode\)/,
    'RAW A/B controls should support FORCE WINNER transition'
  );
  assert.match(
    filmLabUiSource,
    /setRawLinearStageMode\('auto'\)/,
    'RAW linear stage controls should support return to AUTO mode'
  );
  assert.match(
    filmLabUiSource,
    /setRawLinearStageMode\('on'\)/,
    'RAW linear stage controls should support forced ON mode'
  );
  assert.match(
    filmLabUiSource,
    /setRawLinearStageMode\('off'\)/,
    'RAW linear stage controls should support forced OFF mode'
  );
  assert.match(
    filmLabUiSource,
    /RAW:\s*\{rawBackendModeLabel\}/,
    'Batch toolbar should display active RAW backend mode indicator'
  );
  assert.match(
    filmLabUiSource,
    /Backend RAW:\s*<strong>\{rawBackendModeLabel\}<\/strong>/,
    'Batch progress panel should display active RAW backend mode'
  );

  formatOk('Clipboard + batch guards (Cmd/Ctrl+C/V, single picker open, RAW ingest in batch)');
}

function runExifOrientationGuards() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const scriptsDirectory = path.dirname(currentFilePath);
  const metadataPath = path.resolve(scriptsDirectory, '../src/engine/metadata/exifMetadata.js');
  const filmLabSourcePath = path.resolve(scriptsDirectory, '../src/FilmLabPro.jsx');
  const cropDerivedGeometryPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabCropDerivedGeometry.js');
  const metadataItemsHookPath = path.resolve(scriptsDirectory, '../src/filmLab/useFilmLabMetadataItems.js');
  const cropAspectPath = path.resolve(scriptsDirectory, '../src/filmLab/crop/cropAspectResolve.js');
  const enginePath = path.resolve(scriptsDirectory, '../src/engine/useFilmLabEngine.js');
  const batchProcessorPath = path.resolve(scriptsDirectory, '../src/engine/batchProcessor.js');

  const metadataSource = fs.readFileSync(metadataPath, 'utf8');
  const cropAspectSource = fs.readFileSync(cropAspectPath, 'utf8');
  const filmLabSource = fs.readFileSync(filmLabSourcePath, 'utf8');
  const cropDerivedGeometrySource = fs.readFileSync(cropDerivedGeometryPath, 'utf8');
  const metadataItemsHookSource = fs.readFileSync(metadataItemsHookPath, 'utf8');
  const engineSource = fs.readFileSync(enginePath, 'utf8');
  const batchSource = fs.readFileSync(batchProcessorPath, 'utf8');

  assert.match(
    metadataSource,
    /export function mapExifOrientationToTransform\(/,
    'EXIF metadata module should expose orientation transform mapping'
  );
  assert.match(
    metadataSource,
    /orientationTransform/,
    'Parsed EXIF payload should include normalized orientation transform'
  );
  assert.match(
    metadataSource,
    /export function resolveFilmLabSourcePixelSize\(/,
    'EXIF module should expose unified source pixel size resolver for crop/preview'
  );
  assert.match(
    cropAspectSource,
    /resolveFilmLabSourcePixelSize/,
    'Crop aspect resolver should consume unified pixel size helper'
  );
  assert.match(
    `${filmLabSource}\n${cropDerivedGeometrySource}`,
    /crop\/cropAspectResolve\.js/,
    'FilmLab stack should import crop aspect helpers from filmLab/crop module'
  );
  assert.match(
    `${filmLabSource}\n${metadataItemsHookSource}`,
    /Korekcja EXIF/,
    'Metadata panel should display EXIF orientation correction row'
  );
  assert.match(
    engineSource,
    /zeroth\[piexif\.ImageIFD\.Orientation\]\s*=\s*1/,
    'Single export should normalize EXIF orientation to 1 after render transform'
  );
  assert.match(
    batchSource,
    /zeroth\[piexif\.ImageIFD\.Orientation\]\s*=\s*1/,
    'Batch export should normalize EXIF orientation to 1 after render transform'
  );

  formatOk('EXIF orientation guards (metadata transform + normalized export orientation)');
}

function runShortcutActionChecks() {
  const comparePrimary = resolveShortcutAction({
    key: SHORTCUT_KEYS.compare.primary,
    code: 'Backslash',
    hasImage: true,
  });
  assert.equal(comparePrimary?.type, 'toggleCompare');

  const compareIntl = resolveShortcutAction({ key: '|', code: 'IntlBackslash', hasImage: true });
  assert.equal(compareIntl?.type, 'toggleCompare');

  const compareFallback = resolveShortcutAction({
    key: SHORTCUT_KEYS.compare.fallback,
    code: 'KeyY',
    hasImage: true,
  });
  assert.equal(compareFallback?.type, 'toggleCompare');
  const compareWithoutImage = resolveShortcutAction({
    key: SHORTCUT_KEYS.compare.primary,
    code: 'Backslash',
    hasImage: false,
  });
  assert.equal(compareWithoutImage, null, 'Compare shortcut should not toggle when no image is loaded');

  const full = resolveShortcutAction({ key: SHORTCUT_KEYS.full, code: 'KeyF' });
  assert.equal(full?.type, 'toggleFull');

  const fullWithModifier = resolveShortcutAction({
    key: SHORTCUT_KEYS.full,
    code: 'KeyF',
    metaKey: true,
  });
  assert.equal(fullWithModifier, null);

  const clipping = resolveShortcutAction({ key: SHORTCUT_KEYS.clipping, code: 'KeyJ' });
  assert.equal(clipping?.type, 'toggleClipping');

  const fit = resolveShortcutAction({ key: SHORTCUT_KEYS.fit, code: 'Digit0' });
  assert.equal(fit?.type, 'fitZoom');

  const metadata = resolveShortcutAction({ key: SHORTCUT_KEYS.metadata, code: 'KeyI' });
  assert.equal(metadata?.type, 'toggleMetadataPanel');

  const metadataMode = resolveShortcutAction({ key: SHORTCUT_KEYS.metadataMode, code: 'KeyM' });
  assert.equal(metadataMode?.type, 'cycleMetadataMode');

  const rawLinearStage = resolveShortcutAction({
    key: SHORTCUT_KEYS.rawLinearStage,
    code: 'KeyL',
    shiftKey: true,
  });
  assert.equal(rawLinearStage?.type, 'cycleRawLinearStage');
  const rawLinearStageWithModifier = resolveShortcutAction({
    key: SHORTCUT_KEYS.rawLinearStage,
    code: 'KeyL',
    shiftKey: true,
    metaKey: true,
  });
  assert.equal(rawLinearStageWithModifier, null);

  const help = resolveShortcutAction({ key: '?', code: 'Slash', shiftKey: true });
  assert.equal(help?.type, 'toggleShortcutHelp');

  const zoomIn = resolveShortcutAction({ key: SHORTCUT_KEYS.zoomIn, code: 'Equal' });
  assert.equal(zoomIn?.type, 'zoomIn');

  const zoomOut = resolveShortcutAction({ key: SHORTCUT_KEYS.zoomOut, code: 'Minus' });
  assert.equal(zoomOut?.type, 'zoomOut');

  const panLeft = resolveShortcutAction({
    key: 'ArrowLeft',
    code: 'ArrowLeft',
    hasImage: true,
    zoom: 2,
    panKeyStep: 40,
  });
  assert.equal(panLeft?.type, 'pan');
  assert.equal(panLeft?.dx, 40);
  assert.equal(panLeft?.dy, 0);

  const panFast = resolveShortcutAction({
    key: 'ArrowUp',
    code: 'ArrowUp',
    hasImage: true,
    zoom: 2,
    panKeyStep: 40,
    shiftKey: true,
  });
  assert.equal(panFast?.type, 'pan');
  assert.equal(panFast?.dx, 0);
  assert.equal(panFast?.dy, 80);

  const noPanWhenFit = resolveShortcutAction({
    key: 'ArrowUp',
    code: 'ArrowUp',
    hasImage: true,
    zoom: 1,
    panKeyStep: 40,
  });
  assert.equal(noPanWhenFit, null);

  const exitFull = resolveShortcutAction({
    key: 'Escape',
    code: 'Escape',
    isPreviewFullMode: true,
  });
  assert.equal(exitFull?.type, 'exitFull');

  const dust = resolveShortcutAction({ key: 'd', code: 'KeyD' });
  assert.equal(dust?.type, 'triggerDustZip');

  const leak = resolveShortcutAction({ key: 'l', code: 'KeyL' });
  assert.equal(leak?.type, 'triggerRawLeakZip');

  formatOk('Shortcut action checks (compare/full/clipping/fit/zoom/pan/effects)');
}

function runPreviewGeometryChecks() {
  const viewport = { width: 920, height: 660 };

  const landscapeContain = resolveFittedSizeForAspect(viewport.width, viewport.height, 3 / 2, 'contain');
  assert.ok(landscapeContain.width <= viewport.width + 0.01, 'Landscape contain should fit viewport width');
  assert.ok(landscapeContain.height <= viewport.height + 0.01, 'Landscape contain should fit viewport height');

  const portraitContain = resolveFittedSizeForAspect(viewport.width, viewport.height, 2 / 3, 'contain');
  assert.ok(portraitContain.height <= viewport.height + 0.01, 'Portrait contain should fit viewport height');
  assert.ok(portraitContain.width <= viewport.width + 0.01, 'Portrait contain should fit viewport width');

  const landscapeCover = resolveFittedSizeForAspect(viewport.width, viewport.height, 3 / 2, 'cover');
  assert.ok(landscapeCover.width >= viewport.width - 0.01, 'Landscape cover should span viewport width');
  assert.ok(landscapeCover.height >= viewport.height - 0.01, 'Landscape cover should span viewport height');

  const clamped = clampPanToBoundsForSize(
    { x: 1200, y: -1200 },
    viewport.width,
    viewport.height,
    landscapeContain.width,
    landscapeContain.height,
    2.8
  );
  assert.ok(Number.isFinite(clamped.x) && Number.isFinite(clamped.y), 'Pan clamp should return finite values');
  assert.ok(Math.abs(clamped.x) < 1000 && Math.abs(clamped.y) < 1000, 'Pan clamp should bound extreme values');

  const zoomResult = applyAnchoredZoom({
    currentZoom: 1,
    targetZoom: 2.8,
    anchorClient: { x: 640, y: 340 },
    centerClient: { x: 460, y: 330 },
    currentPan: { x: 0, y: 0 },
    clampPan: (candidatePan, targetZoom) =>
      clampPanToBoundsForSize(
        candidatePan,
        viewport.width,
        viewport.height,
        landscapeContain.width,
        landscapeContain.height,
        targetZoom
      ),
  });
  assert.ok(zoomResult.zoom > 1, 'Anchored zoom should increase zoom');
  assert.ok(Math.abs(zoomResult.pan.x) > 0 || Math.abs(zoomResult.pan.y) > 0, 'Anchored zoom should adjust pan');

  const resetPan = clampPanToBoundsForSize(
    { x: 200, y: 200 },
    viewport.width,
    viewport.height,
    landscapeContain.width,
    landscapeContain.height,
    1
  );
  const maxLetterboxPanY =
    viewport.height / 2 - landscapeContain.height / 2;
  assert.ok(Math.abs(resetPan.x) < 1e-9, 'Horizontal pan should pin when image spans viewport width');
  assert.ok(
    Math.abs(resetPan.y - maxLetterboxPanY) < 1e-9,
    'At fit zoom, vertical pan clamps to letterbox range (not always zero)'
  );

  const portraitAtLowZoom = clampPanToBoundsForSize(
    { x: 120, y: -120 },
    viewport.width,
    viewport.height,
    portraitContain.width,
    portraitContain.height,
    1.12
  );
  assert.ok(
    Math.abs(portraitAtLowZoom.x) > 0 || Math.abs(portraitAtLowZoom.y) > 0,
    'Pan should stay available at low zoom when image is still smaller than viewport'
  );

  formatOk('Preview geometry checks (contain/cover, pan clamp, anchored zoom)');
}

function roundGeometry(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round(numeric * 1000) / 1000;
}

function runPreviewGeometryScenarioSnapshots() {
  const viewport = { width: 920, height: 660 };

  const landscape100 = resolveFittedSizeForAspect(
    viewport.width,
    viewport.height,
    3 / 2,
    'contain'
  );
  const portrait100 = resolveFittedSizeForAspect(
    viewport.width,
    viewport.height,
    2 / 3,
    'contain'
  );

  const landscape280Pan = clampPanToBoundsForSize(
    { x: 1500, y: -900 },
    viewport.width,
    viewport.height,
    landscape100.width,
    landscape100.height,
    2.8
  );
  const portrait280Pan = clampPanToBoundsForSize(
    { x: 1500, y: -900 },
    viewport.width,
    viewport.height,
    portrait100.width,
    portrait100.height,
    2.8
  );

  const snapshot = {
    landscape100: {
      width: roundGeometry(landscape100.width),
      height: roundGeometry(landscape100.height),
    },
    portrait100: {
      width: roundGeometry(portrait100.width),
      height: roundGeometry(portrait100.height),
    },
    landscape280Pan: {
      x: roundGeometry(landscape280Pan.x),
      y: roundGeometry(landscape280Pan.y),
    },
    portrait280Pan: {
      x: roundGeometry(portrait280Pan.x),
      y: roundGeometry(portrait280Pan.y),
    },
  };

  const expectedSnapshot = {
    landscape100: { width: 920, height: 613.333 },
    portrait100: { width: 440, height: 660 },
    landscape280Pan: { x: 828, y: -528.667 },
    portrait280Pan: { x: 156, y: -594 },
  };

  assert.deepEqual(
    snapshot,
    expectedSnapshot,
    'Preview geometry snapshot drift detected for sprint baseline scenarios'
  );
  formatOk('Preview geometry snapshots (landscape/portrait at 100% and 280% + pan)');
}

function runPreviewE2EFlowScenario() {
  const state = {
    compareMode: false,
    clipping: false,
    isPreviewFullMode: false,
  };

  const applyAction = (action) => {
    if (!action) {
      return;
    }
    if (action.type === 'toggleCompare') {
      state.compareMode = !state.compareMode;
      return;
    }
    if (action.type === 'toggleClipping') {
      state.clipping = !state.clipping;
      return;
    }
    if (action.type === 'toggleFull') {
      state.isPreviewFullMode = !state.isPreviewFullMode;
      return;
    }
    if (action.type === 'exitFull') {
      state.isPreviewFullMode = false;
    }
  };

  const beforeAfterOn = resolveShortcutAction({ key: '\\', code: 'Backslash', hasImage: true });
  assert.equal(beforeAfterOn?.type, 'toggleCompare');
  assert.equal(beforeAfterOn?.preventDefault, true);
  applyAction(beforeAfterOn);
  assert.equal(state.compareMode, true, 'Before/after should enable compare mode');

  const clippingOn = resolveShortcutAction({ key: 'j', code: 'KeyJ' });
  assert.equal(clippingOn?.type, 'toggleClipping');
  assert.equal(clippingOn?.preventDefault, true);
  applyAction(clippingOn);
  assert.equal(state.clipping, true, 'Clipping should turn on from shortcut');

  const fullOn = resolveShortcutAction({ key: 'f', code: 'KeyF', isPreviewFullMode: false });
  assert.equal(fullOn?.type, 'toggleFull');
  assert.equal(fullOn?.preventDefault, true);
  applyAction(fullOn);
  assert.equal(state.isPreviewFullMode, true, 'Full preview should turn on from shortcut');

  const exitFull = resolveShortcutAction({
    key: 'Escape',
    code: 'Escape',
    isPreviewFullMode: state.isPreviewFullMode,
  });
  assert.equal(exitFull?.type, 'exitFull');
  assert.equal(exitFull?.preventDefault, true);
  applyAction(exitFull);
  assert.equal(state.isPreviewFullMode, false, 'Escape should exit full preview');

  const beforeAfterOff = resolveShortcutAction({ key: '\\', code: 'Backslash', hasImage: true });
  applyAction(beforeAfterOff);
  assert.equal(state.compareMode, false, 'Before/after should toggle compare mode back off');

  const clippingOff = resolveShortcutAction({ key: 'j', code: 'KeyJ' });
  applyAction(clippingOff);
  assert.equal(state.clipping, false, 'Clipping should toggle back off');

  formatOk('E2E flow scenario (before/after + clipping + full preview + escape)');
}

function runClippingPolicyChecks(referenceFilm) {
  const withManualOff = createBaselineAdjustments({
    isAdjusting: true,
    interactionKind: 'curve',
    showClipping: false,
  });
  const workerPayloadOff = buildWorkerAdjustmentsPayload(withManualOff, PROFILE_READY);
  const fastPayloadOff = buildFastPreviewAdjustments(referenceFilm, withManualOff, PROFILE_READY);
  assert.equal(workerPayloadOff.showClipping, false);
  assert.equal(fastPayloadOff.showClipping, false);

  const withManualOn = createBaselineAdjustments({
    isAdjusting: true,
    interactionKind: 'slider:temp',
    showClipping: true,
  });
  const workerPayloadOn = buildWorkerAdjustmentsPayload(withManualOn, PROFILE_READY);
  const fastPayloadOn = buildFastPreviewAdjustments(referenceFilm, withManualOn, PROFILE_READY);
  assert.equal(workerPayloadOn.showClipping, true);
  assert.equal(fastPayloadOn.showClipping, true);
  formatOk('Manual clipping policy (OFF stays OFF, ON stays ON)');
}

function runCurveInteractionCheck(referenceFilm) {
  const curveAdjustments = createBaselineAdjustments({
    isAdjusting: true,
    interactionKind: 'curve',
    userCurves: {
      ...createIdentityCurves(),
      rgb: [
        [0, 0],
        [96, 112],
        [180, 194],
        [255, 255],
      ],
    },
    showClipping: false,
  });
  const fastAdjustments = buildFastPreviewAdjustments(referenceFilm, curveAdjustments, PROFILE_READY);
  assert.equal(fastAdjustments.showClipping, false);
  assert.ok(fastAdjustments.fastLookLut?.size >= 9, 'Curve interaction should provide fast look LUT');
  formatOk('Curve interaction keeps clipping disabled and builds fast look LUT');
}

function runWhiteBalanceChecks() {
  const temperatures = [];
  for (let kelvin = 2000; kelvin <= 10000; kelvin += 250) {
    temperatures.push(mapKelvinToTemperature(kelvin));
  }
  const tintSamples = [-100, -60, -20, 0, 20, 60, 100];

  temperatures.forEach((temp) => {
    tintSamples.forEach((tint) => {
      const gains = resolveWhiteBalanceGains(temp, tint);
      const luma = gains.r * 0.299 + gains.g * 0.587 + gains.b * 0.114;
      assert.ok(Math.abs(luma - 1) <= 0.02, `Luma normalization drift (${luma}) for temp=${temp}, tint=${tint}`);
      assert.ok(gains.r > 0 && gains.g > 0 && gains.b > 0, 'WB gains must stay positive');
    });
  });

  formatOk('White balance gains keep luminance stable across 2000K–10000K equivalents');
}

function runProfileSweepChecks() {
  const nonInputProfiles = filmStocks.filter((profile) => !profile?.isInputProfile);
  assert.ok(nonInputProfiles.length > 0, 'Expected non-input profiles');

  const fallbackCapableProfiles = [];
  const profileFingerprints = new Set();

  nonInputProfiles.forEach((profile) => {
    const hasLut = Boolean(profile?.previewLutFile);
    const hasFallbackShape =
      hasNonIdentityCurves(profile?.curves) ||
      Boolean(profile?.bw) ||
      Math.abs(Number(profile?.temperature ?? 0)) > 0.001 ||
      Math.abs(Number(profile?.tint ?? 0)) > 0.001 ||
      Math.abs(Number(profile?.contrast ?? 0)) > 0.001 ||
      Math.abs(Number(profile?.saturation ?? 0)) > 0.001 ||
      Math.abs(Number(profile?.vibrance ?? 0)) > 0.001;

    assert.ok(hasLut || hasFallbackShape, `Profile "${profile?.name}" has neither LUT nor fallback shape`);
    if (hasFallbackShape) {
      fallbackCapableProfiles.push(profile);
    }

    const safeAdjustments = createBaselineAdjustments({
      interactionKind: 'idle',
      showClipping: false,
    });
    const fastReady = buildFastPreviewAdjustments(profile, safeAdjustments, PROFILE_READY);
    assert.equal(fastReady.showClipping, false);

    const fastFallback = buildFastPreviewAdjustments(profile, safeAdjustments, PROFILE_FAILED);
    assert.equal(fastFallback.showClipping, false);

    const fingerprint = [
      profile?.id ?? profile?.name ?? 'unknown',
      Number(fastFallback.fastExposure ?? 0).toFixed(3),
      Number(fastFallback.fastContrast ?? 0).toFixed(3),
      Number(fastFallback.fastSaturation ?? 0).toFixed(3),
      Number(fastFallback.fastVibrance ?? 0).toFixed(3),
      Number(fastFallback.fastWbR ?? 1).toFixed(3),
      Number(fastFallback.fastWbG ?? 1).toFixed(3),
      Number(fastFallback.fastWbB ?? 1).toFixed(3),
      fastFallback.fastLookLut?.key ?? 'no-look-lut',
    ].join('|');
    profileFingerprints.add(fingerprint);
  });

  assert.ok(fallbackCapableProfiles.length >= 20, 'Expected broad fallback coverage across curated profiles');
  assert.ok(profileFingerprints.size >= 40, 'Expected high profile look diversity in sweep');
  formatOk(
    `Profile sweep stable for ${nonInputProfiles.length} profiles (fallback-capable: ${fallbackCapableProfiles.length}, fingerprints: ${profileFingerprints.size})`
  );
}

function main() {
  const referenceFilm = filmStocks.find((profile) => !profile?.isInputProfile) ?? filmStocks[0];
  assert.ok(referenceFilm, 'Could not resolve reference film profile');

  runClippingPolicyChecks(referenceFilm);
  runCurveInteractionCheck(referenceFilm);
  runWhiteBalanceChecks();
  runProfileSweepChecks();
  runKeyboardShortcutGuard();
  runInteractiveEffectsGuard();
  runRawBackendAbGuard();
  runRawColorPipelineGuards();
  runClipboardAndBatchGuards();
  runExifOrientationGuards();
  runShortcutActionChecks();
  runPreviewGeometryChecks();
  runPreviewGeometryScenarioSnapshots();
  runPreviewE2EFlowScenario();

  console.log('PASS Film Lab regression checks');
}

try {
  main();
} catch (error) {
  console.error('FAIL Film Lab regression checks');
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
}
