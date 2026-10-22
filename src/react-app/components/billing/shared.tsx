import { toast } from "sonner";
import { formatMoney } from "../../lib/money";

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json()) as { error?: string } & Record<string, unknown>;
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export interface BulkResult {
  ok: number;
  failed: Array<{ label: string; error: string }>;
}

/** Run bulk operations sequentially, collecting per-row outcomes. */
export async function runBulk<T>(
  items: T[],
  label: (item: T) => string,
  fn: (item: T) => Promise<void>,
): Promise<BulkResult> {
  let ok = 0;
  const failed: BulkResult["failed"] = [];
  for (const item of items) {
    try {
      await fn(item);
      ok += 1;
    } catch (err) {
      failed.push({ label: label(item), error: err instanceof Error ? err.message : "Failed" });
    }
  }
  return { ok, failed };
}

export function toastBulk(action: string, result: BulkResult): void {
  if (result.failed.length === 0) {
    toast.success(`${action}: ${result.ok} succeeded`);
  } else {
    toast.error(
      `${action}: ${result.ok} succeeded, ${result.failed.length} failed — ${result.failed[0]?.error}`,
      { duration: 6000 },
    );
  }
}

export { formatMoney };
