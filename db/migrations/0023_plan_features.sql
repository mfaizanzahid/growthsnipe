-- Plan feature bullets live in the database (single source of truth).
-- Comma-separated list rendered verbatim by the pricing page and the
-- billing subscribe picker. Individual features must not contain commas.
-- Backfill matches the previous pricing-page derivation for the seed plans.

ALTER TABLE plans ADD COLUMN features TEXT;

UPDATE plans
SET features = '1 user, Connect with any AI tool like Claude / ChatGPT / Gemini and more, Multi-Trades™ MCP Server Access, 3 AI Advisors, Standard support'
WHERE id = 'starter';

UPDATE plans
SET features = 'Unlimited users, Connect with any AI tool like Claude / ChatGPT / Gemini and more, Multi-Trades™ MCP Server Access, 7 AI Advisors, Priority support, Scheduled briefings (Morning/Weekly/Monthly)'
WHERE id = 'pro';
