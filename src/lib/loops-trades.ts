/**
 * Trade choices for the SNIPE Loops checkout and the trade-specific PDF.
 * Values must stay aligned with the H2 trade chapters in
 * docs/SNIPE_Loops_Playbook.md.
 */
export const TRADE_OPTIONS = [
  "Home inspection",
  "HVAC",
  "Plumbing",
  "Electrical",
  "Roofing",
  "General contracting",
  "Others",
] as const;

export type TradeOption = (typeof TRADE_OPTIONS)[number];

const CHAPTER_BY_TRADE: Record<string, string> = {
  "home inspection": "Home Inspection",
  "home inspector": "Home Inspection",
  "home inspectors": "Home Inspection",
  hvac: "HVAC",
  "heating and cooling": "HVAC",
  "heating, ventilation and air conditioning": "HVAC",
  plumbing: "Plumbing",
  plumber: "Plumbing",
  electrical: "Electrical",
  electrician: "Electrical",
  roofing: "Roofing",
  roofer: "Roofing",
  "general contracting": "General Contracting",
  "general contractor": "General Contracting",
  "general contractors": "General Contracting",
  contractor: "General Contracting",
  contractors: "General Contracting",
  remodeling: "General Contracting",
};

/**
 * Exact Markdown trade chapter for a stored trade, or null for the combined
 * edition. Null also covers Others, blank values and legacy unknown trades.
 */
export function loopsTradeChapter(trade: string | null | undefined): string | null {
  const key = trade?.trim().toLowerCase() ?? "";
  if (!key || key === "others" || key === "other") return null;
  return CHAPTER_BY_TRADE[key] ?? null;
}

/** Customer-facing trade label for the PDF cover. */
export function loopsTradeLabel(trade: string | null | undefined): string | null {
  const value = trade?.trim();
  if (!value) return null;
  const key = value.toLowerCase();
  if (key === "others" || key === "other") return "Home services";
  return loopsTradeChapter(value) ?? value;
}
