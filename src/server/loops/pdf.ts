import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import {
  BORDER,
  CONTENT_W,
  INK,
  MARGIN,
  MUTED,
  PAGE_H,
  PAGE_W,
  PRIMARY,
  Report,
  SOFT,
  WHITE,
  sanitize,
  type TocEntry,
} from "../lib/pdf-report";
import { OFFERS, OFFER_CREDITS } from "../../lib/offers";
import { loopsTradeChapter, loopsTradeLabel } from "../../lib/loops-trades";
import { loopsPlaybook } from "./playbook";

export type Block =
  | { kind: "h1"; text: string; toc?: number }
  | { kind: "h2"; text: string; toc?: number }
  | { kind: "h3"; text: string }
  | { kind: "para"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "ordered"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "code"; lines: string[] };

interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
}

const TOC_PER_PAGE = 20;

const SECTION_INDEX = new Map<string, string>([
  ["How to Use This Guide", "Start here"],
  ["Customer Lifecycle Map", "The whole journey"],
  ["The Eight Revenue Loops", "The core system"],
  ["Trade-Specific Revenue Loops", "Your trade"],
  ["Sample End-to-End Recipes", "Copy these first"],
  ["Follow-Up Script Library", "Words you can use"],
  ["Keep Track of What Works", "Measure it"],
]);

function isTocHeading(block: Block, currentH1: string): boolean {
  if (block.kind === "h1") return true;
  if (block.kind !== "h2") return false;
  if (currentH1 === "Follow-Up Script Library") return false;
  return true;
}

/** Parse the bundled Markdown playbook into branded document blocks. */
function parsePlaybook(markdown: string): { preamble: Block[]; blocks: Block[] } {
  const lines = markdown.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "").split("\n");
  const preamble: Block[] = [];
  const blocks: Block[] = [];
  let currentH1 = "";
  let seenCoverTitle = false;
  let tocCount = 0;
  let buffer: string[] = [];
  let list: string[] | null = null;
  let listOrdered = false;
  let table: string[][] | null = null;
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (buffer.length === 0) return;
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    if (!text) return;
    const target = currentH1 === "" ? preamble : blocks;
    target.push({ kind: "para", text });
  };

  const flushList = () => {
    if (!list) return;
    blocks.push(listOrdered ? { kind: "ordered", items: list } : { kind: "bullets", items: list });
    list = null;
  };

  const flushTable = () => {
    if (!table) return;
    const rows = table.filter((row) => !row.every((cell) => /^-+:?$/.test(cell.replace(/\s+/g, ""))));
    if (rows.length > 0) {
      blocks.push({ kind: "table", header: rows[0]!, rows: rows.slice(1) });
    }
    table = null;
  };

  const flush = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (code) {
      if (trimmed.startsWith("```")) {
        blocks.push({ kind: "code", lines: code });
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (trimmed.startsWith("```")) {
      flush();
      code = [];
      continue;
    }

    if (trimmed === "") {
      flush();
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flush();
      const title = trimmed.slice(2).trim();
      if (!seenCoverTitle && title === "SNIPE Loops") {
        seenCoverTitle = true;
        currentH1 = "";
        continue;
      }
      currentH1 = title;
      const block: Block = { kind: "h1", text: title };
      if (isTocHeading(block, currentH1)) block.toc = tocCount++;
      blocks.push(block);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flush();
      const title = trimmed.slice(3).trim();
      if (currentH1 === "" && title.toLowerCase().startsWith("a practical revenue playbook")) {
        continue;
      }
      const block: Block = { kind: "h2", text: title };
      const checkH1 = currentH1;
      if (isTocHeading(block, checkH1)) block.toc = tocCount++;
      blocks.push(block);
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flush();
      blocks.push({ kind: "h3", text: trimmed.slice(4).trim() });
      continue;
    }

    if (trimmed.startsWith("|")) {
      if (list) flushList();
      if (buffer.length > 0) flushParagraph();
      const cells = trimmed
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
      table = table ?? [];
      table.push(cells);
      continue;
    }
    if (table) flushTable();

    if (trimmed.startsWith("- ")) {
      if (buffer.length > 0) flushParagraph();
      if (list && listOrdered) flushList();
      list = list ?? [];
      listOrdered = false;
      list.push(trimmed.slice(2).trim());
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ordered) {
      if (buffer.length > 0) flushParagraph();
      if (list && !listOrdered) flushList();
      list = list ?? [];
      listOrdered = true;
      list.push(ordered[1]!.trim());
      continue;
    }
    if (list) flushList();

    buffer.push(trimmed);
  }

  flush();
  return { preamble, blocks };
}

function cloneBlock(block: Block): Block {
  if (block.kind === "bullets" || block.kind === "ordered") {
    return { ...block, items: [...block.items] };
  }
  if (block.kind === "table") {
    return { ...block, header: [...block.header], rows: block.rows.map((row) => [...row]) };
  }
  if (block.kind === "code") {
    return { ...block, lines: [...block.lines] };
  }
  return { ...block };
}

function renumberToc(blocks: Block[]): Block[] {
  let index = 0;
  for (const block of blocks) {
    if ((block.kind === "h1" || block.kind === "h2") && block.toc !== undefined) {
      block.toc = index;
      index += 1;
    }
  }
  return blocks;
}

/**
 * Keep the full playbook for Others/unknown trades. For a known trade, keep
 * only that trade's chapter and replace the generic chapter-picker intro with
 * a trade-specific one.
 */
export function selectPlaybookForTrade(blocks: Block[], trade?: string | null): Block[] {
  const source = blocks.map(cloneBlock);
  const chapter = loopsTradeChapter(trade);
  if (!chapter) return renumberToc(source);

  const h1Index = source.findIndex(
    (block) => block.kind === "h1" && block.text === "Trade-Specific Revenue Loops",
  );
  if (h1Index < 0) return renumberToc(source);

  let sectionEnd = source.length;
  for (let index = h1Index + 1; index < source.length; index += 1) {
    if (source[index]!.kind === "h1") {
      sectionEnd = index;
      break;
    }
  }
  const section = source.slice(h1Index, sectionEnd);
  const chapterIndex = section.findIndex((block) => block.kind === "h2" && block.text === chapter);
  if (chapterIndex < 0) return renumberToc(source);

  let chapterEnd = section.length;
  for (let index = chapterIndex + 1; index < section.length; index += 1) {
    if (section[index]!.kind === "h2") {
      chapterEnd = index;
      break;
    }
  }

  const intro: Block = {
    kind: "para",
    text: `This edition is built for ${chapter} businesses. Each loop shows when to start, what to do, what to watch out for, and what results to track.`,
  };

  return renumberToc([
    ...source.slice(0, h1Index),
    section[0]!,
    intro,
    ...section.slice(chapterIndex, chapterEnd),
    ...source.slice(sectionEnd),
  ]);
}

function stripEmphasis(value: string): string {
  return value.replace(/\*\*/g, "").replace(/(^|\s)\*(\S[^*]*)\*/g, "$1$2");
}

function parseRuns(value: string): Run[] {
  const clean = sanitize(value).replace(/<\/?small>/g, "");
  const parts = clean.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((part) => part.length > 0);
  return parts.map((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return { text: part.slice(2, -2), bold: true, italic: false };
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return { text: part.slice(1, -1), bold: false, italic: true };
    }
    return { text: part, bold: false, italic: false };
  });
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
}

function fontFor(run: Run, fonts: Fonts): PDFFont {
  if (run.bold && run.italic) return fonts.boldItalic;
  if (run.bold) return fonts.bold;
  if (run.italic) return fonts.italic;
  return fonts.regular;
}

function isQuoted(text: string): boolean {
  const value = text.trim();
  return value.startsWith('"') && value.endsWith('"');
}

function loopNumber(title: string): number | null {
  const match = title.match(/^Loop\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

export interface LoopsPdfInput {
  businessName?: string | null;
  trade?: string | null;
  preparedAt?: number;
  /** Absolute site URL used in the closing next-step links. */
  baseUrl?: string;
}

/**
 * Render the standard SNIPE Loops playbook on demand. The markdown source is
 * bundled by scripts/inline-knowledge.mjs, so the PDF stays in step with
 * docs/SNIPE_Loops_Playbook.md.
 */
export async function renderLoopsPdf(input: LoopsPdfInput = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const report = new Report(doc, fonts.regular, fonts.bold, { productName: "SNIPE Loops™" });
  const parsed = parsePlaybook(loopsPlaybook);
  const preamble = parsed.preamble;
  const blocks = selectPlaybookForTrade(parsed.blocks, input.trade);
  const tocTitles = blocks.filter((block) => (block.kind === "h1" || block.kind === "h2") && block.toc !== undefined);
  const nextStepsIndex = tocTitles.length;
  const tocPageCount = Math.max(1, Math.ceil((tocTitles.length + 1) / TOC_PER_PAGE));
  const preparedAt = input.preparedAt ?? Date.now();
  const preparedDate = new Date(preparedAt).toISOString().slice(0, 10);
  const base = (input.baseUrl ?? "https://growthsnipe.com").replace(/\/+$/, "");

  // Cover.
  report.start();
  const cover = report.currentPage;
  cover.drawRectangle({ x: 0, y: PAGE_H - 220, width: PAGE_W, height: 220, color: PRIMARY });
  cover.drawText("GrowthSnipe", { x: MARGIN, y: PAGE_H - 70, size: 13, font: fonts.bold, color: WHITE });
  cover.drawText("SNIPE Loops™", { x: MARGIN, y: PAGE_H - 130, size: 34, font: fonts.bold, color: WHITE });
  cover.drawText("The eight revenue loops playbook", {
    x: MARGIN,
    y: PAGE_H - 160,
    size: 14,
    font: fonts.regular,
    color: rgb(0.85, 0.92, 1),
  });
  cover.drawText(sanitize(input.businessName?.trim() || "Prepared for your business"), {
    x: MARGIN,
    y: PAGE_H - 280,
    size: 22,
    font: fonts.bold,
    color: INK,
  });
  const tradeLabel = loopsTradeLabel(input.trade);
  if (tradeLabel) {
    cover.drawText(sanitize(tradeLabel), {
      x: MARGIN,
      y: PAGE_H - 304,
      size: 11,
      font: fonts.regular,
      color: MUTED,
    });
  }
  cover.drawText(`Prepared ${preparedDate}`, {
    x: MARGIN,
    y: PAGE_H - 330,
    size: 10,
    font: fonts.regular,
    color: MUTED,
  });
  cover.drawLine({ start: { x: MARGIN, y: 120 }, end: { x: PAGE_W - MARGIN, y: 120 }, thickness: 0.7, color: BORDER });
  cover.drawText("Confidential. Prepared for the named business.", {
    x: MARGIN,
    y: 100,
    size: 9,
    font: fonts.regular,
    color: MUTED,
  });

  // Reserve contents pages before any content page is created.
  const tocPages: PDFPage[] = [];
  for (let i = 0; i < tocPageCount; i += 1) {
    report.newPage(false);
    tocPages.push(report.currentPage);
  }

  const entries: Array<TocEntry | undefined> = new Array(tocTitles.length + 1);
  let currentH1 = "";

  const space = (amount: number) => report.space(amount);

  const drawRich = (
    text: string,
    opts: {
      x?: number;
      width?: number;
      size?: number;
      color?: RGB;
      boldColor?: RGB;
      italicAll?: boolean;
      leading?: number;
      indent?: number;
    } = {},
  ): number => {
    const size = opts.size ?? 9.6;
    const leading = opts.leading ?? size * 1.45;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? CONTENT_W - (x - MARGIN);
    const runs = parseRuns(text).map((run) =>
      opts.italicAll ? { ...run, italic: true } : run,
    );
    const words: Array<{ text: string; run: Run }> = [];
    for (const run of runs) {
      const segments = run.text.split(/(\s+)/).filter((segment) => segment.length > 0);
      for (const segment of segments) {
        if (/^\s+$/.test(segment)) continue;
        let remaining = segment;
        while (remaining.length > 0) {
          let chunk = remaining;
          while (chunk.length > 1 && fontFor(run, fonts).widthOfTextAtSize(chunk, size) > width) {
            chunk = chunk.slice(0, -1);
          }
          words.push({ text: chunk, run });
          remaining = remaining.slice(chunk.length);
        }
      }
    }

    const lines: Array<Array<{ text: string; run: Run }>> = [];
    let line: Array<{ text: string; run: Run }> = [];
    let lineWidth = 0;
    const spaceWidth = fonts.regular.widthOfTextAtSize(" ", size);
    for (const word of words) {
      const wordWidth = fontFor(word.run, fonts).widthOfTextAtSize(word.text, size);
      const addition = line.length > 0 ? spaceWidth + wordWidth : wordWidth;
      if (line.length > 0 && lineWidth + addition > width) {
        lines.push(line);
        line = [];
        lineWidth = 0;
      }
      lineWidth += line.length > 0 ? spaceWidth + wordWidth : wordWidth;
      line.push(word);
    }
    if (line.length > 0) lines.push(line);

    const total = Math.max(1, lines.length) * leading + 2;
    report.ensure(total);
    const startY = report.cursor;
    lines.forEach((lineWords, lineIndex) => {
      let cursorX = x;
      lineWords.forEach((word, wordIndex) => {
        if (wordIndex > 0) cursorX += spaceWidth;
        const run = word.run;
        report.currentPage.drawText(word.text, {
          x: cursorX,
          y: startY - lineIndex * leading,
          size,
          font: fontFor(run, fonts),
          color: run.bold ? (opts.boldColor ?? opts.color ?? INK) : (opts.color ?? INK),
        });
        cursorX += fontFor(run, fonts).widthOfTextAtSize(word.text, size);
      });
    });
    report.setCursor(startY - total);
    return total;
  };

  const drawBullet = (text: string) => {
    const x = MARGIN + 14;
    const width = CONTENT_W - 14;
    const height = drawRich(text, { x, width, size: 9.5 });
    report.currentPage.drawCircle({ x: MARGIN + 3, y: report.cursor + height - 7, size: 1.7, color: PRIMARY });
  };

  const drawOrdered = (index: number, text: string) => {
    const startY = report.cursor;
    const height = drawRich(text, { x: MARGIN + 20, width: CONTENT_W - 20, size: 9.5 });
    report.currentPage.drawText(`${index}.`, {
      x: MARGIN,
      y: startY,
      size: 9.5,
      font: fonts.bold,
      color: PRIMARY,
    });
    void height;
  };

  const drawQuote = (text: string) => {
    const inner = text.trim().replace(/^"/, "").replace(/"$/, "");
    const linesHeight = report.measure(inner, { size: 9.5, x: MARGIN + 24, width: CONTENT_W - 36 });
    const height = linesHeight + 16;
    report.ensure(height + 8);
    const top = report.cursor;
    report.currentPage.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: CONTENT_W,
      height,
      color: SOFT,
      borderColor: BORDER,
      borderWidth: 0.6,
    });
    report.setCursor(top - 10);
    drawRich(inner, {
      x: MARGIN + 12,
      width: CONTENT_W - 24,
      size: 9.5,
      italicAll: true,
      color: INK,
      boldColor: PRIMARY,
    });
    report.setCursor(top - height - 8);
  };

  const drawCode = (lines: string[]) => {
    const size = 7.4;
    const leading = 10.2;
    const wrapped: string[] = [];
    for (const line of lines) {
      const pieces = report.wrapText(line, fonts.mono, size, CONTENT_W - 24);
      wrapped.push(...(pieces.length > 0 ? pieces : [""]));
    }
    const height = wrapped.length * leading + 18;
    report.ensure(height + 10);
    const top = report.cursor;
    report.currentPage.drawRectangle({
      x: MARGIN,
      y: top - height,
      width: CONTENT_W,
      height,
      color: rgb(0.975, 0.98, 0.99),
      borderColor: BORDER,
      borderWidth: 0.6,
    });
    wrapped.forEach((line, index) => {
      report.currentPage.drawText(sanitize(line), {
        x: MARGIN + 12,
        y: top - 14 - index * leading,
        size,
        font: fonts.mono,
        color: INK,
      });
    });
    report.setCursor(top - height - 10);
  };

  const drawTable = (header: string[], rows: string[][]) => {
    const columns = header.length;
    const widths =
      columns <= 2
        ? [1.1, 2.2]
        : columns === 3
          ? [1.5, 1, 2]
          : [1.4, 1, 1, 1.1];
    report.table(
      header.map(stripEmphasis),
      rows.map((row) => row.map(stripEmphasis)),
      widths,
    );
    space(4);
  };

  const drawParagraph = (text: string) => {
    if (isQuoted(text)) {
      drawQuote(text);
      return;
    }
    drawRich(text, { size: 9.6 });
    space(3);
  };

  const drawH1 = (block: Extract<Block, { kind: "h1" }>) => {
    report.newPage();
    if (block.toc !== undefined) entries[block.toc] = { title: block.text, page: report.currentPage };
    report.heading(block.text, { kicker: SECTION_INDEX.get(block.text), size: 24 });
  };

  const drawH2 = (block: Extract<Block, { kind: "h2" }>, nextBlocks: Block[]): number => {
    if (block.toc !== undefined) entries[block.toc] = { title: block.text, page: report.currentPage };
    const number = loopNumber(block.text);
    if (currentH1 === "The Eight Revenue Loops" && number !== null) {
      const paras: string[] = [];
      for (const next of nextBlocks) {
        if (next.kind !== "para") break;
        paras.push(next.text);
      }
      const pad = 14;
      const titleHeight = report.measure(block.text, { bold: true, size: 13, x: MARGIN + 46, width: CONTENT_W - 58 });
      const bodyHeight = paras.reduce(
        (sum, text) => sum + report.measure(text, { size: 9.4, x: MARGIN + pad, width: CONTENT_W - pad * 2 }),
        0,
      );
      const height = 28 + titleHeight + 8 + bodyHeight + pad;
      report.ensure(height + 10);
      const top = report.cursor;
      report.drawCard(MARGIN, top, CONTENT_W, height, PRIMARY);
      report.rankBadge(MARGIN + 24, top - 24, number, PRIMARY);
      report.currentPage.drawText(sanitize(block.text.replace(new RegExp(`^Loop\\s+${number}\\s*-\\s*`, "i"), "")), {
        x: MARGIN + 46,
        y: top - 28,
        size: 13,
        font: fonts.bold,
        color: INK,
      });
      report.setCursor(top - 28 - titleHeight - 6);
      for (const text of paras) drawRich(text, { x: MARGIN + pad, width: CONTENT_W - pad * 2, size: 9.4 });
      report.setCursor(top - height - 10);
      return paras.length;
    }

    if (currentH1 === "Trade-Specific Revenue Loops") {
      report.newPage();
      if (block.toc !== undefined) entries[block.toc] = { title: block.text, page: report.currentPage };
      const top = report.cursor;
      report.drawCard(MARGIN, top, CONTENT_W, 62, PRIMARY, PRIMARY);
      report.currentPage.drawText("TRADE CHAPTER", {
        x: MARGIN + 16,
        y: top - 18,
        size: 7.2,
        font: fonts.bold,
        color: rgb(0.85, 0.92, 1),
      });
      report.currentPage.drawText(sanitize(block.text), {
        x: MARGIN + 16,
        y: top - 42,
        size: 21,
        font: fonts.bold,
        color: WHITE,
      });
      report.setCursor(top - 62 - 14);
      return 0;
    }

    report.subheading(block.text, 0, PRIMARY);
    space(2);
    return 0;
  };

  const drawH3 = (block: Extract<Block, { kind: "h3" }>) => {
    const number = loopNumber(block.text);
    const title = number !== null ? block.text.replace(new RegExp(`^Loop\\s+${number}\\s*-\\s*`, "i"), "") : block.text;
    report.ensure(46);
    const top = report.cursor;
    if (number !== null) {
      report.rankBadge(MARGIN + 9, top - 1, number, PRIMARY);
    }
    report.currentPage.drawText(sanitize(title), {
      x: number !== null ? MARGIN + 24 : MARGIN,
      y: top - 5,
      size: 12,
      font: fonts.bold,
      color: INK,
    });
    report.setCursor(top - 24);
    space(2);
  };

  // Preamble page.
  report.newPage();
  report.heading("A practical revenue playbook", { kicker: "SNIPE Loops™", size: 24 });
  for (const block of preamble) {
    if (block.kind === "para") drawParagraph(block.text);
  }

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (block.kind === "h1") {
      currentH1 = block.text;
      drawH1(block);
      continue;
    }
    if (block.kind === "h2") {
      const consumed = drawH2(block, blocks.slice(index + 1));
      index += consumed;
      continue;
    }
    if (block.kind === "h3") {
      drawH3(block);
      continue;
    }
    if (block.kind === "para") {
      drawParagraph(block.text);
      continue;
    }
    if (block.kind === "bullets") {
      for (const item of block.items) drawBullet(item);
      space(4);
      continue;
    }
    if (block.kind === "ordered") {
      block.items.forEach((item, itemIndex) => drawOrdered(itemIndex + 1, item));
      space(4);
      continue;
    }
    if (block.kind === "table") {
      drawTable(block.header, block.rows);
      continue;
    }
    if (block.kind === "code") {
      drawCode(block.lines);
      space(4);
    }
  }

  // Recommended next steps: a branded conversion page at the end.
  report.newPage();
  entries[nextStepsIndex] = { title: "Recommended next steps", page: report.currentPage };
  report.heading("Turn the playbook into booked work", { kicker: "Your next step", size: 24 });
  report.text(
    "You have the loops. The next decision is where to apply them first. Choose the path that matches how much you want us to do.",
    { size: 10.5, color: MUTED },
  );
  report.space(6);

  const nextSteps = [
    {
      name: OFFERS.diagnostic.name,
      price: `${OFFERS.diagnostic.price.label} one-time`,
      why: "Find the loop with the most revenue behind it.",
      body: "A 12-month review of your booking data, a business-specific Leak Map and priority findings ranked by impact and effort. Includes a 30-minute findings call.",
      cta: "See the Diagnostic",
      url: `${base}/diagnostic`,
    },
    {
      name: OFFERS.blueprint.name,
      price: `${OFFERS.blueprint.price.label} one-time`,
      why: "Turn the findings into a 12-month plan you can run.",
      body: "Packaging, pricing, channels, local visibility, capacity and a phased roadmap. Includes the Diagnostic and SNIPE Loops™.",
      cta: "See the Blueprint",
      url: `${base}/blueprint`,
    },
    {
      name: "SNIPE Engine™",
      price: "Contact us for pricing",
      why: "Have the loops installed and run for you.",
      body: "We install and run the marketing, call coverage, CRM, follow-up loops and reporting. Core and Command are scoped one on one.",
      cta: "See the Engine",
      url: `${base}/engine`,
    },
  ];

  const drawNextStepCard = (
    step: (typeof nextSteps)[number],
    x: number,
    top: number,
    width: number,
  ): number => {
    const innerX = x + 14;
    const innerW = width - 28;
    const headerH = report.measure(`${step.name} - ${step.price}`, {
      bold: true,
      size: 11.5,
      x: innerX,
      width: innerW,
    });
    const whyH = report.measure(step.why, { bold: true, size: 9.5, x: innerX, width: innerW });
    const bodyH = report.measure(step.body, { size: 9.2, x: innerX, width: innerW });
    const height = 14 + headerH + whyH + bodyH + 36 + 18;
    report.drawCard(x, top, width, height, PRIMARY);
    report.setCursor(top - 14);
    report.text(`${step.name} - ${step.price}`, {
      bold: true,
      size: 11.5,
      x: innerX,
      width: innerW,
    });
    report.text(step.why, { bold: true, size: 9.5, color: PRIMARY, x: innerX, width: innerW });
    report.text(step.body, { size: 9.2, color: MUTED, x: innerX, width: innerW });
    report.linkButton(step.cta, step.url, innerX, top - height + 46, 150, false);
    return height;
  };

  const cardGap = 10;
  const halfW = (CONTENT_W - cardGap) / 2;
  const rowTop = report.cursor;
  const leftH = drawNextStepCard(nextSteps[0]!, MARGIN, rowTop, halfW);
  const rightH = drawNextStepCard(nextSteps[1]!, MARGIN + halfW + cardGap, rowTop, halfW);
  report.setCursor(rowTop - Math.max(leftH, rightH) - cardGap);

  const engineTop = report.cursor;
  const engineH = drawNextStepCard(nextSteps[2]!, MARGIN, engineTop, CONTENT_W);
  report.setCursor(engineTop - engineH - 10);

  report.ensure(120);
  const ctaTop = report.cursor;
  report.linkButton("Get My SNIPE Diagnostic™", `${base}/diagnostic`, MARGIN, ctaTop, CONTENT_W, true);
  report.setCursor(ctaTop - 44);
  report.linkButton("Book a Free Growth Fit Call", `${base}/book`, MARGIN, report.cursor, CONTENT_W, false);
  report.setCursor(ctaTop - 88);
  report.text(
    `Credits: ${OFFERS.diagnostic.price.label} Diagnostic toward a ${OFFERS.blueprint.name} within ${OFFER_CREDITS.diagnosticToBlueprint.days} days. ${OFFERS.blueprint.price.label} Blueprint toward SNIPE Engine™ setup within ${OFFER_CREDITS.blueprintToEngine.days} days of your presentation.`,
    { size: 8, color: MUTED },
  );
  report.text("No business outcome is guaranteed.", { size: 8, color: MUTED });

  // Fill the reserved contents pages now that every section has a page.
  for (let pageIndex = 0; pageIndex < tocPages.length; pageIndex += 1) {
    const pageEntries = entries
      .slice(pageIndex * TOC_PER_PAGE, (pageIndex + 1) * TOC_PER_PAGE)
      .filter((entry): entry is TocEntry => entry !== undefined);
    report.drawTocPage(tocPages[pageIndex]!, pageIndex + 2, pageEntries);
  }

  return doc.save();
}
