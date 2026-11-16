import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

function readStored<T>(key: string, initial: T, validate?: (value: unknown) => value is T): T {
  if (typeof window === "undefined") return initial;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as unknown;
    if (!validate) return parsed as T;
    return validate(parsed) ? parsed : initial;
  } catch {
    return initial;
  }
}

/**
 * State backed by localStorage. Falls back to in-memory state when storage is
 * unavailable or blocked. Pass an optional validator to reject stale values.
 */
export function usePersistentState<T>(
  key: string | undefined,
  initial: T,
  validate?: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() =>
    key ? readStored(key, initial, validate) : initial,
  );

  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // Storage can be blocked; keep the in-memory value.
    }
  }, [key, state]);

  return [state, setState];
}
