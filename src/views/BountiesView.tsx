/**
 * BountiesView — real bug bounty submissions ledger.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, X, Trash2, Edit3 } from "lucide-react";
import * as db from "../db";
import type {
  BountySubmissionRow,
  BountySeverity,
  BountyStatus,
} from "../db/types";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/cn";
import { Button } from "../components/ui/Button";

const SEVERITY_COLOR: Record<BountySeverity, string> = {
  info: "var(--color-fg-3)",
  low: "var(--color-fg-2)",
  medium: "var(--color-amber)",
  high: "var(--color-magenta)",
  critical: "var(--color-rose)",
};

const STATUS_COLOR: Record<BountyStatus, string> = {
  submitted: "var(--color-cyan)",
  triaged: "var(--color-amber)",
  accepted: "var(--color-lime)",
  resolved: "var(--color-lime)",
  rejected: "var(--color-rose)",
  duplicate: "var(--color-fg-3)",
  informative: "var(--color-fg-2)",
};

const SEVERITIES: BountySeverity[] = ["info", "low", "medium", "high", "critical"];
const STATUSES: BountyStatus[] = [
  "submitted",
  "triaged",
  "accepted",
  "resolved",
  "rejected",
  "duplicate",
  "informative",
];

export function BountiesView() {
  const [items, setItems] = useState<BountySubmissionRow[]>([]);
  const [totals, setTotals] = useState({ total: 0, accepted: 0, payout: 0, cves: 0 });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BountySubmissionRow | null>(null);

  async function reload() {
    setItems(await db.getBounties());
    setTotals(await db.bountyTotals());
  }

  useEffect(() => {
    reload();
  }, []);

  async function deleteItem(id: number) {
    sfx.warn();
    if (!confirm("Delete this submission?")) return;
    await db.deleteBounty(id);
    reload();
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-10 py-10 max-w-[1100px]">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="np-mono text-[10px] tracking-[0.4em] text-[var(--color-fg-3)] uppercase mb-2">
              // bounty ledger
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-fg-0)]">
              Real-world wins.
            </h1>
            <p className="text-[var(--color-fg-2)] mt-2 text-sm max-w-xl">
              Every submission you've sent. Status, severity, payouts, CVEs.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={() => setAdding(true)}>
            <Plus size={13} />
            Log a submission
          </Button>
        </motion.div>

        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Submissions" value={`${totals.total}`} accent="var(--color-cyan)" />
          <Stat label="Accepted" value={`${totals.accepted}`} accent="var(--color-lime)" />
          <Stat
            label="Total payout"
            value={`$${totals.payout.toLocaleString()}`}
            accent="var(--color-amber)"
          />
          <Stat label="CVEs" value={`${totals.cves}`} accent="var(--color-magenta)" />
        </div>

        {/* List */}
        {items.length === 0 ? (
          <div className="np-glass rounded-lg p-12 text-center">
            <div className="np-mono text-[12px] text-[var(--color-fg-3)] tracking-widest">
              no submissions yet — log one when you ship a real finding
            </div>
          </div>
        ) : (
          <div className="np-glass rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border-subtle)] np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Program</th>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Severity</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Payout</th>
                  <th className="px-4 py-3 text-left">CVE</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-3)] transition-colors"
                  >
                    <td className="px-4 py-3 np-mono text-[11px] text-[var(--color-fg-2)]">
                      {new Date(b.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-[var(--color-fg-0)]">
                      {b.program}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-[var(--color-fg-1)] max-w-[280px] truncate">
                      {b.title}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="np-mono text-[10px] tracking-widest uppercase"
                        style={{ color: SEVERITY_COLOR[b.severity] }}
                      >
                        {b.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="np-mono text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 rounded border"
                        style={{
                          color: STATUS_COLOR[b.status],
                          borderColor: STATUS_COLOR[b.status] + "55",
                        }}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 np-mono text-[12px] text-right text-[var(--color-amber)]">
                      {b.payout_usd ? `$${b.payout_usd.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3 np-mono text-[10.5px] text-[var(--color-magenta)]">
                      {b.cve_id ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(b)}
                        className="text-[var(--color-fg-3)] hover:text-[var(--color-cyan)] p-1"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => deleteItem(b.id)}
                        className="text-[var(--color-fg-3)] hover:text-[var(--color-rose)] p-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(adding || editing) && (
        <BountyForm
          existing={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="np-glass rounded p-4">
      <div className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
        {label}
      </div>
      <div className="np-mono text-2xl mt-1" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function BountyForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: BountySubmissionRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [program, setProgram] = useState(existing?.program ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [severity, setSeverity] = useState<BountySeverity>(existing?.severity ?? "medium");
  const [status, setStatus] = useState<BountyStatus>(existing?.status ?? "submitted");
  const [payout, setPayout] = useState<string>(
    existing?.payout_usd != null ? String(existing.payout_usd) : "",
  );
  const [cve, setCve] = useState(existing?.cve_id ?? "");
  const [submittedAt, setSubmittedAt] = useState(
    existing?.submitted_at ? existing.submitted_at.split("T")[0] : new Date().toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  async function save() {
    if (!program.trim() || !title.trim()) return;
    sfx.success();
    const payload = {
      program: program.trim(),
      title: title.trim(),
      severity,
      status,
      payout_usd: payout ? parseInt(payout, 10) : null,
      cve_id: cve.trim() || null,
      submitted_at: new Date(submittedAt).toISOString(),
      notes: notes.trim() || null,
    };
    if (existing) {
      await db.updateBounty(existing.id, payload);
    } else {
      await db.addBounty(payload);
    }
    onSaved();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        background: "color-mix(in oklab, #06070b 65%, transparent)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97 }}
        animate={{ scale: 1 }}
        className="np-glass rounded-lg w-[560px] max-w-full p-6 border-[var(--color-cyan-dim)] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="np-mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-cyan)]">
            // {existing ? "edit submission" : "log submission"}
          </div>
          <button onClick={onClose} className="text-[var(--color-fg-2)] hover:text-[var(--color-fg-0)]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3 mt-5">
          <div>
            <label className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
              Program
            </label>
            <input
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              placeholder="HackerOne — Acme Corp"
              className="w-full mt-1 bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-sm text-[var(--color-fg-0)] np-mono focus:border-[var(--color-cyan-dim)] focus:outline-none"
            />
          </div>
          <div>
            <label className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="IDOR in /api/v2/users → cross-tenant data read"
              className="w-full mt-1 bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-sm text-[var(--color-fg-0)] focus:border-[var(--color-cyan-dim)] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
                Severity
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as BountySeverity)}
                className="w-full mt-1 bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-sm text-[var(--color-fg-0)] np-mono uppercase focus:border-[var(--color-cyan-dim)] focus:outline-none"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BountyStatus)}
                className="w-full mt-1 bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-sm text-[var(--color-fg-0)] np-mono uppercase focus:border-[var(--color-cyan-dim)] focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
                Submitted
              </label>
              <input
                type="date"
                value={submittedAt}
                onChange={(e) => setSubmittedAt(e.target.value)}
                className="w-full mt-1 bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-sm text-[var(--color-fg-0)] np-mono focus:border-[var(--color-cyan-dim)] focus:outline-none"
              />
            </div>
            <div>
              <label className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
                Payout (USD)
              </label>
              <input
                type="number"
                value={payout}
                onChange={(e) => setPayout(e.target.value)}
                placeholder="0"
                className="w-full mt-1 bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-sm text-[var(--color-fg-0)] np-mono focus:border-[var(--color-cyan-dim)] focus:outline-none"
              />
            </div>
            <div>
              <label className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
                CVE
              </label>
              <input
                value={cve}
                onChange={(e) => setCve(e.target.value)}
                placeholder="CVE-2026-..."
                className="w-full mt-1 bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-sm text-[var(--color-fg-0)] np-mono focus:border-[var(--color-cyan-dim)] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="np-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-fg-3)]">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes — root-cause, technique used, time-to-resolution..."
              className="w-full mt-1 bg-[var(--color-bg-2)] border border-[var(--color-border-default)] rounded px-3 py-2 text-sm text-[var(--color-fg-0)] focus:border-[var(--color-cyan-dim)] focus:outline-none min-h-[80px] resize-y"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={save}>
            Save
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// suppress unused var
void cn;
