import { useCallback, useRef } from 'react';
import { cloneSnapshotSafe } from './sessionSnapshot.js';

const STACK_LIMIT = 20;

export function useFilmLabUndoRedo({ captureCurrentSnapshot, restoreSnapshot, setHistoryRevision }) {
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  const saveUndo = useCallback(() => {
    const snapshot = captureCurrentSnapshot();
    if (!snapshot) {
      return;
    }
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > STACK_LIMIT) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setHistoryRevision((value) => value + 1);
  }, [captureCurrentSnapshot, setHistoryRevision]);

  const pushUndoSnapshot = useCallback((snapshot) => {
    const safeSnapshot = cloneSnapshotSafe(snapshot);
    if (!safeSnapshot) {
      return;
    }
    undoStackRef.current.push(safeSnapshot);
    if (undoStackRef.current.length > STACK_LIMIT) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    setHistoryRevision((value) => value + 1);
  }, [setHistoryRevision]);

  const undoAction = useCallback(() => {
    const previous = cloneSnapshotSafe(undoStackRef.current.pop());
    if (!previous) {
      return;
    }
    const current = captureCurrentSnapshot();
    if (current) {
      redoStackRef.current.push(current);
      if (redoStackRef.current.length > STACK_LIMIT) {
        redoStackRef.current.shift();
      }
    }
    restoreSnapshot(previous, { keepCurrentPanel: true });
    setHistoryRevision((value) => value + 1);
  }, [captureCurrentSnapshot, restoreSnapshot, setHistoryRevision]);

  const redoAction = useCallback(() => {
    const next = cloneSnapshotSafe(redoStackRef.current.pop());
    if (!next) {
      return;
    }
    const current = captureCurrentSnapshot();
    if (current) {
      undoStackRef.current.push(current);
      if (undoStackRef.current.length > STACK_LIMIT) {
        undoStackRef.current.shift();
      }
    }
    restoreSnapshot(next, { keepCurrentPanel: true });
    setHistoryRevision((value) => value + 1);
  }, [captureCurrentSnapshot, restoreSnapshot, setHistoryRevision]);

  return {
    undoStackRef,
    redoStackRef,
    saveUndo,
    pushUndoSnapshot,
    undoAction,
    redoAction,
  };
}
