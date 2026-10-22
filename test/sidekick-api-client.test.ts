import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/react-app/lib/sidekick";

function mockFetch(res: Response) {
  vi.stubGlobal("fetch", vi.fn(async () => res));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client error surfacing", () => {
  it("shows the gate's plain-text message, not a generic status line", async () => {
    mockFetch(
      new Response("Subscription required - upgrade from billing to restore access", { status: 402 }),
    );
    await expect(api("/api/sidekick/connections")).rejects.toThrow(
      "Subscription required - upgrade from billing to restore access",
    );
  });

  it("prefers a JSON error field", async () => {
    mockFetch(
      new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
    );
    await expect(api("/x")).rejects.toThrow("Not found");
  });

  it("never leaks an HTML error page into the message", async () => {
    mockFetch(new Response("<!DOCTYPE html><html><body>oops</body></html>", { status: 500 }));
    await expect(api("/x")).rejects.toThrow("Request failed (500)");
  });

  it("falls back to a status line for an empty body", async () => {
    mockFetch(new Response("", { status: 503 }));
    await expect(api("/x")).rejects.toThrow("Request failed (503)");
  });

  it("falls back to a status line when JSON carries no error field", async () => {
    mockFetch(new Response(JSON.stringify({ issues: [] }), { status: 422 }));
    await expect(api("/x")).rejects.toThrow("Request failed (422)");
  });

  it("returns the parsed body on success", async () => {
    mockFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(api<{ ok: boolean }>("/x")).resolves.toEqual({ ok: true });
  });
});
