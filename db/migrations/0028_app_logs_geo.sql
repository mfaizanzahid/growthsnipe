-- Where the request came from, for the superadmin log table.
--
-- Cloudflare derives both from the client IP and hands them to the Worker on
-- `request.cf`, so no external geolocation lookup is needed. The city is a
-- best-effort approximation ("Austin") and the country is an ISO 3166-1
-- alpha-2 code ("GB"). Both are null when the runtime cannot determine them
-- and for rows that did not come from a request (Cron runs).
ALTER TABLE app_logs ADD COLUMN city TEXT;
ALTER TABLE app_logs ADD COLUMN country TEXT;
