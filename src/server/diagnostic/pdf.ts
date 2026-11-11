import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { OFFER_CREDITS, OFFERS } from "../../lib/offers";
import type { DiagnosticFacts, DiagnosticNarrative, DiagnosticPillarCode } from "./types";

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

interface TocEntry {
  title: string;
  page: PDFPage;
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

function pillarColor(pillar: string): RGB {
  if (pillar === "N" || pillar === "S") return DANGER;
  if (pillar === "P") return WARN;
  return GOOD;
}

const SHORT_PILLAR: Record<DiagnosticPillarCode, string> = {
  S: "Size the Gap",
  N: "Net-Ticket",
  I: "Instant Capture",
  P: "Pipeline",
  E: "Expand and Evaluate",
};

function pillarForRef(ref: string): DiagnosticPillarCode | null {
  if (ref.startsWith("baseline.") || ref.startsWith("trend.")) return "S";
  if (ref.startsWith("ticket.") || ref.startsWith("services.")) return "N";
  if (ref.startsWith("referrals.") || ref.startsWith("geography.")) return "P";
  if (ref.startsWith("clients.") || ref.startsWith("team.")) return "E";
  return null;
}

function pillarForText(text: string): DiagnosticPillarCode | null {
  const value = text.toLowerCase();
  if (/referr|partner|agent|pipeline|concentration|city|geograph|source/.test(value)) return "P";
  if (/add.?on|ticket|price|package|upsell|penetration|service mix|average/.test(value)) return "N";
  if (/repeat|client|capacity|inspector|schedule|utilization|team|retention/.test(value)) return "E";
  if (/cancel|no.?show|confirm|booking|unpaid|revenue|margin/.test(value)) return "S";
  return null;
}

function findLeakForFinding(
  finding: DiagnosticNarrative["executiveSummary"]["topFindings"][number],
  leaks: DiagnosticFacts["leaks"],
): DiagnosticFacts["leaks"][number] | null {
  const words = `${finding.title} ${finding.oneLine}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
  let best: DiagnosticFacts["leaks"][number] | null = null;
  let bestScore = 0;
  for (const leak of leaks) {
    const title = leak.title.toLowerCase();
    const score = words.reduce((sum, word) => sum + (title.includes(word) ? 1 : 0), 0);
    if (score > bestScore) {
      best = leak;
      bestScore = score;
    }
  }
  if (bestScore >= 2) return best;
  return (
    leaks.find((leak) =>
      leak.evidence.some((evidence) => evidence.metricRef === finding.metricRef),
    ) ?? null
  );
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

  get pageNumber(): number {
    return this.pageNo;
  }

  private addLink(page: PDFPage, x: number, y: number, width: number, height: number, target: PDFPage): void {
    const annot = this.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: { S: "GoTo", D: [target.ref, "XYZ", 0, PAGE_H, 0] },
    });
    const ref = this.doc.context.register(annot);
    const existing = page.node.lookup(PDFName.of("Annots"), PDFArray);
    if (existing) existing.push(ref);
    else page.node.set(PDFName.of("Annots"), this.doc.context.obj([ref]));
  }

  addUrlLink(page: PDFPage, x: number, y: number, width: number, height: number, url: string): void {
    const annot = this.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + width, y + height],
      Border: [0, 0, 0],
      A: { S: "URI", URI: PDFString.of(url), NewWindow: true },
    });
    const ref = this.doc.context.register(annot);
    const existing = page.node.lookup(PDFName.of("Annots"), PDFArray);
    if (existing) existing.push(ref);
    else page.node.set(PDFName.of("Annots"), this.doc.context.obj([ref]));
  }

  linkButton(label: string, url: string, x: number, yTop: number, width: number, filled = true): void {
    const height = 36;
    this.page.drawRectangle({
      x,
      y: yTop - height,
      width,
      height,
      color: filled ? PRIMARY : WHITE,
      borderColor: PRIMARY,
      borderWidth: 1,
    });
    const color = filled ? WHITE : PRIMARY;
    const size = 11;
    const textWidth = this.bold.widthOfTextAtSize(label, size);
    this.page.drawText(label, {
      x: x + (width - textWidth) / 2,
      y: yTop - 23,
      size,
      font: this.bold,
      color,
    });
    this.addUrlLink(this.page, x, yTop - height, width, height, url);
  }

  /** Draw the contents page reserved at the front, with clickable links. */
  drawTocPage(page: PDFPage, pageNo: number, entries: TocEntry[]): void {
    page.drawText("SNIPE Diagnostic™", { x: MARGIN, y: HEADER_Y, size: 8, font: this.bold, color: MUTED });
    page.drawText("Confidential", { x: PAGE_W - MARGIN - 54, y: HEADER_Y, size: 8, font: this.font, color: MUTED });
    page.drawLine({
      start: { x: MARGIN, y: HEADER_Y - 8 },
      end: { x: PAGE_W - MARGIN, y: HEADER_Y - 8 },
      thickness: 0.6,
      color: BORDER,
    });
    page.drawLine({
      start: { x: MARGIN, y: 44 },
      end: { x: PAGE_W - MARGIN, y: 44 },
      thickness: 0.6,
      color: BORDER,
    });
    page.drawText("GrowthSnipe", { x: MARGIN, y: 32, size: 8, font: this.font, color: MUTED });
    page.drawText(`Page ${pageNo}`, { x: PAGE_W - MARGIN - 40, y: 32, size: 8, font: this.font, color: MUTED });

    page.drawText("Contents", { x: MARGIN, y: CONTENT_TOP - 8, size: 26, font: this.bold, color: INK });
    page.drawText("SNIPE Diagnostic™", {
      x: MARGIN,
      y: CONTENT_TOP - 26,
      size: 9,
      font: this.font,
      color: MUTED,
    });

    const pages = this.doc.getPages();
    let y = CONTENT_TOP - 70;
    for (const entry of entries) {
      const targetNo = pages.indexOf(entry.page) + 1;
      page.drawText(entry.title, { x: MARGIN, y, size: 11, font: this.bold, color: INK });
      const label = `${targetNo}`;
      const labelWidth = this.font.widthOfTextAtSize(label, 10);
      page.drawText(label, { x: PAGE_W - MARGIN - labelWidth, y, size: 10, font: this.font, color: MUTED });
      const titleWidth = this.bold.widthOfTextAtSize(entry.title, 11);
      const leaderStart = MARGIN + titleWidth + 8;
      const leaderEnd = PAGE_W - MARGIN - labelWidth - 8;
      for (let x = leaderStart; x < leaderEnd; x += 7) {
        page.drawCircle({ x, y: y + 3, size: 0.55, color: BORDER });
      }
      this.addLink(page, MARGIN - 4, y - 5, CONTENT_W + 8, 20, entry.page);
      y -= 26;
    }
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

  setCursor(y: number): void {
    this.y = y;
  }

  drawCard(x: number, yTop: number, width: number, height: number, accent?: RGB, fill: RGB = WHITE): void {
    this.page.drawRectangle({
      x,
      y: yTop - height,
      width,
      height,
      color: fill,
      borderColor: BORDER,
      borderWidth: 0.6,
    });
    if (accent) {
      this.page.drawRectangle({ x, y: yTop - height, width: 4, height, color: accent });
    }
  }

  chip(x: number, yBottom: number, text: string, color: RGB = MUTED, fill: RGB = SOFT): number {
    const size = 7.5;
    const padX = 5;
    const label = sanitize(text);
    const width = this.font.widthOfTextAtSize(label, size) + padX * 2;
    this.page.drawRectangle({ x, y: yBottom, width, height: 14, color: fill });
    this.page.drawText(label, { x: x + padX, y: yBottom + 4, size, font: this.font, color });
    return width;
  }

  rankBadge(cx: number, cy: number, value: number, color: RGB): void {
    this.page.drawCircle({ x: cx, y: cy, size: 8.5, color });
    const label = `${value}`;
    const width = this.bold.widthOfTextAtSize(label, 9);
    this.page.drawText(label, { x: cx - width / 2, y: cy - 3, size: 9, font: this.bold, color: WHITE });
  }

  meter(x: number, y: number, value: number, max: number, color: RGB): void {
    for (let i = 0; i < max; i += 1) {
      this.page.drawRectangle({
        x: x + i * 8,
        y,
        width: 5,
        height: 5,
        color: i < value ? color : SOFT,
        borderColor: BORDER,
        borderWidth: 0.3,
      });
    }
  }

  iconArrow(x: number, y: number, color: RGB): void {
    this.page.drawLine({ start: { x, y: y + 3 }, end: { x: x + 8, y: y + 3 }, thickness: 1.1, color });
    this.page.drawLine({ start: { x: x + 4, y: y + 6 }, end: { x: x + 8, y: y + 3 }, thickness: 1.1, color });
    this.page.drawLine({ start: { x: x + 4, y }, end: { x: x + 8, y: y + 3 }, thickness: 1.1, color });
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

  subheading(text: string, keep = 0, accent?: RGB): void {
    this.ensure(34 + keep);
    this.y -= 4;
    const x = accent ? MARGIN + 14 : MARGIN;
    if (accent) {
      this.page.drawRectangle({ x: MARGIN, y: this.y - 2, width: 4, height: 13, color: accent });
    }
    this.page.drawText(sanitize(text), { x, y: this.y, size: 11.5, font: this.bold, color: INK });
    this.y -= 18;
  }

  wrapLines(text: string, opts: { size?: number; bold?: boolean; width?: number } = {}): string[] {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const width = opts.width ?? CONTENT_W;
    return this.wrap(text, font, size, width);
  }

  drawLines(
    lines: string[],
    x: number,
    yTop: number,
    opts: { size?: number; bold?: boolean; color?: RGB; leading?: number } = {},
  ): void {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const leading = opts.leading ?? size * 1.4;
    lines.forEach((line, index) => {
      this.page.drawText(line, {
        x,
        y: yTop - index * leading,
        size,
        font,
        color: opts.color ?? INK,
      });
    });
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
        this.page.drawText(sanitize(item.sub), {
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

  table(headers: string[], rows: string[][], widths: number[], accent?: RGB): void {
    const headerH = 18;
    const lineH = 12;
    const size = 8.5;
    const offset = accent ? 14 : 0;
    const tableLeft = MARGIN + offset;
    const tableWidth = CONTENT_W - offset;
    const total = widths.reduce((sum, width) => sum + width, 0);
    const cols = widths.map((width) => (width / total) * tableWidth);
    const startPage = this.page;
    const startY = this.y;
    this.ensure(headerH + 8);
    const drawHeader = () => {
      const top = this.y;
      this.page.drawRectangle({ x: tableLeft, y: top - headerH, width: tableWidth, height: headerH, color: SOFT });
      let x = tableLeft + 6;
      headers.forEach((header, i) => {
        this.page.drawText(sanitize(header), {
          x,
          y: top - 12,
          size: 7.5,
          font: this.bold,
          color: MUTED,
        });
        x += cols[i]!;
      });
      this.y = top - headerH;
    };
    drawHeader();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]!;
      const cellLines = row.map((cell, i) =>
        this.wrap(cell, i === 0 ? this.bold : this.font, size, cols[i]! - 12),
      );
      const rowH = Math.max(...cellLines.map((lines) => lines.length)) * lineH + 6;
      if (this.y - rowH < CONTENT_BOTTOM) {
        this.newPage();
        drawHeader();
      }
      const top = this.y;
      if (rowIndex % 2 === 1) {
        this.page.drawRectangle({
          x: tableLeft,
          y: top - rowH,
          width: tableWidth,
          height: rowH,
          color: rgb(0.985, 0.988, 0.995),
        });
      }
      let x = tableLeft + 6;
      cellLines.forEach((lines, i) => {
        const font = i === 0 ? this.bold : this.font;
        const numeric = /^[-+]?\$?[\d,]+(\.\d+)?%?$/.test(row[i]!.replace(/\s+/g, ""));
        lines.forEach((line, lineIndex) => {
          const textWidth = font.widthOfTextAtSize(line, size);
          this.page.drawText(line, {
            x: numeric ? x + cols[i]! - 12 - textWidth : x,
            y: top - 12 - lineIndex * lineH,
            size,
            font,
            color: INK,
          });
        });
        x += cols[i]!;
      });
      this.page.drawLine({
        start: { x: tableLeft, y: top - rowH },
        end: { x: tableLeft + tableWidth, y: top - rowH },
        thickness: 0.5,
        color: BORDER,
      });
      this.y = top - rowH;
    }
    this.y -= 12;
    if (accent) {
      const endY = this.y + 2;
      if (this.page === startPage) {
        startPage.drawRectangle({
          x: MARGIN,
          y: endY,
          width: 4,
          height: Math.max(20, startY - endY),
          color: accent,
        });
      } else {
        const firstBottom = CONTENT_BOTTOM + 6;
        startPage.drawRectangle({
          x: MARGIN,
          y: firstBottom,
          width: 4,
          height: Math.max(20, startY - firstBottom),
          color: accent,
        });
        this.page.drawRectangle({
          x: MARGIN,
          y: endY,
          width: 4,
          height: Math.max(20, CONTENT_TOP - endY),
          color: accent,
        });
      }
    }
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
      this.page.drawText(sanitize(point.label), {
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
    this.page.drawText(sanitize(money(max, currency)), {
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
        this.page.drawText(sanitize(item.label.toUpperCase()), {
          x: x + 8,
          y: top - 14,
          size: 6.5,
          font: this.bold,
          color: MUTED,
        });
        this.page.drawText(sanitize(item.value), {
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

export interface DiagnosticPdfLinks {
  blueprintUrl?: string;
  bookUrl?: string;
}

export async function renderDiagnosticPdf(
  facts: DiagnosticFacts,
  narrative: DiagnosticNarrative,
  links: DiagnosticPdfLinks = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const report = new Report(doc, font, bold);
  const currency = facts.meta.currency;
  const blueprintUrl = links.blueprintUrl ?? "https://growthsnipe.com/blueprint";
  const bookUrl = links.bookUrl ?? "https://growthsnipe.com/book";
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

  // Contents page reserved at the front; filled after all sections exist.
  report.newPage(false);
  const tocPage = report.currentPage;
  const tocPageNo = report.pageNumber;
  const tocEntries: TocEntry[] = [];
  const section = (title: string) => {
    report.newPage();
    tocEntries.push({ title, page: report.currentPage });
  };

  // Executive summary
  section("Executive summary");
  report.heading(narrative.snapshot.headline, { kicker: "Executive summary" });
  report.text(narrative.snapshot.summary, { size: 11 });
  report.space(4);

  const topFindings = narrative.executiveSummary.topFindings.slice(0, 3);
  if (topFindings.length > 0) {
    const gap = 10;
    const cardW = (CONTENT_W - gap * (topFindings.length - 1)) / topFindings.length;
    const titleHeights = topFindings.map((finding) =>
      report.measure(finding.title, { bold: true, size: 9.5, x: MARGIN + 32, width: cardW - 44 }),
    );
    const lineHeights = topFindings.map((finding) =>
      report.measure(finding.oneLine, { size: 8.5, x: MARGIN + 12, width: cardW - 24 }),
    );
    const cardH = 28 + Math.max(...titleHeights) + 4 + Math.max(...lineHeights) + 22;
    report.ensure(cardH + 12);
    const top = report.cursor;
    topFindings.forEach((finding, index) => {
      const x = MARGIN + index * (cardW + gap);
      const leak = findLeakForFinding(finding, facts.leaks);
      const pillarCode =
        leak?.pillar ??
        pillarForText(`${finding.title} ${finding.oneLine}`) ??
        pillarForRef(finding.metricRef) ??
        facts.framework.find((item) => item.status === "leak" || item.status === "watch")?.code ??
        "S";
      const pillar = facts.framework.find((item) => item.code === pillarCode);
      const leakNarrative = leak
        ? narrative.leakNarratives.find((item) => item.leakId === leak.id)
        : undefined;
      const fallbackSeverity =
        pillar?.status === "leak" ? "high" : pillar?.status === "watch" ? "medium" : "low";
      const color = severityColor(leakNarrative?.severity ?? fallbackSeverity);
      report.drawCard(x, top, cardW, cardH, color);
      report.rankBadge(x + 18, top - 18, index + 1, color);
      report.setCursor(top - 18);
      report.text(finding.title, { bold: true, size: 9.5, x: x + 32, width: cardW - 44 });
      report.text(finding.oneLine, { size: 8.5, color: MUTED, x: x + 12, width: cardW - 24 });
      report.chip(
        x + 12,
        top - cardH + 8,
        `${pillarCode} ${SHORT_PILLAR[pillarCode]}`,
        color,
        SOFT,
      );
    });
    report.setCursor(top - cardH - 12);
  }

  report.subheading("The full picture", 60);
  for (const paragraph of narrative.executiveSummary.paragraphs) {
    report.text(paragraph, { size: 10.5 });
  }

  // SNIPE Framework
  section("SNIPE Framework");
  report.heading("SNIPE Framework", { kicker: "The five pillars" });
  report.text(narrative.snapshot.scoreRationale, { size: 9.5, color: MUTED });
  report.space(4);

  const pillarStatusLabel = (pillar: DiagnosticFacts["framework"][number]): string => {
    if (pillar.status === "not_assessed") return "Not assessed";
    const label = pillar.status === "strength" ? "Strength" : pillar.status === "watch" ? "Watch" : "Leak";
    return `${pillar.score} / 100 - ${label}`;
  };

  for (const pillar of facts.framework) {
    const note = narrative.frameworkNotes.find((item) => item.pillar === pillar.code);
    const color = pillar.status === "not_assessed" ? MUTED : statusColor(pillar.status);
    const assessment = note?.assessment ?? "";
    const implication = note?.commercialImplication ?? "";
    const opportunity = note?.strengthOpportunity ?? "";
    const contextLine = pillar.context
      .slice(0, 3)
      .map((item) => `${item.label}: ${item.value}`)
      .join("  |  ");
    const contextH = report.measure(contextLine, { size: 8, x: MARGIN + 58, width: CONTENT_W - 80 });
    const height =
      74 +
      contextH +
      report.measure(`What the numbers say: ${assessment}`, { size: 9.5, x: MARGIN + 58, width: CONTENT_W - 80 }) +
      report.measure(`Why it matters: ${implication}`, { size: 9, x: MARGIN + 58, width: CONTENT_W - 80 }) +
      report.measure(`Strength or opportunity: ${opportunity}`, { size: 9, x: MARGIN + 58, width: CONTENT_W - 80 });
    report.ensure(height + 12);
    const yTop = report.cursor;
    report.drawCard(MARGIN, yTop, CONTENT_W, height, color);
    report.currentPage.drawCircle({ x: MARGIN + 30, y: yTop - 30, size: 18, color });
    const letterWidth = report.bold.widthOfTextAtSize(pillar.code, 16);
    report.currentPage.drawText(pillar.code, {
      x: MARGIN + 30 - letterWidth / 2,
      y: yTop - 36,
      size: 16,
      font: report.bold,
      color: WHITE,
    });
    report.currentPage.drawText(pillar.name, {
      x: MARGIN + 58,
      y: yTop - 24,
      size: 13,
      font: report.bold,
      color: INK,
    });
    const status = pillarStatusLabel(pillar);
    const statusWidth = report.font.widthOfTextAtSize(status, 7.5) + 10;
    report.chip(PAGE_W - MARGIN - statusWidth - 8, yTop - 36, status, color);
    if (pillar.score !== null) {
      report.currentPage.drawText(`${pillar.score} / 100`, {
        x: MARGIN + 58,
        y: yTop - 42,
        size: 8.5,
        font: report.bold,
        color: MUTED,
      });
      report.meter(MARGIN + 112, yTop - 45, Math.round(pillar.score / 20), 5, color);
    }
    report.setCursor(yTop - 58);
    report.text(contextLine, { size: 8, color: MUTED, x: MARGIN + 58, width: CONTENT_W - 80 });
    report.text(`What the numbers say: ${assessment}`, { size: 9.5, x: MARGIN + 58, width: CONTENT_W - 80 });
    report.text(`Why it matters: ${implication}`, { size: 9, color: MUTED, x: MARGIN + 58, width: CONTENT_W - 80 });
    report.text(`Strength or opportunity: ${opportunity}`, { size: 9, color: PRIMARY, x: MARGIN + 58, width: CONTENT_W - 80 });
    report.setCursor(yTop - height - 12);
  }

  report.subheading("Key constraints", 110);
  for (let i = 0; i < narrative.keyConstraints.length; i += 2) {
    const pair = narrative.keyConstraints.slice(i, i + 2);
    const gap = 10;
    const cardW = pair.length === 1 ? CONTENT_W : (CONTENT_W - gap) / 2;
    const heights = pair.map((constraint, index) => {
      const x = MARGIN + index * (cardW + gap);
      return (
        40 +
        report.measure(constraint.title, { bold: true, size: 9.5, x: x + 12, width: cardW - 24 }) +
        report.measure(constraint.whatItMeans, { size: 8.5, x: x + 12, width: cardW - 24 })
      );
    });
    const rowH = Math.max(...heights);
    report.ensure(rowH + 10);
    const top = report.cursor;
    pair.forEach((constraint, index) => {
      const x = MARGIN + index * (cardW + gap);
      const color = pillarColor(constraint.pillar);
      report.drawCard(x, top, cardW, rowH, color);
      report.chip(x + 12, top - 26, `${constraint.pillar} pillar`, color);
      report.setCursor(top - 40);
      report.text(constraint.title, { bold: true, size: 9.5, x: x + 12, width: cardW - 24 });
      report.text(constraint.whatItMeans, { size: 8.5, color: MUTED, x: x + 12, width: cardW - 24 });
    });
    report.setCursor(top - rowH - 10);
  }

  if (narrative.strengths.length > 0) {
    report.subheading("Strengths and opportunities", 110);
    for (let i = 0; i < narrative.strengths.length; i += 2) {
      const pair = narrative.strengths.slice(i, i + 2);
      const gap = 10;
      const cardW = pair.length === 1 ? CONTENT_W : (CONTENT_W - gap) / 2;
      const heights = pair.map((strength, index) => {
        const x = MARGIN + index * (cardW + gap);
        return (
          40 +
          report.measure(strength.title, { bold: true, size: 9.5, x: x + 12, width: cardW - 24 }) +
          report.measure(strength.detail, { size: 8.5, x: x + 12, width: cardW - 24 })
        );
      });
      const rowH = Math.max(...heights);
      report.ensure(rowH + 10);
      const top = report.cursor;
      pair.forEach((strength, index) => {
        const x = MARGIN + index * (cardW + gap);
        report.drawCard(x, top, cardW, rowH, GOOD);
        report.chip(x + 12, top - 26, `${strength.pillar} pillar`, GOOD);
        report.setCursor(top - 40);
        report.text(strength.title, { bold: true, size: 9.5, x: x + 12, width: cardW - 24 });
        report.text(strength.detail, { size: 8.5, color: MUTED, x: x + 12, width: cardW - 24 });
      });
      report.setCursor(top - rowH - 10);
    }
  }

  // Baseline dashboard
  section("Baseline dashboard");
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
    { label: "Add-on rate", value: pct(facts.services.addOnAttachPct) },
  ]);
  report.subheading("What this means", 70);
  report.callout(
    `${facts.baseline.jobs} jobs were booked and ${facts.baseline.completed} were completed, producing ${money(facts.baseline.revenueMinor, currency)} at an average ticket of ${money(facts.baseline.avgTicketMinor, currency)}. ${facts.baseline.cancelled} jobs were cancelled.`,
  );

  // Revenue trend
  section("Revenue trend");
  report.heading("Revenue trend", { kicker: "Monthly pattern and direction" });
  report.barChart(facts.trend.monthly.map((m) => ({ label: monthLabel(m.month), value: m.revenueMinor })), currency);
  report.kvGrid(
    [
      { label: "Best month", value: facts.trend.bestMonth ?? "n/a" },
      { label: "Quietest month", value: facts.trend.worstMonth ?? "n/a" },
      {
        label: "Monthly spread",
        value: facts.trend.seasonalityIndex === null ? "n/a" : `${facts.trend.seasonalityIndex}% range`,
      },
    ],
    3,
  );
  if (facts.trend.yoy.length > 1) {
    report.subheading("Year over year", 70);
    report.table(
      ["Year", "Revenue", "Growth"],
      facts.trend.yoy.map((row) => [String(row.year), money(row.revenueMinor, currency), row.growthPct === null ? "n/a" : `${row.growthPct}%`]),
      [1, 1.4, 1],
    );
  }

  // Referral performance
  section("Referral performance");
  report.heading("Referral performance", { kicker: "Demand and partnership" });
  report.text(
    `${facts.referrals.activeAgentCount} referring partners produced jobs in the period. Your largest partner accounts for ${pct(facts.referrals.topAgents[0]?.sharePct ?? null)} of referred jobs.`,
    { size: 10 },
  );
  report.subheading("Top referring agents", 80);
  report.table(
    ["Agent", "Jobs", "Revenue", "Share", "Status"],
    facts.referrals.topAgents.map((a) => [a.name, `${a.jobs}`, money(a.revenueMinor, currency), `${a.sharePct}%`, a.status]),
    [2.2, 0.6, 1.1, 0.7, 0.9],
  );
  if (facts.referrals.topAgencies.length > 0) {
    report.subheading("Top agencies", 80);
    report.table(
      ["Agency", "Jobs", "Revenue", "Share"],
      facts.referrals.topAgencies.map((a) => [a.name, `${a.jobs}`, money(a.revenueMinor, currency), `${a.sharePct}%`]),
      [2.4, 0.7, 1.2, 0.7],
    );
  }
  report.kvGrid(
    [
      { label: "Repeat referrer share", value: pct(facts.referrals.repeatAgentSharePct) },
      { label: "Partner concentration", value: facts.referrals.concentrationIndex === null ? "n/a" : `${facts.referrals.concentrationIndex}` },
      { label: "Dormant partners", value: `${facts.referrals.droppedAgents.length}` },
    ],
    3,
  );
  if (facts.referrals.newAgents.length > 0) {
    const gap = 10;
    const rows: Array<{
      pair: Array<(typeof facts.referrals.newAgents)[number]>;
      cardW: number;
      rowH: number;
    }> = [];
    for (let i = 0; i < facts.referrals.newAgents.length; i += 2) {
      const pair = facts.referrals.newAgents.slice(i, i + 2);
      const cardW = pair.length === 1 ? CONTENT_W : (CONTENT_W - gap) / 2;
      const nameHeights = pair.map((agent, index) => {
        const x = MARGIN + index * (cardW + gap);
        return report.measure(agent.name, { bold: true, size: 10, x: x + 12, width: cardW - 74 });
      });
      rows.push({ pair, cardW, rowH: 34 + Math.max(...nameHeights) + 22 });
    }
    const totalHeight = rows.reduce((sum, row) => sum + row.rowH + 10, 0);
    report.ensure(34 + totalHeight);
    report.subheading("New partners in the last 90 days");
    for (const row of rows) {
      const top = report.cursor;
      row.pair.forEach((agent, index) => {
        const x = MARGIN + index * (row.cardW + gap);
        report.drawCard(x, top, row.cardW, row.rowH, GOOD);
        report.setCursor(top - 18);
        report.text(agent.name, { bold: true, size: 10, x: x + 12, width: row.cardW - 74 });
        report.text(`${agent.jobs} jobs  |  ${money(agent.revenueMinor, currency)}`, {
          size: 8.5,
          color: MUTED,
          x: x + 12,
          width: row.cardW - 24,
        });
        report.chip(x + row.cardW - 52, top - 26, "NEW", GOOD);
      });
      report.setCursor(top - row.rowH - 10);
    }
  }

  const insightCard = (leak: DiagnosticFacts["leaks"][number]) => {
    const color = pillarColor(leak.pillar);
    const assumptionText = leak.exposure ? `Assumption: ${leak.exposure.assumptions.join(" ")}` : "";
    const titleH = report.measure(leak.title, {
      bold: true,
      size: 11.5,
      x: MARGIN + 14,
      width: CONTENT_W - 28,
    });
    const evidenceHeights = leak.evidence.map((evidence) =>
      report.measure(evidence.value, { size: 9, x: MARGIN + 26, width: CONTENT_W - 40 }),
    );
    const assumptionH = leak.exposure
      ? report.measure(assumptionText, { size: 8.5, x: MARGIN + 14, width: CONTENT_W - 28 })
      : 0;
    const height =
      30 +
      titleH +
      20 +
      evidenceHeights.reduce((sum, value) => sum + value, 0) +
      (leak.exposure ? 18 + assumptionH : 0) +
      10;
    report.ensure(height + 10);
    const yTop = report.cursor;
    report.drawCard(MARGIN, yTop, CONTENT_W, height, color);
    report.setCursor(yTop - 22);
    report.text(leak.title, { bold: true, size: 11.5, x: MARGIN + 14, width: CONTENT_W - 28 });
    report.chip(MARGIN + 14, report.cursor - 16, `${leak.pillar} pillar`, color);
    report.setCursor(report.cursor - 24);
    for (const evidence of leak.evidence) {
      const cy = report.cursor;
      report.currentPage.drawCircle({ x: MARGIN + 18, y: cy + 3, size: 1.4, color });
      report.text(evidence.value, { size: 9, x: MARGIN + 26, width: CONTENT_W - 40 });
    }
    if (leak.exposure) {
      report.text(
        `Estimated range: ${money(leak.exposure.lowMinor, currency)} to ${money(leak.exposure.highMinor, currency)}`,
        { bold: true, size: 10, x: MARGIN + 14, width: CONTENT_W - 28 },
      );
      report.text(assumptionText, { size: 8.5, color: MUTED, x: MARGIN + 14, width: CONTENT_W - 28 });
    }
    report.setCursor(yTop - height - 10);
  };

  // Cancellations and loss
  section("Cancellations and loss");
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
  cancelLeaks.forEach(insightCard);

  // Job value and job penetration
  section("Job value and job penetration");
  report.heading("Job value and job penetration", { kicker: "Ticket architecture" });
  report.kpiRow([
    { label: "Typical ticket", value: money(facts.ticket.distributionMinor.p50, currency) },
    { label: "Upper range", value: money(facts.ticket.distributionMinor.p75, currency) },
    { label: "High-end jobs", value: money(facts.ticket.distributionMinor.p90, currency) },
    { label: "Add-on rate", value: pct(facts.services.addOnAttachPct) },
  ]);
  report.subheading("Job penetration", 80);
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
  ticketLeaks.forEach(insightCard);

  // Repeat and retention
  section("Repeat and retention");
  report.heading("Repeat and retention", { kicker: "Revenue that comes back" });
  report.kpiRow([
    { label: "Repeat client share", value: pct(facts.clients.repeatClientSharePct) },
    { label: "Jobs per client", value: facts.clients.avgJobsPerClient === null ? "n/a" : `${facts.clients.avgJobsPerClient}` },
    { label: "Repeat referrer share", value: pct(facts.referrals.repeatAgentSharePct) },
    { label: "Clients identified", value: pct(facts.clients.identityCoveragePct) },
  ]);
  if (facts.referrals.droppedAgents.length > 0) {
    const accent = pillarColor("P");
    report.subheading("Partners who have gone quiet", 80, accent);
    report.table(
      ["Partner", "Jobs", "Revenue", "Last job"],
      facts.referrals.droppedAgents.map((agent) => [
        agent.name,
        `${agent.jobs}`,
        money(agent.revenueMinor, currency),
        shortDate(agent.lastSeen),
      ]),
      [2.4, 0.7, 1.2, 1],
      accent,
    );
  }
  const repeatLeaks = facts.leaks.filter((leak) => leak.category === "repeat" || leak.category === "referral");
  repeatLeaks.forEach(insightCard);

  // Capacity and team
  section("Capacity and team");
  report.heading("Capacity and team", { kicker: "Throughput" });
  const avgUtilization =
    facts.team.inspectors.length > 0
      ? facts.team.inspectors.reduce((sum, i) => sum + (i.utilizationPct ?? 0), 0) / facts.team.inspectors.length
      : null;
  report.kpiRow([
    { label: "Inspectors", value: `${facts.team.inspectorCount}` },
    { label: "Team jobs", value: pct(facts.team.teamJobSharePct) },
    { label: "Average schedule use", value: avgUtilization === null ? "n/a" : `${Math.round(avgUtilization)}%` },
  ]);
  if (facts.team.inspectors.length > 0) {
    report.subheading("Work per inspector", 80);
    report.table(
      ["Inspector", "Jobs", "Revenue", "Avg ticket", "Schedule use"],
      facts.team.inspectors.map((i) => [
        i.name,
        `${i.jobs}`,
        money(i.revenueMinor, currency),
        money(i.avgTicketMinor, currency),
        i.utilizationPct === null ? "n/a" : `${i.utilizationPct}%`,
      ]),
      [2, 0.6, 1.2, 1.1, 1],
    );
    report.text("Schedule use compares each inspector with a two-job-per-day baseline. Treat it as a direction, not a target.", { size: 8.5, color: MUTED });
  }

  // Leak map
  section("Leak map");
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

  // Priority findings: impact/effort matrix, top three, then cards.
  section("Priority findings");
  report.heading("Priority findings", { kicker: "What to fix first" });
  report.text(
    "Ranked by impact and practical effort. The matrix shows where each finding sits; the cards give the next action.",
    { size: 9.5, color: MUTED },
  );
  report.space(4);

  const impactFor = (severity: string): number =>
    severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : 1;
  const effortFor = (effort: string): number => (effort === "high" ? 3 : effort === "medium" ? 2 : 1);
  const findings = ordered.map((item, index) => {
    const leak = leakById.get(item.leakId);
    return {
      item,
      leak,
      rank: index + 1,
      impact: impactFor(item.severity),
      effortScore: effortFor(item.effort),
      color: severityColor(item.severity),
    };
  });

  const matrixH = 250;
  report.ensure(matrixH + 20);
  const matrixTop = report.cursor;
  const matrixBottom = matrixTop - matrixH;
  const plotLeft = MARGIN + 44;
  const plotRight = PAGE_W - MARGIN - 10;
  const plotTop = matrixTop - 26;
  const plotBottom = matrixBottom + 34;
  const plotW = plotRight - plotLeft;
  const plotH = plotTop - plotBottom;
  const halfW = plotW / 2;
  const halfH = plotH / 2;

  report.drawCard(MARGIN, matrixTop, CONTENT_W, matrixH, undefined, SOFT);
  report.currentPage.drawRectangle({ x: plotLeft, y: plotBottom + halfH, width: halfW, height: halfH, color: rgb(0.94, 0.99, 0.96) });
  report.currentPage.drawRectangle({ x: plotLeft + halfW, y: plotBottom + halfH, width: halfW, height: halfH, color: rgb(0.99, 0.97, 0.92) });
  report.currentPage.drawRectangle({ x: plotLeft, y: plotBottom, width: halfW, height: halfH, color: rgb(0.97, 0.98, 1) });
  report.currentPage.drawRectangle({ x: plotLeft + halfW, y: plotBottom, width: halfW, height: halfH, color: rgb(0.96, 0.96, 0.97) });
  report.currentPage.drawLine({ start: { x: plotLeft, y: plotBottom }, end: { x: plotRight, y: plotBottom }, thickness: 0.8, color: BORDER });
  report.currentPage.drawLine({ start: { x: plotLeft, y: plotBottom }, end: { x: plotLeft, y: plotTop }, thickness: 0.8, color: BORDER });
  report.currentPage.drawLine({ start: { x: plotLeft + halfW, y: plotBottom }, end: { x: plotLeft + halfW, y: plotTop }, thickness: 0.5, color: BORDER });
  report.currentPage.drawLine({ start: { x: plotLeft, y: plotBottom + halfH }, end: { x: plotRight, y: plotBottom + halfH }, thickness: 0.5, color: BORDER });
  const quadrantLabels = [
    { text: "QUICK WINS", x: plotLeft + 8, y: plotTop - 16, color: GOOD },
    { text: "MAJOR PROJECTS", x: plotLeft + halfW + 8, y: plotTop - 16, color: WARN },
    { text: "FILL-INS", x: plotLeft + 8, y: plotBottom + halfH - 14, color: MUTED },
    { text: "DEPRIORITIZE", x: plotLeft + halfW + 8, y: plotBottom + halfH - 14, color: MUTED },
  ];
  for (const label of quadrantLabels) {
    const width = report.bold.widthOfTextAtSize(label.text, 7);
    report.currentPage.drawRectangle({
      x: label.x - 3,
      y: label.y - 3,
      width: width + 6,
      height: 11,
      color: WHITE,
      opacity: 0.92,
    });
    report.currentPage.drawText(label.text, {
      x: label.x,
      y: label.y,
      size: 7,
      font: report.bold,
      color: label.color,
    });
  }
  report.currentPage.drawText("IMPACT", { x: MARGIN + 8, y: matrixTop - 14, size: 7.5, font: report.bold, color: MUTED });
  report.currentPage.drawText("Critical", { x: MARGIN + 2, y: plotTop - 8, size: 7, font: report.font, color: MUTED });
  report.currentPage.drawText("Low", { x: MARGIN + 10, y: plotBottom - 2, size: 7, font: report.font, color: MUTED });
  report.currentPage.drawText("Low", { x: plotLeft - 4, y: plotBottom - 12, size: 7, font: report.font, color: MUTED });
  report.currentPage.drawText("Medium", { x: plotLeft + halfW - 14, y: plotBottom - 12, size: 7, font: report.font, color: MUTED });
  report.currentPage.drawText("High", { x: plotRight - 16, y: plotBottom - 12, size: 7, font: report.font, color: MUTED });
  report.currentPage.drawText("EFFORT", { x: MARGIN + CONTENT_W / 2 - 16, y: matrixBottom + 14, size: 7.5, font: report.bold, color: MUTED });

  const xMin = plotLeft + 20;
  const xMax = plotRight - 20;
  const yMin = plotBottom + 18;
  const yMax = plotTop - 18;
  const offsets = [-13, 13, -26, 26];
  const plotted = new Map<string, number>();
  for (const finding of findings) {
    const key = `${finding.effortScore}-${finding.impact}`;
    const offset = plotted.get(key) ?? 0;
    plotted.set(key, offset + 1);
    const jitter = offset === 0 ? 0 : offsets[offset % offsets.length]!;
    const x = Math.max(
      plotLeft + 12,
      Math.min(plotRight - 12, xMin + ((finding.effortScore - 1) / 2) * (xMax - xMin) + jitter),
    );
    const y = yMin + ((finding.impact - 1) / 3) * (yMax - yMin);
    report.currentPage.drawCircle({ x, y, size: 10.5, color: finding.color });
    const label = `${finding.rank}`;
    const labelWidth = report.bold.widthOfTextAtSize(label, 9);
    report.currentPage.drawText(label, { x: x - labelWidth / 2, y: y - 3, size: 9, font: report.bold, color: WHITE });
  }
  report.setCursor(matrixBottom - 10);

  const topThree = findings.slice(0, 3);
  if (topThree.length > 0) {
    const stripGap = 10;
    const stripW = (CONTENT_W - stripGap * (topThree.length - 1)) / topThree.length;
    const stripTop = report.cursor;
    const exposureFor = (finding: (typeof topThree)[number]): string =>
      finding.leak?.quantifiable && finding.leak.exposure
        ? `Estimated range ${money(finding.leak.exposure.lowMinor, currency)} to ${money(finding.leak.exposure.highMinor, currency)}`
        : `${finding.item.severity} severity`;
    const titleHeights = topThree.map((finding, index) => {
      const x = MARGIN + index * (stripW + stripGap);
      return report.measure(finding.item.title, { bold: true, size: 9, x: x + 32, width: stripW - 40 });
    });
    const exposureHeights = topThree.map((finding, index) => {
      const x = MARGIN + index * (stripW + stripGap);
      return report.measure(exposureFor(finding), { size: 7.5, x: x + 12, width: stripW - 24 });
    });
    const stripH = 26 + Math.max(...titleHeights) + 4 + Math.max(...exposureHeights) + 18;
    topThree.forEach((finding, index) => {
      const x = MARGIN + index * (stripW + stripGap);
      report.drawCard(x, stripTop, stripW, stripH, finding.color);
      report.rankBadge(x + 18, stripTop - 18, finding.rank, finding.color);
      report.setCursor(stripTop - 18);
      report.text(finding.item.title, { bold: true, size: 9, x: x + 32, width: stripW - 40 });
      report.text(exposureFor(finding), { size: 7.5, color: MUTED, x: x + 12, width: stripW - 24 });
      report.text(`${finding.item.effort} effort`, { size: 7.5, color: MUTED, x: x + 12, width: stripW - 24 });
    });
    report.setCursor(stripTop - stripH - 12);
  }

  for (const finding of findings) {
    const titleHeight = report.measure(finding.item.title, { bold: true, size: 12.5, x: MARGIN + 38 });
    const consequenceHeight = report.measure(finding.item.consequence, { size: 9.5, x: MARGIN + 38 });
    const fixHeight = report.measure(finding.item.recommendedFix, { size: 9.5, x: MARGIN + 26 });
    const height = 110 + titleHeight + consequenceHeight + fixHeight;
    report.ensure(height + 12);
    const yTop = report.cursor;
    report.drawCard(MARGIN, yTop, CONTENT_W, height, finding.color);
    report.rankBadge(MARGIN + 22, yTop - 18, finding.rank, finding.color);
    report.setCursor(yTop - 22);
    report.text(finding.item.title, { bold: true, size: 12.5, x: MARGIN + 38, width: CONTENT_W - 56 });
    const chipsY = report.cursor - 16;
    let chipX = MARGIN + 38;
    chipX += report.chip(chipX, chipsY, `${finding.item.severity} severity`, finding.color) + 6;
    chipX += report.chip(chipX, chipsY, `${finding.item.effort} effort`, MUTED) + 6;
    report.chip(chipX, chipsY, `${finding.item.confidence} confidence`, MUTED);
    report.setCursor(chipsY - 18);
    report.text(finding.item.consequence, { size: 9.5, x: MARGIN + 38 });
    const fixTop = report.cursor - 6;
    const fixBlockH = fixHeight + 24;
    report.currentPage.drawRectangle({
      x: MARGIN + 14,
      y: fixTop - fixBlockH,
      width: CONTENT_W - 28,
      height: fixBlockH,
      color: PRIMARY_SOFT,
    });
    report.currentPage.drawRectangle({
      x: MARGIN + 14,
      y: fixTop - fixBlockH,
      width: 3,
      height: fixBlockH,
      color: PRIMARY,
    });
    report.iconArrow(MARGIN + 24, fixTop - 16, PRIMARY);
    report.currentPage.drawText("DO THIS NEXT", {
      x: MARGIN + 38,
      y: fixTop - 16,
      size: 7.5,
      font: report.bold,
      color: PRIMARY,
    });
    report.setCursor(fixTop - 28);
    report.text(finding.item.recommendedFix, { size: 9.5, x: MARGIN + 26, width: CONTENT_W - 44 });
    report.setCursor(yTop - height - 12);
  }

  // Quick wins: two-column task cards.
  section("Quick wins");
  report.heading("Quick wins", { kicker: "Start this week" });
  const totalQuickWinHours = narrative.quickWins.reduce(
    (sum, win) => sum + Math.max(1, win.effortHours),
    0,
  );
  report.text(
    `Small moves you can finish this week. Total estimated time: about ${totalQuickWinHours} hours.`,
    { size: 9.5, color: MUTED },
  );
  report.space(4);

  const winGap = 12;
  for (let i = 0; i < narrative.quickWins.length; i += 2) {
    const pair = narrative.quickWins.slice(i, i + 2);
    const cardW = pair.length === 1 ? CONTENT_W : (CONTENT_W - winGap) / 2;
    const heights = pair.map((win, index) => {
      const x = MARGIN + index * (cardW + winGap);
      return (
        60 +
        report.measure(win.title, { bold: true, size: 11, x: x + 34, width: cardW - 44 }) +
        report.measure(win.what, { size: 9.5, x: x + 14, width: cardW - 28 }) +
        report.measure(`How: ${win.how}`, { size: 8.5, x: x + 14, width: cardW - 28 }) +
        report.measure(`When: ${win.when}`, { size: 8.5, x: x + 14, width: cardW - 28 }) +
        18
      );
    });
    const rowH = Math.max(...heights);
    report.ensure(rowH + winGap);
    const rowTop = report.cursor;
    pair.forEach((win, index) => {
      const x = MARGIN + index * (cardW + winGap);
      const isFirst = i + index === 0;
      report.drawCard(x, rowTop, cardW, rowH, isFirst ? PRIMARY : BORDER);
      report.currentPage.drawRectangle({
        x: x + 14,
        y: rowTop - 25,
        width: 12,
        height: 12,
        borderColor: isFirst ? PRIMARY : BORDER,
        borderWidth: 0.9,
        color: WHITE,
      });
      report.setCursor(rowTop - 22);
      report.text(win.title, { bold: true, size: 11, x: x + 34, width: cardW - 44 });
      report.text(win.what, { size: 9.5, x: x + 14, width: cardW - 28 });
      report.text(`How: ${win.how}`, { size: 8.5, color: MUTED, x: x + 14, width: cardW - 28 });
      report.text(`When: ${win.when}`, { size: 8.5, color: MUTED, x: x + 14, width: cardW - 28 });
      const chipsY = rowTop - rowH + 12;
      let chipX = x + 14;
      chipX += report.chip(chipX, chipsY, `Time: ${Math.max(1, win.effortHours)}h`, PRIMARY, PRIMARY_SOFT) + 6;
      if (isFirst) report.chip(chipX, chipsY, "START HERE", PRIMARY, PRIMARY_SOFT);
    });
    report.setCursor(rowTop - rowH - winGap);
  }

  // 30-day plan: timeline track and phase cards.
  section("30-day plan");
  report.heading("30-day plan", { kicker: "From findings to action" });
  report.text(
    "A focused 30-day sequence. One owner per action and one success metric per phase.",
    { size: 9.5, color: MUTED },
  );
  report.space(6);

  const segmentShares = [7, 14, 9];
  const totalDays = segmentShares.reduce((sum, value) => sum + value, 0);
  const segGap = 4;
  const usableW = CONTENT_W - segGap * 2;
  const segmentWidths = segmentShares.map((share) => (share / totalDays) * usableW);
  const focusLines = narrative.thirtyDayPlan.map((phase, index) =>
    report.wrapLines(phase.focus, { size: 7.5, width: segmentWidths[index]! - 16 }),
  );
  const maxFocusLines = Math.max(...focusLines.map((lines) => lines.length), 1);
  const trackH = 26 + maxFocusLines * 10.5 + 6;
  const shades: RGB[] = [PRIMARY, rgb(0.18, 0.5, 1), rgb(0.42, 0.66, 1)];
  report.ensure(trackH + 20);
  const trackTop = report.cursor;
  let trackX = MARGIN;
  narrative.thirtyDayPlan.forEach((phase, index) => {
    const width = segmentWidths[index]!;
    report.currentPage.drawRectangle({
      x: trackX,
      y: trackTop - trackH,
      width,
      height: trackH,
      color: shades[index] ?? PRIMARY,
    });
    report.currentPage.drawText(phase.window, {
      x: trackX + 8,
      y: trackTop - 16,
      size: 8.5,
      font: report.bold,
      color: WHITE,
    });
    report.drawLines(focusLines[index]!, trackX + 8, trackTop - 30, {
      size: 7.5,
      color: rgb(0.92, 0.96, 1),
      leading: 10.5,
    });
    trackX += width + segGap;
  });
  report.currentPage.drawCircle({ x: MARGIN + CONTENT_W - 2, y: trackTop - trackH / 2, size: 4, color: INK });
  report.currentPage.drawText("Day 30", {
    x: MARGIN + CONTENT_W - 44,
    y: trackTop - trackH - 12,
    size: 7.5,
    font: report.bold,
    color: MUTED,
  });
  report.setCursor(trackTop - trackH - 18);

  for (const phase of narrative.thirtyDayPlan) {
    const focusH = report.measure(phase.focus, { bold: true, size: 9, x: MARGIN + 12, width: CONTENT_W - 24 });
    const actionHeights = phase.actions.map((action) => {
      const whatH = report.measure(action.what, { bold: true, size: 10, x: MARGIN + 38, width: CONTENT_W - 60 });
      const howH = report.measure(action.how, { size: 9.5, x: MARGIN + 38, width: CONTENT_W - 56 });
      const successH = report.measure(`Success metric: ${action.successMetric}`, {
        size: 8.5,
        x: MARGIN + 38,
        width: CONTENT_W - 56,
      });
      return 16 + whatH + 4 + howH + 18 + successH + 10;
    });
    const height = 34 + focusH + 8 + actionHeights.reduce((sum, value) => sum + value, 0) + 12;
    report.ensure(height + 12);
    const yTop = report.cursor;
    report.drawCard(MARGIN, yTop, CONTENT_W, height, PRIMARY);
    report.currentPage.drawRectangle({ x: MARGIN, y: yTop - 30, width: CONTENT_W, height: 30, color: SOFT });
    report.currentPage.drawText(phase.window, {
      x: MARGIN + 12,
      y: yTop - 20,
      size: 10.5,
      font: report.bold,
      color: PRIMARY,
    });
    report.setCursor(yTop - 40);
    report.text(phase.focus, { bold: true, size: 9, x: MARGIN + 12, width: CONTENT_W - 24 });
    let cy = report.cursor - 4;
    phase.actions.forEach((action, index) => {
      report.rankBadge(MARGIN + 22, cy + 3, index + 1, PRIMARY);
      report.setCursor(cy);
      report.text(action.what, { bold: true, size: 10, x: MARGIN + 38, width: CONTENT_W - 60 });
      report.text(action.how, { size: 9.5, x: MARGIN + 38, width: CONTENT_W - 56 });
      const chipsY = report.cursor - 18;
      let chipX = MARGIN + 38;
      chipX += report.chip(chipX, chipsY, `When: ${action.when}`, MUTED) + 6;
      report.chip(chipX, chipsY, `Owner: ${action.ownerRole}`, PRIMARY, PRIMARY_SOFT);
      report.setCursor(chipsY - 16);
      report.text(`Success metric: ${action.successMetric}`, {
        size: 8.5,
        color: MUTED,
        x: MARGIN + 38,
        width: CONTENT_W - 56,
      });
      cy = report.cursor - 6;
    });
    report.setCursor(yTop - height - 12);
  }

  const lastPhase = narrative.thirtyDayPlan[narrative.thirtyDayPlan.length - 1];
  const lastAction = lastPhase?.actions[lastPhase.actions.length - 1];
  if (lastAction) {
    report.callout(`By day 30: ${lastAction.successMetric}`);
  }

  // Recommended next step: conversion page.
  section("Recommended next step");
  report.heading("Turn this Diagnostic into your 12-month plan", { kicker: "Your next step" });
  report.text(
    "The SNIPE Blueprint™ takes the numbers in this report and turns them into a sequenced plan for revenue, channels, ticket value, follow-up, and capacity.",
    { size: 10.5, color: MUTED },
  );
  report.space(6);

  const recommendation = displayProduct(narrative.nextStep.recommendation);
  const recommendationH = report.measure(recommendation, {
    bold: true,
    size: 16,
    x: MARGIN + 16,
    width: CONTENT_W - 32,
  });
  const rationaleH = report.measure(narrative.nextStep.rationale, {
    size: 9,
    x: MARGIN + 16,
    width: CONTENT_W - 32,
  });
  const ribbonH = 24 + recommendationH + 4 + rationaleH + 14;
  report.ensure(ribbonH + 12);
  const ribbonY = report.cursor;
  report.drawCard(MARGIN, ribbonY, CONTENT_W, ribbonH, PRIMARY, PRIMARY_SOFT);
  report.currentPage.drawText("RECOMMENDED FOR YOUR BUSINESS", {
    x: MARGIN + 16,
    y: ribbonY - 18,
    size: 7.5,
    font: report.bold,
    color: PRIMARY,
  });
  report.setCursor(ribbonY - 38);
  report.text(recommendation, { bold: true, size: 16, x: MARGIN + 16, width: CONTENT_W - 32 });
  report.text(narrative.nextStep.rationale, {
    size: 9,
    color: MUTED,
    x: MARGIN + 16,
    width: CONTENT_W - 32,
  });
  report.setCursor(ribbonY - ribbonH - 12);

  const focusFindings = narrative.executiveSummary.topFindings.slice(0, 2).map((item) => item.title);
  if (focusFindings.length > 0) {
    report.text(`Your Blueprint will focus on ${focusFindings.join(" and ")}.`, { size: 10 });
  }

  report.subheading("What the Blueprint gives you", 100);
  const benefits = [
    "A personalized plan built from your actual numbers.",
    "12-month targets, economics, channel mix, and budget.",
    "Booking, follow-up, and revenue workflows.",
    "Capacity and hiring triggers.",
    "A 90-minute presentation and 30 days of follow-up questions.",
    "A sequenced plan you can run with your own team.",
  ];
  const benefitRows = Math.ceil(benefits.length / 2);
  const benefitHeights = benefits.map((benefit) =>
    report.measure(benefit, { size: 8.5, x: MARGIN + 28, width: CONTENT_W / 2 - 44 }),
  );
  const benefitRowHeights: number[] = [];
  for (let row = 0; row < benefitRows; row += 1) {
    benefitRowHeights.push(Math.max(benefitHeights[row * 2] ?? 0, benefitHeights[row * 2 + 1] ?? 0) + 6);
  }
  const benefitsH = 20 + benefitRowHeights.reduce((sum, value) => sum + value, 0);
  report.ensure(benefitsH + 12);
  const benefitsTop = report.cursor;
  report.drawCard(MARGIN, benefitsTop, CONTENT_W, benefitsH);
  let benefitY = benefitsTop - 24;
  for (let row = 0; row < benefitRows; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const benefit = benefits[row * 2 + col];
      if (!benefit) continue;
      const x = MARGIN + 16 + col * (CONTENT_W / 2);
      report.currentPage.drawLine({ start: { x, y: benefitY + 3 }, end: { x: x + 3, y: benefitY }, thickness: 1, color: PRIMARY });
      report.currentPage.drawLine({ start: { x: x + 3, y: benefitY }, end: { x: x + 8, y: benefitY + 6 }, thickness: 1, color: PRIMARY });
      report.setCursor(benefitY);
      report.text(benefit, { size: 8.5, x: x + 12, width: CONTENT_W / 2 - 42 });
    }
    benefitY -= benefitRowHeights[row]!;
  }
  report.setCursor(benefitsTop - benefitsH - 12);

  report.subheading("Your credit", 70);
  const creditDays = OFFER_CREDITS.diagnosticToBlueprint.days;
  const diagnosticPrice = OFFERS.diagnostic.price.label;
  report.callout(
    `You have already paid ${diagnosticPrice} for this SNIPE Diagnostic™. Purchase the SNIPE Blueprint™ within ${creditDays} days of your readout and the full ${diagnosticPrice} is credited.`,
  );

  report.subheading("What happens next", 110);
  const nextSteps = [
    { title: "Open the Blueprint page", body: "Review the plan and choose your start date." },
    { title: "Complete the short intake", body: "We already have your 12 months of data, so this is quick." },
    { title: "Get your plan", body: "Receive it within 10 business days and join the 90-minute presentation." },
  ];
  const stepGap = 10;
  const stepW = (CONTENT_W - stepGap * 2) / 3;
  const stepH = 92;
  report.ensure(stepH + 12);
  const stepsTop = report.cursor;
  nextSteps.forEach((step, index) => {
    const x = MARGIN + index * (stepW + stepGap);
    report.drawCard(x, stepsTop, stepW, stepH, PRIMARY);
    report.rankBadge(x + 18, stepsTop - 18, index + 1, PRIMARY);
    report.setCursor(stepsTop - 18);
    report.text(step.title, { bold: true, size: 9.5, x: x + 32, width: stepW - 36 });
    report.text(step.body, { size: 8.5, color: MUTED, x: x + 12, width: stepW - 24 });
  });
  report.setCursor(stepsTop - stepH - 12);

  report.subheading("What owners say", 120);
  const testimonials = [
    {
      quote: "They found $4,800 a month in missed calls before we signed anything. That number made the decision easy.",
      name: "Marcus Hale",
      detail: "Owner, Hale Home Inspections",
    },
    {
      quote: "Our average ticket moved because every inspector finally offered the same add-ons. No discounting, just consistency.",
      name: "Dana Whitfield",
      detail: "Owner, Whitfield Property Inspections",
    },
    {
      quote: "The dashboard is the first report I actually read. It tells me what to do, not just what happened.",
      name: "Luis Ortega",
      detail: "Owner, Ortega Inspection Group",
    },
  ];
  const quoteGap = 10;
  const quoteW = (CONTENT_W - quoteGap * 2) / 3;
  const quoteHeights = testimonials.map((item) =>
    report.measure(`"${item.quote}"`, { size: 8.5, x: MARGIN + 12, width: quoteW - 24 }),
  );
  const quoteH = Math.max(...quoteHeights) + 64;
  report.ensure(quoteH + 12);
  const quotesTop = report.cursor;
  testimonials.forEach((item, index) => {
    const x = MARGIN + index * (quoteW + quoteGap);
    report.drawCard(x, quotesTop, quoteW, quoteH, BORDER);
    report.setCursor(quotesTop - 18);
    report.text(`"${item.quote}"`, { size: 8.5, x: x + 12, width: quoteW - 24 });
    report.setCursor(quotesTop - quoteH + 34);
    report.text(item.name, { bold: true, size: 8.5, x: x + 12, width: quoteW - 24 });
    report.text(item.detail, { size: 7.5, color: MUTED, x: x + 12, width: quoteW - 24 });
  });
  report.setCursor(quotesTop - quoteH - 12);

  report.subheading("Take the next step", 110);
  report.ensure(110);
  const ctaTop = report.cursor;
  report.linkButton("Get My SNIPE Blueprint™", blueprintUrl, MARGIN, ctaTop, CONTENT_W, true);
  report.setCursor(ctaTop - 44);
  report.linkButton("Book a Free Growth Fit Call", bookUrl, MARGIN, report.cursor, CONTENT_W, false);
  report.setCursor(ctaTop - 88);
  report.text(
    `Opens the Blueprint page. The ${diagnosticPrice} credit applies within ${creditDays} days of your readout.`,
    { size: 8, color: MUTED },
  );
  report.text(
    "No business outcome is guaranteed. The Blueprint is a planning product built from the data in this report.",
    { size: 8, color: MUTED },
  );

  // Methodology
  section("Methodology");
  report.heading("Methodology", { kicker: "How this report was built" });
  report.subheading("Sources", 60);
  report.bullets(narrative.methodology.sources);
  if (narrative.methodology.assumptions.length > 0) {
    report.subheading("Assumptions", 60);
    report.bullets(narrative.methodology.assumptions);
  }
  report.subheading("Disclaimers", 70);
  report.callout(narrative.methodology.disclaimers.join(" "), "warn");

  // Appendix
  section("Appendix and scoring rules");
  report.heading("Appendix", { kicker: "Data tables and scoring rules" });
  report.subheading("Monthly performance", 80);
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
  report.subheading("Top cities", 80);
  if (facts.geography.topCities.length > 0) {
    report.table(
      ["City", "Jobs", "Revenue", "Share"],
      facts.geography.topCities.map((c) => [c.city, `${c.jobs}`, money(c.revenueMinor, currency), `${c.sharePct}%`]),
      [2.4, 0.7, 1.2, 0.7],
    );
  } else {
    report.text("No city data was available in the connected records.", { size: 9.5, color: MUTED });
  }

  report.subheading("How the pillar scores work", 80);
  report.text(
    "Each pillar score is a weighted average of its available components. Status: 70 or above is a Strength, 45 to 69 is Watch, and below 45 is a Leak. Instant Capture is not assessed in Release 1.",
    { size: 9, color: MUTED },
  );
  for (const pillar of facts.framework) {
    report.subheading(`${pillar.code} - ${pillar.name}`, 60);
    if (pillar.code === "I") {
      report.text(
        "Not assessed in Release 1: no phone, lead, or CRM data is connected. No response-time or missed-lead findings are claimed.",
        { size: 9 },
      );
      continue;
    }
    for (const component of pillar.components) {
      report.text(
        `${component.label} (${Math.round(component.weight * 100)}%): ${component.rule}`,
        { size: 9 },
      );
    }
  }

  report.drawTocPage(tocPage, tocPageNo, tocEntries);
  return doc.save();
}


