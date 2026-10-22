import { describe, expect, it } from "vitest";
import { createProviderAdapter } from "../src/server/providers/registry";
import {
  COMING_SOON_PROVIDERS,
  LIVE_PROVIDERS,
  PROVIDER_DISPLAY_NAMES,
} from "../src/server/providers/types";

describe("coming-soon provider shells", () => {
  it("catalogs three coming-soon platforms behind two live ones", () => {
    expect([...LIVE_PROVIDERS]).toEqual(["spectora", "isn"]);
    expect([...COMING_SOON_PROVIDERS]).toEqual(["servicetitan", "housecallpro", "jobber"]);
    for (const key of COMING_SOON_PROVIDERS) {
      expect(PROVIDER_DISPLAY_NAMES[key]).toBeTruthy();
    }
  });

  it("registers fail-closed stubs that advertise no capabilities", async () => {
    for (const provider of COMING_SOON_PROVIDERS) {
      const adapter = createProviderAdapter({} as never, { provider, credentials: {} });
      const caps = await adapter.capabilities();
      expect(caps).toMatchObject({ provider, read: [], write: [] });
      expect(adapter.searchClients).toBeDefined();
      await expect(adapter.searchOrders({ limit: 10 })).rejects.toThrow(/coming soon/i);
      await expect(adapter.searchClients({ limit: 10 })).rejects.toThrow(/coming soon/i);
      await expect(adapter.searchAgents({ limit: 10 })).rejects.toThrow(/coming soon/i);
      await expect(adapter.searchEvents({ limit: 10 })).rejects.toThrow(/coming soon/i);
    }
  });

  it("stubs expose no write methods", async () => {
    for (const provider of COMING_SOON_PROVIDERS) {
      const adapter = createProviderAdapter({} as never, { provider, credentials: {} });
      expect(adapter.createOrder).toBeUndefined();
      expect(adapter.createClient).toBeUndefined();
      expect(adapter.sendMessage).toBeUndefined();
    }
  });
});
