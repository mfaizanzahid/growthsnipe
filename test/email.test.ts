import { describe, expect, it } from "vitest";
import {
  captureEmails,
  escapeHtml,
  invitationEmail,
  magicLinkEmail,
  resetPasswordEmail,
  sendEmail,
  superadminBcc,
  verificationEmail,
} from "../src/server/lib/email";

describe("email service", () => {
  it("captures instead of delivering when capture is enabled", async () => {
    const outbox = captureEmails();
    await sendEmail("re_test_key", {
      to: "user@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe("user@example.com");
  });

  it("captures when no API key is configured", async () => {
    const outbox = captureEmails();
    await sendEmail(undefined, {
      to: "user@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });
    expect(outbox).toHaveLength(1);
  });

  it("builds verification, magic-link, and invitation bodies", () => {    const v = verificationEmail("a@x.com", "https://app/verify?token=t");
    expect(v.to).toBe("a@x.com");
    expect(v.html).toContain("https://app/verify?token=t");

    const m = magicLinkEmail("a@x.com", "https://app/magic?token=t");
    expect(m.html).toContain("https://app/magic?token=t");

    const inv = invitationEmail("a@x.com", "Acme", "https://app/accept/1", "help@x.com");
    expect(inv.subject).toContain("Acme");
    expect(inv.html).toContain("https://app/accept/1");
    expect(inv.html).toContain("help@x.com");
  });

  it("escapes user-controlled values in HTML emails", async () => {    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    const inv = invitationEmail("a@x.com", "<b>Evil</b>", "https://app/accept/1", "help@x.com");
    expect(inv.html).not.toContain("<b>Evil</b>");
    expect(inv.html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
  });

  it("renders branded billing layout with action button", async () => {
    const { memoryStore } = await import("./memory-store");
    const { sendChargeReceipt } = await import("../src/server/billing/mail");
    const outbox = captureEmails();
    const store = memoryStore();
    await sendChargeReceipt({ RESEND_API_KEY: "x" } as never, store, ["a@x.com"], {
      invoiceNumber: "INV-2026-0001",
      amountMinor: 19900,
      currency: "USD",
      planName: "<Plan>",
    });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.subject).toContain("[GrowthSnipe]");
    expect(outbox[0]?.html).toContain("&lt;Plan&gt;");
    expect(outbox[0]?.html).toContain("View billing");
    expect(outbox[0]?.html).toContain("help@test.com");
  });

  it("builds password-reset bodies", () => {
    const r = resetPasswordEmail("a@x.com", "https://app/reset?token=t");
    expect(r.to).toBe("a@x.com");
    expect(r.html).toContain("https://app/reset?token=t");
  });

  it("bcc's superadmin emails except the primary recipient", () => {
    const env = { SUPERADMIN_EMAILS: "boss@test.com, ops@test.com" } as never;
    expect(superadminBcc(env, "user@test.com")).toEqual(["boss@test.com", "ops@test.com"]);
    expect(superadminBcc(env, "BOSS@test.com")).toEqual(["ops@test.com"]);
    expect(superadminBcc({} as never, "user@test.com")).toEqual([]);
  });

  it("sends billing notifications without a bcc (superadmin copy disabled)", async () => {
    const { memoryStore } = await import("./memory-store");
    const { sendChargeReceipt } = await import("../src/server/billing/mail");
    const outbox = captureEmails();
    const store = memoryStore();
    await sendChargeReceipt(
      { RESEND_API_KEY: "x", SUPERADMIN_EMAILS: "boss@test.com" } as never,
      store,
      ["a@x.com"],
      { invoiceNumber: "INV-2026-0001", amountMinor: 19900, currency: "USD", planName: "Launch" },
    );
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.bcc).toBeUndefined();
  });
});
