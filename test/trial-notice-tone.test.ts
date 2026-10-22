import { describe, expect, it } from "vitest";
import { noticeTone } from "../src/react-app/lib/trial-notice";

const BLUE = "bg-primary text-primary-foreground";
const ORANGE = "bg-orange-500 text-orange-950";
const RED = "bg-red-600 text-white";

describe("trial notice banner tone", () => {
  it("stays brand blue while the trial has time left", () => {
    expect(noticeTone("trial", 30)).toBe(BLUE);
    expect(noticeTone("trial", 8)).toBe(BLUE);
    expect(noticeTone("trial", 7)).toBe(BLUE);
  });

  it("turns orange inside the last seven days", () => {
    expect(noticeTone("trial", 6)).toBe(ORANGE);
    expect(noticeTone("trial", 5)).toBe(ORANGE);
    expect(noticeTone("trial", 1)).toBe(ORANGE);
  });

  it("turns red on the final day, once expired, and when past due", () => {
    expect(noticeTone("trial", 0)).toBe(RED);
    expect(noticeTone("expired")).toBe(RED);
    expect(noticeTone("past_due")).toBe(RED);
  });

  it("never escalates on an unknown trial length", () => {
    expect(noticeTone("trial")).toBe(BLUE);
  });
});