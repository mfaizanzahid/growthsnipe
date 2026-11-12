import { describe, expect, it } from "vitest";
import type { Env } from "../src/server/types";
import {
  RUNTIME_CONFIG_MAX_EMBED_BYTES,
  runtimeConfigRoutes,
} from "../src/server/routes/runtime-config";

function env(values: Record<string, string | undefined>): Env {
  return values as unknown as Env;
}

describe("GET /api/runtime-config", () => {
  it("is public and returns trimmed runtime values", async () => {
    const res = await runtimeConfigRoutes.request(
      "/api/runtime-config",
      {},
      env({
        GA_MEASUREMENT_ID: "  G-TEST123  ",
        EMBED_APP_HTML: "  <script>app</script>  ",
        EMBED_MARKETING_HTML: "<script>marketing</script>",
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(await res.json()).toEqual({
      ga_measurement_id: "G-TEST123",
      embed_app_html: "<script>app</script>",
      embed_marketing_html: "<script>marketing</script>",
    });
  });

  it("treats missing and blank values as unset", async () => {
    const res = await runtimeConfigRoutes.request(
      "/api/runtime-config",
      {},
      env({
        GA_MEASUREMENT_ID: undefined,
        EMBED_APP_HTML: "   ",
        EMBED_MARKETING_HTML: undefined,
      }),
    );

    expect(await res.json()).toEqual({
      ga_measurement_id: "",
      embed_app_html: null,
      embed_marketing_html: null,
    });
  });

  it("treats an oversized snippet as unset instead of truncating it", async () => {
    const res = await runtimeConfigRoutes.request(
      "/api/runtime-config",
      {},
      env({ EMBED_APP_HTML: "x".repeat(RUNTIME_CONFIG_MAX_EMBED_BYTES + 1) }),
    );

    expect(await res.json()).toMatchObject({ embed_app_html: null });
  });

  it("preserves dollar signs verbatim (no build-time env expansion)", async () => {
    const snippet =
      "<script>window.$zoho=window.$zoho || {};$zoho.salesiq=$zoho.salesiq||{ready:function(){}}</script>";
    const res = await runtimeConfigRoutes.request(
      "/api/runtime-config",
      {},
      env({ EMBED_APP_HTML: snippet }),
    );

    expect(await res.json()).toMatchObject({ embed_app_html: snippet });
  });
});
