import { useI18n } from './i18n';

export default function FilmLabCanvasHistogramBar({ hasImage, histogramCanvasRef }) {
  const { t } = useI18n();
  if (!hasImage) {
    return null;
  }

  return (
    <div className="histogram-bar">
      <div className="histogram-label">{t('filmLab.histogram.label')}</div>
      <canvas ref={histogramCanvasRef} width="180" height="55" />
    </div>
  );
}
