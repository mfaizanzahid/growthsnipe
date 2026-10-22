-- Member access status (suspended members are denied by tenant guards).
ALTER TABLE members ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
