-- Spaced repetition refresher queue.
-- One row per node-completion event; the renderer picks rows whose `due_at`
-- has passed and surfaces them on the dashboard. Acing a refresh bumps the
-- next interval; missing it resets to 1 day.

CREATE TABLE refresher (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id     TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
    streak      INTEGER NOT NULL DEFAULT 0,    -- successful recalls in a row
    last_at     TEXT,
    due_at      TEXT NOT NULL,
    UNIQUE (node_id)
);

CREATE INDEX idx_refresher_due ON refresher(due_at);
