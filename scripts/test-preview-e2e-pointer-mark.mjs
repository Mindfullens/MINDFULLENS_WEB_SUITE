/**
 * Regresja modułu E2E pointer (Film Lab): mark / aux / compute bez przeglądarki.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clearFilmLabE2ePointerMark,
  computePreviewE2ePointerToPresentMs,
  getFilmLabE2eKeyboardSession,
  getFilmLabE2ePointerAuxSession,
  markFilmLabE2eKeyboardE2eIntent,
  markFilmLabE2ePointerDown,
  setFilmLabE2ePointerAuxSession,
} from '../src/filmLab/previewE2ePointerMark.js';

const _root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const _curves = fs.readFileSync(path.join(_root, 'src/FilmLabCurveHandlers.js'), 'utf8');
assert.match(_curves, /markFilmLabE2ePointerDown/);
assert.match(_curves, /previewE2ePointerMark/);

const _gradeWheel = fs.readFileSync(
  path.join(_root, 'src/filmLab/useFilmLabColorGradeWheelAdjustSession.js'),
  'utf8'
);
assert.match(_gradeWheel, /slider:grade-\$\{activeGradeZone\}-wheel/);
assert.match(_gradeWheel, /markFilmLabE2ePointerDown/);

const _wheel = fs.readFileSync(path.join(_root, 'src/ColorWheel.jsx'), 'utf8');
assert.match(_wheel, /onAdjustSessionStart/);
assert.match(_wheel, /onAdjustSessionEnd/);

const _shellArgs = fs.readFileSync(
  path.join(_root, 'src/filmLab/buildFilmLabShellContainerBundleArgs.js'),
  'utf8'
);
assert.match(_shellArgs, /saveUndo:\s*s\.saveUndo/);
assert.match(_shellArgs, /setIsAdjusting:\s*s\.setIsAdjusting/);
assert.match(_shellArgs, /setInteractionKind:\s*s\.setInteractionKind/);
assert.match(_shellArgs, /handleSliderEnd:\s*s\.handleSliderEnd/);

const _shellProp = fs.readFileSync(path.join(_root, 'src/filmLab/buildFilmLabShellPropBundle.js'), 'utf8');
assert.match(_shellProp, /saveUndo:\s*ctx\.saveUndo/);
assert.match(_shellProp, /handleSliderEnd:\s*ctx\.handleSliderEnd/);
assert.match(_shellProp, /buildFilmLabRightPanelProps\(/);

const _rightPanel = fs.readFileSync(path.join(_root, 'src/FilmLabRightPanel.jsx'), 'utf8');
assert.match(_rightPanel, /useFilmLabColorGradeWheelAdjustSession/);
assert.match(_rightPanel, /saveUndo,[\s\n]*setIsAdjusting,[\s\n]*setInteractionKind,[\s\n]*handleSliderEnd/s);

const _shellBuilder = fs.readFileSync(path.join(_root, 'src/filmLab/shellPropBuilders.js'), 'utf8');
assert.match(
  _shellBuilder,
  /export function buildFilmLabRightPanelProps\(\{[^}]*saveUndo,[\s\S]*handleSliderEnd/s
);

const _globalKeydown = fs.readFileSync(
  path.join(_root, 'src/filmLab/useFilmLabGlobalKeydown.js'),
  'utf8'
);
assert.match(_globalKeydown, /markFilmLabE2eKeyboardE2eIntent/);
assert.match(_globalKeydown, /oneToOneZoom/);
assert.match(_globalKeydown, /handleToolbarUndo/);
assert.match(_globalKeydown, /undoStackRef/);
assert.match(_globalKeydown, /modLower === 'y'/);

const _clipboard = fs.readFileSync(
  path.join(_root, 'src/filmLab/useFilmLabClipboardShortcuts.js'),
  'utf8'
);
assert.match(_clipboard, /markFilmLabE2eKeyboardE2eIntent/);
assert.match(_clipboard, /pasteFromClipboard/);

assert.equal(computePreviewE2ePointerToPresentMs(false), null);

markFilmLabE2ePointerDown();
const t = computePreviewE2ePointerToPresentMs(true);
assert.ok(typeof t === 'number' && t >= 0 && t < 5000, `expected small ms, got ${t}`);

assert.equal(computePreviewE2ePointerToPresentMs(false), null);

setFilmLabE2ePointerAuxSession(true);
assert.equal(getFilmLabE2ePointerAuxSession(), true);
const t2 = computePreviewE2ePointerToPresentMs(true);
assert.ok(typeof t2 === 'number' && t2 >= t);

setFilmLabE2ePointerAuxSession(false);
clearFilmLabE2ePointerMark();
assert.equal(getFilmLabE2ePointerAuxSession(), false);
assert.equal(computePreviewE2ePointerToPresentMs(true), null);

markFilmLabE2eKeyboardE2eIntent();
assert.equal(getFilmLabE2eKeyboardSession(), true);
markFilmLabE2ePointerDown();
assert.equal(getFilmLabE2eKeyboardSession(), false);

markFilmLabE2eKeyboardE2eIntent();
const tk = computePreviewE2ePointerToPresentMs(true);
assert.ok(typeof tk === 'number' && tk >= 0);
clearFilmLabE2ePointerMark();
assert.equal(getFilmLabE2eKeyboardSession(), false);

console.log('PASS preview-e2e-pointer-mark');
