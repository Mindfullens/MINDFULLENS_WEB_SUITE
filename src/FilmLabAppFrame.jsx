/**
 * Global PRO shell: wraps {@link FilmLabToolbar}, {@link FilmLabStudioNav}, workspace body and optional bottom status.
 * Grid areas are defined in `filmLabPage.css` (`.app-container.film-lab-frame__grid`).
 */
export default function FilmLabAppFrame({
  shellRef,
  viewMode,
  isPreviewFullMode,
  studioWorkspace,
  children,
  bottomSlot,
}) {
  return (
    <div
      ref={shellRef}
      className={`film-lab-shell film-lab-frame view-${viewMode} workspace-${studioWorkspace}${
        isPreviewFullMode ? ' preview-full-mode' : ''
      }`}
    >
      <div
        className={`app-container film-lab-frame__grid view-${viewMode} workspace-${studioWorkspace}${
          isPreviewFullMode ? ' preview-full-mode' : ''
        }`}
      >
        {children}
        {bottomSlot}
      </div>
    </div>
  );
}
