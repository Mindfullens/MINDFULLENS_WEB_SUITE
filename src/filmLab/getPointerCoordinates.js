export function getPointerCoordinates(event) {
  if (!event) {
    return null;
  }

  if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  const touch = event.touches?.[0] ?? event.changedTouches?.[0];

  if (touch && typeof touch.clientX === 'number' && typeof touch.clientY === 'number') {
    return {
      x: touch.clientX,
      y: touch.clientY,
    };
  }

  return null;
}
