import FilmLabShell from './FilmLabShell.jsx';
import { buildFilmLabShellPropBundle } from './filmLab/buildFilmLabShellPropBundle.js';

export default function FilmLabShellContainer({ shellRef, viewMode, isPreviewFullMode, bundleArgs }) {
  const {
    toolbarProps,
    profilesSidebarProps,
    canvasAreaProps,
    rightPanelProps,
    shortcutHelpProps,
    sessionRestorePromptProps,
    exportModalProps,
  } = buildFilmLabShellPropBundle(bundleArgs);

  return (
    <FilmLabShell
      shellRef={shellRef}
      viewMode={viewMode}
      isPreviewFullMode={isPreviewFullMode}
      toolbarProps={toolbarProps}
      profilesSidebarProps={profilesSidebarProps}
      canvasAreaProps={canvasAreaProps}
      rightPanelProps={rightPanelProps}
      shortcutHelpProps={shortcutHelpProps}
      sessionRestorePromptProps={sessionRestorePromptProps}
      exportModalProps={exportModalProps}
    />
  );
}
