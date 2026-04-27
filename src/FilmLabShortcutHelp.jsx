import { SHORTCUT_KEYS } from './engine/shortcutActions.js';

export default function FilmLabShortcutHelp({ open, onClose }) {
  if (!open) {
    return null;
  }

  return (
    <div className="shortcut-help-overlay" onClick={onClose}>
      <div
        className="shortcut-help-panel"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="shortcut-help-header">
          <h3>Skróty klawiszowe</h3>
          <button type="button" className="shortcut-help-close" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <div className="shortcut-help-grid">
          <div className="shortcut-help-row">
            <span>Przed / Po</span>
            <div className="shortcut-help-keys">
              <kbd>\</kbd>
              <kbd>Y</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Clipping</span>
            <div className="shortcut-help-keys">
              <kbd>J</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Automatyczna ekspozycja</span>
            <div className="shortcut-help-keys">
              <kbd>{SHORTCUT_KEYS.autoExposure}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Automatyczny kolor</span>
            <div className="shortcut-help-keys">
              <kbd>{SHORTCUT_KEYS.autoColor}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Nakładki Crop</span>
            <div className="shortcut-help-keys">
              <kbd>{SHORTCUT_KEYS.overlayCycle}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Dopasuj</span>
            <div className="shortcut-help-keys">
              <kbd>0</kbd>
              <kbd>{SHORTCUT_KEYS.fitAlt}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Skala 1:1 (piksele)</span>
            <div className="shortcut-help-keys">
              <kbd>{SHORTCUT_KEYS.oneToOne}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Widok pełny</span>
            <div className="shortcut-help-keys">
              <kbd>F</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Przybliż / oddal</span>
            <div className="shortcut-help-keys">
              <kbd>+</kbd>
              <kbd>-</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Pan (po zoomie)</span>
            <div className="shortcut-help-keys">
              <kbd>←</kbd>
              <kbd>↑</kbd>
              <kbd>→</kbd>
              <kbd>↓</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Pokaż skróty</span>
            <div className="shortcut-help-keys">
              <kbd>?</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Panel metadanych</span>
            <div className="shortcut-help-keys">
              <kbd>I</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Tryb metadanych</span>
            <div className="shortcut-help-keys">
              <kbd>M</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Kopiuj ustawienia</span>
            <div className="shortcut-help-keys">
              <kbd>Cmd/Ctrl</kbd>
              <kbd>C</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Wklej ustawienia</span>
            <div className="shortcut-help-keys">
              <kbd>Cmd/Ctrl</kbd>
              <kbd>V</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Cofnij</span>
            <div className="shortcut-help-keys">
              <kbd>Cmd/Ctrl</kbd>
              <kbd>Z</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>Ponów</span>
            <div className="shortcut-help-key-alternatives">
              <div className="shortcut-help-keys">
                <kbd>Shift</kbd>
                <kbd>Cmd/Ctrl</kbd>
                <kbd>Z</kbd>
              </div>
              <span className="shortcut-help-or">lub</span>
              <div className="shortcut-help-keys">
                <kbd>Ctrl</kbd>
                <kbd>Y</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
