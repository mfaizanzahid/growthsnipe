import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { DiagnosticFacts, DiagnosticNarrative } from "./types";

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const HEADER_Y = PAGE_H - 52;
const CONTENT_TOP = PAGE_H - 92;
const CONTENT_BOTTOM = 64;

const INK = rgb(0.09, 0.1, 0.13);
const MUTED = rgb(0.42, 0.45, 0.5);
const BORDER = rgb(0.88, 0.9, 0.93);
const SOFT = rgb(0.965, 0.975, 0.99);
const PRIMARY = rgb(0.024, 0.412, 1);
const PRIMARY_SOFT = rgb(0.9, 0.94, 1);
const WHITE = rgb(1, 1, 1);
const GOOD = rgb(0.09, 0.58, 0.34);
const WARN = rgb(0.84, 0.55, 0.1);
const DANGER = rgb(0.83, 0.22, 0.24);

function money(minor: number | null, currency: string): string {
  if (minor === null) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

function pct(value: number | null): string {
  return value === null ? "n/a" : `${value}%`;
}

function compactMoney(minor: number, currency: string): string {
  const value = minor / 100;
  if (value >= 1_000_000) return `${currency === "USD" ? "$" : ""}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${currency === "USD" ? "$" : ""}${Math.round(value / 1_000)}k`;
  return `${currency === "USD" ? "$" : ""}${Math.round(value)}`;
}

const PRODUCT_LABELS: Record<string, string> = {
  DIY: "DIY",
  "SNIPE Loops": "SNIPE Loops™",
  "SNIPE Blueprint": "SNIPE Blueprint™",
  "SNIPE Engine Core": "SNIPE Engine™ Core",
  "SNIPE Engine Command": "SNIPE Engine™ Command",
};

function displayProduct(name: string): string {
  return PRODUCT_LABELS[name] ?? name;
}

function sanitize(value: string): string {
  return value
    .replace(/\u2014|\u2013/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...");
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function shortDate(iso: string | null): string {
  if (!iso) return "n/a";
  return iso.slice(0, 10);
}

function severityColor(severity: string): RGB {
  if (severity === "critical" || severity === "high") return DANGER;
  if (severity === "medium") return WARN;
  return GOOD;
}

function statusColor(status: string): RGB {
  if (status === "strength") return GOOD;
  if (status === "watch") return WARN;
  if (status === "leak") return DANGER;
  return MUTED;
}

class Report {
  readonly doc: PDFDocument;
  readonly font: PDFFont;
  readonly bold: PDFFont;
  private page!: PDFPage;
  private pageNo = 0;
  private y = CONTENT_TOP;

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
  }

  start(): this {
    this.newPage();
    return this;
  }

  get currentPage(): PDFPage {
    return this.page;
  }

  get cursor(): number {
    return this.y;
  }

  private chrome(): void {
    this.page.drawText("SNIPE Diagnostic™", {
      x: MARGIN,
      y: HEADER_Y,
      size: 8,
      font: this.bold,
      color: MUTED,
    });
    this.page.drawText("Confidential", {
      x: PAGE_W - MARGIN - 54,
      y: HEADER_Y,
      size: 8,
      font: this.font,
      color: MUTED,
    });
    this.page.drawLine({
      start: { x: MARGIN, y: HEADER_Y - 8 },
      end: { x: PAGE_W - MARGIN, y: HEADER_Y - 8 },
      thickness: 0.6,
      color: BORDER,
    });
    this.page.drawLine({
      start: { x: MARGIN, y: 44 },
      end: { x: PAGE_W - MARGIN, y: 44 },
      thickness: 0.6,
      color: BORDER,
    });
    this.page.drawText(`Page ${this.pageNo}`, {
      x: PAGE_W - MARGIN - 40,
      y: 32,
      size: 8,
      font: this.font,
      color: MUTED,
    });
    this.page.drawText("GrowthSnipe", {
      x: MARGIN,
      y: 32,
      size: 8,
      font: this.font,
      color: MUTED,
    });
  }

  newPage(chrome = true): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pageNo += 1;
    this.y = CONTENT_TOP;
    if (chrome) this.chrome();
  }

  ensure(height: number): void {
    if (this.y - height < CONTENT_BOTTOM) this.newPage();
  }

  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const clean = sanitize(text).replace(/\s+/g, " ").trim();
    if (clean === "") return [""];
    const words = clean.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line !== "") lines.push(line);
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          let chunk = "";
          for (const char of word) {
            if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
              lines.push(chunk);
              chunk = char;
            } else {
              chunk += char;
            }
          }
          line = chunk;
        } else {
          line = word;
        }
      }
    }
    if (line !== "") lines.push(line);
    return lines;
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: RGB; x?: number; width?: number; leading?: number } = {}): void {
    const size = opts.size ?? 10.5;
    const font = opts.bold ? this.bold : this.font;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? CONTENT_W - (x - MARGIN);
    const leading = opts.leading ?? size * 1.45;
    const lines = this.wrap(text, font, size, width);
    this.ensure(lines.length * leading + 6);
    for (const line of lines) {
      this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ?? INK });
      this.y -= leading;
    }
    this.y -= 2;
  }

  /** Vertical space a `text` call will consume, used to keep blocks together. */
  measure(text: string, opts: { size?: number; bold?: boolean; x?: number; width?: number; leading?: number } = {}): number {
    const size = opts.size ?? 10.5;
    const font = opts.bold ? this.bold : this.font;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? CONTENT_W - (x - MARGIN);
    const leading = opts.leading ?? size * 1.45;
    return this.wrap(text, font, size, width).length * leading + 6;
  }

  heading(text: string, opts: { size?: number; kicker?: string } = {}): void {
    this.ensure(60);
    if (opts.kicker) {
      this.page.drawText(sanitize(opts.kicker).toUpperCase(), {
        x: MARGIN,
        y: this.y,
        size: 7.5,
        font: this.bold,
        color: PRIMARY,
      });
      this.y -= 24;
    }
    const size = opts.size ?? 20;
    for (const line of this.wrap(text, this.bold, size, CONTENT_W)) {
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font: this.bold, color: INK });
      this.y -= size + 4;
    }
    this.y -= 6;
  }

  subheading(text: string): void {
    this.ensure(34);
    this.y -= 4;
    this.page.drawText(sanitize(text), { x: MARGIN, y: this.y, size: 11.5, font: this.bold, color: INK });
    this.y -= 18;
  }

  divider(): void {
    this.ensure(14);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.7,
      color: BORDER,
    });
    this.y -= 14;
  }

  bullets(items: string[]): void {
    for (const item of items) {
      this.ensure(20);
      this.page.drawCircle({ x: MARGIN + 3, y: this.y + 3, size: 1.6, color: PRIMARY });
      this.text(item, { x: MARGIN + 14, size: 10 });
      this.y -= 2;
    }
    this.y -= 4;
  }

  kpiRow(items: Array<{ label: string; value: string; sub?: string }>): void {
    const gap = 10;
    const cardW = (CONTENT_W - gap * (items.length - 1)) / items.length;
    const cardH = 66;
    this.ensure(cardH + 16);
    const top = this.y;
    items.forEach((item, index) => {
      const x = MARGIN + index * (cardW + gap);
      this.page.drawRectangle({
        x,
        y: top - cardH,
        width: cardW,
        height: cardH,
        color: index === 0 ? PRIMARY : SOFT,
        borderColor: index === 0 ? PRIMARY : BORDER,
        borderWidth: 0.7,
      });
      const labelColor = index === 0 ? WHITE : MUTED;
      const valueColor = index === 0 ? WHITE : INK;
      this.page.drawText(sanitize(item.label).toUpperCase(), {
        x: x + 10,
        y: top - 18,
        size: 6.8,
        font: this.bold,
        color: labelColor,
      });
      this.page.drawText(sanitize(item.value), {
        x: x + 10,
        y: top - 40,
        size: 17,
        font: this.bold,
        color: valueColor,
      });
      if (item.sub) {
        this.page.drawText(this.fit(item.sub, this.font, 7, cardW - 20), {
          x: x + 10,
          y: top - 54,
          size: 7,
          font: this.font,
          color: labelColor,
        });
      }
    });
    this.y = top - cardH - 16;
  }

  private fit(text: string, font: PDFFont, size: number, width: number): string {
    const clean = sanitize(text);
    if (font.widthOfTextAtSize(clean, size) <= width) return clean;
    let out = clean;
    while (out.length > 0 && font.widthOfTextAtSize(`${out}...`, size) > width) {
      out = out.slice(0, -1);
    }
    return `${out}...`;
  }

  table(headers: string[], rows: string[][], widths: number[]): void {
    const rowH = 18;
    const total = widths.reduce((s, w) => s + w, 0);
    const cols = widths.map((w) => (w / total) * CONTENT_W);
    this.ensure(rowH * Math.min(rows.length + 1, 6) + 8);
    const drawHeader = () => {
      const top = this.y;
      this.page.drawRectangle({ x: MARGIN, y: top - rowH, width: CONTENT_W, height: rowH, color: SOFT });
      let x = MARGIN + 6;
      headers.forEach((header, i) => {
        this.page.drawText(this.fit(header, this.bold, 7.5, cols[i]! - 10), {
          x,
          y: top - 12,
          size: 7.5,
          font: this.bold,
          color: MUTED,
        });
        x += cols[i]!;
      });
      this.y = top - rowH;
    };
    drawHeader();
    for (const row of rows) {
      if (this.y - rowH < CONTENT_BOTTOM) {
        this.newPage();
        drawHeader();
      }
      const top = this.y;
      let x = MARGIN + 6;
      row.forEach((cell, i) => {
        this.page.drawText(this.fit(cell, i === 0 ? this.bold : this.font, 8.5, cols[i]! - 10), {
          x,
          y: top - 12,
          size: 8.5,
          font: i === 0 ? this.bold : this.font,
          color: INK,
        });
        x += cols[i]!;
      });
      this.page.drawLine({
        start: { x: MARGIN, y: top - rowH },
        end: { x: PAGE_W - MARGIN, y: top - rowH },
        thickness: 0.5,
        color: BORDER,
      });
      this.y = top - rowH;
    }
    this.y -= 12;
  }

  scoreBars(entries: DiagnosticFacts["scorecard"]): void {
    const rowH = 26;
    for (const entry of entries) {
      this.ensure(rowH);
      const top = this.y;
      this.page.drawText(this.fit(entry.label, this.font, 9, 130), {
        x: MARGIN,
        y: top - 12,
        size: 9,
        font: this.font,
        color: INK,
      });
      const barX = MARGIN + 140;
      const barW = CONTENT_W - 200;
      this.page.drawRectangle({ x: barX, y: top - 11, width: barW, height: 8, color: SOFT, borderColor: BORDER, borderWidth: 0.5 });
      const fill = Math.max(0, Math.min(1, entry.score / 100));
      if (fill > 0) {
        this.page.drawRectangle({ x: barX, y: top - 11, width: barW * fill, height: 8, color: statusColor(entry.status) });
      }
      this.page.drawText(entry.status === "unknown" ? "n/a" : `${entry.score}`, {
        x: barX + barW + 8,
        y: top - 12,
        size: 9,
        font: this.bold,
        color: MUTED,
      });
      this.y = top - rowH;
    }
    this.y -= 6;
  }

  barChart(points: Array<{ label: string; value: number }>, currency: string): void {
    const height = 150;
    const labelSpace = 18;
    this.ensure(height + 40);
    const baseline = this.y - height;
    const chartLeft = MARGIN;
    const chartW = CONTENT_W;
    const max = Math.max(1, ...points.map((p) => p.value));
    const n = Math.max(1, points.length);
    const step = chartW / n;
    const barW = Math.min(26, step * 0.55);
    this.page.drawLine({
      start: { x: chartLeft, y: baseline },
      end: { x: chartLeft + chartW, y: baseline },
      thickness: 0.7,
      color: BORDER,
    });
    const tops: Array<{ x: number; y: number }> = [];
    points.forEach((point, index) => {
      const usable = height - labelSpace;
      const barH = Math.max(1, (point.value / max) * usable);
      const x = chartLeft + index * step + (step - barW) / 2;
      this.page.drawRectangle({
        x,
        y: baseline,
        width: barW,
        height: barH,
        color: PRIMARY,
        opacity: 0.22,
      });
      this.page.drawRectangle({
        x,
        y: baseline + barH - 3,
        width: barW,
        height: 3,
        color: PRIMARY,
      });
      tops.push({ x: x + barW / 2, y: baseline + barH });
      const valueLabel = compactMoney(point.value, currency);
      const valueWidth = this.font.widthOfTextAtSize(valueLabel, 5.5);
      if (step > 24) {
        this.page.drawText(valueLabel, {
          x: x + (barW - valueWidth) / 2,
          y: baseline + barH + 4,
          size: 5.5,
          font: this.font,
          color: MUTED,
        });
      }
      this.page.drawText(this.fit(point.label, this.font, 6.5, step - 2), {
        x: chartLeft + index * step + 1,
        y: baseline - 11,
        size: 6.5,
        font: this.font,
        color: MUTED,
      });
    });
    for (let i = 1; i < tops.length; i += 1) {
      this.page.drawLine({
        start: tops[i - 1]!,
        end: tops[i]!,
        thickness: 1.6,
        color: PRIMARY,
      });
    }
    this.page.drawText(this.fit(money(max, currency), this.font, 7, 90), {
      x: chartLeft,
      y: this.y - 9,
      size: 7,
      font: this.font,
      color: MUTED,
    });
    this.y = baseline - 26;
  }

  kvGrid(items: Array<{ label: string; value: string }>, perRow = 3): void {
    const gap = 10;
    const colW = (CONTENT_W - gap * (perRow - 1)) / perRow;
    for (let i = 0; i < items.length; i += perRow) {
      const slice = items.slice(i, i + perRow);
      const rowH = 46;
      this.ensure(rowH + 8);
      const top = this.y;
      slice.forEach((item, index) => {
        const x = MARGIN + index * (colW + gap);
        this.page.drawRectangle({ x, y: top - rowH, width: colW, height: rowH, color: SOFT, borderColor: BORDER, borderWidth: 0.5 });
        this.page.drawText(this.fit(item.label.toUpperCase(), this.bold, 6.5, colW - 16), {
          x: x + 8,
          y: top - 14,
          size: 6.5,
          font: this.bold,
          color: MUTED,
        });
        this.page.drawText(this.fit(item.value, this.bold, 13, colW - 16), {
          x: x + 8,
          y: top - 33,
          size: 13,
          font: this.bold,
          color: INK,
        });
      });
      this.y = top - rowH - 8;
    }
  }

  callout(text: string, tone: "info" | "warn" = "info"): void {
    const lines = this.wrap(text, this.font, 9.5, CONTENT_W - 24);
    const height = lines.length * 14 + 18;
    this.ensure(height + 8);
    const top = this.y;
    this.page.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: CONTENT_W,
      height,
      color: tone === "warn" ? rgb(1, 0.97, 0.9) : PRIMARY_SOFT,
      borderColor: tone === "warn" ? WARN : PRIMARY,
      borderWidth: 0.6,
    });
    let yy = top - 14;
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + 12, y: yy, size: 9.5, font: this.font, color: INK });
      yy -= 14;
    }
    this.y = top - height - 10;
  }

  space(amount: number): void {
    this.y -= amount;
  }
}

export async function renderDiagnosticPdf(
  facts: DiagnosticFacts,
  narrative: DiagnosticNarrative,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const report = new Report(doc, font, bold);
  const currency = facts.meta.currency;
  const leakById = new Map(facts.leaks.map((leak) => [leak.id, leak]));

  // Cover
  report.start();
  const cover = report.currentPage;
  cover.drawRectangle({ x: 0, y: PAGE_H - 220, width: PAGE_W, height: 220, color: PRIMARY });
  cover.drawText("GrowthSnipe", { x: MARGIN, y: PAGE_H - 70, size: 13, font: bold, color: WHITE });
  cover.drawText("SNIPE Diagnostic™", { x: MARGIN, y: PAGE_H - 130, size: 34, font: bold, color: WHITE });
  cover.drawText("12-month performance review", { x: MARGIN, y: PAGE_H - 160, size: 14, font, color: rgb(0.85, 0.92, 1) });
  cover.drawText(sanitize(facts.meta.businessName ?? "Business review"), { x: MARGIN, y: PAGE_H - 280, size: 22, font: bold, color: INK });
  cover.drawText(sanitize(facts.meta.trade ?? "Home services"), { x: MARGIN, y: PAGE_H - 304, size: 11, font, color: MUTED });
  cover.drawText(`${facts.meta.provider === "isn" ? "ISN" : "Spectora"} data`, { x: MARGIN, y: PAGE_H - 330, size: 10, font, color: MUTED });
  cover.drawText(facts.meta.periodLabel, { x: MARGIN, y: PAGE_H - 348, size: 10, font, color: MUTED });
  cover.drawText(`Prepared ${facts.meta.generatedAt.slice(0, 10)}`, { x: MARGIN, y: PAGE_H - 366, size: 10, font, color: MUTED });
  cover.drawLine({ start: { x: MARGIN, y: 120 }, end: { x: PAGE_W - MARGIN, y: 120 }, thickness: 0.7, color: BORDER });
  cover.drawText("Confidential. Prepared for the named business.", { x: MARGIN, y: 100, size: 9, font, color: MUTED });

  // Executive summary
  report.newPage();
  report.heading(narrative.snapshot.headline, { kicker: "Executive summary" });
  report.text(narrative.snapshot.summary, { size: 11 });
  report.space(4);
  for (const paragraph of narrative.executiveSummary.paragraphs) {
    report.text(paragraph, { size: 10.5 });
  }
  report.subheading("Top findings");
  for (const finding of narrative.executiveSummary.topFindings) {
    report.ensure(40);
    report.text(finding.title, { bold: true, size: 10.5 });
    report.text(finding.oneLine, { size: 9.5, color: MUTED });
    report.space(2);
  }

  // Snapshot and scorecard
  report.newPage();
  report.heading("Diagnostic snapshot", { kicker: "Where the business stands" });
  report.text(narrative.snapshot.scoreRationale, { size: 10, color: MUTED });
  report.space(4);
  report.scoreBars(facts.scorecard);
  report.subheading("Scorecard notes");
  for (const note of narrative.scorecardNotes) {
    const entry = facts.scorecard.find((s) => s.dimension === note.dimension);
    report.text(`${entry?.label ?? note.dimension}: ${note.note}`, { size: 9.5 });
  }

  // Baseline dashboard
  report.newPage();
  report.heading("Baseline dashboard", { kicker: "The last 12 months" });
  report.kpiRow([
    { label: "Completed revenue", value: money(facts.baseline.revenueMinor, currency) },
    { label: "Completed jobs", value: `${facts.baseline.completed}` },
    { label: "Average ticket", value: money(facts.baseline.avgTicketMinor, currency) },
    { label: "Cancellation rate", value: pct(facts.baseline.cancelRatePct) },
  ]);
  report.kpiRow([
    { label: "Jobs per week", value: facts.baseline.jobsPerWeek === null ? "n/a" : `${facts.baseline.jobsPerWeek}` },
    { label: "Active months", value: `${facts.baseline.activeMonths} of ${facts.trend.monthly.length}` },
    { label: "Active partners", value: `${facts.referrals.activeAgentCount}` },
    { label: "Add-on attach", value: pct(facts.services.addOnAttachPct) },
  ]);
  report.subheading("What this means");
  report.text(
    `${facts.baseline.jobs} jobs were booked and ${facts.baseline.completed} were completed, producing ${money(facts.baseline.revenueMinor, currency)} at an average ticket of ${money(facts.baseline.avgTicketMinor, currency)}. ${facts.baseline.cancelled} jobs were cancelled.`,
    { size: 10.5 },
  );

  // Revenue trend
  report.newPage();
  report.heading("Revenue trend", { kicker: "Seasonality and momentum" });
  report.barChart(facts.trend.monthly.map((m) => ({ label: monthLabel(m.month), value: m.revenueMinor })), currency);
  report.kvGrid(
    [
      { label: "Best month", value: facts.trend.bestMonth ?? "n/a" },
      { label: "Quietest month", value: facts.trend.worstMonth ?? "n/a" },
      {
        label: "Seasonality",
        value: facts.trend.seasonalityIndex === null ? "n/a" : `${facts.trend.seasonalityIndex}% range`,
      },
    ],
    3,
  );
  if (facts.trend.yoy.length > 1) {
    report.subheading("Year over year");
    report.table(
      ["Year", "Revenue", "Growth"],
      facts.trend.yoy.map((row) => [String(row.year), money(row.revenueMinor, currency), row.growthPct === null ? "n/a" : `${row.growthPct}%`]),
      [1, 1.4, 1],
    );
  }

  // Referral performance
  report.newPage();
  report.heading("Referral performance", { kicker: "Demand and partnership" });
  report.text(
    `${facts.referrals.activeAgentCount} referring partners produced jobs in the period. Your largest partner accounts for ${pct(facts.referrals.topAgents[0]?.sharePct ?? null)} of referred jobs.`,
    { size: 10 },
  );
  report.subheading("Top referring agents");
  report.table(
    ["Agent", "Jobs", "Revenue", "Share", "Status"],
    facts.referrals.topAgents.map((a) => [a.name, `${a.jobs}`, money(a.revenueMinor, currency), `${a.sharePct}%`, a.status]),
    [2.2, 0.6, 1.1, 0.7, 0.9],
  );
  if (facts.referrals.topAgencies.length > 0) {
    report.subheading("Top agencies");
    report.table(
      ["Agency", "Jobs", "Revenue", "Share"],
      facts.referrals.topAgencies.map((a) => [a.name, `${a.jobs}`, money(a.revenueMinor, currency), `${a.sharePct}%`]),
      [2.4, 0.7, 1.2, 0.7],
    );
  }
  report.kvGrid(
    [
      { label: "Repeat referrer share", value: pct(facts.referrals.repeatAgentSharePct) },
      { label: "Concentration index", value: facts.referrals.concentrationIndex === null ? "n/a" : `${facts.referrals.concentrationIndex}` },
      { label: "Dormant partners", value: `${facts.referrals.droppedAgents.length}` },
    ],
    3,
  );
  if (facts.referrals.newAgents.length > 0) {
    report.subheading("New partners in the last 90 days");
    report.bullets(facts.referrals.newAgents.map((a) => `${a.name}: ${a.jobs} jobs, ${money(a.revenueMinor, currency)}`));
  }

  // Cancellations and loss
  report.newPage();
  report.heading("Cancellations and loss", { kicker: "Booked work that did not happen" });
  report.kpiRow([
    { label: "Cancellations", value: `${facts.baseline.cancelled}` },
    { label: "Cancellation rate", value: pct(facts.baseline.cancelRatePct) },
    { label: "Open jobs", value: `${facts.baseline.open}` },
  ]);
  const cancelLeaks = facts.leaks.filter((leak) => leak.category === "cancellation" || leak.category === "booking");
  if (cancelLeaks.length === 0) {
    report.text("No material cancellation finding was produced from the available records.", { size: 10 });
  }
  for (const leak of cancelLeaks) {
    report.subheading(leak.title);
    report.bullets(leak.evidence.map((e) => `${e.value}`));
    if (leak.exposure) {
      report.text(`Estimated range: ${money(leak.exposure.lowMinor, currency)} to ${money(leak.exposure.highMinor, currency)}.`, { bold: true, size: 10.5 });
      report.text(`Assumption: ${leak.exposure.assumptions.join(" ")}`, { size: 9, color: MUTED });
    }
  }

  // Job value and job penetration
  report.newPage();
  report.heading("Job value and job penetration", { kicker: "Ticket architecture" });
  report.kpiRow([
    { label: "Median ticket", value: money(facts.ticket.distributionMinor.p50, currency) },
    { label: "Top quartile", value: money(facts.ticket.distributionMinor.p75, currency) },
    { label: "Top decile", value: money(facts.ticket.distributionMinor.p90, currency) },
    { label: "Add-on attach", value: pct(facts.services.addOnAttachPct) },
  ]);
  report.subheading("Job penetration");
  report.text(
    "Job penetration is the share of reviewed jobs that included each service or add-on.",
    { size: 9, color: MUTED },
  );
  report.table(
    ["Service", "Jobs", "% of jobs"],
    facts.services.mix.map((s) => [s.name, `${s.jobs}`, `${s.penetrationPct}%`]),
    [3.2, 0.8, 1],
  );
  report.text(`Average services per job: ${facts.services.avgServicesPerJob === null ? "n/a" : facts.services.avgServicesPerJob}.`, { size: 10 });
  const ticketLeaks = facts.leaks.filter((leak) => leak.category === "ticket");
  for (const leak of ticketLeaks) {
    report.subheading(leak.title);
    report.bullets(leak.evidence.map((e) => e.value));
    if (leak.exposure) {
      report.text(`Estimated range: ${money(leak.exposure.lowMinor, currency)} to ${money(leak.exposure.highMinor, currency)}.`, { bold: true, size: 10.5 });
      report.text(`Assumption: ${leak.exposure.assumptions.join(" ")}`, { size: 9, color: MUTED });
    }
  }

  // Repeat and retention
  report.newPage();
  report.heading("Repeat and retention", { kicker: "Revenue that comes back" });
  report.kpiRow([
    { label: "Repeat client share", value: pct(facts.clients.repeatClientSharePct) },
    { label: "Jobs per client", value: facts.clients.avgJobsPerClient === null ? "n/a" : `${facts.clients.avgJobsPerClient}` },
    { label: "Repeat referrer share", value: pct(facts.referrals.repeatAgentSharePct) },
    { label: "Client match rate", value: pct(facts.clients.identityCoveragePct) },
  ]);
  if (facts.referrals.droppedAgents.length > 0) {
    report.subheading("Partners who have gone quiet");
    report.table(
      ["Partner", "Jobs", "Revenue", "Last job"],
      facts.referrals.droppedAgents.map((a) => [a.name, `${a.jobs}`, money(a.revenueMinor, currency), shortDate(a.lastSeen)]),
      [2.4, 0.7, 1.2, 1],
    );
  }
  const repeatLeaks = facts.leaks.filter((leak) => leak.category === "repeat" || leak.category === "referral");
  for (const leak of repeatLeaks) {
    report.subheading(leak.title);
    report.bullets(leak.evidence.map((e) => e.value));
  }

  // Capacity and team
  report.newPage();
  report.heading("Capacity and team", { kicker: "Throughput" });
  const avgUtilization =
    facts.team.inspectors.length > 0
      ? facts.team.inspectors.reduce((sum, i) => sum + (i.utilizationPct ?? 0), 0) / facts.team.inspectors.length
      : null;
  report.kpiRow([
    { label: "Inspectors", value: `${facts.team.inspectorCount}` },
    { label: "Team job share", value: pct(facts.team.teamJobSharePct) },
    { label: "Avg utilization", value: avgUtilization === null ? "n/a" : `${Math.round(avgUtilization)}%` },
  ]);
  if (facts.team.inspectors.length > 0) {
    report.subheading("Inspector throughput");
    report.table(
      ["Inspector", "Jobs", "Revenue", "Avg ticket", "Utilization"],
      facts.team.inspectors.map((i) => [
        i.name,
        `${i.jobs}`,
        money(i.revenueMinor, currency),
        money(i.avgTicketMinor, currency),
        i.utilizationPct === null ? "n/a" : `${i.utilizationPct}%`,
      ]),
      [2, 0.6, 1.2, 1.1, 1],
    );
    report.text("Utilization is measured against a two-job-per-day baseline and is directional, not a target.", { size: 8.5, color: MUTED });
  }

  // Leak map
  report.newPage();
  report.heading("Leak map", { kicker: "Where the growth leaks out" });
  const ordered = [...narrative.leakNarratives].sort((a, b) => a.priorityRank - b.priorityRank);
  for (const item of ordered) {
    const leak = leakById.get(item.leakId);
    if (!leak) continue;
    const meta = `${item.severity.toUpperCase()} severity, ${item.confidence} confidence, ${item.effort} effort`;
    const evidenceHeight =
      leak.evidence.reduce(
        (sum, evidence) => sum + report.measure(evidence.value, { size: 10, x: MARGIN + 14 }) + 2,
        0,
      ) + 4;
    const exposureText = leak.exposure
      ? `Estimated range: ${money(leak.exposure.lowMinor, currency)} to ${money(leak.exposure.highMinor, currency)}.`
      : "";
    const assumptionText = leak.exposure ? `Assumption: ${leak.exposure.assumptions.join(" ")}` : "";
    const exposureHeight = leak.exposure
      ? report.measure(exposureText, { bold: true, size: 10, x: MARGIN + 12 }) +
        report.measure(assumptionText, { size: 8.5, x: MARGIN + 12 })
      : 0;
    const blockHeight =
      report.measure(item.title, { bold: true, size: 11.5, x: MARGIN + 12 }) +
      report.measure(meta, { size: 8, x: MARGIN + 12 }) +
      evidenceHeight +
      exposureHeight +
      report.measure(item.consequence, { size: 9.5, x: MARGIN + 12 }) +
      14;

    // Keep the whole section on one page, then draw the severity bar to the
    // section's actual vertical bounds instead of a fixed height.
    report.ensure(blockHeight);
    const startPage = report.currentPage;
    const startY = report.cursor;

    report.text(item.title, { bold: true, size: 11.5, x: MARGIN + 12 });
    report.text(meta, { size: 8, color: MUTED, x: MARGIN + 12 });
    report.bullets(leak.evidence.map((e) => e.value));
    if (leak.exposure) {
      report.text(exposureText, { bold: true, size: 10, x: MARGIN + 12 });
      report.text(assumptionText, { size: 8.5, color: MUTED, x: MARGIN + 12 });
    }
    report.text(item.consequence, { size: 9.5, x: MARGIN + 12 });

    const blockTop = startY + 8;
    const blockBottom = report.cursor;
    const barColor = severityColor(item.severity);
    if (report.currentPage === startPage) {
      startPage.drawRectangle({
        x: MARGIN,
        y: blockBottom,
        width: 3,
        height: Math.max(24, blockTop - blockBottom),
        color: barColor,
      });
    } else {
      // A block taller than a page: continue the bar across the break.
      const firstBottom = CONTENT_BOTTOM + 6;
      startPage.drawRectangle({
        x: MARGIN,
        y: firstBottom,
        width: 3,
        height: Math.max(24, blockTop - firstBottom),
        color: barColor,
      });
      report.currentPage.drawRectangle({
        x: MARGIN,
        y: blockBottom,
        width: 3,
        height: Math.max(24, CONTENT_TOP - blockBottom),
        color: barColor,
      });
    }

    report.divider();
  }

  // Priority findings
  report.newPage();
  report.heading("Priority findings", { kicker: "What to fix first" });
  ordered.forEach((item, index) => {
    const leak = leakById.get(item.leakId);
    report.ensure(96);
    report.text(`${index + 1}. ${item.title}`, { bold: true, size: 12 });
    report.text(`${item.consequence}`, { size: 9.5 });
    report.text(`Next action: ${item.recommendedFix}`, { size: 9.5, color: PRIMARY });
    report.text(`Effort: ${item.effort}. ${leak?.quantifiable && leak.exposure ? `Estimated range: ${money(leak.exposure.lowMinor, currency)} to ${money(leak.exposure.highMinor, currency)}.` : ""}`, {
      size: 8.5,
      color: MUTED,
    });
    report.space(6);
  });

  // Quick wins
  report.newPage();
  report.heading("Quick wins", { kicker: "Start this week" });
  narrative.quickWins.forEach((win, index) => {
    report.ensure(70);
    report.text(`${index + 1}. ${win.title}`, { bold: true, size: 11 });
    report.text(win.action, { size: 9.5 });
    report.text(`About ${win.effortHours} hours.`, { size: 8.5, color: MUTED });
    report.space(6);
  });

  // 90-day plan
  report.newPage();
  report.heading("90-day plan", { kicker: "From findings to action" });
  for (const phase of narrative.ninetyDayPlan) {
    report.ensure(110);
    report.subheading(phase.window);
    report.text(phase.focus, { bold: true, size: 10 });
    report.bullets(phase.actions);
    report.text(`Success metric: ${phase.successMetric}`, { size: 9, color: MUTED });
    report.space(4);
  }

  // Next step
  report.newPage();
  report.heading("Recommended next step", { kicker: "Keep moving" });
  report.kpiRow([{ label: "Recommendation", value: displayProduct(narrative.nextStep.recommendation) }]);
  report.text(narrative.nextStep.rationale, { size: 10.5 });
  report.space(4);
  report.callout(narrative.nextStep.creditNote);

  // Methodology
  report.newPage();
  report.heading("Methodology", { kicker: "How this report was built" });
  report.subheading("Sources");
  report.bullets(narrative.methodology.sources);
  if (narrative.methodology.assumptions.length > 0) {
    report.subheading("Assumptions");
    report.bullets(narrative.methodology.assumptions);
  }
  report.subheading("Disclaimers");
  report.bullets(narrative.methodology.disclaimers);

  // Appendix
  report.newPage();
  report.heading("Appendix", { kicker: "Data tables" });
  report.subheading("Monthly performance");
  report.table(
    ["Month", "Jobs", "Completed", "Revenue", "Avg ticket"],
    facts.trend.monthly.map((m) => [
      m.month,
      `${m.jobs}`,
      `${m.completed}`,
      money(m.revenueMinor, currency),
      money(m.avgTicketMinor, currency),
    ]),
    [1, 0.6, 0.9, 1.2, 1.1],
  );
  report.subheading("Top cities");
  if (facts.geography.topCities.length > 0) {
    report.table(
      ["City", "Jobs", "Revenue", "Share"],
      facts.geography.topCities.map((c) => [c.city, `${c.jobs}`, money(c.revenueMinor, currency), `${c.sharePct}%`]),
      [2.4, 0.7, 1.2, 0.7],
    );
  } else {
    report.text("No city data was available in the connected records.", { size: 9.5, color: MUTED });
  }

  return doc.save();
}
