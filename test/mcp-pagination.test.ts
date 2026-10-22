import { describe, expect, it } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import type { BusinessProviderAdapter, Page } from "../src/server/providers/types";
import { MCP_MAX_LIMIT, PAGINATION_CONTRACT, paginatedResult, registerDataTools } from "../src/server/mcp/tools";

type Handler = (input: never) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

function captureTools(adapter: BusinessProviderAdapter): Record<string, { description: string; handler: Handler; inputSchema: { parse: (v: unknown) => unknown } }> {
  const tools: Record<string, { description: string; handler: Handler; inputSchema: { parse: (v: unknown) => unknown } }> = {};
  const fake = {
    registerTool: (
      name: string,
      config: { description: string; inputSchema: { parse: (v: unknown) => unknown } },
      handler: Handler,
    ) => {
      tools[name] = { description: config.description, handler, inputSchema: config.inputSchema };
    },
  } as unknown as McpServer;
  registerDataTools(fake, adapter);
  return tools;
}

function order(id: string) {
  return { id, status: "completed" };
}

/** Three Spectora-style pages: cursors "2"/"3", true total of 6. */
function threePageAdapter(): BusinessProviderAdapter {
  return {
    key: "spectora",
    capabilities: async () => ({ provider: "spectora", read: [], write: [] }),
    searchClients: async () => ({ items: [] }),
    getClient: async () => null,
    searchOrders: async (input: { cursor?: string }): Promise<Page<{ id: string; status: string }>> => {
      if (!input.cursor) return { items: [order("o1"), order("o2")], nextCursor: "2", totalEstimate: 6 };
      if (input.cursor === "2") return { items: [order("o3"), order("o4")], nextCursor: "3", totalEstimate: 6 };
      return { items: [order("o5"), order("o6")], totalEstimate: 6 };
    },
    getOrder: async () => null,
    searchAgents: async () => ({ items: [] }),
    getAgent: async () => null,
    searchEvents: async () => ({ items: [] }),
  };
}

/** ISN-style: never a cursor, totalEstimate equals records returned. */
function isnStyleAdapter(): BusinessProviderAdapter {
  return {
    key: "isn",
    capabilities: async () => ({ provider: "isn", read: [], write: [] }),
    searchClients: async () => ({
      items: [{ id: "c1", name: "Acme" }, { id: "c2", name: "Globex" }],
      totalEstimate: 2,
    }),
    getClient: async () => null,
    searchOrders: async () => ({ items: [] }),
    getOrder: async () => null,
    searchAgents: async () => ({ items: [] }),
    getAgent: async () => null,
    searchEvents: async () => ({ items: [] }),
  };
}

function parse(out: { content: Array<{ type: "text"; text: string }> }) {
  return JSON.parse(out.content[0]!.text) as {
    items: unknown[];
    nextCursor?: string;
    totalEstimate?: number;
    hasMore: boolean;
    pageComplete: string;
    retrievalNote: string;
  };
}

describe("pagination completeness envelope", () => {
  it("walks three pages to COMPLETE with mergeable cursors", async () => {
    const tools = captureTools(threePageAdapter());
    const merged: unknown[] = [];
    let cursor: string | undefined;
    let last!: ReturnType<typeof parse>;
    for (let i = 0; i < 3; i++) {
      const out = await tools["search_orders"]!.handler({ limit: 2, cursor } as never);
      last = parse(out);
      merged.push(...last.items);
      if (!last.hasMore) break;
      cursor = last.nextCursor;
    }
    expect(merged).toHaveLength(6);
    expect(last.hasMore).toBe(false);
    expect(last.pageComplete).toBe("COMPLETE");
    expect(last.nextCursor).toBeUndefined();
    expect(last.totalEstimate).toBe(6);
    expect(last.retrievalNote).toContain("COMPLETE");
  });

  it("marks partial pages with the exact resume instruction", async () => {
    const tools = captureTools(threePageAdapter());
    const first = parse(await tools["search_orders"]!.handler({ limit: 2 } as never));
    expect(first.hasMore).toBe(true);
    expect(first.pageComplete).toBe("PARTIAL");
    expect(first.nextCursor).toBe("2");
    expect(first.retrievalNote).toContain('cursor "2"');
    expect(first.retrievalNote).toContain("search_orders");
    expect(first.retrievalNote).toContain("identical filters");
  });

  it("treats ISN-style cursorless pages as COMPLETE", async () => {
    const tools = captureTools(isnStyleAdapter());
    const out = parse(await tools["search_clients"]!.handler({ limit: 100 } as never));
    expect(out.hasMore).toBe(false);
    expect(out.pageComplete).toBe("COMPLETE");
    expect(out.items).toHaveLength(2);
  });

  it("tells the model a cursorless page is PARTIAL when count exceeds what it holds", async () => {
    const tools = captureTools({
      ...threePageAdapter(),
      searchClients: async () => ({
        items: Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, name: `Client ${i}` })),
        totalEstimate: 500,
      }),
    });
    const out = parse(await tools["search_clients"]!.handler({ limit: 100 } as never));
    expect(out.hasMore).toBe(false);
    // No cursor to resume from, but the page is demonstrably incomplete:
    // claiming COMPLETE here was the silent-data-loss bug.
    expect(out.pageComplete).toBe("PARTIAL");
    expect(out.items).toHaveLength(100);
    expect(out.retrievalNote).toContain("narrow the date window or filters and re-query");
  });

  it("treats empty-string cursors as absent", () => {
    const out = parse(paginatedResult("search_orders", { items: [], nextCursor: "" }));
    expect(out.hasMore).toBe(false);
    expect(out.pageComplete).toBe("COMPLETE");
  });

  it("caps every search_* limit at the 50,000 memory backstop", () => {
    const tools = captureTools(threePageAdapter());
    for (const name of ["search_clients", "search_orders", "search_agents", "search_events"]) {
      expect(() => tools[name]!.inputSchema.parse({ limit: MCP_MAX_LIMIT })).not.toThrow();
      expect(() => tools[name]!.inputSchema.parse({ limit: MCP_MAX_LIMIT + 1 })).toThrow();
    }
  });

  it("carries the pagination contract in every search_* description", () => {
    const tools = captureTools(threePageAdapter());
    for (const name of ["search_clients", "search_orders", "search_agents", "search_events"]) {
      expect(tools[name]!.description).toContain(PAGINATION_CONTRACT);
    }
    // Single-record tools stay contract-free (no pagination involved).
    for (const name of ["get_client", "get_order", "get_agent"]) {
      expect(tools[name]!.description).not.toContain("hasMore");
    }
  });
});
