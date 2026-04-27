import { useEffect } from 'react';

/** After commit, assign `value` to `ref.current` (mirrors state/props into an imperative ref). */
export function useSyncStateToRef(ref, value) {
  useEffect(() => {
    ref.current = value;
  }, [ref, value]);
}

/**
 * When `value` is null or undefined, set `ref.current` to null. When value is present, does nothing
 * (for cases where the ref is updated imperatively while state is non-null).
 */
export function useClearRefWhenNullish(ref, value) {
  useEffect(() => {
    if (value == null) {
      ref.current = null;
    }
  }, [ref, value]);
}
