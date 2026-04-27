import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error, errorInfo) {
    // Keep stack traces in devtools for root-cause debugging.
    console.error('[FilmLab] Runtime crash captured by ErrorBoundary', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
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
            <h1 style={{ fontSize: '22px', marginBottom: '12px' }}>Film Lab zatrzymał się na błędzie</h1>
            <p style={{ opacity: 0.9, marginBottom: '8px' }}>
              Odśwież stronę (Cmd+Shift+R). Jeśli błąd wraca, skopiuj komunikat poniżej.
            </p>
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
              {this.state.message || 'Brak szczegółów błędu.'}
            </pre>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
