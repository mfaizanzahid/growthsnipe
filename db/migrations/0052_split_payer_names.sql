-- Split payer names for Safepay. The combined `name` columns remain as
-- derived compatibility fields for Better Auth and existing display code.

ALTER TABLE one_time_orders ADD COLUMN first_name TEXT;
ALTER TABLE one_time_orders ADD COLUMN last_name TEXT;

ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
