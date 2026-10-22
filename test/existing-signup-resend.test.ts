import { describe, expect, it, vi } from "vitest";
import { resendVerificationForExistingSignup } from "../src/server/auth";
import type { Db } from "../src/server/repositories/db";

/** Minimal drizzle select-chain stub with canned verification rows. */
function fakeDb(rows: Array<{ createdAt: Date }>, onQuery?: () => void) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              onQuery?.();
              return rows;
            },
          }),
        }),
      }),
    }),
  } as unknown as Db;
}

describe("resendVerificationForExistingSignup", () => {
  it("sends to unverified addresses (lowercased)", async () => {
    const send = vi.fn(async () => undefined);
    const result = await resendVerificationForExistingSignup(
      fakeDb([]),
      send,
      { email: "New@Test.com", emailVerified: false },
      new Headers(),
    );
    expect(result).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls[0] as unknown as [string, Headers])?.[0]).toBe("new@test.com");
  });

  it("never mails verified addresses and never touches the db", async () => {
    const send = vi.fn(async () => undefined);
    const result = await resendVerificationForExistingSignup(
      fakeDb([], () => {
        throw new Error("db must not be queried");
      }),
      send,
      { email: "done@test.com", emailVerified: true },
      new Headers(),
    );
    expect(result).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("honors the per-address cooldown", async () => {
    const send = vi.fn(async () => undefined);
    const result = await resendVerificationForExistingSignup(
      fakeDb([{ createdAt: new Date(Date.now() - 10_000) }]),
      send,
      { email: "old@test.com", emailVerified: false },
      new Headers(),
    );
    expect(result).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends again after the cooldown expires", async () => {
    const send = vi.fn(async () => undefined);
    const result = await resendVerificationForExistingSignup(
      fakeDb([{ createdAt: new Date(Date.now() - 61_000) }]),
      send,
      { email: "old@test.com", emailVerified: false },
      new Headers(),
    );
    expect(result).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reports failure when sending throws (never throws itself)", async () => {
    const send = vi.fn(async () => {
      throw new Error("smtp down");
    });
    const result = await resendVerificationForExistingSignup(
      fakeDb([]),
      send,
      { email: "old@test.com", emailVerified: false },
      new Headers(),
    );
    expect(result).toBe("failed");
  });
});
