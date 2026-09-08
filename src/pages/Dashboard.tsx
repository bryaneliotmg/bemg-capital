import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUp, Calendar, ChevronDown } from 'lucide-react';
import { Ring } from '../components/Ring';
import { GrantSummaryRow } from '../components/GrantSummaryRow';
import { GRANTS, readinessBand } from '../data/sampleData';
import { useApplications } from '../context/ApplicationsContext';

const READINESS_SCORE = 72;
const DNA_COMPLETENESS = 84;

export function Dashboard() {
  const navigate = useNavigate();
  const { hasApplication, startApplication } = useApplications();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const band = readinessBand(READINESS_SCORE);
  const dashboardGrants = GRANTS.slice(0, 4);

  return (
    <div className="panel-enter">
      <div className="grid grid-cols-4 gap-[18px] mb-7">
        <div className="glass-card p-[22px]">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant mb-2.5">
            Funding Readiness
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold" style={{ color: band.color }}>
              {READINESS_SCORE}
            </span>
            <span className="text-xs text-ink3">/ 100</span>
          </div>
          <div className="mt-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: band.color }}>
            {band.label}
          </div>
        </div>

        <div className="glass-card p-[22px]">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant mb-2.5">
            Business DNA
          </div>
          <div className="text-3xl font-extrabold">{DNA_COMPLETENESS}%</div>
          <button className="link-btn block mt-2 text-[11.5px] font-bold" onClick={() => navigate('/business-dna')}>
            Complete your profile →
          </button>
        </div>

        <div className="glass-card p-[22px]">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant mb-2.5">
            Active Matches
          </div>
          <div className="text-3xl font-extrabold">{GRANTS.length}</div>
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <ArrowUp className="w-2.5 h-2.5" />
            +3 this week
          </div>
        </div>

        <div className="glass-card p-[22px]">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant mb-2.5">
            Funding Identified
          </div>
          <div className="text-3xl font-extrabold">$185K</div>
          <div className="mt-2 text-[11.5px] text-ink3">across {GRANTS.length} open opportunities</div>
        </div>
      </div>

      <div className="grid gap-6 items-start" style={{ gridTemplateColumns: '1fr 320px' }}>
        <div>
          <div className="text-[13px] font-extrabold uppercase tracking-wide text-on-surface-variant mb-3.5">
            Matched Opportunities
          </div>
          <div className="flex flex-col gap-3.5">
            {dashboardGrants.map((grant) => {
              const expanded = expandedId === grant.id;
              return (
                <div
                  key={grant.id}
                  className="bg-surface-container-low border border-outline-variant rounded-2xl px-5 py-[18px] cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setExpandedId(expanded ? null : grant.id)}
                >
                  <GrantSummaryRow
                    grant={grant}
                    trailing={
                      <ChevronDown
                        className="w-4 h-4 text-ink3 shrink-0 transition-transform duration-150"
                        style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    }
                  />
                  {expanded && (
                    <div className="mt-4 pt-4 border-t border-outline-variant">
                      <div className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant mb-2.5">
                        Why you matched
                      </div>
                      <div className="flex flex-col gap-2 mb-4">
                        {grant.evidence.map((ev) => (
                          <div key={ev} className="flex items-start gap-2 text-[12.5px] text-on-surface-variant">
                            <span className="w-[5px] h-[5px] rounded-full bg-secondary mt-1.5 shrink-0" />
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
          <button className="link-btn mt-3.5 text-[12.5px] font-bold" onClick={() => navigate('/grants')}>
            View all {GRANTS.length} matches →
          </button>
        </div>

        <div className="flex flex-col gap-[18px]">
          <div className="glass-card p-[22px]">
            <div className="text-xs font-extrabold uppercase tracking-wide text-on-surface-variant mb-3.5">
              Business DNA at a glance
            </div>
            <div className="flex flex-col gap-[11px] text-[13px]">
              <div className="flex justify-between">
                <span className="text-ink3">Revenue (TTM)</span>
                <span className="font-bold">$620,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink3">Employees</span>
                <span className="font-bold">8</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink3">Years operating</span>
                <span className="font-bold">6</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink3">Location</span>
                <span className="font-bold">Jackson, MS</span>
              </div>
            </div>
            <button className="link-btn block mt-4 text-xs font-bold" onClick={() => navigate('/business-dna')}>
              View full profile →
            </button>
          </div>

          <div className="glass-card p-[22px] bg-primary-container border-transparent">
            <div className="text-xs font-extrabold uppercase tracking-wide text-on-primary-container mb-2">
              Next best action
            </div>
            <div className="text-[13px] text-on-primary-container leading-relaxed">
              Upload your 2024 tax return to raise Loan Readiness from 68 → 78.
            </div>
            <button
              className="glass-btn-outline mt-3.5 bg-white/60 border-[#004466]/15"
              onClick={() => navigate('/business-dna')}
            >
              Upload document
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
