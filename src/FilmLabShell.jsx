import FilmLabAppFrame from './FilmLabAppFrame.jsx';
import FilmLabBottomStatusBar from './FilmLabBottomStatusBar.jsx';
import FilmLabToolbar from './FilmLabToolbar.jsx';
import FilmLabProfilesSidebar from './FilmLabProfilesSidebar.jsx';
import FilmLabRightPanel from './FilmLabRightPanel.jsx';
import FilmLabCanvasArea from './FilmLabCanvasArea.jsx';
import FilmLabShortcutHelp from './FilmLabShortcutHelp.jsx';
import FilmLabExportModal from './FilmLabExportModal.jsx';
import FilmLabSessionRestorePrompt from './FilmLabSessionRestorePrompt.jsx';
import FilmLabStudioNav from './FilmLabStudioNav.jsx';
import FilmLabLibraryWorkspace from './FilmLabLibraryWorkspace.jsx';
import FilmLabRetouchWorkspace from './FilmLabRetouchWorkspace.jsx';
import FilmLabAiAutomationWorkspace from './FilmLabAiAutomationWorkspace.jsx';
import {
  FilmLabLocalMaskWorkbenchListRail,
  FilmLabLocalMaskWorkbenchToolsRail,
} from './FilmLabLocalMaskWorkbench.jsx';
import {
  FilmLabRecipeLayersEditorRail,
  FilmLabRecipeLayersListRail,
} from './FilmLabRecipeLayersStudio.jsx';

const noop = () => {};

export default function FilmLabShell({
  shellRef,
  viewMode,
  isPreviewFullMode,
  studioWorkspace,
  studioNavProps,
  libraryWorkspaceProps = {
    collections: [],
    assets: [],
    activeCollectionId: 'inbox',
    onCollectionChange: noop,
  },
  toolbarProps,
  profilesSidebarProps,
  canvasAreaProps,
  maskStudioProps = { maskWorkbench: null },
  recipeLayersProps = { adjustments: null, updateAdjustment: noop, maskWorkbench: null },
  retouchProps = { adjustments: null, updateAdjustment: noop, maskWorkbench: null },
  aiAutomationProps = {
    adjustments: null,
    updateAdjustment: noop,
    setAdjustments: noop,
    activeCropRectNorm: null,
    batchFileInputRef: null,
    setIsExportModalOpen: noop,
  },
  rightPanelProps,
  shortcutHelpProps,
  sessionRestorePromptProps,
  exportModalProps,
  bottomStatusBarProps = {},
}) {
  return (
    <>
      <FilmLabAppFrame
        shellRef={shellRef}
        viewMode={viewMode}
        isPreviewFullMode={isPreviewFullMode}
        studioWorkspace={studioWorkspace}
        bottomSlot={
          isPreviewFullMode ? null : <FilmLabBottomStatusBar {...bottomStatusBarProps} />
        }
      >
        <FilmLabToolbar {...toolbarProps} />

        <FilmLabStudioNav {...studioNavProps} />

        {studioWorkspace === 'library' ? (
            <FilmLabLibraryWorkspace {...libraryWorkspaceProps} />
          ) : studioWorkspace === 'masks' ? (
            <>
              <FilmLabLocalMaskWorkbenchListRail wb={maskStudioProps.maskWorkbench} />

              <FilmLabCanvasArea {...canvasAreaProps} />

              <FilmLabLocalMaskWorkbenchToolsRail wb={maskStudioProps.maskWorkbench} />
            </>
          ) : studioWorkspace === 'layers' ? (
            <>
              <FilmLabRecipeLayersListRail {...recipeLayersProps} />

              <FilmLabCanvasArea {...canvasAreaProps} />

              <FilmLabRecipeLayersEditorRail {...recipeLayersProps} />
            </>
          ) : studioWorkspace === 'retouch' ? (
            <FilmLabRetouchWorkspace {...retouchProps} canvasAreaProps={canvasAreaProps} />
          ) : studioWorkspace === 'ai' ? (
            <FilmLabAiAutomationWorkspace {...aiAutomationProps} canvasAreaProps={canvasAreaProps} />
          ) : (
            <>
              {/* Develop / Eksport / pozostałe: profil + podgląd + panel (Etap 7 — układ RAW/globalny) */}
              <FilmLabProfilesSidebar {...profilesSidebarProps} />

              <FilmLabCanvasArea {...canvasAreaProps} />

              <FilmLabRightPanel {...rightPanelProps} />
            </>
          )}
      </FilmLabAppFrame>

      <FilmLabShortcutHelp {...shortcutHelpProps} />

      <FilmLabSessionRestorePrompt {...sessionRestorePromptProps} />

      <FilmLabExportModal {...exportModalProps} />
    </>
  );
}
