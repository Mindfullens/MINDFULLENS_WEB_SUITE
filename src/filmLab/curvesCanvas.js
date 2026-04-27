import { buildCurvePreviewLut, sampleCurveLut } from '../engine/curveInterpolation.js';

export function drawCurvesPreview(curvesCanvas, userCurves, activeCurveCh) {
  if (!curvesCanvas) {
    return;
  }

  const context = curvesCanvas.getContext('2d');

  if (!context) {
    return;
  }

  const width = curvesCanvas.width;
  const height = curvesCanvas.height;
  const colors = {
    rgb: '#c4944e',
    r: '#e85d5d',
    g: '#5de88a',
    b: '#5d8ae8',
  };

  context.clearRect(0, 0, width, height);
  context.strokeStyle = 'rgba(255,255,255,0.06)';
  context.lineWidth = 1;

  for (let index = 1; index < 4; index += 1) {
    context.beginPath();
    context.moveTo((index * width) / 4, 0);
    context.lineTo((index * width) / 4, height);
    context.stroke();

    context.beginPath();
    context.moveTo(0, (index * height) / 4);
    context.lineTo(width, (index * height) / 4);
    context.stroke();
  }

  context.strokeStyle = 'rgba(255,255,255,0.1)';
  context.beginPath();
  context.moveTo(0, height);
  context.lineTo(width, 0);
  context.stroke();

  const points = userCurves[activeCurveCh];
  const lut = buildCurvePreviewLut(points, 'monotonic');
  const sampleCount = Math.max(256, Math.floor(width));

  context.beginPath();
  context.strokeStyle = colors[activeCurveCh] ?? colors.rgb;
  context.lineWidth = 1.5;

  for (let index = 0; index < sampleCount; index += 1) {
    const normalized = sampleCount > 1 ? index / (sampleCount - 1) : 0;
    const xInput = normalized * 255;
    const x = normalized * width;
    const y = height - (sampleCurveLut(lut, xInput) / 255) * height;

    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.stroke();

  points.forEach((point) => {
    context.beginPath();
    context.arc((point[0] / 255) * width, height - (point[1] / 255) * height, 4, 0, Math.PI * 2);
    context.fillStyle = colors[activeCurveCh] ?? colors.rgb;
    context.fill();
    context.strokeStyle = 'rgba(0,0,0,0.5)';
    context.lineWidth = 1;
    context.stroke();
  });
}

export function cloneCurves(curves) {
  return {
    rgb: curves.rgb.map((point) => [...point]),
    r: curves.r.map((point) => [...point]),
    g: curves.g.map((point) => [...point]),
    b: curves.b.map((point) => [...point]),
  };
}
