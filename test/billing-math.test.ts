import { describe, expect, it } from "vitest";
import {
  computeProration,
  computeSignupAmounts,
  dunningDue,
  formatInvoiceNumber,
} from "../src/server/lib/billing-math";

describe("computeSignupAmounts", () => {
  it("sums setup + recurring with no coupon", () => {
    expect(computeSignupAmounts({ setupMinor: 49700, recurringMinor: 19900 })).toMatchObject({
      totalMinor: 69600,
      discountTotalMinor: 0,
    });
  });

  it("applies percent to the recurring line only by default", () => {
    const r = computeSignupAmounts({
      setupMinor: 49700,
      recurringMinor: 19900,
      coupon: { kind: "percent", percentOff: 20 },
    });
    expect(r.recurringDiscountMinor).toBe(3980);
    expect(r.setupDiscountMinor).toBe(0);
    expect(r.totalMinor).toBe(49700 + 19900 - 3980);
  });

  it("applies percent to setup too when enabled", () => {
    const r = computeSignupAmounts({
      setupMinor: 49700,
      recurringMinor: 19900,
      coupon: { kind: "percent", percentOff: 10, appliesToSetup: 1 },
    });
    expect(r.recurringDiscountMinor).toBe(1990);
    expect(r.setupDiscountMinor).toBe(4970);
    expect(r.totalMinor).toBe(69600 - 1990 - 4970);
  });

  it("caps fixed discounts at the discounted lines (never negative)", () => {
    const r = computeSignupAmounts({
      setupMinor: 49700,
      recurringMinor: 19900,
      coupon: { kind: "fixed", amountOffMinor: 99999 },
    });
    expect(r.recurringDiscountMinor).toBe(19900);
    expect(r.setupDiscountMinor).toBe(0);
    expect(r.totalMinor).toBe(49700);
  });

  it("spreads fixed discounts onto setup when enabled", () => {
    const r = computeSignupAmounts({
      setupMinor: 49700,
      recurringMinor: 19900,
      coupon: { kind: "fixed", amountOffMinor: 25000, appliesToSetup: 1 },
    });
    expect(r.recurringDiscountMinor).toBe(19900);
    expect(r.setupDiscountMinor).toBe(5100);
    expect(r.totalMinor).toBe(69600 - 25000);
  });

  it("clamps percent above 100", () => {
    const r = computeSignupAmounts({
      setupMinor: 0,
      recurringMinor: 19900,
      coupon: { kind: "percent", percentOff: 150 },
    });
    expect(r.totalMinor).toBe(0);
  });
});

describe("computeProration", () => {
  const START = 1_000_000;
  const END = START + 30 * 86400;

  it("charges the remaining fraction on upgrade", () => {
    // Half the period remains: (29900-19900) * 0.5 = 5000.
    expect(
      computeProration({
        oldRecurringMinor: 19900,
        newRecurringMinor: 29900,
        periodStartSec: START,
        periodEndSec: END,
        nowSec: START + 15 * 86400,
      }),
    ).toBe(5000);
  });

  it("returns 0 for downgrades, equal prices, and elapsed periods", () => {
    const base = {
      oldRecurringMinor: 29900,
      newRecurringMinor: 19900,
      periodStartSec: START,
      periodEndSec: END,
      nowSec: START,
    };
    expect(computeProration(base)).toBe(0);
    expect(computeProration({ ...base, newRecurringMinor: 29900 })).toBe(0);
    expect(
      computeProration({
        oldRecurringMinor: 19900,
        newRecurringMinor: 29900,
        periodStartSec: START,
        periodEndSec: END,
        nowSec: END + 10,
      }),
    ).toBe(0);
  });
});

describe("formatInvoiceNumber", () => {
  it("pads to four digits", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("INV-2026-0001");
    expect(formatInvoiceNumber(2026, 42)).toBe("INV-2026-0042");
  });
});

describe("dunningDue", () => {
  const NOW = 2_000_000;

  it("sends while under the 5-send cap with 2-day spacing", () => {
    expect(dunningDue({ reminderCount: 1, lastReminderAtSec: NOW - 2 * 86400, nowSec: NOW })).toBe(
      true,
    );
    expect(
      dunningDue({ reminderCount: 1, lastReminderAtSec: NOW - 86400, nowSec: NOW }),
    ).toBe(false);
    expect(dunningDue({ reminderCount: 5, lastReminderAtSec: NOW - 30 * 86400, nowSec: NOW })).toBe(
      false,
    );
  });

  it("allows the final notice 1 day after the day-6 reminder", () => {
    expect(
      dunningDue({ reminderCount: 4, lastReminderAtSec: NOW - 86400, nowSec: NOW }),
    ).toBe(true);
    expect(
      dunningDue({ reminderCount: 4, lastReminderAtSec: NOW - 3600, nowSec: NOW }),
    ).toBe(false);
  });
});
