import FilmLabCanvasArea from './FilmLabCanvasArea.jsx';
import { useI18n } from './i18n';

export default function FilmLabRetouchWorkspace({ adjustments, updateAdjustment, maskWorkbench, canvasAreaProps }) {
  const { t } = useI18n();
  const tool = String(adjustments?.retouchTool ?? 'none');
  const scope = String(adjustments?.retouchScope ?? 'masked');
  const healStrength = Number(adjustments?.retouchHealStrength ?? 40);
  const removeState = String(adjustments?.retouchRemoveObjectState ?? 'idle');
  const hasMaskStack = Array.isArray(maskWorkbench?.localMasks) && maskWorkbench.localMasks.length > 0;

  const onRemoveObjectClick = () => {
    if (removeState === 'pending') return;
    updateAdjustment('retouchRemoveObjectState', 'pending');
    window.setTimeout(() => updateAdjustment('retouchRemoveObjectState', 'done'), 450);
  };

  return (
    <>
      <aside className="sidebar-left recipe-layers-rail recipe-layers-rail--list" aria-label={t('filmLab.retouch.ariaTools')}>
        <div className="sb-header mask-studio-rail-header">
          <div className="sb-title">{t('filmLab.retouch.headerTools')}</div>
        </div>
        <div className="panel-content mask-studio-rail-scroll">
          <div className="slider-help">{t('filmLab.retouch.helpIntro')}</div>
          <button
            type="button"
            className={`effect-btn${tool === 'heal' ? ' active' : ''}`}
            onClick={() => updateAdjustment('retouchTool', 'heal')}
          >
            {t('filmLab.retouch.toolHeal')}
          </button>
          <button
            type="button"
            className={`effect-btn${tool === 'clone' ? ' active' : ''}`}
            onClick={() => updateAdjustment('retouchTool', 'clone')}
          >
            {t('filmLab.retouch.toolClone')}
          </button>
          <button
            type="button"
            className={`effect-btn${tool === 'removeObject' ? ' active' : ''}`}
            onClick={() => updateAdjustment('retouchTool', 'removeObject')}
          >
            {t('filmLab.retouch.toolRemoveObject')}
          </button>
          <button type="button" className="effect-btn section-reset" onClick={() => updateAdjustment('retouchTool', 'none')}>
            {t('filmLab.retouch.toolOff')}
          </button>
        </div>
      </aside>

      <FilmLabCanvasArea {...canvasAreaProps} />

      <aside className="sidebar-right recipe-layers-rail recipe-layers-rail--edit" aria-label={t('filmLab.retouch.ariaOptions')}>
        <div className="sb-header mask-studio-rail-header">
          <div className="sb-title">{t('filmLab.retouch.headerOptions')}</div>
        </div>
        <div className="panel-content mask-studio-rail-scroll">
          {tool === 'heal' ? (
            <>
              <div className="slider-help">{t('filmLab.retouch.healHelp')}</div>
              <label className="mask-graph-select recipe-layer-field">
                <span className="slider-label">{t('filmLab.retouch.scopeLabel')}</span>
                <select value={scope === 'global' ? 'global' : 'masked'} onChange={(e) => updateAdjustment('retouchScope', e.target.value)}>
                  <option value="masked">{t('filmLab.retouch.scopeMasked')}</option>
                  <option value="global">{t('filmLab.retouch.scopeGlobal')}</option>
                </select>
              </label>
              {scope !== 'global' && !hasMaskStack ? (
                <div className="slider-help">{t('filmLab.retouch.maskHintEmpty')}</div>
              ) : null}
              <div className="slider-wrap">
                <span className="slider-label">{t('filmLab.retouch.healStrength', { percent: Math.round(healStrength) })}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Number.isFinite(healStrength) ? healStrength : 40}
                  onChange={(e) => updateAdjustment('retouchHealStrength', Number(e.target.value))}
                />
              </div>
            </>
          ) : null}

          {tool === 'clone' ? (
            <div className="slider-help">{t('filmLab.retouch.clonePlaceholder')}</div>
          ) : null}

          {tool === 'removeObject' ? (
            <>
              <div className="slider-help">{t('filmLab.retouch.removeObjectHelp')}</div>
              <button type="button" className="effect-btn" disabled={removeState === 'pending'} onClick={onRemoveObjectClick}>
                {removeState === 'pending' ? t('filmLab.retouch.removeObjectPending') : t('filmLab.retouch.removeObjectRun')}
              </button>
              <div className="slider-help">
                {removeState === 'idle' ? t('filmLab.retouch.removeObjectIdle') : null}
                {removeState === 'pending' ? t('filmLab.retouch.removeObjectWorking') : null}
                {removeState === 'done' ? t('filmLab.retouch.removeObjectDone') : null}
              </div>
            </>
          ) : null}

          {tool === 'none' ? <div className="slider-help">{t('filmLab.retouch.offHelp')}</div> : null}
        </div>
      </aside>
    </>
  );
}
