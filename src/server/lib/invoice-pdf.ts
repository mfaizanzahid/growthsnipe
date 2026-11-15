import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export interface InvoicePdfInput {
  portalName: string;
  supportEmail: string;
  number: string;
  status: string;
  orgName: string;
  billToEmail?: string | null;
  description: string | null;
  currency: string;
  lines: Array<{ description: string; amountMinor: number }>;
  totalMinor: number;
  createdAt: Date | number;
  paidAt: Date | number | null;
}

const PAGE = [595.28, 841.89] as const;
const MARGIN = 48;
const NAVY = rgb(0.06, 0.09, 0.16);
const SLATE = rgb(0.32, 0.36, 0.44);
const LIGHT = rgb(0.96, 0.97, 0.98);
const LINE = rgb(0.86, 0.88, 0.91);
const WHITE = rgb(1, 1, 1);
const GREEN = rgb(0.09, 0.45, 0.28);
const AMBER = rgb(0.72, 0.45, 0.06);
const RED = rgb(0.68, 0.16, 0.16);

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

function dateOf(value: Date | number | null): string {
  if (value == null) return "-";
  return (typeof value === "number" ? new Date(value) : value).toISOString().slice(0, 10);
}

function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fitLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines = wrap(text, font, size, maxWidth);
  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  const last = clipped[maxLines - 1] ?? "";
  clipped[maxLines - 1] = `${last.replace(/\s+$/, "")}…`;
  return clipped;
}

function drawRight(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = NAVY,
): void {
  page.drawText(text, {
    x: rightX - font.widthOfTextAtSize(text, size),
    y,
    size,
    font,
    color,
  });
}

function statusColor(status: string) {
  if (status === "paid") return GREEN;
  if (status === "due") return AMBER;
  if (status === "failed") return RED;
  return SLATE;
}

/** Render a professional invoice PDF (pure JS, Workers-safe). */
export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE[0], PAGE[1]]);
  const { width, height } = page.getSize();
  const right = width - MARGIN;

  page.drawRectangle({
    x: 0,
    y: height - 72,
    width,
    height: 72,
    color: NAVY,
  });
  page.drawText(input.portalName, {
    x: MARGIN,
    y: height - 46,
    size: 18,
    font: bold,
    color: WHITE,
  });
  page.drawText("INVOICE", {
    x: right - bold.widthOfTextAtSize("INVOICE", 24),
    y: height - 50,
    size: 24,
    font: bold,
    color: WHITE,
  });

  let y = height - 102;
  page.drawText("Invoice", { x: MARGIN, y, size: 9, font: bold, color: SLATE });
  page.drawText(input.number, { x: MARGIN, y: y - 18, size: 16, font: bold, color: NAVY });

  const badgeWidth = 68;
  const badgeHeight = 20;
  const badgeX = right - badgeWidth;
  const badgeY = y - 12;
  page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeWidth,
    height: badgeHeight,
    color: statusColor(input.status),
  });
  const statusText = input.status.toUpperCase();
  page.drawText(statusText, {
    x: badgeX + (badgeWidth - bold.widthOfTextAtSize(statusText, 9)) / 2,
    y: badgeY + 6,
    size: 9,
    font: bold,
    color: WHITE,
  });

  y -= 54;
  const cardWidth = (width - MARGIN * 2 - 16) / 2;
  const cardHeight = 82;
  page.drawRectangle({
    x: MARGIN,
    y: y - cardHeight,
    width: cardWidth,
    height: cardHeight,
    color: LIGHT,
  });
  page.drawRectangle({
    x: MARGIN + cardWidth + 16,
    y: y - cardHeight,
    width: cardWidth,
    height: cardHeight,
    color: LIGHT,
  });

  page.drawText("BILL TO", { x: MARGIN + 12, y: y - 18, size: 8, font: bold, color: SLATE });
  const billLines = fitLines(input.orgName, bold, 11, cardWidth - 24, 2);
  let billY = y - 34;
  for (const line of billLines) {
    page.drawText(line, { x: MARGIN + 12, y: billY, size: 11, font: bold, color: NAVY });
    billY -= 14;
  }
  if (input.billToEmail) {
    page.drawText(input.billToEmail, {
      x: MARGIN + 12,
      y: billY,
      size: 9,
      font,
      color: SLATE,
    });
  }

  const metaX = MARGIN + cardWidth + 28;
  page.drawText("INVOICE DETAILS", { x: metaX, y: y - 18, size: 8, font: bold, color: SLATE });
  page.drawText("Issued", { x: metaX, y: y - 36, size: 9, font, color: SLATE });
  drawRight(page, dateOf(input.createdAt), right - 12, y - 36, font, 9, NAVY);
  page.drawText("Paid", { x: metaX, y: y - 54, size: 9, font, color: SLATE });
  drawRight(page, dateOf(input.paidAt), right - 12, y - 54, font, 9, NAVY);
  page.drawText("Currency", { x: metaX, y: y - 72, size: 9, font, color: SLATE });
  drawRight(page, input.currency, right - 12, y - 72, font, 9, NAVY);

  y -= cardHeight + 30;
  page.drawText("SERVICES", { x: MARGIN, y, size: 9, font: bold, color: SLATE });
  if (input.description) {
    const desc = fitLines(input.description, font, 9, width - MARGIN * 2, 1)[0] ?? "";
    page.drawText(desc, { x: MARGIN, y: y - 14, size: 9, font, color: SLATE });
  }
  y -= 30;

  const tableX = MARGIN;
  const tableWidth = width - MARGIN * 2;
  const amountX = right;
  const descriptionWidth = tableWidth - 140;
  page.drawRectangle({
    x: tableX,
    y: y - 24,
    width: tableWidth,
    height: 24,
    color: NAVY,
  });
  page.drawText("Description", {
    x: tableX + 10,
    y: y - 16,
    size: 8,
    font: bold,
    color: WHITE,
  });
  drawRight(page, "Amount", amountX - 10, y - 16, bold, 8, WHITE);
  y -= 24;

  input.lines.forEach((line, index) => {
    const lineHeight = 12;
    const descLines = fitLines(line.description, font, 10, descriptionWidth, 2);
    const rowHeight = Math.max(28, 12 + descLines.length * lineHeight);
    if (index % 2 === 0) {
      page.drawRectangle({
        x: tableX,
        y: y - rowHeight,
        width: tableWidth,
        height: rowHeight,
        color: LIGHT,
      });
    }
    let lineY = y - 16;
    for (const desc of descLines) {
      page.drawText(desc, { x: tableX + 10, y: lineY, size: 10, font, color: NAVY });
      lineY -= lineHeight;
    }
    drawRight(page, money(line.amountMinor, input.currency), amountX - 10, y - 16, font, 10, NAVY);
    page.drawLine({
      start: { x: tableX, y: y - rowHeight },
      end: { x: tableX + tableWidth, y: y - rowHeight },
      thickness: 0.6,
      color: LINE,
    });
    y -= rowHeight;
  });

  const subtotal = input.lines
    .filter((line) => line.amountMinor > 0)
    .reduce((sum, line) => sum + line.amountMinor, 0);
  const discount = -input.lines
    .filter((line) => line.amountMinor < 0)
    .reduce((sum, line) => sum + line.amountMinor, 0);
  const paid = input.status === "paid" ? input.totalMinor : 0;
  const balance = input.totalMinor - paid;

  y -= 22;
  const totalsLabelX = width - MARGIN - 220;
  const totalsValueX = right - 10;

  const totalRow = (label: string, value: number, strong = false) => {
    page.drawText(label, {
      x: totalsLabelX,
      y,
      size: strong ? 11 : 10,
      font: strong ? bold : font,
      color: strong ? NAVY : SLATE,
    });
    drawRight(page, money(value, input.currency), totalsValueX, y, strong ? bold : font, strong ? 11 : 10, strong ? NAVY : NAVY);
    y -= strong ? 20 : 16;
  };

  totalRow("Subtotal", subtotal);
  if (discount > 0) totalRow("Discount", -discount);
  page.drawLine({
    start: { x: totalsLabelX, y: y + 6 },
    end: { x: totalsValueX, y: y + 6 },
    thickness: 0.8,
    color: LINE,
  });
  y -= 8;
  totalRow("Total", input.totalMinor, true);
  totalRow("Amount paid", paid);
  totalRow("Balance due", balance, true);

  const footerY = 42;
  page.drawLine({
    start: { x: MARGIN, y: footerY + 18 },
    end: { x: right, y: footerY + 18 },
    thickness: 0.6,
    color: LINE,
  });
  page.drawText("Thank you for your business.", {
    x: MARGIN,
    y: footerY,
    size: 9,
    font,
    color: SLATE,
  });
  if (input.supportEmail) {
    drawRight(page, input.supportEmail, right, footerY, font, 9, SLATE);
  }

  return doc.save();
}
