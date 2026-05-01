import { useI18n } from './i18n';

/** Musi renderować się pod `<I18nProvider>` — provider jest nad `ErrorBoundary` w `main.jsx`. */
export default function RuntimeErrorScreen({ message }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#08070c',
        color: '#ede8df',
        fontFamily: 'Outfit, system-ui, sans-serif',
        padding: '24px',
      }}
    >
      <div style={{ maxWidth: '720px', width: '100%' }}>
        <h1 style={{ fontSize: '22px', marginBottom: '12px' }}>{t('errors.runtime.title')}</h1>
        <p style={{ opacity: 0.9, marginBottom: '8px' }}>{t('errors.runtime.hint')}</p>
        <pre
          style={{
            marginTop: '12px',
            padding: '12px',
            borderRadius: '8px',
            background: '#13111c',
            border: '1px solid rgba(255,255,255,0.12)',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message || t('errors.runtime.noDetails')}
        </pre>
      </div>
    </div>
  );
}
