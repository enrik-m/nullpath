/**
 * Placeholder views — replaced as each feature lands. Keep them intentionally
 * minimal so the shell renders end-to-end while we iterate.
 */

interface StubProps {
  title: string;
  body?: string;
}

function Stub({ title, body }: StubProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md px-8">
        <div className="np-mono text-[10px] tracking-[0.4em] text-[var(--color-fg-3)] uppercase mb-3">
          // {title.toLowerCase()}
        </div>
        <div className="text-3xl font-bold tracking-tight text-[var(--color-fg-0)] mb-3">
          {title}
        </div>
        {body && (
          <div className="text-[var(--color-fg-2)] text-sm">
            {body}
          </div>
        )}
        <div className="mt-6 np-mono text-[10px] text-[var(--color-fg-3)] tracking-widest">
          coming online soon...
        </div>
      </div>
    </div>
  );
}

export const CodexStub = () => (
  <Stub
    title="Codex"
    body="Every video, blog, writeup, and lab you've attached to your skill graph. Searchable. Filterable. Exportable."
  />
);

export const StatsStub = () => (
  <Stub
    title="Stats"
    body="Time Ledger, completion charts, hunt mode hours, streak heatmap."
  />
);

export const BountiesStub = () => (
  <Stub
    title="Bounty Ledger"
    body="Track every submission. Date, program, severity, status, payout."
  />
);
