import { beforeAll, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildBusinessSidekickServer } from "../src/server/mcp/server";
import { PROMPT_NAMES, PRO_EMPLOYEE_PROMPTS, STARTER_EMPLOYEE_PROMPTS } from "../src/server/mcp/prompts";
import type { BusinessProviderAdapter } from "../src/server/providers/types";

async function starterClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildBusinessSidekickServer(
    {} as never,
    {} as BusinessProviderAdapter,
    { employees: [...STARTER_EMPLOYEE_PROMPTS] },
  );
  await server.connect(serverTransport);
  const client = new Client({ name: "prompt-test-starter", version: "1.0" });
  await client.connect(clientTransport);
  return client;
}

let client: Client;

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildBusinessSidekickServer(
    {} as never,
    {} as BusinessProviderAdapter,
  );
  await server.connect(serverTransport);
  client = new Client({ name: "prompt-test", version: "1.0" });
  await client.connect(clientTransport);
});

describe("sidekick prompts", () => {
  it("lists all employee + workflow prompts", async () => {
    const list = await client.listPrompts();
    const names = list.prompts.map((p) => p.name).sort();
    expect(names).toEqual([...PROMPT_NAMES].sort());
    expect(names).toContain("ask-cfo");
    expect(names).toContain("morning-briefing");
  });

  it("expands an employee prompt with playbook + tool guidance", async () => {
    const res = await client.getPrompt({ name: "ask-cfo", arguments: { focus: "ticket size" } });
    const text = res.messages.map((m) => (m.content as { type: string; text?: string }).text ?? "").join("\n");
    expect(text).toContain("CFO");
    expect(text).toContain("search_orders");
    expect(text).toContain("ticket size");
  });

  it("expands a workflow prompt into a tool-call plan", async () => {
    const res = await client.getPrompt({ name: "find-anything-unusual", arguments: {} });
    const text = res.messages.map((m) => (m.content as { type: string; text?: string }).text ?? "").join("\n");
    expect(text).toContain("search_orders");
    expect(text).toContain("search_events");
  });
});

describe("starter-tier prompt gating", () => {
  it("splits the roster into 3 starter + 4 pro prompts", () => {
    expect(STARTER_EMPLOYEE_PROMPTS).toEqual(["ask-owner", "ask-cfo", "ask-operations"]);
    expect(PRO_EMPLOYEE_PROMPTS).toEqual(["ask-revenue", "ask-customer", "ask-marketing", "ask-quality"]);
  });

  it("hides pro prompts from the starter list but keeps starter + workflows", async () => {
    const starter = await starterClient();
    const names = (await starter.listPrompts()).prompts.map((p) => p.name);
    for (const n of STARTER_EMPLOYEE_PROMPTS) expect(names).toContain(n);
    for (const n of PRO_EMPLOYEE_PROMPTS) expect(names).not.toContain(n);
    expect(names).toContain("morning-briefing");
  });

  it("refuses gated prompts when called directly", async () => {
    const starter = await starterClient();
    await expect(starter.getPrompt({ name: "ask-revenue", arguments: {} })).rejects.toThrow();
  });
});
