import { getPipelineLabel, PIPELINE_KIND, PIPELINE_STATUS } from './engine/pipeline/constants.js';

export default function FilmLabCanvasSourcePanels({
  hasActiveSource,
  hasImage,
  fileInputRef,
  pipelineInfo,
}) {
  return (
    <>
      {!hasActiveSource ? (
        <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
          <div className="upload-icon">◎</div>
          <div className="upload-text">Wgraj swoje zdjęcie</div>
          <div className="upload-sub">JPG · PNG · WebP · TIFF · RAW / DNG</div>
          <button className="btn-browse" type="button">
            Wybierz z dysku
          </button>
        </div>
      ) : null}

      {hasActiveSource && !hasImage ? (
        <div className="upload-zone source-status-card">
          <div className="upload-icon">
            {pipelineInfo?.pipelineKind === PIPELINE_KIND.RAW ? 'RAW' : '…'}
          </div>
          <div className="upload-text">{getPipelineLabel(pipelineInfo)}</div>
          <div className="upload-sub">
            {pipelineInfo?.status === PIPELINE_STATUS.DECODER_MISSING
              ? 'Architektura RAW/DNG jest gotowa, ale dekoder nie jest jeszcze podłączony.'
              : pipelineInfo?.message || 'Przygotowywanie źródła…'}
          </div>
        </div>
      ) : null}
    </>
  );
}
