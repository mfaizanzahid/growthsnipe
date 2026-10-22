-- Better Auth 1.7 requires an issuer column on the account table
-- (account identity namespace). Nullable: only OAuth accounts carry one.
ALTER TABLE accounts ADD COLUMN issuer TEXT;
