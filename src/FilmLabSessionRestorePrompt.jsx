import { useI18n } from './i18n';

export default function FilmLabSessionRestorePrompt({ open, savedAt, fileName, onConfirm, onDecline }) {
  const { t } = useI18n();

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
          <h2 id="session-restore-title">{t('session.restore.title')}</h2>
        </div>
        <p className="session-restore-body">
          {t('session.restore.intro')}{' '}
          <strong>{when}</strong>
          {fileName ? (
            <>
              {' '}
              {t('session.restore.fileLead')} <strong>{fileName}</strong>
            </>
          ) : null}
          {t('session.restore.question')}
        </p>
        <p className="session-restore-hint">{t('session.restore.hint')}</p>
        <div className="session-restore-actions">
          <button type="button" className="session-restore-btn session-restore-btn--primary" onClick={onConfirm}>
            {t('session.restore.confirm')}
          </button>
          <button type="button" className="session-restore-btn session-restore-btn--ghost" onClick={onDecline}>
            {t('session.restore.decline')}
          </button>
        </div>
      </div>
    </div>
  );
}
