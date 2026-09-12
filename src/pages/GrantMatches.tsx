import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Target, Loader2, ExternalLink, CheckCircle2, FileText, Circle, Search, X, Copy, Upload } from 'lucide-react';
import { GrantSummaryRow } from '../components/GrantSummaryRow';
import { useApplications } from '../context/ApplicationsContext';
import { useOpportunities } from '../context/OpportunitiesContext';
import { useBusinessDNA } from '../context/BusinessDNAContext';
import { useAuth } from '../context/AuthContext';
import { ELIGIBILITY_LABELS, STRONG_MATCH_THRESHOLD } from '../lib/matching';
import { SF424_FIELD_MAP, PROJECT_SPECIFIC_FIELDS, buildOrgInfoSnapshot } from '../data/applicationFields';
import { buildGrantExtractionPrompt } from '../lib/prompts';
import { compactCurrency } from '../lib/format';

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
  const { opportunities, loading, error, search, searching, searchError, refresh } = useOpportunities();
  const { getField } = useBusinessDNA();
  const { isAdmin } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

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

  const categoryFiltered = activeCategory
    ? opportunities.filter((o) => o.fundingCategories.some((c) => c.id === activeCategory))
    : opportunities;

  // The search box previously only triggered a live Grants.gov fetch — typing "ohio"
  // added any newly-synced opportunities to the shared cache but never actually
  // narrowed what's displayed, so the list looked unchanged even when nothing matched.
  // Filtering the already-loaded list by the same typed term (title/description/
  // eligibility text) makes the search box behave like a search, independent of
  // whether a live sync finds anything new.
  const searchTerm = searchInput.trim().toLowerCase();
  const visibleOpportunities = searchTerm
    ? categoryFiltered.filter((o) =>
        `${o.name} ${o.description} ${o.applicantEligibilityDesc ?? ''} ${o.funder}`
          .toLowerCase()
          .includes(searchTerm),
      )
    : categoryFiltered;

  const selected = visibleOpportunities.find((g) => g.id === selectedId) ?? null;

  // Same "strong match" definition and award-summing logic as the Dashboard's Funding
  // Identified card (see STRONG_MATCH_THRESHOLD's comment in matching.ts) — summing
  // every technically-eligible match would overstate what's realistically winnable.
  // Scoped to whatever's currently visible (search/category filters applied), not the
  // full unfiltered list, so the number stays accurate to what's actually on screen.
  const strongVisibleMatches = visibleOpportunities.filter((o) => o.matchPct >= STRONG_MATCH_THRESHOLD);
  const totalIdentified = strongVisibleMatches.reduce((sum, o) => sum + (o.awardAmount ?? 0), 0);

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

  async function handleCopyExtractionPrompt() {
    await navigator.clipboard.writeText(buildGrantExtractionPrompt());
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2500);
  }

  async function handleImport() {
    setImporting(true);
    setImportMessage(null);
    try {
      // AI chat tools (including Claude's Chrome extension) commonly wrap JSON output
      // in a ```json ... ``` markdown fence even when told to return "only" JSON —
      // strip it before parsing rather than asking the user to hand-edit the paste.
      const clean = importText.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean);
      const res = await fetch('/api/import-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Import failed');
      setImportMessage(
        `Imported ${body.imported} grant${body.imported === 1 ? '' : 's'}` +
          (body.errorCount > 0 ? ` (${body.errorCount} skipped — see console)` : '.'),
      );
      if (body.errorCount > 0) console.warn('Import errors:', body.errors);
      setImportText('');
      await refresh();
    } catch (err) {
      setImportMessage(err instanceof Error ? `Couldn't import: ${err.message}` : 'Import failed — check the pasted JSON.');
    } finally {
      setImporting(false);
    }
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
        {isAdmin && (
          <button className="glass-btn-outline" onClick={() => setImportOpen((v) => !v)}>
            <Upload className="w-3.5 h-3.5" />
            Import grants
          </button>
        )}
      </div>
      {isAdmin && importOpen && (
        <div className="glass-card p-5 mb-4">
          <div className="text-[13px] font-bold mb-1.5">Manually import grants from a blocked site</div>
          <div className="text-[11.5px] text-ink-2 leading-relaxed mb-3.5">
            For sites that block automated access (Hello Alice, MBDA, etc.): browse the site yourself in a
            session where Claude's Chrome extension is active, copy this prompt to it, then paste the JSON
            it returns below and import.
          </div>
          <button className="glass-btn-outline mb-3.5" onClick={handleCopyExtractionPrompt}>
            <Copy className="w-3.5 h-3.5" />
            {promptCopied ? 'Copied — paste into your AI' : 'Copy extraction prompt'}
          </button>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='Paste the JSON output here — { "source": "...", "sourceLabel": "...", "grants": [...] }'
            rows={6}
            className="w-full bg-surface-2 border border-line-2 rounded-lg px-3 py-2 text-[12.5px] font-mono outline-none focus:border-accent resize-y mb-3"
          />
          <div className="flex items-center gap-3">
            <button className="glass-btn" onClick={handleImport} disabled={importing || !importText.trim()}>
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {importing ? 'Importing…' : 'Import'}
            </button>
            {importMessage && <div className="text-[12px] font-semibold text-ink-2">{importMessage}</div>}
          </div>
        </div>
      )}
      {searchError && <div className="text-[12px] text-required font-semibold mb-3">{searchError}</div>}
      <div className="text-[11px] text-ink-3 mb-4 leading-relaxed max-w-2xl">
        Typing filters the list below to opportunities whose title, description, or eligibility text
        mentions your term. Click Search to also check Grants.gov live for anything not yet synced.
        Federal grants are almost always nationwide — genuinely state-specific or demographic-restricted
        programs (e.g. "Ohio only," "minority-owned only") are rare in this data source and, for
        demographic set-asides specifically, largely phased out of federal grantmaking in recent years.
        A 0-result filter usually means the federal data just doesn't have that, not that the search failed.
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
        {!loading && (
          <div className="ml-auto flex items-center gap-2 px-4 py-2 rounded-full border border-line-2 bg-surface-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-ink-3">Funding Identified</span>
            <span className="text-[13px] font-bold text-accent">
              {totalIdentified > 0 ? compactCurrency.format(totalIdentified) : 'N/A'}
            </span>
            <span className="text-[11px] text-ink-3">
              across {strongVisibleMatches.length} strong match{strongVisibleMatches.length === 1 ? '' : 'es'}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="glass-card p-10 flex items-center justify-center gap-2.5 text-ink-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-semibold">Loading real grant opportunities…</span>
        </div>
      ) : error ? (
        <div className="glass-card p-10 text-center text-ink-3">
          <div className="text-sm font-semibold">Couldn't load opportunities: {error}</div>
        </div>
      ) : visibleOpportunities.length === 0 ? (
        <div className="glass-card p-10 text-center text-ink-3">
          <Target className="w-7 h-7 mx-auto mb-3" />
          <div className="text-sm font-semibold">
            {searchTerm
              ? `Nothing currently loaded mentions "${searchInput.trim()}" — click Search to check Grants.gov live, or this term may just not exist as a federal grant category.`
              : activeCategory
                ? 'No matches in this category.'
                : 'No eligible opportunities synced yet.'}
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
