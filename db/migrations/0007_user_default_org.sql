-- Per-user default organization (active-org selection).
-- Login auto-activates the default, else the first-created org.
ALTER TABLE users ADD COLUMN default_org_id TEXT;
CREATE INDEX IF NOT EXISTS users_default_org_idx ON users (default_org_id);
