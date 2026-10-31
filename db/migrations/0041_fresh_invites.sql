-- Fresh-user invites for invite-only signup.
--
-- A superadmin pre-approves an email that belongs to no workspace yet. The
-- invitee signs in with a magic link, creates their own workspace in
-- onboarding (becoming its admin via creatorRole), and the invite is consumed
-- on first org creation. No subscription is created here: the workspace
-- trials exactly like onboarding-created ones.
--
-- Validity is checked as: consumed_at IS NULL AND expires_at > now. Expired
-- rows are ignored (login oracle, org gate) and revocable by delete.
CREATE TABLE IF NOT EXISTS fresh_invites (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  inviter_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS fresh_invites_email_idx ON fresh_invites (email);
