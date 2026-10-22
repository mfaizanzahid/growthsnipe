import { describe, expect, it, vi, afterEach } from "vitest";
import {
  parseSenderAddress,
  resolveBrevoSender,
  resolveSignupListId,
  sendBrevoEmail,
  addBrevoContactToLists,
} from "../src/server/lib/brevo";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("brevo sender parsing", () => {
  it("parses Name <email> senders", () => {
    expect(parseSenderAddress("GrowthSnipe <hello@growthsnipe.com>")).toEqual({
      email: "hello@growthsnipe.com",
      name: "GrowthSnipe",
    });
  });

  it("parses plain emails and rejects garbage", () => {
    expect(parseSenderAddress("hello@growthsnipe.com")).toEqual({ email: "hello@growthsnipe.com" });
    expect(parseSenderAddress("not-an-email")).toBeUndefined();
    expect(parseSenderAddress(undefined)).toBeUndefined();
  });

  it("prefers explicit BREVO_SENDER_* over the legacy from", () => {
    expect(
      resolveBrevoSender({
        brevoEmail: "news@growthsnipe.com",
        brevoName: "GrowthSnipe",
        fallbackFrom: "Old <old@x.com>",
      }),
    ).toEqual({ email: "news@growthsnipe.com", name: "GrowthSnipe" });
    expect(resolveBrevoSender({ fallbackFrom: "Old <old@x.com>" })).toEqual({
      email: "old@x.com",
      name: "Old",
    });
  });

  it("resolves the signup list id, defaulting to 8", () => {
    expect(resolveSignupListId(undefined)).toBe(8);
    expect(resolveSignupListId("8")).toBe(8);
    expect(resolveSignupListId("12")).toBe(12);
    expect(resolveSignupListId("junk")).toBe(8);
  });
});

describe("brevo api calls", () => {
  it("sends transactional email via /smtp/email", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messageId: "m1" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await sendBrevoEmail(
      "brevo-key",
      { email: "hello@growthsnipe.com", name: "GrowthSnipe" },
      { to: "user@x.com", bcc: ["boss@x.com", "USER@x.com"], subject: "Hi", html: "<p>Hi</p>" },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("brevo-key");
    const body = JSON.parse(init.body as string);
    expect(body.sender).toEqual({ email: "hello@growthsnipe.com", name: "GrowthSnipe" });
    expect(body.to).toEqual([{ email: "user@x.com" }]);
    // Self-address excluded from bcc, superadmin copy kept.
    expect(body.bcc).toEqual([{ email: "boss@x.com" }]);
    expect(body.subject).toBe("Hi");
  });

  it("creates contacts with updateEnabled and listIds", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await addBrevoContactToLists("brevo-key", {
      email: "new@x.com",
      name: "Jane Doe",
      listIds: [8],
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/contacts");
    const body = JSON.parse(init.body as string);
    expect(body.email).toBe("new@x.com");
    expect(body.listIds).toEqual([8]);
    expect(body.updateEnabled).toBe(true);
    expect(body.attributes).toEqual({ FNAME: "Jane", LNAME: "Doe" });
  });

  it("falls back to add-to-list when the contact already exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Contact already exists" }), { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await addBrevoContactToLists("brevo-key", { email: "dup@x.com", listIds: [8] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.brevo.com/v3/contacts/lists/8/contacts/add");
  });
});

describe("email transport prefers Brevo, keeps Resend fallback", () => {
  it("captures to outbox when no provider is configured", async () => {
    const { captureEmails, sendEmail } = await import("../src/server/lib/email");
    const outbox = captureEmails();
    await sendEmail({ RESEND_API_KEY: "" } as never, { to: "a@x.com", subject: "s", html: "<p>x</p>" });
    expect(outbox).toHaveLength(1);
  });

  it("subscribe helper never throws without a key", async () => {
    const { subscribeVerifiedUserToBrevo } = await import("../src/server/lib/email");
    await expect(
      subscribeVerifiedUserToBrevo({} as never, { email: "a@x.com", name: "A" }),
    ).resolves.toBe("skipped");
  });

  it("subscribe helper swallows Brevo failures (best-effort)", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { subscribeVerifiedUserToBrevo } = await import("../src/server/lib/email");
    await expect(
      subscribeVerifiedUserToBrevo({ BREVO_API_KEY: "k" } as never, { email: "a@x.com" }),
    ).resolves.toBe("failed");
  });
});
