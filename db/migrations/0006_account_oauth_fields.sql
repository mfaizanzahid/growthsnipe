-- Better Auth 1.7 OAuth account fields (password-only flows never write them,
-- so the gap only surfaces on the first Google sign-in).
ALTER TABLE accounts ADD COLUMN scope TEXT;
ALTER TABLE accounts ADD COLUMN access_token_expires_at INTEGER;
ALTER TABLE accounts ADD COLUMN refresh_token_expires_at INTEGER;
