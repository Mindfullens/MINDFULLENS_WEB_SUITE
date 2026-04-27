export function normalizeOverlayOrientation(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  const wrapped = Math.round(parsed) % 4;
  return wrapped < 0 ? wrapped + 4 : wrapped;
}

export function buildLogSpiralPath() {
  const centerX = 50;
  const centerY = 50;
  const maxRadius = 47.5;
  const minRadius = 1.4;
  const turns = 3.8;
  const pointCount = 240;
  const maxTheta = turns * Math.PI * 2;
  const decay = Math.log(maxRadius / minRadius) / Math.max(0.001, maxTheta);
  let path = '';
  for (let index = 0; index <= pointCount; index += 1) {
    const t = index / pointCount;
    const theta = t * maxTheta;
    const radius = maxRadius * Math.exp(-decay * theta);
    const x = centerX + radius * Math.cos(theta - Math.PI / 2);
    const y = centerY + radius * Math.sin(theta - Math.PI / 2);
    path += `${index === 0 ? 'M' : ' L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return path;
}
