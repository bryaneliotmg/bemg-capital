import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import { GrantSummaryRow } from '../components/GrantSummaryRow';
import { readinessBand } from '../data/sampleData';
import { useApplications } from '../context/ApplicationsContext';
import { useOpportunities } from '../context/OpportunitiesContext';

const DNA_COMPLETENESS = 46;

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function Dashboard() {
  const navigate = useNavigate();
  const { hasApplication, startApplication } = useApplications();
  const { opportunities, loading, error } = useOpportunities();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState(24);
  const band = readinessBand(readiness);
  const dashboardGrants = opportunities.slice(0, 4);
  const totalIdentified = opportunities.reduce((sum, o) => sum + (o.awardAmount ?? 0), 0);

  return (
    <div className="panel-enter">
      <div className="grid grid-cols-4 gap-[18px] mb-7">
        <div className="glass-card p-[22px]">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5">
            Funding Readiness
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[32px] font-semibold" style={{ color: band.color }}>
              {readiness}
            </span>
            <span className="text-xs text-ink-3">/ 100</span>
          </div>
          <div className="mt-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: band.color }}>
            {band.label}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={readiness}
            onChange={(e) => setReadiness(Number(e.target.value))}
            className="w-full mt-3 accent-[var(--color-accent)]"
          />
        </div>

        <div className="glass-card p-[22px]">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5">
            Business DNA
          </div>
          <div className="font-serif text-[32px] font-semibold">{DNA_COMPLETENESS}%</div>
          <button className="link-btn block mt-2 text-[11.5px] font-bold" onClick={() => navigate('/business-dna')}>
            Complete your profile →
          </button>
        </div>

        <div className="glass-card p-[22px]">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5">
            Active Matches
          </div>
          <div className="font-serif text-[32px] font-semibold">{loading ? '—' : opportunities.length}</div>
          <div className="mt-2 text-[11.5px] text-ink-3">
            {loading ? 'Loading real federal opportunities…' : 'Federal grants, via Grants.gov'}
          </div>
        </div>

        <div className="glass-card p-[22px]">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5">
            Funding Identified
          </div>
          <div className="font-serif text-[32px] font-semibold">
            {loading ? '—' : totalIdentified > 0 ? compactCurrency.format(totalIdentified) : 'N/A'}
          </div>
          <div className="mt-2 text-[11.5px] text-ink-3">
            {loading ? ' ' : `across ${opportunities.length} open opportunities`}
          </div>
        </div>
      </div>

      <div className="grid gap-6 items-start" style={{ gridTemplateColumns: '1fr 320px' }}>
        <div>
          <div className="text-[13px] font-extrabold uppercase tracking-wide text-ink-2 mb-3.5">
            Matched Opportunities
          </div>
          {loading ? (
            <div className="glass-card p-10 flex items-center justify-center gap-2.5 text-ink-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-semibold">Loading real federal opportunities…</span>
            </div>
          ) : error ? (
            <div className="glass-card p-10 text-center text-sm font-semibold text-ink-3">
              Couldn't load opportunities: {error}
            </div>
          ) : dashboardGrants.length === 0 ? (
            <div className="glass-card p-10 text-center text-sm font-semibold text-ink-3">
              No eligible opportunities synced yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {dashboardGrants.map((grant) => {
                const expanded = expandedId === grant.id;
                return (
                  <div
                    key={grant.id}
                    className="bg-surface border border-line rounded-2xl px-5 py-[18px] cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setExpandedId(expanded ? null : grant.id)}
                  >
                    <GrantSummaryRow
                      grant={grant}
                      trailing={
                        <ChevronDown
                          className="w-4 h-4 text-ink-3 shrink-0 transition-transform duration-150"
                          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                        />
                      }
                    />
                    {expanded && (
                      <div className="mt-4 pt-4 border-t border-line">
                        <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5">
                          Why you matched
                        </div>
                        <div className="flex flex-col gap-2 mb-4">
                          {grant.evidence.map((ev) => (
                            <div key={ev} className="flex items-start gap-2 text-[12.5px] text-ink-2">
                              <span className="w-[5px] h-[5px] rounded-full bg-accent mt-1.5 shrink-0" />
                              {ev}
                            </div>
                          ))}
                        </div>
                        <button
                          className="glass-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            startApplication(grant);
                            navigate('/applications');
                          }}
                        >
                          {hasApplication(grant.id) ? 'View Application' : 'Start Application'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {!loading && opportunities.length > 0 && (
            <button className="link-btn mt-3.5 text-[12.5px] font-bold" onClick={() => navigate('/grants')}>
              View all {opportunities.length} matches →
            </button>
          )}
        </div>

        <div className="flex flex-col gap-[18px]">
          <div className="glass-card p-[22px]">
            <div className="text-xs font-extrabold uppercase tracking-wide text-ink-2 mb-3.5">
              Business DNA at a glance
            </div>
            <div className="flex flex-col gap-[11px] text-[13px]">
              <div className="flex justify-between">
                <span className="text-ink-3">Contacts</span>
                <span className="font-bold">605</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-3">Posts published</span>
                <span className="font-bold">79</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-3">Signals sent</span>
                <span className="font-bold">14</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-3">Plan</span>
                <span className="font-bold">Starter</span>
              </div>
            </div>
            <button className="link-btn block mt-4 text-xs font-bold" onClick={() => navigate('/business-dna')}>
              View full profile →
            </button>
          </div>

          <div className="glass-card p-[22px] bg-surface-2">
            <div className="text-xs font-extrabold uppercase tracking-wide text-accent mb-2">
              Next best action
            </div>
            <div className="text-[13px] text-ink-2 leading-relaxed">
              Financial DNA is empty — connect accounting software or provide 2024 financials to start computing Grant and Loan Readiness.
            </div>
            <button className="glass-btn-outline mt-3.5" onClick={() => navigate('/business-dna')}>
              Add financial info
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
