import { describe, expect, it, vi } from "vitest";
import { registerWriteTools, type WritePolicy } from "../src/server/mcp/actions";
import type { BusinessProviderAdapter } from "../src/server/providers/types";

interface Registered {
  name: string;
  cb: (args: any) => Promise<{ content: Array<{ type: "text"; text: string }> }>;
}

function harness(adapter: Partial<BusinessProviderAdapter>, policy: WritePolicy, auditLog: unknown[] = []) {
  const tools = new Map<string, Registered["cb"]>();
  const server = {
    registerTool: (name: string, _def: unknown, cb: Registered["cb"]) => {
      tools.set(name, cb);
    },
  };
  registerWriteTools(
    server as never,
    adapter as BusinessProviderAdapter,
    policy,
    {
      organizationId: "o1",
      principalType: "mcp_token",
      principalId: "t1",
      provider: "test",
      log: async (e) => {
        auditLog.push(e);
      },
    },
  );
  return { tools, auditLog };
}

const textOf = (res: { content: Array<{ type: "text"; text: string }> }) => JSON.parse(res.content[0]!.text);

describe("write-action gating", () => {
  it("registers nothing under READ", () => {
    const { tools } = harness({}, { permission: "READ", allowedActions: ["create_order"] });
    expect(tools.size).toBe(0);
  });

  it("registers only policy-allowed actions", () => {
    const { tools } = harness({}, { permission: "SUGGEST", allowedActions: ["create_client"] });
    expect([...tools.keys()]).toEqual(["create_client"]);
  });

  it("returns not-supported when the adapter lacks the method", async () => {
    const { tools, auditLog } = harness({}, { permission: "EXECUTE", allowedActions: ["create_order"] });
    const res = await tools.get("create_order")!({ serviceType: "X" });
    const body = textOf(res);
    expect(body.success).toBe(false);
    expect(body.supported).toBe(false);
    expect(body.message).toMatch(/not currently supported/);
    expect(auditLog).toHaveLength(0);
  });

  it("suggests without executing under SUGGEST", async () => {
    const run = vi.fn(async () => ({ id: "c1", name: "Acme" }));
    const { tools, auditLog } = harness(
      { createClient: run },
      { permission: "SUGGEST", allowedActions: ["create_client"] },
    );
    const res = await tools.get("create_client")!({ name: "Acme" });
    expect(textOf(res)).toMatchObject({ proposed: true, action: "create_client", name: "Acme" });
    expect(run).not.toHaveBeenCalled();
    expect(auditLog).toHaveLength(0);
  });

  it("executes and audits success under EXECUTE", async () => {
    const run = vi.fn(async () => ({ id: "o9" }));
    const { tools, auditLog } = harness(
      { createOrder: run },
      { permission: "EXECUTE", allowedActions: ["create_order"] },
    );
    const res = await tools.get("create_order")!({ serviceType: "Checkup" });
    expect(textOf(res)).toMatchObject({ success: true });
    expect(run).toHaveBeenCalledOnce();
    expect(auditLog).toHaveLength(1);
    expect(auditLog[0]).toMatchObject({ tool: "create_order", status: "success" });
  });

  it("audits failure and rethrows under EXECUTE", async () => {
    const run = vi.fn(async () => {
      throw new Error("gateway down");
    });
    const { tools, auditLog } = harness(
      { updateOrder: run },
      { permission: "EXECUTE", allowedActions: ["update_order"] },
    );
    await expect(tools.get("update_order")!({ id: "o1", notes: "x" })).rejects.toThrow("gateway down");
    expect(auditLog).toHaveLength(1);
    expect(auditLog[0]).toMatchObject({ tool: "update_order", status: "failed" });
  });
});
