export default function FilmLabCanvasHistogramBar({ hasImage, histogramCanvasRef }) {
  if (!hasImage) {
    return null;
  }

  return (
    <div className="histogram-bar">
      <div className="histogram-label">Histogram</div>
      <canvas ref={histogramCanvasRef} width="180" height="55" />
    </div>
  );
}
