import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Target } from 'lucide-react';
import { GrantSummaryRow } from '../components/GrantSummaryRow';
import { FUNDING_OPPORTUNITIES, ringColorForMatch } from '../data/sampleData';
import { useApplications } from '../context/ApplicationsContext';

export function GrantMatches() {
  const navigate = useNavigate();
  const { hasApplication, startApplication } = useApplications();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = FUNDING_OPPORTUNITIES.find((g) => g.id === selectedId) ?? null;

  return (
    <div className="panel-enter">
      <div className="flex items-center gap-2.5 bg-surface-2 border border-line-2 rounded-2xl p-1.5 w-fit mb-5">
        <div className="chip active">Grants · {FUNDING_OPPORTUNITIES.length}</div>
        <div className="chip locked" title="Coming soon">
          <Lock className="w-[11px] h-[11px]" />
          Loans
        </div>
        <div className="chip locked" title="Coming soon">
          <Lock className="w-[11px] h-[11px]" />
          VC / Equity
        </div>
      </div>

      <div className="grid gap-6 items-start" style={{ gridTemplateColumns: '1fr 380px' }}>
        <div className="flex flex-col gap-3.5">
          {FUNDING_OPPORTUNITIES.map((grant) => {
            const isSelected = selectedId === grant.id;
            return (
              <div
                key={grant.id}
                className="bg-surface rounded-2xl px-5 py-[18px] cursor-pointer hover:shadow-md transition-shadow"
                style={{ border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-line)'}` }}
                onClick={() => setSelectedId(grant.id)}
              >
                <GrantSummaryRow grant={grant} />
              </div>
            );
          })}
        </div>

        <div className="glass-card p-[26px] sticky top-[100px]">
          {selected ? (
            <div>
              <div className="text-base font-bold mb-1">{selected.name}</div>
              <div className="text-[12.5px] text-ink-2 mb-[18px]">{selected.funder}</div>
              <div className="flex gap-6 mb-5">
                <div>
                  <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-3">Amount</div>
                  <div className="text-sm font-bold mt-1">{selected.amount}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-3">Deadline</div>
                  <div className="text-sm font-bold mt-1">{selected.deadline}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-3">Match</div>
                  <div className="text-sm font-bold mt-1" style={{ color: ringColorForMatch(selected.matchPct) }}>
                    {selected.matchPct}%
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5">
                Why you matched
              </div>
              <div className="flex flex-col gap-[9px] mb-[22px]">
                {selected.evidence.map((ev) => (
                  <div key={ev} className="flex items-start gap-2 text-[12.5px] text-ink-2">
                    <span className="w-[5px] h-[5px] rounded-full bg-accent mt-1.5 shrink-0" />
                    {ev}
                  </div>
                ))}
              </div>
              <button
                className="glass-btn w-full justify-center"
                onClick={() => {
                  startApplication(selected);
                  navigate('/applications');
                }}
              >
                {hasApplication(selected.id) ? 'View Application' : 'Start Application'}
              </button>
            </div>
          ) : (
            <div className="text-center py-[30px] px-2.5 text-ink-3">
              <Target className="w-7 h-7 mx-auto mb-3" />
              <div className="text-[13px] font-semibold">
                Select an opportunity to see the full match evidence.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
