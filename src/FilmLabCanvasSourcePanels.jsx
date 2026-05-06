import { PIPELINE_KIND, PIPELINE_STATUS } from './engine/pipeline/constants.js';
import { useI18n } from './i18n';

export default function FilmLabCanvasSourcePanels({
  hasActiveSource,
  hasImage,
  fileInputRef,
  pipelineInfo,
}) {
  const { t } = useI18n();
  const pipelineTitle = !pipelineInfo
    ? t('filmLab.sourcePanel.pipelineIdle')
    : pipelineInfo.pipelineKind === PIPELINE_KIND.RAW
      ? t('filmLab.sourcePanel.pipelineRaw')
      : t('filmLab.sourcePanel.pipelineBitmap');
  return (
    <>
      {!hasActiveSource ? (
        <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
          <div className="upload-icon">◎</div>
          <div className="upload-text">{t('filmLab.sourcePanel.uploadTitle')}</div>
          <div className="upload-sub">{t('filmLab.sourcePanel.uploadSub')}</div>
          <button className="btn-browse" type="button">
            {t('filmLab.sourcePanel.browse')}
          </button>
        </div>
      ) : null}

      {hasActiveSource && !hasImage ? (
        <div className="upload-zone source-status-card">
          <div className="upload-icon">
            {pipelineInfo?.pipelineKind === PIPELINE_KIND.RAW ? 'RAW' : '…'}
          </div>
          <div className="upload-text">{pipelineTitle}</div>
          <div className="upload-sub">
            {pipelineInfo?.status === PIPELINE_STATUS.DECODER_MISSING
              ? t('filmLab.sourcePanel.rawDecoderPending')
              : pipelineInfo?.message || t('filmLab.sourcePanel.preparingSource')}
          </div>
        </div>
      ) : null}
    </>
  );
}
