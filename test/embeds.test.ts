import { describe, expect, it } from "vitest";
import {
  embedSnippetFor,
  parseEmbedAttrs,
  splitEmbedHtml,
} from "../src/react-app/lib/embeds";
import { EMPTY_RUNTIME_CONFIG, type RuntimeConfig } from "../src/react-app/lib/runtime-config";

const ZOHO =
  '<script>window.$zoho=window.$zoho || {};$zoho.salesiq=$zoho.salesiq||{ready:function(){}}</script>' +
  '<script id="zsiqscript" src="https://salesiq.zohopublic.com/widget?wc=siq468e5f801848e5904a9b7053f9b977f00a3d6406ab04b113ea78bf8c583463eb" defer></script>';

function config(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return { ...EMPTY_RUNTIME_CONFIG, ...overrides };
}

describe("embedSnippetFor", () => {
  it("maps each surface to its runtime config value", () => {
    const value = config({
      embedAppHtml: "<script>app</script>",
      embedMarketingHtml: "<script>marketing</script>",
    });
    expect(embedSnippetFor("app", value)).toBe("<script>app</script>");
    expect(embedSnippetFor("marketing", value)).toBe("<script>marketing</script>");
  });

  it("trims the value", () => {
    expect(embedSnippetFor("app", config({ embedAppHtml: "  <script>app</script>  " }))).toBe(
      "<script>app</script>",
    );
  });

  it("treats a blank value as no snippet for that surface", () => {
    expect(embedSnippetFor("app", config({ embedAppHtml: "   " }))).toBeNull();
    expect(embedSnippetFor("marketing", config({ embedMarketingHtml: "" }))).toBeNull();
  });

  it("treats a missing value as no snippet", () => {
    expect(embedSnippetFor("app", EMPTY_RUNTIME_CONFIG)).toBeNull();
    expect(embedSnippetFor("marketing", EMPTY_RUNTIME_CONFIG)).toBeNull();
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
