import { useEffect, useState } from "react";

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Fired after any mutation that changes what a workspace is entitled to
 * (subscribe, invoice paid, plan change, cancel). The app-shell trial notice
 * and the access gate read server state in effects keyed on the active org, so
 * without this signal they keep showing a stale trial banner / lock overlay
 * until the user hard-refreshes.
 */
export function notifyBillingChanged(): void {
  for (const fn of [...listeners]) fn();
}

/** Increments whenever billing state changes; use it as an effect dependency. */
export function useBillingRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const fn = () => setRevision((r) => r + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return revision;
}