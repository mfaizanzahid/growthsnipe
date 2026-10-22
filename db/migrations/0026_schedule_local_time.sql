-- Schedules now honor their own wall-clock time and IANA zone: the 5-minute Cron
-- only decides *when* a schedule is due, and next_run_at is computed by
-- resolving localTime in timezone (src/server/lib/local-time.ts).
--
-- Existing rows were seeded with next_run_at = creation time and then advanced by
-- fixed offsets, so they fire at the wrong hour. SQL cannot do IANA timezone
-- math, so we make every existing schedule due immediately instead: the next
-- tick runs it once and advances it to the correct local time from then on.
-- Keeps `enabled = false` schedules untouched.
UPDATE sidekick_schedules
SET next_run_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE enabled = 1;