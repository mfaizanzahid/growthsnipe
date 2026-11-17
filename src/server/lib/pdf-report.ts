import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFString,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN = 48;
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const HEADER_Y = PAGE_H - 52;
export const CONTENT_TOP = PAGE_H - 92;
export const CONTENT_BOTTOM = 64;

export const INK = rgb(0.09, 0.1, 0.13);
export const MUTED = rgb(0.42, 0.45, 0.5);
export const BORDER = rgb(0.88, 0.9, 0.93);
export const SOFT = rgb(0.965, 0.975, 0.99);
export const PRIMARY = rgb(0.024, 0.412, 1);
export const PRIMARY_SOFT = rgb(0.9, 0.94, 1);
export const WHITE = rgb(1, 1, 1);
export const GOOD = rgb(0.09, 0.58, 0.34);
export const WARN = rgb(0.84, 0.55, 0.1);
export const DANGER = rgb(0.83, 0.22, 0.24);

export function sanitize(value: string): string {
  return value
    .replace(/\u2014|\u2013/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...");
}

export interface TocEntry {
  title: string;
  page: PDFPage;
}

export interface ReportOptions {
  /** Product name printed in the page header. */
  productName?: string;
}

/**
 * Branded PDF layout engine shared by the Diagnostic report and the SNIPE
 * Loops playbook. Both documents use the same page geometry, palette, header,
 * footer, contents page, tables and callouts.
 */
export class Report {
  readonly doc: PDFDocument;
  readonly font: PDFFont;
  readonly bold: PDFFont;
  readonly productName: string;
  private page!: PDFPage;
  private pageNo = 0;
  private y = CONTENT_TOP;

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont, opts: ReportOptions = {}) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.productName = opts.productName ?? "SNIPE Diagnostic™";
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
    page.drawText(this.productName, { x: MARGIN, y: HEADER_Y, size: 8, font: this.bold, color: MUTED });
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
    page.drawText(this.productName, {
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
    this.page.drawText(this.productName, {
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

  /** Wrap text with an arbitrary embedded font (used by monospace panels). */
  wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    return this.wrap(text, font, size, maxWidth);
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
      const valueLabel = this.compactMoney(point.value, currency);
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
    this.page.drawText(sanitize(this.moneyValue(max, currency)), {
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

  private moneyValue(minor: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(minor / 100);
  }

  private compactMoney(minor: number, currency: string): string {
    const value = minor / 100;
    if (value >= 1_000_000) return `${currency === "USD" ? "$" : ""}${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${currency === "USD" ? "$" : ""}${Math.round(value / 1_000)}k`;
    return `${currency === "USD" ? "$" : ""}${Math.round(value)}`;
  }
}
