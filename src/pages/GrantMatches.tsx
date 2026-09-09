import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Target, Loader2, ExternalLink, CheckCircle2, FileText, Circle, Search, X } from 'lucide-react';
import { GrantSummaryRow } from '../components/GrantSummaryRow';
import { useApplications } from '../context/ApplicationsContext';
import { useOpportunities } from '../context/OpportunitiesContext';
import { useBusinessDNA } from '../context/BusinessDNAContext';
import { ELIGIBILITY_LABELS } from '../lib/matching';
import { SF424_FIELD_MAP, PROJECT_SPECIFIC_FIELDS, buildOrgInfoSnapshot } from '../data/applicationFields';

const BUSINESS_CODES = new Set(['22', '23', '25', '99']);

function formatExactDate(iso: string | null): string {
  if (!iso) return 'Not listed';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function GrantMatches() {
  const navigate = useNavigate();
  const { hasApplication, startApplication } = useApplications();
  const { opportunities, loading, error, search, searching, searchError } = useOpportunities();
  const { getField } = useBusinessDNA();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // "Sections" built from Grants.gov's own funding-activity-category labels present
  // in whatever's actually synced — not a hardcoded/guessed taxonomy. Demographic or
  // regional targeting (minority-owned, urban, rural, veteran, etc.) isn't a
  // structured field Grants.gov exposes, so those live in free text and surface via
  // the search box instead of a category chip here.
  const categories = useMemo(() => {
    const counts = new Map<string, { description: string; count: number }>();
    for (const opp of opportunities) {
      for (const cat of opp.fundingCategories) {
        const existing = counts.get(cat.id);
        counts.set(cat.id, { description: cat.description, count: (existing?.count ?? 0) + 1 });
      }
    }
    return Array.from(counts.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [opportunities]);

  const visibleOpportunities = activeCategory
    ? opportunities.filter((o) => o.fundingCategories.some((c) => c.id === activeCategory))
    : opportunities;

  const selected = visibleOpportunities.find((g) => g.id === selectedId) ?? null;

  const applicationFields = SF424_FIELD_MAP.map((mapping) => {
    const field = getField(mapping.dnaTab, mapping.dnaLabel);
    const ready = !!field && field.status !== 'required';
    return { ...mapping, value: field?.value ?? 'Not yet provided', ready };
  });
  const readyCount = applicationFields.filter((f) => f.ready).length;

  function handleSearch() {
    const term = searchInput.trim();
    if (!term || searching) return;
    search(term);
  }

  return (
    <div className="panel-enter">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search Grants.gov — e.g. minority-owned, rural, urban, veteran, AI…"
            className="w-full bg-surface border border-line-2 rounded-full pl-10 pr-4 py-2.5 text-[13px] outline-none focus:border-accent"
          />
        </div>
        <button className="glass-btn" onClick={handleSearch} disabled={searching || !searchInput.trim()}>
          {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
      {searchError && <div className="text-[12px] text-required font-semibold mb-3">{searchError}</div>}
      <div className="text-[11px] text-ink-3 mb-4 leading-relaxed max-w-2xl">
        Searches Grants.gov live and adds any new eligible matches to your list below. Demographic and
        regional set-asides (minority-owned, urban, rural, veteran, etc.) aren't a separate structured
        category in federal data — they show up in program text, so search for them as keywords rather
        than a filter chip.
      </div>

      <div className="flex items-center gap-2.5 flex-wrap mb-5">
        <div className="flex items-center gap-2.5 bg-surface-2 border border-line-2 rounded-2xl p-1.5 w-fit">
          <div className="chip active">Grants · {loading ? '…' : opportunities.length}</div>
          <div className="chip locked" title="Coming soon">
            <Lock className="w-[11px] h-[11px]" />
            Loans
          </div>
          <div className="chip locked" title="Coming soon">
            <Lock className="w-[11px] h-[11px]" />
            VC / Equity
          </div>
        </div>
        {categories.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {activeCategory && (
              <button className="chip" onClick={() => setActiveCategory(null)}>
                <X className="w-[11px] h-[11px]" />
                Clear
              </button>
            )}
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`chip ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              >
                {cat.description} · {cat.count}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="glass-card p-10 flex items-center justify-center gap-2.5 text-ink-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading real federal opportunities…</span>
        </div>
      ) : error ? (
        <div className="glass-card p-10 text-center text-ink-3">
          <div className="text-sm font-semibold">Couldn't load opportunities: {error}</div>
        </div>
      ) : visibleOpportunities.length === 0 ? (
        <div className="glass-card p-10 text-center text-ink-3">
          <Target className="w-7 h-7 mx-auto mb-3" />
          <div className="text-sm font-semibold">
            {activeCategory ? 'No matches in this category.' : 'No eligible opportunities synced yet.'}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 items-start min-w-0" style={{ gridTemplateColumns: '1fr 420px' }}>
          <div className="flex flex-col gap-3.5 min-w-0">
            {visibleOpportunities.map((grant) => {
              const isSelected = selectedId === grant.id;
              return (
                <div
                  key={grant.id}
                  className="bg-surface rounded-2xl px-5 py-[18px] cursor-pointer hover:shadow-md transition-shadow min-w-0"
                  style={{ border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-line)'}` }}
                  onClick={() => setSelectedId(grant.id)}
                >
                  <GrantSummaryRow grant={grant} />
                </div>
              );
            })}
          </div>

          <div
            className="glass-card p-[26px] sticky top-[100px] overflow-y-auto scrollarea"
            style={{ maxHeight: 'calc(100vh - 140px)' }}
          >
            {selected ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      selected.status === 'posted'
                        ? 'bg-verified/10 text-verified border border-verified/25'
                        : 'bg-inferred/10 text-inferred border border-inferred/25'
                    }`}
                  >
                    {selected.status === 'posted' ? 'Open' : 'Forecasted'}
                  </span>
                  {selected.opportunityNumber && (
                    <span className="text-[11px] text-ink-3 font-semibold">{selected.opportunityNumber}</span>
                  )}
                </div>
                <div className="text-base font-bold mb-1">{selected.name}</div>
                <div className="text-[12.5px] text-ink-2 mb-2">
                  {selected.funder}
                  {selected.cfdaList.length > 0 && ` · ALN ${selected.cfdaList.join(', ')}`}
                </div>
                {selected.fundingCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {selected.fundingCategories.map((cat) => (
                      <span
                        key={cat.id}
                        className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-surface-2 text-ink-2"
                      >
                        {cat.description}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div>
                    <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-3">Amount</div>
                    <div className="text-sm font-bold mt-1">{selected.amount}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-3">Match</div>
                    <div className="text-sm font-bold mt-1 text-accent">{selected.matchPct}%</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-3">Opens</div>
                    <div className="text-sm font-bold mt-1">{formatExactDate(selected.openDate)}</div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-3">Closes</div>
                    <div className="text-sm font-bold mt-1">
                      {formatExactDate(selected.closeDate)}
                      <span className="text-ink-3 font-semibold"> ({selected.deadline})</span>
                    </div>
                  </div>
                </div>

                {selected.caveats.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-required/10 border border-required/30 mb-5">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-required mb-1.5">
                      Before you invest time here
                    </div>
                    <div className="flex flex-col gap-2">
                      {selected.caveats.map((c) => (
                        <div key={c} className="text-[12.5px] text-ink-2 leading-relaxed">
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5">
                  Why you matched
                </div>
                <div className="flex flex-col gap-[9px] mb-5">
                  {selected.evidence.map((ev) => (
                    <div key={ev} className="flex items-start gap-2 text-[12.5px] text-ink-2">
                      <span className="w-[5px] h-[5px] rounded-full bg-accent mt-1.5 shrink-0" />
                      {ev}
                    </div>
                  ))}
                </div>

                <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5">
                  About this opportunity
                </div>
                <p className="text-[12.5px] text-ink-2 leading-relaxed mb-5 whitespace-pre-line">
                  {selected.description}
                </p>

                <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5">
                  Who's eligible
                </div>
                <div className="flex flex-col gap-1.5 mb-2">
                  {selected.eligibilityCodes.map((code) => (
                    <div key={code} className="flex items-start gap-2 text-[12.5px]">
                      <CheckCircle2
                        className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                          BUSINESS_CODES.has(code) ? 'text-verified' : 'text-ink-3'
                        }`}
                      />
                      <span className={BUSINESS_CODES.has(code) ? 'text-ink font-semibold' : 'text-ink-2'}>
                        {ELIGIBILITY_LABELS[code] ?? `Eligibility code ${code}`}
                      </span>
                    </div>
                  ))}
                </div>
                {selected.applicantEligibilityDesc && (
                  <p className="text-[12px] text-ink-3 leading-relaxed italic mb-5">
                    {selected.applicantEligibilityDesc}
                  </p>
                )}

                <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5 mt-1">
                  How to apply
                </div>
                {selected.announcementUrl && (
                  <a
                    href={selected.announcementUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[12.5px] font-bold text-accent mb-3.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View the full official announcement on Grants.gov
                  </a>
                )}
                <div className="bg-surface-2 rounded-xl p-4 mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-2">
                      <FileText className="w-3.5 h-3.5" />
                      Application fields
                    </div>
                    <span className="text-[11px] font-bold text-ink-3">
                      {readyCount} of {applicationFields.length} ready
                    </span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {applicationFields.map((f) => (
                      <div key={f.label} className="flex items-start gap-2.5">
                        {f.ready ? (
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-verified" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ink-3" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-ink-2">{f.label}</div>
                          {f.ready ? (
                            <div className="text-[12.5px] font-semibold">{f.value}</div>
                          ) : (
                            <button
                              className="text-[12.5px] font-semibold text-required underline decoration-dotted"
                              onClick={() => navigate('/business-dna', { state: { tab: f.dnaTab } })}
                            >
                              Not yet provided — add in Business DNA
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mt-4 mb-2">
                    Project-specific — fill in per application
                  </div>
                  <div className="flex flex-col gap-1.5 mb-1">
                    {PROJECT_SPECIFIC_FIELDS.map((req) => (
                      <div key={req} className="flex items-start gap-2 text-[12px] text-ink-2">
                        <span className="w-1 h-1 rounded-full bg-ink-3 mt-[7px] shrink-0" />
                        {req}
                      </div>
                    ))}
                  </div>
                  <div className="text-[10.5px] text-ink-3 italic mt-3">
                    Pre-filled fields come straight from your Business DNA. Project-specific fields aren't
                    facts about the business, so they're always written fresh for this opportunity.
                  </div>
                </div>

                <button
                  className="glass-btn w-full justify-center"
                  onClick={() => {
                    startApplication(selected, buildOrgInfoSnapshot(getField));
                    navigate(`/applications/${selected.id}`);
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
      )}
    </div>
  );
}
