-- Align org tables with the Better Auth organization plugin contract while
-- keeping portal extras (created_by, viewer/user role strings, invitation status).
-- Tables are rebuilt (rename → create → copy → drop) so the change is
-- data-preserving. Fresh DBs are empty; /fresh-db wipes local state anyway.

-- organizations: add logo + metadata (plugin fields).
ALTER TABLE organizations RENAME TO organizations_old;
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo TEXT,
  metadata TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
INSERT INTO organizations (id, name, slug, created_by, created_at, updated_at)
  SELECT id, name, slug, created_by, created_at, updated_at FROM organizations_old;
DROP TABLE organizations_old;

-- members: keep org scoping + role strings (admin/user/viewer enforced server-side).
ALTER TABLE members RENAME TO members_old;
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  UNIQUE (org_id, user_id)
);
INSERT INTO members (id, org_id, user_id, role, created_at, updated_at)
  SELECT id, org_id, user_id, role, created_at, updated_at FROM members_old;
DROP TABLE members_old;
CREATE INDEX IF NOT EXISTS members_user_idx ON members (user_id);

-- invitations: add expires_at + inviter_id (plugin fields).
ALTER TABLE invitations RENAME TO invitations_old;
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER,
  inviter_id TEXT,
  invited_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER
);
INSERT INTO invitations (id, org_id, email, role, status, invited_by, created_at, updated_at)
  SELECT id, org_id, email, role, status, invited_by, created_at, updated_at FROM invitations_old;
DROP TABLE invitations_old;
CREATE INDEX IF NOT EXISTS invitations_org_idx ON invitations (org_id);

-- sessions: active organization pointer (plugin field, mapped in the adapter).
ALTER TABLE sessions ADD COLUMN active_organization_id TEXT;
