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
import { FILE_INPUT_ACCEPT } from './engine/pipeline/constants.js';
import FilmLabFilmstripCanvas from './filmLab/FilmLabFilmstripCanvas.jsx';
import {
  FilmLabLocalMaskWorkbenchListRail,
  FilmLabLocalMaskWorkbenchToolsRail,
} from './FilmLabLocalMaskWorkbench.jsx';
import FilmLabLibraryWorkspace from './FilmLabLibraryWorkspace.jsx';

const noop = () => {};

function workspaceRouteLayerClass(isActive) {
  return `film-lab-route-layer ${isActive ? 'is-route-active' : 'is-route-hidden'}`;
}

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
    isMetadataPanelOpen: false,
  },
  developFilmstripProps = null,
  sourceFileInputProps = null,
  toolbarProps,
  profilesSidebarProps,
  maskWorkbench = null,
  canvasAreaProps,
  rightPanelProps,
  shortcutHelpProps,
  sessionRestorePromptProps,
  exportModalProps,
  bottomStatusBarProps = {},
}) {
  const isLibraryWorkspace = studioWorkspace === 'library';

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

        {sourceFileInputProps ? (
          <input
            ref={sourceFileInputProps.fileInputRef}
            id="sourceFileInput"
            data-testid="film-lab-source-file-input"
            name="sourceFileInput"
            type="file"
            multiple
            accept={FILE_INPUT_ACCEPT}
            onChange={sourceFileInputProps.handleFileUpload}
            style={{ display: 'none' }}
          />
        ) : null}

        <FilmLabStudioNav {...studioNavProps} />

        <div className="film-lab-workspace-route-stack">
          <div
            className={`film-lab-route-layer film-lab-route-layer--library ${workspaceRouteLayerClass(isLibraryWorkspace)}`}
            aria-hidden={!isLibraryWorkspace}
          >
            <FilmLabLibraryWorkspace {...libraryWorkspaceProps} />
          </div>
          <div
            className={`film-lab-route-layer film-lab-route-layer--develop ${workspaceRouteLayerClass(!isLibraryWorkspace)}`}
            aria-hidden={isLibraryWorkspace}
          >
            <div className="film-lab-develop-route-columns">
              <div className="film-lab-develop-left-stack">
                {maskWorkbench ? <FilmLabLocalMaskWorkbenchListRail wb={maskWorkbench} /> : null}
                <FilmLabProfilesSidebar {...profilesSidebarProps} />
              </div>
              <FilmLabCanvasArea {...canvasAreaProps} />
              <div className="film-lab-develop-right-stack">
                {maskWorkbench ? <FilmLabLocalMaskWorkbenchToolsRail wb={maskWorkbench} /> : null}
                <FilmLabRightPanel {...rightPanelProps} />
              </div>
            </div>
          </div>
        </div>

        {developFilmstripProps != null && studioWorkspace !== 'library' ? (
          <div className="film-lab-global-filmstrip-slot">
            <FilmLabFilmstripCanvas
              {...developFilmstripProps}
              workspaceTabKey={studioWorkspace}
            />
          </div>
        ) : null}
      </FilmLabAppFrame>

      <FilmLabShortcutHelp {...shortcutHelpProps} />

      <FilmLabSessionRestorePrompt {...sessionRestorePromptProps} />

      <FilmLabExportModal {...exportModalProps} />
    </>
  );
}
