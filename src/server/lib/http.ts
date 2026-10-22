import type { Context } from "hono";

export function jsonError(c: Context, status: 400 | 401 | 403 | 404 | 409 | 422 | 500, message: string) {
  return c.json({ error: message }, status);
}

export function amountToMinorUnits(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Invalid amount");
  }
  return Math.round(amount * 100);
}

/**
 * Convert a decimal amount (number or numeric string, e.g. `"199.99"`)
 * to integer minor units (USD cents). Used at the provider boundary so no
 * gateway call ever carries a decimal money value.
 */
export function decimalToMinorUnits(amount: unknown): number {
  if (typeof amount === "string" && amount.trim() === "") {
    throw new Error("Invalid amount");
  }
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Invalid amount");
  }
  return Math.round(n * 100);
}
