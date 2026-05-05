-- Nullpath — bounty ledger schema
-- ==========================================================================
-- Optional separate ledger for tracking real bug bounty / vuln-disclosure
-- submissions. Decoupled from `node` so it survives schema changes there.

CREATE TABLE bounty_submission (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    program      TEXT NOT NULL,
    title        TEXT NOT NULL,
    severity     TEXT NOT NULL DEFAULT 'medium',  -- info | low | medium | high | critical
    status       TEXT NOT NULL DEFAULT 'submitted', -- submitted | triaged | accepted | rejected | duplicate | informative | resolved
    payout_usd   INTEGER,
    submitted_at TEXT NOT NULL,
    resolved_at  TEXT,
    cve_id       TEXT,                            -- if assigned
    related_node TEXT REFERENCES node(id) ON DELETE SET NULL,
    notes        TEXT,                            -- markdown
    visibility   TEXT NOT NULL DEFAULT 'private'
);

CREATE INDEX idx_bounty_status ON bounty_submission(status);
CREATE INDEX idx_bounty_program ON bounty_submission(program);
CREATE INDEX idx_bounty_submitted ON bounty_submission(submitted_at);
