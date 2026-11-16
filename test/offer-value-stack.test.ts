import { describe, expect, it } from "vitest";
import {
  OFFERS,
  OFFER_STACKS,
  OFFER_VALUE_DISCLAIMER,
  type OfferStack,
} from "../src/lib/offers";

function bonusOfferIds(stack: OfferStack): string[] {
  return stack.bonuses.flatMap((bonus) => (bonus.fromOfferId ? [bonus.fromOfferId] : []));
}

describe("offer value stacks", () => {
  it("shows Loops at a $99 core price, free, 100% off", () => {
    expect(OFFERS.loops.value).toEqual({ amountMinor: 9900, label: "$99" });
    expect(OFFERS.loops.price).toEqual({ amountMinor: 0, label: "$0" });
    expect(OFFERS.loops.discountPercent).toBe(100);
    expect(OFFER_STACKS.loops.core.value?.label).toBe("$99");
    expect(OFFER_STACKS.loops.priceDisplay).toBe("Free");
    expect(OFFER_STACKS.loops.discountPercent).toBe(100);
    expect(OFFER_STACKS.loops.totalValue.label).toBe("$244");
    expect(OFFER_STACKS.loops.price?.label).toBe("$0");
    expect(OFFER_STACKS.loops.bonuses.map((bonus) => bonus.name)).toEqual([
      "The Unbooked Enquiry Follow-Up Loop",
      "Follow-up script library",
      "Ongoing library updates and new recipes",
    ]);
    expect(OFFER_STACKS.loops.bonuses.map((bonus) => bonus.value.label)).toEqual([
      "$39",
      "$47",
      "$59",
    ]);
  });

  it("carries each previous offer into the next stack as a bonus", () => {
    expect(bonusOfferIds(OFFER_STACKS.diagnostic)).toContain("loops");
    expect(new Set(bonusOfferIds(OFFER_STACKS.blueprint))).toEqual(
      new Set(["diagnostic", "loops"]),
    );
    expect(new Set(bonusOfferIds(OFFER_STACKS.engine))).toEqual(
      new Set(["blueprint", "diagnostic", "loops"]),
    );
  });

  it("labels every included call as a bonus call", () => {
    const calls = Object.values(OFFER_STACKS).flatMap((stack) =>
      stack.bonuses.filter((bonus) => bonus.kind === "call"),
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) expect(call.name.toLowerCase()).toContain("call");
  });

  it("keeps totals and savings consistent", () => {
    for (const stack of Object.values(OFFER_STACKS)) {
      const core = stack.core.value?.amountMinor ?? 0;
      const nonCredit = stack.bonuses
        .filter((bonus) => bonus.kind !== "credit")
        .reduce((total, bonus) => total + bonus.value.amountMinor, 0);
      expect(stack.deliverableValue.amountMinor).toBe(core + nonCredit);
      const credit = stack.bonuses
        .filter((bonus) => bonus.kind === "credit")
        .reduce((total, bonus) => total + bonus.value.amountMinor, 0);
      expect(stack.totalValue.amountMinor).toBe(stack.deliverableValue.amountMinor + credit);
      if (stack.price) {
        expect(stack.savings?.amountMinor).toBe(
          stack.deliverableValue.amountMinor - stack.price.amountMinor,
        );
      } else {
        expect(stack.savings).toBeNull();
      }
    }
  });

  it("keeps Engine pricing out of the stack and uses a pricing CTA", () => {
    expect(OFFER_STACKS.engine.price).toBeNull();
    expect(OFFER_STACKS.engine.savings).toBeNull();
    expect(OFFER_STACKS.engine.priceCta).toEqual({
      label: "Contact us for pricing",
      href: "/book",
    });
    expect(OFFER_STACKS.engine.totalValue.label).toBe("$5,142");
  });

  it("ends every bonus price in 3, 7 or 9", () => {
    for (const stack of Object.values(OFFER_STACKS)) {
      for (const bonus of stack.bonuses) {
        const dollars = Math.round(bonus.value.amountMinor / 100);
        expect([3, 7, 9]).toContain(dollars % 10);
      }
    }
  });

  it("gives every core offer an Included checklist and a centralized CTA", () => {
    for (const stack of Object.values(OFFER_STACKS)) {
      expect(stack.core.features.length).toBeGreaterThan(0);
      expect(stack.cta.label.length).toBeGreaterThan(0);
      expect(stack.cta.href.length).toBeGreaterThan(0);
      expect(stack.ctaNote.length).toBeGreaterThan(0);
    }
  });

  it("uses the requested total and pay labels", () => {
    expect(OFFER_STACKS.diagnostic.totalLabel).toBe("Total value with credit");
    expect(OFFER_STACKS.blueprint.totalLabel).toBe("Total value with credit");
    expect(OFFER_STACKS.diagnostic.priceLabel).toBe("You pay");
    expect(OFFER_STACKS.blueprint.priceLabel).toBe("You pay");
    expect(OFFER_STACKS.loops.priceLabel).toBe("You pay");
    expect(OFFER_STACKS.engine.priceLabel).toBe("Your investment");
  });

  it("uses no em dashes in value-stack copy", () => {
    expect(JSON.stringify(OFFER_STACKS)).not.toContain("\u2014");
    expect(OFFER_VALUE_DISCLAIMER).not.toContain("\u2014");
  });

  it("does not use forbidden Diagnostic claims in the Diagnostic stack", () => {
    expect(JSON.stringify(OFFER_STACKS.diagnostic)).not.toMatch(
      /enquir|lead|response-time|missed call|call handling|booking conversion/i,
    );
  });
});
