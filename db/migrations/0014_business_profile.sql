-- Per-organization business profile for personalizing briefings, snapshots,
-- and the served core-instructions resource. All columns optional: the
-- onboarding step collects what the owner provides; the profile page edits it.

CREATE TABLE IF NOT EXISTS sidekick_business_profiles (
  organization_id TEXT PRIMARY KEY,
  business_name TEXT,
  trade TEXT,
  service_area TEXT,
  owner_name TEXT,
  team_size TEXT,
  services_main TEXT,
  services_high_value TEXT,
  services_recurring TEXT,
  updated_at INTEGER NOT NULL
);
