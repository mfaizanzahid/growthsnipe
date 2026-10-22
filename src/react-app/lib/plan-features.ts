/**
 * Plan feature bullets are data: the `features` column holds one
 * comma-separated list per plan (single source of truth for the pricing page
 * and the billing subscribe picker). Individual features must not contain
 * commas — split here is a plain comma split.
 */
export function parsePlanFeatures(features: string | null | undefined): string[] {
  if (!features) return [];
  return features
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}
