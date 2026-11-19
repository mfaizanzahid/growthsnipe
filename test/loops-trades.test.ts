import { describe, expect, it } from "vitest";
import {
  TRADE_OPTIONS,
  loopsTradeChapter,
  loopsTradeLabel,
} from "../src/lib/loops-trades";

describe("SNIPE Loops trade mapping", () => {
  it("offers the expected checkout choices including Others", () => {
    expect(TRADE_OPTIONS).toEqual([
      "Home inspection",
      "HVAC",
      "Plumbing",
      "Electrical",
      "Roofing",
      "General contracting",
      "Others",
    ]);
  });

  it("maps each known trade to its Markdown chapter", () => {
    expect(loopsTradeChapter("Home inspection")).toBe("Home Inspection");
    expect(loopsTradeChapter("HVAC")).toBe("HVAC");
    expect(loopsTradeChapter("Plumbing")).toBe("Plumbing");
    expect(loopsTradeChapter("Electrical")).toBe("Electrical");
    expect(loopsTradeChapter("Roofing")).toBe("Roofing");
    expect(loopsTradeChapter("General contracting")).toBe("General Contracting");
  });

  it("maps legacy aliases and uses the combined edition for Others or unknown trades", () => {
    expect(loopsTradeChapter("home inspector")).toBe("Home Inspection");
    expect(loopsTradeChapter("plumber")).toBe("Plumbing");
    expect(loopsTradeChapter("general contractor")).toBe("General Contracting");
    expect(loopsTradeChapter("Others")).toBeNull();
    expect(loopsTradeChapter("Window cleaning")).toBeNull();
    expect(loopsTradeChapter("")).toBeNull();
    expect(loopsTradeChapter(null)).toBeNull();
  });

  it("labels the cover without exposing the Others placeholder", () => {
    expect(loopsTradeLabel("HVAC")).toBe("HVAC");
    expect(loopsTradeLabel("general contractor")).toBe("General Contracting");
    expect(loopsTradeLabel("Others")).toBe("Home services");
    expect(loopsTradeLabel("Window cleaning")).toBe("Window cleaning");
    expect(loopsTradeLabel(null)).toBeNull();
  });
});
