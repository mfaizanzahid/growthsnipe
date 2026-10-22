import { beforeAll, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { buildBusinessSidekickServer } from "../src/server/mcp/server";
import { ALL_RESOURCE_URIS, RESOURCE_URIS } from "../src/server/mcp/resources";
import { formatBusinessProfileText } from "../src/server/sidekick/store";
import type { BusinessProviderAdapter } from "../src/server/providers/types";

async function connect(env: Record<string, string>, profileText?: string | null): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = buildBusinessSidekickServer(env as never, {} as BusinessProviderAdapter, profileText ? { profileText } : {});
  await server.connect(serverTransport);
  const client = new Client({ name: "resource-test", version: "1.0" });
  await client.connect(clientTransport);
  return client;
}

let client: Client;

beforeAll(async () => {
  client = await connect({});
});

describe("sidekick resources", () => {
  it("serves only core instructions by default", async () => {
    const list = await client.listResources();
    const uris = list.resources.map((r) => r.uri).sort();
    expect(uris).toEqual(["sidekick://instructions/core"]);
    expect(RESOURCE_URIS).toEqual(["sidekick://instructions/core"]);
    expect(ALL_RESOURCE_URIS).toHaveLength(9);
  });

  it("reads the core instructions", async () => {
    const res = await client.readResource({ uri: "sidekick://instructions/core" });
    const text = res.contents.map((c) => (c as { text?: string }).text ?? "").join("\n");
    expect(text).toContain("fractional COO");
    expect(text).toContain("Never invent missing values");
  });

  it("re-enables hidden resources via MCP_ENABLE_RESOURCES", async () => {
    const partial = await connect({ MCP_ENABLE_RESOURCES: "work-instructions,sidekick://employees/cfo" });
    const uris = (await partial.listResources()).resources.map((r) => r.uri).sort();
    expect(uris).toEqual(
      ["sidekick://instructions/core", "sidekick://instructions/work", "sidekick://employees/cfo"].sort(),
    );
    const full = await connect({ MCP_ENABLE_RESOURCES: "*" });
    expect((await full.listResources()).resources).toHaveLength(9);
  });

  it("injects the business profile into served core instructions", async () => {
    const profileText = formatBusinessProfileText({
      organizationId: "o1",
      businessName: "Acme Home",
      trade: "Home inspection",
      serviceArea: "Austin, TX",
      ownerName: null,
      teamSize: null,
      servicesMain: null,
      servicesHighValue: null,
      servicesRecurring: null,
    });
    expect(profileText).toContain("Business name: Acme Home");
    const client = await connect({}, profileText);
    const res = await client.readResource({ uri: "sidekick://instructions/core" });
    const text = res.contents.map((c) => (c as { text?: string }).text ?? "").join("\n");
    expect(text).toContain("ACTIVE BUSINESS PROFILE");
    expect(text).toContain("Trade: Home inspection");
  });

  it("serves generic core instructions without a profile", async () => {
    expect(formatBusinessProfileText(null)).toBeNull();
    expect(
      formatBusinessProfileText({
        organizationId: "o1",
        businessName: null,
        trade: null,
        serviceArea: null,
        ownerName: null,
        teamSize: null,
        servicesMain: null,
        servicesHighValue: null,
        servicesRecurring: null,
      }),
    ).toBeNull();
  });
});
