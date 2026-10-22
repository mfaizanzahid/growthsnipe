import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planCron } from "../src/server/lib/cron-plan";

const DAILY = "0 3 * * *";
const TICK = "0 * * * *";
const TODAY = "2026-10-20";

describe("planCron", () => {
  it("runs only billing on the daily trigger", () => {
    const plan = planCron({
      cron: DAILY,
      dailyCron: DAILY,
      lastBillingDay: TODAY,
      today: TODAY,
    });
    expect(plan.runBilling).toBe(true);
    expect(plan.runBriefings).toBe(false);
    expect(plan.runRetentionPurge).toBe(true);
  });

  it("runs only briefings on the hourly tick once the day is handled", () => {
    const plan = planCron({
      cron: TICK,
      dailyCron: DAILY,
      lastBillingDay: TODAY,
      today: TODAY,
    });
    expect(plan.runBilling).toBe(false);
    expect(plan.runBriefings).toBe(true);
    expect(plan.runRetentionPurge).toBe(false);
  });

  it("does not run billing on every tick of the day", () => {
    // The bug this guards: the scheduled() handler ran renewals and trials
    // on every trigger, so billing ran 288 times a day.
    for (let minute = 0; minute < 60; minute += 5) {
      const plan = planCron({
        cron: TICK,
        dailyCron: DAILY,
        lastBillingDay: TODAY,
        today: TODAY,
      });
      expect(plan.runBilling).toBe(false);
    }
  });

  it("catches up on billing when the daily run was missed", () => {
    // A missed 03:00 invocation (deploy at 03:00, outage) must not stall
    // billing for a whole day: the next tick picks it up.
    const plan = planCron({
      cron: TICK,
      dailyCron: DAILY,
      lastBillingDay: "2026-10-19",
      today: TODAY,
    });
    expect(plan.runBilling).toBe(true);
    expect(plan.runBriefings).toBe(true);
  });

  it("catches up on billing when it has never run", () => {
    const plan = planCron({
      cron: TICK,
      dailyCron: DAILY,
      lastBillingDay: "",
      today: TODAY,
    });
    expect(plan.runBilling).toBe(true);
  });

  it("does not run the retention purge on the tick", () => {
    const plan = planCron({
      cron: TICK,
      dailyCron: DAILY,
      lastBillingDay: "2026-10-19",
      today: TODAY,
    });
    expect(plan.runRetentionPurge).toBe(false);
  });

  it("treats an unknown trigger as a tick", () => {
    const plan = planCron({
      cron: "15 2 * * *",
      dailyCron: DAILY,
      lastBillingDay: TODAY,
      today: TODAY,
    });
    expect(plan.runBilling).toBe(false);
    expect(plan.runBriefings).toBe(true);
  });

  it("keeps the worker's daily cron in step with wrangler.jsonc", () => {
    // The worker branches on controller.cron, so the expression it compares
    // against has to be the one Cloudflare actually schedules. Both the top
    // level and env.production must declare the same triggers.
    const worker = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");
    const configured = worker.match(/const DAILY_CRON = "([^"]+)"/);
    expect(configured).not.toBeNull();
    expect(configured![1]).toBe(DAILY);

    const wrangler = readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8");
    const cronLists = [...wrangler.matchAll(/"crons":\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(cronLists.length).toBeGreaterThan(0);
    for (const list of cronLists) {
      expect(list).toContain(`"${DAILY}"`);
      expect(list).toContain(`"${TICK}"`);
    }
  });
});
