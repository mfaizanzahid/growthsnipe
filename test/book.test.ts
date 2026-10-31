import { beforeEach, describe, expect, it } from "vitest";
import { createBookRoutes } from "../src/server/routes/book";
import { captureEmails } from "../src/server/lib/email";
import type { Auth } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";
import type { Env } from "../src/server/types";

const ENV = {} as unknown as Env;

const VALID = {
  name: "Ada Owner",
  workEmail: "ada@example.com",
  phone: "555-010-2030",
  businessName: "Ada Home Inspections",
  website: "https://adainspections.example.com",
  trade: "Home inspection",
  serviceArea: "Austin, TX",
  revenueRange: "Under $250k",
  teamSize: "2 to 5",
  software: "Spectora",
  growthChallenge: "Too many missed calls after hours and no follow-up system.",
};

function buildApp(supportEmail: string) {
  return createBookRoutes({
    ctx: { db: {} as unknown as Db, auth: {} as unknown as Auth },
    settings: { getSupportEmail: async () => supportEmail },
  });
}

function req(app: ReturnType<typeof buildApp>, body: unknown) {
  return app.request(
    "/api/book",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    ENV,
  );
}

beforeEach(() => {
  captureEmails();
});

describe("book-a-call route", () => {
  it("emails the request with all fields to the support address", async () => {
    const outbox = captureEmails();
    const app = buildApp("help@test.com");
    const res = await req(app, {
      ...VALID,
      marketingSpend: "Under 1k/mo",
      growthTarget: "50% growth",
      notes: "Evenings work best.",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe("help@test.com");
    expect(outbox[0]?.subject).toContain("Ada Home Inspections");
    expect(outbox[0]?.html).toContain("Evenings work best.");
  });

  it("accepts a request without the optional fields", async () => {
    const app = buildApp("help@test.com");
    const res = await req(app, VALID);
    expect(res.status).toBe(200);
  });

  it("rejects missing required fields, bad email, and short challenge", async () => {
    const app = buildApp("help@test.com");
    expect((await req(app, { ...VALID, workEmail: "not-an-email" })).status).toBe(422);
    expect((await req(app, { ...VALID, revenueRange: "Millions" })).status).toBe(422);
    expect((await req(app, { ...VALID, growthChallenge: "short" })).status).toBe(422);
    const { businessName: _dropped, ...missing } = VALID;
    expect(missing).not.toHaveProperty("businessName");
    expect((await req(app, missing)).status).toBe(422);
  });

  it("503s when no support address is configured", async () => {
    const app = buildApp("");
    const res = await req(app, VALID);
    expect(res.status).toBe(503);
  });
});
