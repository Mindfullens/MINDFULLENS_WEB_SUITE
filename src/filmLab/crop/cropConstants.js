export const CROP_OVERLAY_MODES = [
  { id: 'none', label: 'Brak' },
  { id: 'thirds', label: 'Trójpodział' },
  { id: 'phi', label: 'Złoty podział' },
  { id: 'spiral', label: 'Spirala' },
  { id: 'diagonalA', label: 'Diagonalna A' },
  { id: 'diagonalB', label: 'Diagonalna B' },
  { id: 'triangleA', label: 'Trójkąt A' },
  { id: 'triangleB', label: 'Trójkąt B' },
];

export const CROP_ASPECT_PRESETS = [
  { id: 'free', label: 'Free', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '5:4', label: '5:4', ratio: 5 / 4 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '2:3', label: '2:3', ratio: 2 / 3 },
  { id: '16:10', label: '16:10', ratio: 16 / 10 },
  { id: '10:16', label: '10:16', ratio: 10 / 16 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '21:9', label: '21:9', ratio: 21 / 9 },
  { id: '9:21', label: '9:21', ratio: 9 / 21 },
];

export const CROP_HANDLE_DEFS = [
  { id: 'nw', cursor: 'nwse-resize' },
  { id: 'n', cursor: 'ns-resize' },
  { id: 'ne', cursor: 'nesw-resize' },
  { id: 'e', cursor: 'ew-resize' },
  { id: 'se', cursor: 'nwse-resize' },
  { id: 's', cursor: 'ns-resize' },
  { id: 'sw', cursor: 'nesw-resize' },
  { id: 'w', cursor: 'ew-resize' },
];

export const CROP_MIN_SIZE = 0.05;
export const STRAIGHTEN_MIN_LINE_LENGTH = 0.04;
