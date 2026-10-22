-- AI employee activation states per workspace.
-- One row per (organization, employee prompt). Absent rows mean "default":
-- active when the org's plan entitles the employee, inactive otherwise.
-- Deactivation is honored by prompts/list (hidden) and direct calls (refused).

CREATE TABLE IF NOT EXISTS sidekick_employee_states (
  organization_id TEXT NOT NULL,
  employee TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, employee)
);
CREATE INDEX IF NOT EXISTS sidekick_employee_states_org_idx ON sidekick_employee_states (organization_id);
