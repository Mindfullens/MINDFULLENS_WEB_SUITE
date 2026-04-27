import FilmLabToolbar from './FilmLabToolbar.jsx';
import FilmLabProfilesSidebar from './FilmLabProfilesSidebar.jsx';
import FilmLabRightPanel from './FilmLabRightPanel.jsx';
import FilmLabCanvasArea from './FilmLabCanvasArea.jsx';
import FilmLabShortcutHelp from './FilmLabShortcutHelp.jsx';
import FilmLabExportModal from './FilmLabExportModal.jsx';
import FilmLabSessionRestorePrompt from './FilmLabSessionRestorePrompt.jsx';

export default function FilmLabShell({
  shellRef,
  viewMode,
  isPreviewFullMode,
  toolbarProps,
  profilesSidebarProps,
  canvasAreaProps,
  rightPanelProps,
  shortcutHelpProps,
  sessionRestorePromptProps,
  exportModalProps,
}) {
  return (
    <div
      ref={shellRef}
      className={`film-lab-shell view-${viewMode}${isPreviewFullMode ? ' preview-full-mode' : ''}`}
    >
      <div
        className={`app-container view-${viewMode}${isPreviewFullMode ? ' preview-full-mode' : ''}`}
      >
        <FilmLabToolbar {...toolbarProps} />

        <FilmLabProfilesSidebar {...profilesSidebarProps} />

        <FilmLabCanvasArea {...canvasAreaProps} />

        <FilmLabRightPanel {...rightPanelProps} />
      </div>

      <FilmLabShortcutHelp {...shortcutHelpProps} />

      <FilmLabSessionRestorePrompt {...sessionRestorePromptProps} />

      <FilmLabExportModal {...exportModalProps} />
    </div>
  );
}
