import { beforeEach, describe, expect, it } from "vitest";
import { createContactRoutes } from "../src/server/routes/contact";
import { captureEmails } from "../src/server/lib/email";
import type { Auth } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";
import type { Env } from "../src/server/types";

const ENV = {} as unknown as Env;

function buildApp(supportEmail: string) {
  return createContactRoutes({
    ctx: { db: {} as unknown as Db, auth: {} as unknown as Auth },
    settings: { getSupportEmail: async () => supportEmail },
  });
}

function req(app: ReturnType<typeof buildApp>, body: unknown) {
  return app.request(
    "/api/contact",
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

describe("contact form route", () => {
  it("sends the message to the support address", async () => {
    const outbox = captureEmails();
    const app = buildApp("help@test.com");
    const res = await req(app, { name: "Ada", email: "ada@test.com", message: "Hello, I need help with billing." });
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe("help@test.com");
    expect(outbox[0]?.html).toContain("Ada");
  });

  it("rejects invalid payloads", async () => {
    const app = buildApp("help@test.com");
    expect((await req(app, { name: "", email: "x", message: "short" })).status).toBe(422);
    expect((await req(app, { name: "Ada", email: "ada@test.com", message: "short" })).status).toBe(422);
  });

  it("503s when no support address is configured", async () => {
    const app = buildApp("");
    const res = await req(app, { name: "Ada", email: "ada@test.com", message: "Hello, I need help with billing." });
    expect(res.status).toBe(503);
  });
});
