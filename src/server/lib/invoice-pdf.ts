import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface InvoicePdfInput {
  portalName: string;
  supportEmail: string;
  number: string;
  status: string;
  orgName: string;
  description: string | null;
  currency: string;
  lines: Array<{ description: string; amountMinor: number }>;
  totalMinor: number;
  createdAt: Date | number;
  paidAt: Date | number | null;
}

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}

function dateOf(v: Date | number): string {
  const d = typeof v === "number" ? new Date(v) : v;
  return d.toISOString().slice(0, 10);
}

/** Render an invoice PDF (pure JS — Workers-safe). Returns PDF bytes. */
export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const { height } = page.getSize();
  let y = height - 60;

  const text = (str: string, opts?: { size?: number; bold?: boolean; x?: number }) => {
    page.drawText(str.slice(0, 90), {
      x: opts?.x ?? 50,
      y,
      size: opts?.size ?? 11,
      font: opts?.bold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= (opts?.size ?? 11) + 6;
  };

  text(input.portalName, { size: 18, bold: true });
  if (input.supportEmail) text(input.supportEmail, { size: 10 });
  y -= 10;
  text(`Invoice ${input.number}`, { size: 16, bold: true });
  text(`Status: ${input.status.toUpperCase()}`);
  text(`Billed to: ${input.orgName}`);
  text(`Issued: ${dateOf(input.createdAt)}`);
  if (input.paidAt) text(`Paid: ${dateOf(input.paidAt)}`);
  if (input.description) text(input.description);
  y -= 8;
  text("Items", { bold: true });
  for (const line of input.lines) {
    text(line.description);
    text(money(line.amountMinor, input.currency), { x: 430 });
    y += 0;
  }
  y -= 6;
  text(`Total: ${money(input.totalMinor, input.currency)}`, { size: 13, bold: true });

  return doc.save();
}
