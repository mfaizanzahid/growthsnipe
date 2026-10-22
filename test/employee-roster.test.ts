import { describe, expect, it } from "vitest";
import {
  EMPLOYEE_CATALOG,
  PRO_EMPLOYEE_PROMPTS,
  STARTER_EMPLOYEE_PROMPTS,
  resolveEmployeeRoster,
} from "../src/server/mcp/prompts";

describe("employee roster resolution", () => {
  it("keeps the full roster when nothing is deactivated", () => {
    expect(resolveEmployeeRoster(undefined, [])).toBeUndefined();
    expect(resolveEmployeeRoster([...STARTER_EMPLOYEE_PROMPTS], [])).toEqual(STARTER_EMPLOYEE_PROMPTS);
  });

  it("drops deactivated employees from the Pro roster", () => {
    const roster = resolveEmployeeRoster(undefined, [{ employee: "ask-cfo", active: false }]);
    expect(roster).toHaveLength(EMPLOYEE_CATALOG.length - 1);
    expect(roster).not.toContain("ask-cfo");
    expect(roster).toEqual(expect.arrayContaining(PRO_EMPLOYEE_PROMPTS));
  });

  it("drops deactivated employees from the Starter roster", () => {
    expect(
      resolveEmployeeRoster([...STARTER_EMPLOYEE_PROMPTS], [{ employee: "ask-owner", active: false }]),
    ).toEqual(["ask-cfo", "ask-operations"]);
  });

  it("never widens the base via stored active rows (downgrade-safe)", () => {
    expect(
      resolveEmployeeRoster([...STARTER_EMPLOYEE_PROMPTS], [{ employee: "ask-revenue", active: true }]),
    ).toEqual(STARTER_EMPLOYEE_PROMPTS);
  });
});
