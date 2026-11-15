-- Loop Library leads now collect a last name alongside the first name.
-- Existing rows keep NULL until the lead submits again.

ALTER TABLE loop_library_leads ADD COLUMN last_name TEXT;
