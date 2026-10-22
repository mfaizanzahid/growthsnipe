import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "vite";
import { embedSnippetFor, parseEmbedAttrs, splitEmbedHtml } from "../src/react-app/lib/embeds";

const ZOHO =
  '<script>window.$zoho=window.$zoho || {};$zoho.salesiq=$zoho.salesiq||{ready:function(){}}</script>' +
  '<script id="zsiqscript" src="https://salesiq.zohopublic.com/widget?wc=siq468e5f801848e5904a9b7053f9b977f00a3d6406ab04b113ea78bf8c583463eb" defer></script>';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("embedSnippetFor", () => {
  it("maps each surface to its own build-time variable", () => {
    vi.stubEnv("VITE_EMBED_APP_HTML", "<script>app</script>");
    vi.stubEnv("VITE_EMBED_MARKETING_HTML", "<script>marketing</script>");
    expect(embedSnippetFor("app")).toBe("<script>app</script>");
    expect(embedSnippetFor("marketing")).toBe("<script>marketing</script>");
  });

  it("trims the value", () => {
    vi.stubEnv("VITE_EMBED_APP_HTML", "  <script>app</script>  ");
    expect(embedSnippetFor("app")).toBe("<script>app</script>");
  });

  it("treats a blank value as no snippet for that surface", () => {
    vi.stubEnv("VITE_EMBED_APP_HTML", "   ");
    vi.stubEnv("VITE_EMBED_MARKETING_HTML", "");
    expect(embedSnippetFor("app")).toBeNull();
    expect(embedSnippetFor("marketing")).toBeNull();
  });

  it("treats a missing variable as no snippet", () => {
    vi.stubEnv("VITE_EMBED_APP_HTML", undefined);
    expect(embedSnippetFor("app")).toBeNull();
  });
});

describe("vite env loading", () => {
  // Vite expands $VAR references inside env values, so a bare $zoho in a
  // vendor snippet is silently replaced with an empty string and the widget
  // breaks. \$ is the documented escape. This test fails if that ever changes.
  it("keeps an escaped $ intact and expands an unescaped one", () => {
    const dir = mkdtempSync(join(tmpdir(), "tm-embeds-"));
    writeFileSync(
      join(dir, ".env"),
      [
        "VITE_ESCAPED=window.\\$zoho=window.\\$zoho",
        "VITE_BARE=window.$zoho=window.$zoho",
      ].join("\n"),
    );
    const env = loadEnv("development", dir, "VITE_");
    expect(env.VITE_ESCAPED).toBe("window.$zoho=window.$zoho");
    expect(env.VITE_BARE).not.toContain("$zoho");
  });
});

describe("parseEmbedAttrs", () => {
  it("reads quoted, single-quoted, unquoted and boolean attributes", () => {
    expect(parseEmbedAttrs(' id="zsiqscript" src="https://x.test/w?wc=1" defer async ')).toEqual({
      id: "zsiqscript",
      src: "https://x.test/w?wc=1",
      defer: "",
      async: "",
    });
    expect(parseEmbedAttrs("src='https://x.test/'")).toEqual({ src: "https://x.test/" });
    expect(parseEmbedAttrs("src=https://x.test/")).toEqual({ src: "https://x.test/" });
  });
});

describe("splitEmbedHtml", () => {
  it("splits the Zoho snippet into an inline script and an external script", () => {
    const { scripts, markup } = splitEmbedHtml(ZOHO);
    expect(scripts).toHaveLength(2);
    expect(scripts[0]?.code).toContain("window.$zoho");
    expect(scripts[0]?.attrs).toEqual({});
    expect(scripts[1]?.code).toBe("");
    expect(scripts[1]?.attrs).toEqual({
      id: "zsiqscript",
      src: "https://salesiq.zohopublic.com/widget?wc=siq468e5f801848e5904a9b7053f9b977f00a3d6406ab04b113ea78bf8c583463eb",
      defer: "",
    });
    expect(markup.trim()).toBe("");
  });

  it("keeps non-script markup for insertion", () => {
    const { scripts, markup } = splitEmbedHtml('<div id="chat"></div><script src="https://x.test/w.js"></script>');
    expect(scripts).toHaveLength(1);
    expect(markup).toContain('<div id="chat"></div>');
    expect(markup).not.toContain("script");
  });

  it("handles a snippet with no scripts at all", () => {
    const { scripts, markup } = splitEmbedHtml('<div id="chat"></div>');
    expect(scripts).toHaveLength(0);
    expect(markup).toBe('<div id="chat"></div>');
  });

  it("supports self-closing script tags", () => {
    const { scripts } = splitEmbedHtml('<script src="https://x.test/w.js" />');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.attrs.src).toBe("https://x.test/w.js");
  });
});
