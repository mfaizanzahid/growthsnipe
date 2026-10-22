-- Align the 0008 column with the drizzle schema (member_status).
-- SQLite supports RENAME COLUMN; existing values carry over.
ALTER TABLE members RENAME COLUMN status TO member_status;
