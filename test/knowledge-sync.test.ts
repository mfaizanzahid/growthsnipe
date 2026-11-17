import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  coreInstructions,
  workInstructions,
  employeeBusinessOwner,
  employeeCfo,
  employeeOperations,
  employeeRevenue,
  employeeCustomer,
  employeeMarketing,
  employeeQuality,
} from "../src/server/sidekick/knowledge";
import { loopsPlaybook } from "../src/server/loops/playbook";

const root = process.cwd();
const normalize = (s: string) => s.replace(/\r\n/g, "\n");
const read = (rel: string) => normalize(readFileSync(join(root, rel), "utf8"));

/** knowledge.ts must mirror the Markdown sources (regenerate: npm run inline-docs). */
describe("knowledge sync", () => {
  const cases: Array<[string, string]> = [
    ["src/server/sidekick/instructions/core-instructions.md", coreInstructions],
    ["src/server/sidekick/instructions/work-instructions.md", workInstructions],
    ["src/server/sidekick/employees/business-owner.md", employeeBusinessOwner],
    ["src/server/sidekick/employees/cfo.md", employeeCfo],
    ["src/server/sidekick/employees/operations-manager.md", employeeOperations],
    ["src/server/sidekick/employees/revenue-manager.md", employeeRevenue],
    ["src/server/sidekick/employees/customer-manager.md", employeeCustomer],
    ["src/server/sidekick/employees/marketing-analyst.md", employeeMarketing],
    ["src/server/sidekick/employees/quality-risk-manager.md", employeeQuality],
    ["docs/SNIPE_Loops_Playbook.md", loopsPlaybook],
  ];
  for (const [file, bundled] of cases) {
    it(`${file} matches the bundle`, () => {
      expect(normalize(bundled)).toBe(read(file));
    });
  }
});
