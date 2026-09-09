import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Check,
  X,
  ExternalLink,
  ClipboardCheck,
  Sparkles,
  RefreshCw,
  Mail,
  Phone,
  BookOpen,
  AlertTriangle,
  Tags,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useApplications } from '../context/ApplicationsContext';
import { useOpportunities } from '../context/OpportunitiesContext';
import { useBusinessDNA } from '../context/BusinessDNAContext';
import { STATUS_META } from '../data/sampleData';
import { SF424_FIELD_MAP, PROJECT_SPECIFIC_FIELDS } from '../data/applicationFields';
import { getNarrativeSections, getRubricLabel } from '../data/narrativeSections';

type Section = 'overview' | 'organization' | 'narrative' | 'review';

const SECTION_DEFS: { id: Section; label: string; desc: string }[] = [
  { id: 'overview', label: 'Overview', desc: 'What this grant needs' },
  { id: 'organization', label: 'Organization Info', desc: 'SF-424 fields, pre-filled' },
  { id: 'narrative', label: 'Project Narrative', desc: 'Guided, section by section' },
  { id: 'review', label: 'Review & Submit', desc: 'Final checklist' },
];

const STOPWORDS = new Set([
  'their', 'which', 'been', 'also', 'such', 'than', 'they', 'them', 'these', 'those',
  'about', 'after', 'before', 'under', 'over', 'more', 'most', 'some', 'each', 'every',
  'other', 'only', 'when', 'where', 'while', 'through', 'include', 'including', 'shall',
  'should', 'would', 'could', 'within', 'without', 'applicant', 'applicants', 'application',
  'applications', 'funding', 'opportunity', 'program', 'programs', 'grant', 'grants',
]);

function extractKeywords(text: string, max = 25): string[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/[a-z]{5,}/g) ?? [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

function parseDollarAmount(raw: string): number | null {
  const cleaned = raw.replace(/[, ]/g, '');
  const match = cleaned.match(/\$?([\d.]+)\s*(k|m)?/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return null;
  const suffix = match[2]?.toLowerCase();
  if (suffix === 'k') return num * 1_000;
  if (suffix === 'm') return num * 1_000_000;
  return num;
}

interface ReporterExample {
  title: string;
  abstract: string;
  fiscalYear: number;
  org: string;
}

function QuickEditField({
  label,
  value,
  ready,
  onSave,
}: {
  label: string;
  value: string;
  ready: boolean;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === 'Not yet provided' ? '' : value);

  if (editing) {
    return (
      <div className="field-row">
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2">{label}</div>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onSave(draft);
              setEditing(false);
            }
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-full bg-surface-2 border border-line-2 rounded-lg px-3 py-1.5 text-sm font-semibold outline-none focus:border-accent"
        />
        <div className="flex items-center gap-1.5 justify-end">
          <button
            className="text-verified"
            onClick={() => {
              onSave(draft);
              setEditing(false);
            }}
          >
            <Check className="w-4 h-4" />
          </button>
          <button className="text-ink-3" onClick={() => setEditing(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="field-row">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2">{label}</div>
      <div className={cn('text-sm font-semibold', !ready && 'text-required')}>{value}</div>
      <button
        className="flex items-center gap-1 text-[11px] font-bold text-ink-3 hover:text-accent justify-self-end"
        onClick={() => setEditing(true)}
      >
        <Pencil className="w-3 h-3" />
        {ready ? 'Edit' : 'Add'}
      </button>
    </div>
  );
}

export function ApplicationDetail() {
  const { grantId } = useParams<{ grantId: string }>();
  const navigate = useNavigate();
  const {
    getApplication,
    setApplicationStatus,
    getNarrative,
    updateNarrative,
    setNarrativeBulk,
    narrativeProgress,
    loading: applicationsLoading,
    saveStatus,
  } = useApplications();
  const { opportunities } = useOpportunities();
  const { fieldsByTab, getField, setFieldValue } = useBusinessDNA();
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [reporterExamples, setReporterExamples] = useState<ReporterExample[]>([]);
  const [showReferences, setShowReferences] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const application = grantId ? getApplication(grantId) : undefined;
  const opportunity = opportunities.find((o) => o.id === grantId);
  const narrative = grantId ? getNarrative(grantId) : {};
  const sections = useMemo(
    () => getNarrativeSections(opportunity?.agencyCode, opportunity?.name ?? ''),
    [opportunity?.agencyCode, opportunity?.name],
  );
  const rubricLabel = getRubricLabel(opportunity?.agencyCode, opportunity?.name ?? '');
  const progress = grantId ? narrativeProgress(grantId, sections) : { done: 0, total: sections.length };

  const applicationFields = SF424_FIELD_MAP.map((mapping) => {
    const field = getField(mapping.dnaTab, mapping.dnaLabel);
    const ready = !!field && field.status !== 'required';
    return { ...mapping, value: field?.value ?? 'Not yet provided', ready };
  });
  const orgReadyCount = applicationFields.filter((f) => f.ready).length;

  useEffect(() => {
    if (!opportunity?.name) return;
    let cancelled = false;
    fetch(`/api/reporter-examples?title=${encodeURIComponent(opportunity.name)}`)
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled && body?.ok) setReporterExamples(body.examples ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [opportunity?.name]);

  const keywordTargets = useMemo(
    () => extractKeywords(`${opportunity?.name ?? ''} ${opportunity?.description ?? ''}`),
    [opportunity?.name, opportunity?.description],
  );
  const narrativeText = useMemo(() => Object.values(narrative).join(' ').toLowerCase(), [narrative]);
  const matchedKeywords = keywordTargets.filter((k) => narrativeText.includes(k));
  const missingKeywords = keywordTargets.filter((k) => !narrativeText.includes(k)).slice(0, 6);

  const capitalField = getField('growth', 'Capital Requirement');
  const capitalNeed =
    capitalField && capitalField.status !== 'required' ? parseDollarAmount(capitalField.value) : null;

  function buildBusinessFacts() {
    return Object.values(fieldsByTab)
      .flat()
      .map((f) => ({ label: f.label, value: f.value, status: f.status }));
  }

  async function callGenerate(sectionsToGenerate: typeof sections) {
    if (!opportunity) return null;
    const res = await fetch('/api/generate-narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sections: sectionsToGenerate,
        opportunity: {
          title: opportunity.name,
          funder: opportunity.funder,
          amount: opportunity.amount,
          description: opportunity.description,
          eligibilityNotes: opportunity.applicantEligibilityDesc,
        },
        businessFacts: buildBusinessFacts(),
        referenceAbstracts: reporterExamples.map((e) => ({ title: e.title, abstract: e.abstract })),
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Generation failed');
    return body.sections as Record<string, string>;
  }

  async function handleGenerateAll() {
    if (!grantId) return;
    setGenerateError(null);
    setGeneratingAll(true);
    try {
      const result = await callGenerate(sections);
      if (result) setNarrativeBulk(grantId, result);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGeneratingAll(false);
    }
  }

  async function handleRegenerate(section: (typeof sections)[number]) {
    if (!grantId) return;
    setGenerateError(null);
    setRegeneratingId(section.id);
    try {
      const result = await callGenerate([section]);
      if (result?.[section.id]) updateNarrative(grantId, section.id, result[section.id]);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setRegeneratingId(null);
    }
  }

  if (applicationsLoading) {
    return <div className="glass-card p-10 text-center text-ink-3 text-sm font-semibold">Loading application…</div>;
  }

  if (!application) {
    return (
      <div className="glass-card p-10 text-center text-ink-3">
        <div className="text-sm font-semibold mb-3">Application not found.</div>
        <Link to="/applications" className="link-btn text-[13px] font-bold">
          Back to Applications
        </Link>
      </div>
    );
  }

  const name = opportunity?.name ?? application.name;
  const hasContact = !!(opportunity?.agencyContactName || opportunity?.agencyContactEmail || opportunity?.agencyContactPhone);

  return (
    <div className="panel-enter">
      <button
        className="link-btn flex items-center gap-1.5 text-[12.5px] font-bold mb-4"
        onClick={() => navigate('/applications')}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Applications
      </button>

      <div className="glass-card p-6 mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-lg font-bold truncate">{name}</div>
          <div className="text-[12.5px] text-ink-2 mt-0.5">
            {opportunity?.funder ?? 'Federal agency'} · Deadline: {application.deadline}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {saveStatus !== 'idle' && (
            <span className="text-[11px] font-bold text-ink-3">
              {saveStatus === 'saving' && 'Saving…'}
              {saveStatus === 'saved' && 'All changes saved'}
              {saveStatus === 'error' && <span className="text-required">Couldn't save — check connection</span>}
            </span>
          )}
          <span className={`w-2 h-2 rounded-full inline-block ${STATUS_META[application.status].dotClass}`} />
          <span className="text-[11px] font-bold uppercase tracking-wide text-ink-2">
            {STATUS_META[application.status].label}
          </span>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <div className="w-[260px] shrink-0 flex flex-col gap-2.5">
          {SECTION_DEFS.map((s) => {
            const active = s.id === activeSection;
            let dotClass = 'bg-inferred';
            if (s.id === 'organization') dotClass = orgReadyCount === applicationFields.length ? 'bg-verified' : 'bg-inferred';
            if (s.id === 'narrative') dotClass = progress.done === progress.total ? 'bg-verified' : 'bg-inferred';
            if (s.id === 'overview') dotClass = 'bg-verified';
            return (
              <button
                key={s.id}
                className={cn('section-nav-card', active && 'active')}
                onClick={() => setActiveSection(s.id)}
              >
                <span className={cn('w-[7px] h-[7px] rounded-full mt-1.5 shrink-0', active ? 'bg-accent' : dotClass)} />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold">{s.label}</div>
                  <div className="text-[11.5px] text-ink-3 mt-0.5">{s.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-0 panel-enter">
          {activeSection === 'overview' && (
            <div className="glass-card p-7">
              <div className="text-[15px] font-bold mb-1.5">Overview</div>
              <div className="text-[12.5px] text-ink-2 mb-5">What this grant asks for, at a glance.</div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-3">Amount</div>
                  <div className="text-sm font-bold mt-1">{opportunity?.amount ?? 'Not specified'}</div>
                </div>
                <div>
                  <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-3">Deadline</div>
                  <div className="text-sm font-bold mt-1">{application.deadline}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-surface-2 mb-5">
                <ClipboardCheck className="w-4 h-4 text-accent shrink-0" />
                <div className="text-[12px] text-ink-2">
                  <span className="font-bold text-ink">Review rubric: </span>
                  {rubricLabel}
                </div>
              </div>

              {opportunity && (
                <>
                  <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2.5">
                    About this opportunity
                  </div>
                  <p className="text-[12.5px] text-ink-2 leading-relaxed mb-5 whitespace-pre-line">
                    {opportunity.description}
                  </p>
                  {opportunity.announcementUrl && (
                    <a
                      href={opportunity.announcementUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[12.5px] font-bold text-accent mb-5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View the full official announcement
                    </a>
                  )}
                </>
              )}

              {hasContact && (
                <div className="p-4 rounded-xl border border-line-2 mb-6">
                  <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2">
                    Program Officer / Agency Contact
                  </div>
                  {opportunity?.agencyContactName && (
                    <div className="text-[13px] font-semibold mb-1">{opportunity.agencyContactName}</div>
                  )}
                  <div className="flex flex-col gap-1">
                    {opportunity?.agencyContactEmail && (
                      <a
                        href={`mailto:${opportunity.agencyContactEmail}`}
                        className="flex items-center gap-1.5 text-[12px] font-semibold text-accent"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        {opportunity.agencyContactEmail}
                      </a>
                    )}
                    {opportunity?.agencyContactPhone && (
                      <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
                        <Phone className="w-3.5 h-3.5" />
                        {opportunity.agencyContactPhone}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-3 mt-2">
                    Program officers can often tell you before you apply whether your project is a good fit — worth a
                    short email.
                  </div>
                </div>
              )}

              <button className="glass-btn mt-1" onClick={() => setActiveSection('organization')}>
                Start with Organization Info
              </button>
            </div>
          )}

          {activeSection === 'organization' && (
            <div className="glass-card p-7">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[15px] font-bold">Organization Info</div>
                <span className="text-[11px] font-bold text-ink-3">
                  {orgReadyCount} of {applicationFields.length} ready
                </span>
              </div>
              <div className="text-[12.5px] text-ink-2 mb-3.5">
                Pulled from your Business DNA. Fix anything here — it updates your DNA everywhere, not just this
                application.
              </div>
              {applicationFields.map((f) => (
                <QuickEditField
                  key={f.label}
                  label={f.label}
                  value={f.value}
                  ready={f.ready}
                  onSave={(value) => setFieldValue(f.dnaTab, f.dnaLabel, value)}
                />
              ))}
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mt-5 mb-2">
                Project-specific — no Business DNA source
              </div>
              <div className="flex flex-col gap-1.5">
                {PROJECT_SPECIFIC_FIELDS.map((req) => (
                  <div key={req} className="flex items-start gap-2 text-[12px] text-ink-2">
                    <span className="w-1 h-1 rounded-full bg-ink-3 mt-[7px] shrink-0" />
                    {req} — written in Project Narrative
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'narrative' && (
            <div className="flex flex-col gap-4">
              <div className="glass-card p-5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-bold">Project Narrative</span>
                  <span className="text-[11px] font-bold text-ink-3 ml-2">
                    {progress.done} of {progress.total} sections drafted
                  </span>
                </div>
                <button className="glass-btn flex items-center gap-1.5" onClick={handleGenerateAll} disabled={generatingAll}>
                  <Sparkles className="w-3.5 h-3.5" />
                  {generatingAll ? 'Drafting…' : 'Generate Full Draft with AI'}
                </button>
              </div>

              {generateError && (
                <div className="glass-card p-4 text-[12px] font-semibold text-required flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {generateError}
                </div>
              )}

              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Tags className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-bold">Keyword Alignment</span>
                </div>
                <div className="text-[12px] text-ink-2 mb-2">
                  {matchedKeywords.length} of {keywordTargets.length} recurring terms from this opportunity's own
                  listing appear somewhere in your draft.
                </div>
                {missingKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className="text-[11px] text-ink-3 mr-1">Not yet mentioned:</span>
                    {missingKeywords.map((k) => (
                      <span key={k} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-ink-2">
                        {k}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="glass-card p-5">
                <div className="text-[13px] font-bold mb-2">Budget Reasonableness</div>
                {capitalNeed == null ? (
                  <div className="text-[12px] text-ink-2">
                    Add a dollar figure to <span className="font-semibold">Capital Requirement</span> in Growth DNA to
                    check it against this grant's award range.
                  </div>
                ) : opportunity?.awardAmount == null ? (
                  <div className="text-[12px] text-ink-2">
                    This opportunity doesn't list a specific award amount to compare against.
                  </div>
                ) : capitalNeed > opportunity.awardAmount * 1.15 ? (
                  <div className="text-[12px] text-required font-semibold">
                    Your stated need (${capitalNeed.toLocaleString()}) is larger than this award's ceiling ($
                    {opportunity.awardAmount.toLocaleString()}) — plan to cover the gap elsewhere or scope the project
                    down.
                  </div>
                ) : capitalNeed < opportunity.awardAmount * 0.2 ? (
                  <div className="text-[12px] text-inferred font-semibold">
                    This award (up to ${opportunity.awardAmount.toLocaleString()}) offers well beyond your stated need
                    (${capitalNeed.toLocaleString()}) — consider whether a larger, more ambitious scope is worth
                    proposing.
                  </div>
                ) : (
                  <div className="text-[12px] text-verified font-semibold">
                    Your stated need (${capitalNeed.toLocaleString()}) fits comfortably within this award's range (up
                    to ${opportunity.awardAmount.toLocaleString()}).
                  </div>
                )}
              </div>

              {reporterExamples.length > 0 && (
                <div className="glass-card p-5">
                  <button
                    className="flex items-center gap-2 w-full text-left"
                    onClick={() => setShowReferences((v) => !v)}
                  >
                    <BookOpen className="w-4 h-4 text-accent shrink-0" />
                    <span className="text-[13px] font-bold flex-1">
                      Similar Funded Projects ({reporterExamples.length})
                    </span>
                    <span className="text-[11px] font-bold text-ink-3">{showReferences ? 'Hide' : 'Show'}</span>
                  </button>
                  <div className="text-[11.5px] text-ink-3 mt-1.5">
                    Real, publicly funded projects under this same mechanism, from NIH RePORTER — for structure and
                    tone reference only. AI drafts use these to calibrate style, never to source facts about your
                    project.
                  </div>
                  {showReferences && (
                    <div className="flex flex-col gap-3 mt-4">
                      {reporterExamples.map((ex, i) => (
                        <div key={i} className="p-3.5 rounded-xl bg-surface-2">
                          <div className="text-[12.5px] font-bold mb-1">{ex.title}</div>
                          <div className="text-[10.5px] text-ink-3 mb-1.5">
                            {ex.org} · FY{ex.fiscalYear}
                          </div>
                          <div className="text-[11.5px] text-ink-2 leading-relaxed line-clamp-4">{ex.abstract}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {sections.map((section) => {
                const value = narrative[section.id] ?? '';
                const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
                return (
                  <div key={section.id} className="glass-card p-6">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className={cn('w-2 h-2 rounded-full', value.trim() ? 'bg-verified' : 'bg-inferred')} />
                        <div className="text-[14px] font-bold">{section.label}</div>
                      </div>
                      <button
                        className="flex items-center gap-1 text-[11px] font-bold text-ink-3 hover:text-accent"
                        onClick={() => handleRegenerate(section)}
                        disabled={regeneratingId === section.id}
                      >
                        <RefreshCw className={cn('w-3.5 h-3.5', regeneratingId === section.id && 'animate-spin')} />
                        {regeneratingId === section.id ? 'Drafting…' : value.trim() ? 'Regenerate' : 'Draft with AI'}
                      </button>
                    </div>
                    <p className="text-[12px] text-ink-2 leading-relaxed mb-2">{section.guidance}</p>
                    <p className="text-[11.5px] text-ink-3 italic mb-3">{section.prompt}</p>
                    <textarea
                      value={value}
                      onChange={(e) => grantId && updateNarrative(grantId, section.id, e.target.value)}
                      rows={6}
                      placeholder="Start writing, or generate a first draft…"
                      className="w-full bg-surface-2 border border-line-2 rounded-lg px-3 py-2.5 text-[13px] outline-none focus:border-accent resize-y"
                    />
                    <div className="text-[10.5px] text-ink-3 mt-1.5 text-right">{wordCount} words</div>
                  </div>
                );
              })}
            </div>
          )}

          {activeSection === 'review' && (
            <div className="glass-card p-7">
              <div className="text-[15px] font-bold mb-1.5">Review &amp; Submit</div>
              <div className="text-[12.5px] text-ink-2 mb-5">
                A last honest look before this leaves your desk.
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2 mb-3">
                <div className="text-[13px] font-semibold">Organization Info</div>
                <div
                  className={cn(
                    'text-[11px] font-bold uppercase tracking-wide',
                    orgReadyCount === applicationFields.length ? 'text-verified' : 'text-inferred',
                  )}
                >
                  {orgReadyCount} of {applicationFields.length} ready
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2 mb-5">
                <div className="text-[13px] font-semibold">Project Narrative</div>
                <div
                  className={cn(
                    'text-[11px] font-bold uppercase tracking-wide',
                    progress.done === progress.total ? 'text-verified' : 'text-inferred',
                  )}
                >
                  {progress.done} of {progress.total} sections drafted
                </div>
              </div>

              {(orgReadyCount < applicationFields.length || progress.done < progress.total) && (
                <div className="text-[12px] text-required font-semibold mb-5">
                  Some sections are still incomplete — you can still submit, but a reviewer will see the gaps
                  too.
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  className="glass-btn"
                  onClick={() => grantId && setApplicationStatus(grantId, 'submitted')}
                >
                  Mark as Submitted
                </button>
                <button className="glass-btn-outline" onClick={() => navigate('/applications')}>
                  Save &amp; Come Back Later
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
