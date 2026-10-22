import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPENAI_MODEL, synthesizeBriefing } from "../src/server/sidekick/synthesis";
import type { BriefingFacts } from "../src/server/briefing/types";

function facts(over: Partial<BriefingFacts> = {}): BriefingFacts {
  return {
    cadence: "morning_briefing",
    cadenceLabel: "Morning briefing",
    provider: "spectora",
    currency: "USD",
    timezone: "Asia/Karachi",
    current: { from: "2026-10-16T19:00:00.000Z", to: "2026-10-17T19:00:00.000Z", days: 1, label: "Yesterday" },
    previous: { from: "2026-10-15T19:00:00.000Z", to: "2026-10-16T19:00:00.000Z", days: 1, label: "Previous day" },
    metrics: {
      orders: 3,
      completed: 2,
      cancelled: 0,
      cancelledBounded: false,
      open: 1,
      cancelRatePct: 0,
      revenueMinor: 120000,
      avgTicketMinor: 60000,
      revenuePerDayMinor: 120000,
      paidOrders: 1,
      unpaidOrders: 1,
      unpaidAmountMinor: 45000,
      overdueOpenOrders: 1,
      referralMix: [],
      serviceMix: [],
      inspectors: [],
      teamJobs: 0,
      dailySeries: [],
    },
    deltas: { ordersPct: 20, revenuePct: -10, avgTicketPct: null, cancelRatePoints: null },
    dataQuality: { truncated: false, retrieved: 3, omissions: [], providerLimits: [] },
    ...over,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("briefing synthesis provider selection", () => {
  it("returns facts-only text when no provider is configured (no fetch)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const text = await synthesizeBriefing({} as never, facts());
    expect(text).toContain("AI SYNTHESIS NOT CONFIGURED");
    expect(text).toContain("MORNING BRIEFING");
    expect(text).toContain("orders: 3");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("labels the unconfigured fallback with the actual cadence, not always morning", async () => {
    const weekly = await synthesizeBriefing(
      {} as never,
      facts({ cadence: "weekly_review", cadenceLabel: "Weekly review" }),
    );
    expect(weekly).toContain("WEEKLY REVIEW");
    expect(weekly).not.toContain("MORNING BRIEFING");
  });

  it("calls OpenAI chat completions with the configured model", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "Briefing done" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const text = await synthesizeBriefing(
      { AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test", AI_MODEL: "gpt-5.6-luna" } as never,
      facts(),
    );
    expect(text).toBe("Briefing done");
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string) as { model: string; messages: unknown[] };
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.messages).toHaveLength(2);
  });

  it("sends the cadence lens and data limits to the model", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await synthesizeBriefing(
      { AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" } as never,
      facts({
        cadence: "weekly_review",
        dataQuality: {
          truncated: true,
          retrieved: 100,
          omissions: ["Retrieval was capped at 100 of about 900 records."],
          providerLimits: ["page size capped at 200"],
        },
      }),
    );
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { messages: { role: string; content: string }[] };
    const prompt = body.messages.map((m) => m.content).join("\n");
    // Weekly lens, not the daily one.
    expect(prompt).toContain("Weekly review");
    expect(prompt).toContain("trended versus the week before");
    // Limits travel with the numbers so the model can disclose them.
    expect(prompt).toContain("capped at 100 of about 900");
    expect(prompt).toContain("DATA QUALITY");
    // Money is rendered for humans, not leaked as raw cents.
    expect(prompt).toContain("$1,200");
  });

  it("fails loudly on an empty completion instead of delivering a blank report", async () => {
    // Regression, live 2026-10-17: a blank model response passed the old
    // `?? 'No briefing generated.'` guard (only null/undefined), stored an empty
    // briefing, and the job still reported "delivered".
    const blank = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", blank);
    await expect(
      synthesizeBriefing({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" } as never, facts()),
    ).rejects.toThrow("AI synthesis returned an empty briefing");

    const whitespace = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "   \n " } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", whitespace);
    await expect(
      synthesizeBriefing({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" } as never, facts()),
    ).rejects.toThrow("AI synthesis returned an empty briefing");
  });

  it("defaults the OpenAI model when AI_MODEL is unset", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    await synthesizeBriefing({ AI_PROVIDER: "OpenAI", OPENAI_API_KEY: "sk-test" } as never, facts());
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe(DEFAULT_OPENAI_MODEL);
  });

  it("throws on OpenAI API failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    await expect(
      synthesizeBriefing({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-bad" } as never, facts()),
    ).rejects.toThrow("AI synthesis failed: 401");
  });

  it("keeps the Anthropic path for non-openai providers", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ text: "Anthropic briefing" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const text = await synthesizeBriefing(
      { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-test" } as never,
      facts(),
    );
    expect(text).toBe("Anthropic briefing");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    // Anthropic takes the system prompt in its own field, not as a user message.
    const body = JSON.parse(init.body as string) as { system: string; messages: unknown[] };
    expect(body.system).toContain("Never invent a number");
    expect(body.messages).toHaveLength(1);
  });
});