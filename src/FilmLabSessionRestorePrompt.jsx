export default function FilmLabSessionRestorePrompt({ open, savedAt, fileName, onConfirm, onDecline }) {
  if (!open) {
    return null;
  }

  const when = new Date(savedAt).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <div
      className="export-modal-backdrop session-restore-backdrop"
      onClick={onDecline}
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-restore-title"
    >
      <div className="export-modal-content session-restore-modal" onClick={(event) => event.stopPropagation()}>
        <div className="export-modal-header">
          <h2 id="session-restore-title">Przywrócić auto-zapis?</h2>
        </div>
        <p className="session-restore-body">
          Znaleziono zapis automatyczny z <strong>{when}</strong>
          {fileName ? (
            <>
              {' '}
              — plik: <strong>{fileName}</strong>
            </>
          ) : null}
          . Czy chcesz przywrócić sesję (zdjęcie i ustawienia)?
        </p>
        <p className="session-restore-hint">„Nie przywracaj” usunie ten zapis z przeglądarki.</p>
        <div className="session-restore-actions">
          <button type="button" className="session-restore-btn session-restore-btn--primary" onClick={onConfirm}>
            Przywróć
          </button>
          <button type="button" className="session-restore-btn session-restore-btn--ghost" onClick={onDecline}>
            Nie przywracaj
          </button>
        </div>
      </div>
    </div>
  );
}
