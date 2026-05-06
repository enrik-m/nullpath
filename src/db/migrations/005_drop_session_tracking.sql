-- Migration 005: drop session-tracking dead weight.
--
-- v0.7 removed the live session timer entirely; XP and progress are now
-- driven purely by node completions. The schema still carried:
--   - session table (no writers)
--   - app_state.idle_threshold_seconds, idle_hard_cap_seconds (no readers)
--   - streak_day.seconds_studied (always 0)
--
-- Drop them. SQLite supports `ALTER TABLE ... DROP COLUMN` on 3.35+ which
-- ships with every Tauri 2 build, so we can do it without the
-- copy-table-rename dance.

DROP TABLE IF EXISTS session;

ALTER TABLE app_state DROP COLUMN idle_threshold_seconds;
ALTER TABLE app_state DROP COLUMN idle_hard_cap_seconds;

ALTER TABLE streak_day DROP COLUMN seconds_studied;
