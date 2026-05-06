import { SHORTCUT_KEYS } from './engine/shortcutActions.js';
import { useI18n } from './i18n';

export default function FilmLabShortcutHelp({ open, onClose }) {
  const { t } = useI18n();

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
          <h3>{t('shortcutHelp.title')}</h3>
          <button type="button" className="shortcut-help-close" onClick={onClose}>
            {t('shortcutHelp.close')}
          </button>
        </div>
        <div className="shortcut-help-grid">
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.beforeAfter')}</span>
            <div className="shortcut-help-keys">
              <kbd>\</kbd>
              <kbd>Y</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.clipping')}</span>
            <div className="shortcut-help-keys">
              <kbd>J</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.autoExposure')}</span>
            <div className="shortcut-help-keys">
              <kbd>{SHORTCUT_KEYS.autoExposure}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.autoColor')}</span>
            <div className="shortcut-help-keys">
              <kbd>{SHORTCUT_KEYS.autoColor}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.cropOverlays')}</span>
            <div className="shortcut-help-keys">
              <kbd>{SHORTCUT_KEYS.overlayCycle}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.cropOverlayRotate')}</span>
            <div className="shortcut-help-keys">
              <kbd>Shift</kbd>
              <kbd>{SHORTCUT_KEYS.overlayCycle}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.fit')}</span>
            <div className="shortcut-help-keys">
              <kbd>0</kbd>
              <kbd>{SHORTCUT_KEYS.fitAlt}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.oneToOne')}</span>
            <div className="shortcut-help-keys">
              <kbd>{SHORTCUT_KEYS.oneToOne}</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.fullView')}</span>
            <div className="shortcut-help-keys">
              <kbd>F</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.zoomInOut')}</span>
            <div className="shortcut-help-keys">
              <kbd>+</kbd>
              <kbd>-</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.panAfterZoom')}</span>
            <div className="shortcut-help-keys">
              <kbd>←</kbd>
              <kbd>↑</kbd>
              <kbd>→</kbd>
              <kbd>↓</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.showShortcuts')}</span>
            <div className="shortcut-help-keys">
              <kbd>?</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.metadataPanel')}</span>
            <div className="shortcut-help-keys">
              <kbd>I</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.metadataMode')}</span>
            <div className="shortcut-help-keys">
              <kbd>M</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.copySettings')}</span>
            <div className="shortcut-help-keys">
              <kbd>Cmd/Ctrl</kbd>
              <kbd>C</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span title={t('shortcutHelp.pasteSettingsTitle')}>{t('shortcutHelp.pasteSettings')}</span>
            <div className="shortcut-help-keys">
              <kbd>Cmd/Ctrl</kbd>
              <kbd>V</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span title={t('shortcutHelp.pasteRecipeTitle')}>{t('shortcutHelp.pasteRecipeRenderDebug')}</span>
            <div className="shortcut-help-keys">
              <kbd>Shift</kbd>
              <kbd>Cmd/Ctrl</kbd>
              <kbd>V</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span title={t('shortcutHelp.dropRecipeTitle')}>{t('shortcutHelp.dropRecipePanel')}</span>
            <div className="shortcut-help-keys">
              <span className="shortcut-help-drag-hint">{t('shortcutHelp.dragDropHint')}</span>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.undo')}</span>
            <div className="shortcut-help-keys">
              <kbd>Cmd/Ctrl</kbd>
              <kbd>Z</kbd>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span>{t('shortcutHelp.redo')}</span>
            <div className="shortcut-help-key-alternatives">
              <div className="shortcut-help-keys">
                <kbd>Shift</kbd>
                <kbd>Cmd/Ctrl</kbd>
                <kbd>Z</kbd>
              </div>
              <span className="shortcut-help-or">{t('shortcutHelp.or')}</span>
              <div className="shortcut-help-keys">
                <kbd>Ctrl</kbd>
                <kbd>Y</kbd>
              </div>
            </div>
          </div>
          <div className="shortcut-help-row">
            <span title={t('shortcutHelp.exportSaveDialogTitle')}>{t('shortcutHelp.exportSaveDialog')}</span>
            <div className="shortcut-help-keys">
              <kbd>Cmd/Ctrl</kbd>
              <kbd>{SHORTCUT_KEYS.exportModal}</kbd>
            </div>
          </div>
          <div className="shortcut-help-tip-banner" role="note">
            {t('shortcutHelp.kinoTip')}
          </div>
        </div>
      </div>
    </div>
  );
}
