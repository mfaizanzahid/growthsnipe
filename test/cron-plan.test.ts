import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planCron } from "../src/server/lib/cron-plan";

const DAILY = "0 3 * * *";
const TICK = "0 * * * *";
const MINUTELY = "* * * * *";
const TODAY = "2026-10-20";

function input(cron: string, lastBillingDay: string = TODAY) {
  return { cron, dailyCron: DAILY, hourlyCron: TICK, lastBillingDay, today: TODAY };
}

describe("planCron", () => {
  it("runs only billing on the daily trigger", () => {
    const plan = planCron(input(DAILY));
    expect(plan.runBilling).toBe(true);
    expect(plan.runBriefings).toBe(false);
    expect(plan.runAnalytics).toBe(false);
    expect(plan.runRetentionPurge).toBe(true);
  });

  it("runs analytics without briefings on the minutely tick", () => {
    const plan = planCron(input(MINUTELY));
    expect(plan.runBilling).toBe(false);
    expect(plan.runBriefings).toBe(false);
    expect(plan.runAnalytics).toBe(true);
    expect(plan.runRetentionPurge).toBe(false);
  });

  it("runs briefings and analytics on the hourly tick once the day is handled", () => {
    const plan = planCron(input(TICK));
    expect(plan.runBilling).toBe(false);
    expect(plan.runBriefings).toBe(true);
    expect(plan.runAnalytics).toBe(true);
    expect(plan.runRetentionPurge).toBe(false);
  });

  it("does not run billing on every tick of the day", () => {
    // The bug this guards: the scheduled() handler ran renewals and trials
    // on every trigger, so billing ran 288 times a day.
    for (let minute = 0; minute < 60; minute += 5) {
      const plan = planCron(input(TICK));
      expect(plan.runBilling).toBe(false);
    }
  });

  it("catches up on billing when the daily run was missed", () => {
    // A missed 03:00 invocation (deploy at 03:00, outage) must not stall
    // billing for a whole day: the next tick picks it up.
    const plan = planCron(input(TICK, "2026-10-19"));
    expect(plan.runBilling).toBe(true);
    expect(plan.runBriefings).toBe(true);
  });

  it("catches up on billing when it has never run", () => {
    const plan = planCron(input(TICK, ""));
    expect(plan.runBilling).toBe(true);
  });

  it("runs marketing sequences on the daily trigger and on catch-up ticks", () => {
    expect(planCron(input(DAILY)).runMarketing).toBe(true);
    expect(planCron(input(TICK, "2026-10-19")).runMarketing).toBe(true);
    expect(planCron(input(TICK)).runMarketing).toBe(false);
    expect(planCron(input("15 2 * * *")).runMarketing).toBe(false);
  });

  it("does not run the retention purge on the tick", () => {
    const plan = planCron(input(TICK, "2026-10-19"));
    expect(plan.runRetentionPurge).toBe(false);
  });

  it("treats an unknown trigger as an analytics-only tick", () => {
    const plan = planCron(input("15 2 * * *"));
    expect(plan.runBilling).toBe(false);
    expect(plan.runBriefings).toBe(false);
    expect(plan.runAnalytics).toBe(true);
  });

  it("keeps the worker's daily cron in step with wrangler.jsonc", () => {
    // The worker branches on controller.cron, so the expression it compares
    // against has to be the one Cloudflare actually schedules. Both the top
    // level and env.production must declare the same triggers.
    const worker = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");
    const configured = worker.match(/const DAILY_CRON = "([^"]+)"/);
    expect(configured).not.toBeNull();
    expect(configured![1]).toBe(DAILY);
    const hourly = worker.match(/const HOURLY_CRON = "([^"]+)"/);
    expect(hourly).not.toBeNull();
    expect(hourly![1]).toBe(TICK);

    const wrangler = readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8");
    const cronLists = [...wrangler.matchAll(/"crons":\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(cronLists.length).toBeGreaterThan(0);
    for (const list of cronLists) {
      expect(list).toContain(`"${DAILY}"`);
      expect(list).toContain(`"${TICK}"`);
      expect(list).toContain(`"${MINUTELY}"`);
    }
  });
});
