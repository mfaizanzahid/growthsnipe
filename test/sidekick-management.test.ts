import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_MAX_PAGES,
  SNAPSHOT_PAGE_LIMIT,
  countRecentAgents,
  fetchSnapshotPages,
  orderFacts,
} from "../src/server/sidekick/management";
import type { OrderRecord, Page } from "../src/server/providers/types";

function page<T>(items: T[], nextCursor?: string, totalEstimate?: number): Page<T> {
  const p: Page<T> = { items };
  if (nextCursor !== undefined) p.nextCursor = nextCursor;
  if (totalEstimate !== undefined) p.totalEstimate = totalEstimate;
  return p;
}

describe("fetchSnapshotPages", () => {
  it("follows cursors until they run out", async () => {
    const calls: Array<string | undefined> = [];
    const result = await fetchSnapshotPages((cursor?: string) => {
      calls.push(cursor);
      if (cursor === undefined) return Promise.resolve(page([1, 2], "c1", 4));
      return Promise.resolve(page([3, 4]));
    });
    expect(result).toMatchObject({ items: [1, 2, 3, 4], truncated: false, totalEstimate: 4 });
    expect(calls).toEqual([undefined, "c1"]);
  });

  it("caps pages and flags truncation when the cursor never ends", async () => {
    const result = await fetchSnapshotPages(() => Promise.resolve(page([1], "more")));
    expect(result.items).toHaveLength(SNAPSHOT_MAX_PAGES);
    expect(result.truncated).toBe(true);
  });

  it("flags truncation when the provider total exceeds fetched items", async () => {
    const result = await fetchSnapshotPages(() => Promise.resolve(page([1, 2], undefined, 250)));
    expect(result).toMatchObject({ items: [1, 2], truncated: true, totalEstimate: 250 });
  });

  it("reports no truncation for a single complete page", async () => {
    const result = await fetchSnapshotPages(() => Promise.resolve(page([1, 2], undefined, 2)));
    expect(result.truncated).toBe(false);
  });

  it("makes one call when a cursorless provider returns the whole window", async () => {
    // Regression, live 2026-10-17 on the ISN org "Guardian": ISN has no cursor
    // and ignores `limit`, so a cursorless read returns every row. The old
    // bulk-retry call is gone; a single call completes the snapshot.
    const limits: Array<number | undefined> = [];
    const result = await fetchSnapshotPages((_cursor?: string, limit?: number) => {
      limits.push(limit);
      return Promise.resolve(page(Array.from({ length: 499 }, (_, i) => i), undefined, 499));
    });

    expect(limits).toEqual([SNAPSHOT_PAGE_LIMIT]);
    expect(result.items).toHaveLength(499);
    expect(result.truncated).toBe(false);
  });
});

describe("countRecentAgents", () => {
  it("counts distinct agent names across window orders", () => {
    const orders = [
      { id: "o1", inspectorName: "Alice Inspector", buyingAgentName: "Bob Broker" },
      { id: "o2", inspectorName: "alice  INSPECTOR", sellingAgentName: "Carol Closer" },
      { id: "o3", buyingAgentName: "Bob Broker" },
    ];
    expect(countRecentAgents(orders)).toBe(3);
  });

  it("ignores buyer names and blank entries", () => {
    const orders = [
      { id: "o1", buyerName: "Hank Homebuyer", inspectorName: "  " },
      { id: "o2" },
    ];
    expect(countRecentAgents(orders)).toBe(0);
    expect(countRecentAgents([])).toBe(0);
  });

  it("does not count provider identifiers as people (ISN returns UUIDs)", () => {
    // Regression: 106 ISN orders reported "148 recent agents" because
    // inspector1/buyersagent hold UUIDs, one per order.
    const uuidA = "4f06d537-b74a-4833-99e9-2228eaa1f413";
    const uuidB = "9c2b1a44-7e0d-4f6a-9a1e-3b7c5d2e8f01";
    const orders = [
      { id: "o1", inspectorName: uuidA },
      { id: "o2", inspectorName: uuidA },
      { id: "o3", buyingAgentName: uuidB },
    ];
    expect(countRecentAgents(orders)).toBe(0);

    // Real names still count alongside identifiers.
    const mixed = [...orders, { id: "o4", inspectorName: "Alice Inspector" }];
    expect(countRecentAgents(mixed)).toBe(1);
  });
});

describe("orderFacts", () => {
  it("hides cancelled orders from the order and agent counts", () => {
    const orders: OrderRecord[] = [
      { id: "o1", status: "completed", total: 25000, inspectorName: "Alice Inspector" },
      { id: "o2", status: "scheduled", inspectorName: "Alice Inspector" },
      { id: "o3", status: "cancelled", total: 9900, inspectorName: "Bob Broker" },
      { id: "o4", status: "Cancelled", inspectorName: "Carol Closer" },
    ];
    const facts = orderFacts(orders);
    expect(facts.recentOrders).toBe(2);
    expect(facts.recentAgents).toBe(1);
    expect(facts.openOrders).toBe(1);
    expect(facts.recentCompletedRevenue).toBe(25000);
  });
});
