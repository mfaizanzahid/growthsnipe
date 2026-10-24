import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "../db/schema";
import type { Db } from "../src/server/repositories/db";
import type { Env } from "../src/server/lib/env";
import { runAnalyticsSyncForOrg } from "../src/server/analytics/sync";

/** TEMPORARY (deleted after the run): diagnose jalop9 enrichment. */
const D1_FILE =
  "C:\\Users\\Faizan\\Desktop\\Apps\\growthsnipe\\.wrangler\\state\\v3\\d1\\miniflare-D1DatabaseObject\\7374fef25ccac9ec6b58abb7cb382bb3da92c78f756d4d4484cde648ac3d59cf.sqlite";
const ORG = "yjfwNIM800WOrkNL3FupwHGMhP6pi64E";

function devVar(name: string): string {
  const text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  const line = text.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`missing ${name}`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

describe("jalop9 enrich", () => {
  it("reports done/failed visibly", { timeout: 480_000 }, async () => {
    const sqlite = new DatabaseSync(D1_FILE);
    sqlite.exec("PRAGMA busy_timeout = 30000");
    const db = drizzle(
      async (sql: string, params: unknown[]) => {
        const statement = sqlite.prepare(sql);
        const objectRows = statement.all(...(params as never[])) as Record<string, unknown>[];
        return { rows: objectRows.map((row) => Object.values(row)) };
      },
      { schema },
    ) as unknown as Db;
    const before = (sqlite.prepare("SELECT COUNT(*) AS n FROM org_order_services WHERE organization_id = ?").get(ORG) as { n: number }).n;
    const env = { MCP_ENCRYPTION_KEY: devVar("MCP_ENCRYPTION_KEY") } as unknown as Env;
    const summary = await runAnalyticsSyncForOrg(env, db, ORG, { maxChunks: 1 });
    const after = (sqlite.prepare("SELECT COUNT(*) AS n FROM org_order_services WHERE organization_id = ?").get(ORG) as { n: number }).n;
    console.log("SUMMARY", JSON.stringify(summary), "SVC", before, "->", after);
    sqlite.close();
    expect(true).toBe(true);
  });
});
