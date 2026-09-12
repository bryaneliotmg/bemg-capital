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
  Gauge,
  Copy,
  Plus,
  Trash2,
  DollarSign,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Ring } from '../components/Ring';
import { useApplications } from '../context/ApplicationsContext';
import { useOpportunities } from '../context/OpportunitiesContext';
import { useBusinessDNA } from '../context/BusinessDNAContext';
import { STATUS_META } from '../data/sampleData';
import { SF424_FIELD_MAP, PROJECT_SPECIFIC_FIELDS, EXTERNAL_ACQUIRE_LINKS } from '../data/applicationFields';
import { getNarrativeSections, getRubricLabel } from '../data/narrativeSections';
import { getChecklistItems, type ChecklistItemStatus } from '../data/checklistItems';
import { BUDGET_CATEGORIES, type BudgetCategoryId } from '../data/budgetCategories';
import { buildOrgInfoPrompt, buildNarrativePrompt } from '../lib/prompts';
import { extractKeywords } from '../lib/keywords';

type Section = 'overview' | 'organization' | 'narrative' | 'budget' | 'review';

const SECTION_DEFS: { id: Section; label: string; desc: string }[] = [
  { id: 'overview', label: 'Overview', desc: 'What this grant needs' },
  { id: 'organization', label: 'Organization Info', desc: 'SF-424 fields, pre-filled' },
  { id: 'narrative', label: 'Project Narrative', desc: 'Guided, section by section' },
  { id: 'budget', label: 'Budget', desc: 'Line items by category' },
  { id: 'review', label: 'Review & Submit', desc: 'Final checklist' },
];

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

interface Placeholder {
  sectionId: string;
  sectionLabel: string;
  text: string;
  /** Exact character offset within that section's current narrative text — repeats of the
   * same bracket text (e.g. multiple "[Number]"s) need this to know which one is which. */
  index: number;
}

function findPlaceholders(
  narrative: Record<string, string>,
  sections: { id: string; label: string }[],
): Placeholder[] {
  const found: Placeholder[] = [];
  for (const section of sections) {
    const text = narrative[section.id] ?? '';
    for (const m of text.matchAll(/\[[^\]]+\]/g)) {
      found.push({ sectionId: section.id, sectionLabel: section.label, text: m[0], index: m.index ?? 0 });
    }
  }
  return found;
}

interface AlignmentAssessment {
  rating: string;
  score: number;
  reason: string;
}

const RATING_COLOR: Record<string, string> = {
  Strong: 'text-verified',
  Adequate: 'text-inferred',
  Weak: 'text-required',
  'Not Addressed': 'text-required',
};

function alignmentRingColor(score: number): string {
  if (score >= 80) return '#059669';
  if (score >= 55) return '#d97706';
  return '#8a8178';
}

// Pulled out of the component so both the render-time display and the persist-on-compute
// call sites (handleAssessAlignment, handleStrengthenDraft) share one definition — the
// score shown is always exactly the score saved, never two subtly different formulas.
function computeAlignmentScore(
  assessments: Record<string, AlignmentAssessment>,
  orgFraction: number,
  placeholderCount: number,
): number | null {
  const scores = Object.values(assessments);
  if (scores.length === 0) return null;
  const contentAvg = Math.round(scores.reduce((sum, a) => sum + a.score, 0) / scores.length);
  const placeholderPenalty = Math.min(placeholderCount * 5, 30);
  return Math.max(0, Math.min(100, Math.round(0.7 * contentAvg + 0.3 * orgFraction * 100) - placeholderPenalty));
}

function QuickEditField({
  label,
  value,
  ready,
  onSave,
  acquireLink,
}: {
  label: string;
  value: string;
  ready: boolean;
  onSave: (value: string) => void;
  acquireLink?: { linkLabel: string; url: string };
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
      <div>
        <div className={cn('text-sm font-semibold', !ready && 'text-required')}>{value}</div>
        {!ready && acquireLink && (
          <a
            href={acquireLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-bold text-accent mt-1"
          >
            <ExternalLink className="w-3 h-3" />
            {acquireLink.linkLabel}
          </a>
        )}
      </div>
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
    recordAlignmentScore,
    updateChecklistItem,
    getBudgetItems,
    addBudgetItem,
    updateBudgetItemField,
    removeBudgetItem,
    updateOrgField,
    getNarrative,
    updateNarrative,
    setNarrativeBulk,
    narrativeProgress,
    loading: applicationsLoading,
    saveStatus,
  } = useApplications();
  const { opportunities } = useOpportunities();
  const { fieldsByTab, getField } = useBusinessDNA();
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [reporterExamples, setReporterExamples] = useState<ReporterExample[]>([]);
  const [showReferences, setShowReferences] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [alignment, setAlignment] = useState<Record<string, AlignmentAssessment> | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [strengthening, setStrengthening] = useState(false);
  const [strengthenLog, setStrengthenLog] = useState<string[]>([]);
  const [strengthenError, setStrengthenError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const [narrativePromptCopied, setNarrativePromptCopied] = useState(false);
  const [placeholderDrafts, setPlaceholderDrafts] = useState<Record<string, string>>({});
  const [outcomeReasonDraft, setOutcomeReasonDraft] = useState('');

  const application = grantId ? getApplication(grantId) : undefined;
  const opportunity = opportunities.find((o) => o.id === grantId);
  const narrative = grantId ? getNarrative(grantId) : {};
  const sections = useMemo(
    () => getNarrativeSections(opportunity?.agencyCode, opportunity?.name ?? ''),
    [opportunity?.agencyCode, opportunity?.name],
  );
  const rubricLabel = getRubricLabel(opportunity?.agencyCode, opportunity?.name ?? '');
  const progress = grantId ? narrativeProgress(grantId, sections) : { done: 0, total: sections.length };
  const checklistItems = useMemo(() => (opportunity ? getChecklistItems(opportunity) : []), [opportunity]);
  const budgetItems = grantId ? getBudgetItems(grantId) : [];
  const budgetTotal = budgetItems.reduce((sum, item) => sum + item.amount, 0);

  // Sourced from this application's own orgInfo snapshot (taken once from Business DNA
  // when the application was started), not a live read of Business DNA — edits here are
  // specific to this submission and don't affect the shared DNA record or other applications.
  const applicationFields = SF424_FIELD_MAP.map((mapping) => {
    const field = application?.orgInfo?.[mapping.dnaLabel];
    const ready = !!field && field.status !== 'required';
    return { ...mapping, value: field?.value ?? 'Not yet provided', status: field?.status ?? 'required', ready };
  });
  const orgReadyCount = applicationFields.filter((f) => f.ready).length;

  async function handleCopyPrompt() {
    if (!opportunity) return;
    const prompt = buildOrgInfoPrompt(
      applicationFields.map((f) => ({ label: f.label, value: f.value, status: f.status })),
      {
        title: opportunity.name,
        funder: opportunity.funder,
        description: opportunity.description,
        eligibilityNotes: opportunity.applicantEligibilityDesc,
      },
    );
    await navigator.clipboard.writeText(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2500);
  }

  const placeholders = useMemo(() => findPlaceholders(narrative, sections), [narrative, sections]);

  function placeholderKey(p: Placeholder) {
    return `${p.sectionId}:${p.index}`;
  }

  function handleFillPlaceholder(p: Placeholder) {
    if (!grantId) return;
    const value = (placeholderDrafts[placeholderKey(p)] ?? '').trim();
    if (!value) return;
    const currentText = narrative[p.sectionId] ?? '';
    const newText = currentText.slice(0, p.index) + value + currentText.slice(p.index + p.text.length);
    updateNarrative(grantId, p.sectionId, newText);
    setPlaceholderDrafts((prev) => {
      const next = { ...prev };
      delete next[placeholderKey(p)];
      return next;
    });
  }

  const narrativeSnapshot = useMemo(() => JSON.stringify(narrative), [narrative]);
  const [assessedSnapshot, setAssessedSnapshot] = useState<string | null>(null);
  const isAlignmentStale = alignment != null && assessedSnapshot !== narrativeSnapshot;

  const contentAvg =
    alignment && Object.keys(alignment).length
      ? Math.round(Object.values(alignment).reduce((sum, a) => sum + a.score, 0) / Object.values(alignment).length)
      : null;
  const orgFraction = applicationFields.length ? orgReadyCount / applicationFields.length : 0;
  const placeholderPenalty = Math.min(placeholders.length * 5, 30);
  const alignmentScore = alignment ? computeAlignmentScore(alignment, orgFraction, placeholders.length) : null;

  async function callAssess(narrativeToAssess: Record<string, string>): Promise<Record<string, AlignmentAssessment>> {
    if (!opportunity) throw new Error('No opportunity loaded');
    const res = await fetch('/api/assess-alignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sections: sections.map((s) => ({ id: s.id, label: s.label, guidance: s.guidance })),
        narrative: narrativeToAssess,
        opportunity: {
          title: opportunity.name,
          funder: opportunity.funder,
          description: opportunity.description,
          eligibilityNotes: opportunity.applicantEligibilityDesc,
        },
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Assessment failed');
    return body.assessments as Record<string, AlignmentAssessment>;
  }

  async function handleAssessAlignment() {
    setAssessError(null);
    setAssessing(true);
    try {
      const result = await callAssess(narrative);
      setAlignment(result);
      setAssessedSnapshot(narrativeSnapshot);
      const score = computeAlignmentScore(result, orgFraction, findPlaceholders(narrative, sections).length);
      if (score != null && grantId) recordAlignmentScore(grantId, score);
    } catch (err) {
      setAssessError(err instanceof Error ? err.message : 'Assessment failed');
    } finally {
      setAssessing(false);
    }
  }

  async function handleStrengthenDraft() {
    if (!opportunity || !grantId) return;
    setStrengthenError(null);
    setStrengthening(true);
    setStrengthenLog([]);
    let workingNarrative: Record<string, string> = { ...narrative };
    const log: string[] = [];
    try {
      let currentAlignment: Record<string, AlignmentAssessment> | null =
        alignment && !isAlignmentStale ? alignment : null;
      if (!currentAlignment) {
        currentAlignment = await callAssess(workingNarrative);
        setAlignment(currentAlignment);
        setAssessedSnapshot(JSON.stringify(workingNarrative));
      }

      const MAX_ROUNDS = 3;
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        const weak = sections.filter((s) => currentAlignment![s.id] && currentAlignment![s.id].rating !== 'Strong');
        if (weak.length === 0) {
          log.push(`Round ${round}: every section is already rated Strong — nothing left to strengthen.`);
          break;
        }

        const hasPlaceholder = (text: string) => /\[[^\]]+\]/.test(text);
        const fixable = weak.filter((s) => !hasPlaceholder(workingNarrative[s.id] ?? ''));
        const factBlocked = weak.filter((s) => hasPlaceholder(workingNarrative[s.id] ?? ''));

        if (fixable.length === 0) {
          log.push(
            `Round ${round}: the remaining weak section${factBlocked.length > 1 ? 's are' : ' is'} ${factBlocked
              .map((s) => s.label)
              .join(', ')} — blocked by missing facts, not writing quality. Add those to Business DNA to improve further.`,
          );
          break;
        }

        const critiques = Object.fromEntries(fixable.map((s) => [s.id, currentAlignment![s.id].reason]));
        const beforeScores = Object.fromEntries(fixable.map((s) => [s.id, currentAlignment![s.id].score]));
        const result = await callGenerate(fixable, critiques);
        if (!result) break;
        workingNarrative = { ...workingNarrative, ...result };
        setNarrativeBulk(grantId, result);

        const newAlignment = await callAssess(workingNarrative);
        currentAlignment = { ...currentAlignment, ...newAlignment };
        setAlignment(currentAlignment);
        setAssessedSnapshot(JSON.stringify(workingNarrative));

        const changes = fixable
          .map((s) => `${s.label} ${beforeScores[s.id]}→${newAlignment[s.id]?.score ?? beforeScores[s.id]}`)
          .join(', ');
        log.push(`Round ${round}: ${changes}.`);

        if (factBlocked.length > 0) {
          log.push(
            `Still blocked by missing facts: ${factBlocked.map((s) => s.label).join(', ')} — add those to Business DNA to raise the score further.`,
          );
        }

        const improved = fixable.some((s) => (newAlignment[s.id]?.score ?? 0) > beforeScores[s.id]);
        if (!improved) {
          log.push(`Round ${round}: no measurable improvement — stopping early rather than spinning further.`);
          break;
        }
      }

      if (currentAlignment && grantId) {
        const finalScore = computeAlignmentScore(
          currentAlignment,
          orgFraction,
          findPlaceholders(workingNarrative, sections).length,
        );
        if (finalScore != null) recordAlignmentScore(grantId, finalScore);
      }
    } catch (err) {
      setStrengthenError(err instanceof Error ? err.message : 'Strengthen failed');
    } finally {
      setStrengthenLog(log);
      setStrengthening(false);
    }
  }

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

  async function callGenerate(sectionsToGenerate: typeof sections, critiques?: Record<string, string>) {
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
        targetKeywords: keywordTargets,
        critiques,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Generation failed');
    return body.sections as Record<string, string>;
  }

  async function handleCopyNarrativePrompt() {
    if (!opportunity) return;
    const prompt = buildNarrativePrompt(
      sections.map((s) => ({ label: s.label, guidance: s.guidance, prompt: s.prompt })),
      buildBusinessFacts(),
      {
        title: opportunity.name,
        funder: opportunity.funder,
        description: opportunity.description,
        eligibilityNotes: opportunity.applicantEligibilityDesc,
      },
    );
    await navigator.clipboard.writeText(prompt);
    setNarrativePromptCopied(true);
    setTimeout(() => setNarrativePromptCopied(false), 2500);
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
            if (s.id === 'budget') dotClass = budgetItems.length > 0 ? 'bg-verified' : 'bg-inferred';
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
            <div className="flex flex-col gap-4">
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-3.5">
                  <div className="text-[13px] font-bold">Applying As</div>
                  <button
                    className="text-[11px] font-bold text-accent"
                    onClick={() => setActiveSection('organization')}
                  >
                    Edit in Organization Info
                  </button>
                </div>
                <div className="text-[11.5px] text-ink-2 mb-4">
                  A copy of your Business DNA taken when you started this application — edits here are specific to
                  this submission.
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
                  {applicationFields
                    .filter((f) => f.dnaTab === 'identity')
                    .map((f) => (
                      <div key={f.label} className="min-w-0">
                        <div className="text-[10px] font-extrabold uppercase tracking-wide text-ink-3">
                          {f.label}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full shrink-0',
                              f.status === 'verified' ? 'bg-verified' : f.status === 'inferred' ? 'bg-inferred' : 'bg-required',
                            )}
                          />
                          <span className={cn('text-[13px] font-semibold truncate', f.status === 'required' && 'text-required')}>
                            {f.value}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

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
            </div>
          )}

          {activeSection === 'organization' && (
            <div className="glass-card p-7">
              <div className="flex items-center justify-between mb-1.5 gap-3">
                <div className="text-[15px] font-bold">Organization Info</div>
                <span className="text-[11px] font-bold text-ink-3 shrink-0">
                  {orgReadyCount} of {applicationFields.length} ready
                </span>
              </div>
              <div className="text-[12.5px] text-ink-2 mb-2">
                Copied from your Business DNA when you started this application. Fix anything here — it only
                changes this submission, not your Business DNA or other applications.
              </div>
              <button
                className="flex items-center gap-1.5 text-[11.5px] font-bold text-accent mb-3.5"
                onClick={handleCopyPrompt}
              >
                <Copy className="w-3.5 h-3.5" />
                {promptCopied ? 'Copied — paste into your AI of choice' : 'Copy a prompt for your AI to help fill these in'}
              </button>
              {applicationFields.map((f) => (
                <QuickEditField
                  key={f.label}
                  label={f.label}
                  value={f.value}
                  ready={f.ready}
                  onSave={(value) => grantId && updateOrgField(grantId, f.dnaLabel, value)}
                  acquireLink={EXTERNAL_ACQUIRE_LINKS[f.dnaLabel]}
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
                <div className="flex items-center gap-2">
                  <button
                    className="glass-btn-outline flex items-center gap-1.5"
                    onClick={handleCopyNarrativePrompt}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {narrativePromptCopied ? 'Copied — paste into your AI' : 'Copy a prompt for your AI'}
                  </button>
                  <button className="glass-btn flex items-center gap-1.5" onClick={handleGenerateAll} disabled={generatingAll}>
                    <Sparkles className="w-3.5 h-3.5" />
                    {generatingAll ? 'Drafting…' : 'Generate Full Draft with AI'}
                  </button>
                </div>
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

          {activeSection === 'budget' && grantId && (
            <div className="flex flex-col gap-4">
              <div className="glass-card p-5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-bold">Budget</span>
                  <span className="text-[11px] font-bold text-ink-3 ml-2">{budgetItems.length} line items</span>
                </div>
                <div className="text-[15px] font-bold">
                  ${budgetTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} total
                </div>
              </div>

              <div className="glass-card p-5">
                <div className="text-[13px] font-bold mb-2">Budget vs. Award Range</div>
                {opportunity?.awardAmount == null ? (
                  <div className="text-[12px] text-ink-2">
                    This opportunity doesn't list a specific award amount to compare your budget against.
                  </div>
                ) : budgetTotal === 0 ? (
                  <div className="text-[12px] text-ink-2">Add line items below to compare your total request.</div>
                ) : budgetTotal > opportunity.awardAmount * 1.02 ? (
                  <div className="text-[12px] text-required font-semibold">
                    Your line-item total (${budgetTotal.toLocaleString()}) exceeds this award's ceiling ($
                    {opportunity.awardAmount.toLocaleString()}) — trim the budget or scope the project down.
                  </div>
                ) : (
                  <div className="text-[12px] text-verified font-semibold">
                    Your line-item total (${budgetTotal.toLocaleString()}) fits within this award's ceiling (up to $
                    {opportunity.awardAmount.toLocaleString()}).
                  </div>
                )}
              </div>

              {BUDGET_CATEGORIES.map((cat) => {
                const items = budgetItems.filter((item) => item.category === cat.id);
                const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
                return (
                  <div key={cat.id} className="glass-card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[13px] font-bold">{cat.label}</div>
                      <div className="flex items-center gap-3">
                        {subtotal > 0 && (
                          <span className="text-[12px] font-bold text-ink-2">${subtotal.toLocaleString()}</span>
                        )}
                        <button
                          className="flex items-center gap-1 text-[11px] font-bold text-accent"
                          onClick={() => addBudgetItem(grantId, cat.id as BudgetCategoryId)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add line item
                        </button>
                      </div>
                    </div>
                    {items.length === 0 ? (
                      <div className="text-[11.5px] text-ink-3 italic">No line items yet.</div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-start gap-2.5">
                            <input
                              value={item.label}
                              onChange={(e) => updateBudgetItemField(grantId, item.id, { label: e.target.value })}
                              placeholder="e.g. Program Coordinator, 0.5 FTE"
                              className="flex-1 min-w-0 bg-surface-2 border border-line-2 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent"
                            />
                            <input
                              type="number"
                              value={item.amount || ''}
                              onChange={(e) =>
                                updateBudgetItemField(grantId, item.id, { amount: Number(e.target.value) || 0 })
                              }
                              placeholder="$0"
                              className="w-28 shrink-0 bg-surface-2 border border-line-2 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent"
                            />
                            <button
                              className="text-ink-3 hover:text-required shrink-0 mt-1.5"
                              onClick={() => removeBudgetItem(grantId, item.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeSection === 'review' && (
            <div className="flex flex-col gap-4">
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
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2 mb-3">
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
                <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2 mb-5">
                  <div className="text-[13px] font-semibold">Unresolved placeholders</div>
                  <div
                    className={cn(
                      'text-[11px] font-bold uppercase tracking-wide',
                      placeholders.length === 0 ? 'text-verified' : 'text-required',
                    )}
                  >
                    {placeholders.length === 0 ? 'None found' : `${placeholders.length} remaining`}
                  </div>
                </div>

                {placeholders.length > 0 && (
                  <div className="mb-5">
                    <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2">
                      Fill these in directly — the narrative updates as soon as you do
                    </div>
                    <div className="flex flex-col gap-2">
                      {placeholders.map((p) => {
                        const key = placeholderKey(p);
                        return (
                          <div key={key} className="flex items-center gap-2.5">
                            <span className="w-1 h-1 rounded-full bg-required shrink-0" />
                            <div className="text-[12px] text-ink-2 shrink-0">
                              <span className="font-semibold">{p.sectionLabel}:</span> {p.text}
                            </div>
                            <input
                              value={placeholderDrafts[key] ?? ''}
                              onChange={(e) =>
                                setPlaceholderDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleFillPlaceholder(p);
                              }}
                              placeholder="Type the real value…"
                              className="flex-1 min-w-0 bg-surface border border-line-2 rounded-lg px-2.5 py-1 text-[12px] outline-none focus:border-accent"
                            />
                            <button
                              className="text-verified shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                              onClick={() => handleFillPlaceholder(p)}
                              disabled={!(placeholderDrafts[key] ?? '').trim()}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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

                {application.status !== 'draft' && application.status !== 'new' && (
                  <div className="mt-6 pt-6 border-t border-line">
                    <div className="text-[13px] font-bold mb-1.5">Record the Outcome</div>
                    <div className="text-[11.5px] text-ink-2 mb-3.5">
                      Once the funder responds, record it here — a real, growing record of what actually happened
                      is worth more over time than any prediction this app could make beforehand.
                    </div>
                    {application.status === 'awarded' || application.status === 'not_awarded' ? (
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full inline-block ${STATUS_META[application.status].dotClass}`} />
                        <span className="text-[12.5px] font-bold">{STATUS_META[application.status].label}</span>
                        {application.outcomeReason && (
                          <span className="text-[12px] text-ink-2">— {application.outcomeReason}</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center gap-2">
                          <button
                            className="glass-btn-outline"
                            onClick={() => grantId && setApplicationStatus(grantId, 'awarded')}
                          >
                            Mark Awarded
                          </button>
                          <input
                            value={outcomeReasonDraft}
                            onChange={(e) => setOutcomeReasonDraft(e.target.value)}
                            placeholder="Optional note (e.g. reviewer feedback)…"
                            className="flex-1 min-w-0 bg-surface border border-line-2 rounded-lg px-2.5 py-1.5 text-[12px] outline-none focus:border-accent"
                          />
                          <button
                            className="glass-btn-outline shrink-0"
                            onClick={() =>
                              grantId && setApplicationStatus(grantId, 'not_awarded', outcomeReasonDraft.trim() || null)
                            }
                          >
                            Mark Not Awarded
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {checklistItems.length > 0 && (
                <div className="glass-card p-7">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[15px] font-bold">Pre-Submission Requirements</div>
                    <span className="text-[11px] font-bold text-ink-3">
                      {checklistItems.filter((item) => (application.checklistState[item.id]?.status ?? 'pending') !== 'pending').length} of {checklistItems.length} resolved
                    </span>
                  </div>
                  <div className="text-[12px] text-ink-2 mb-5">
                    Deterministic, based on facts this opportunity's own listing states — not AI-guessed. Mark each
                    complete, or not applicable if it genuinely doesn't apply to your situation.
                  </div>
                  <div className="flex flex-col gap-3">
                    {checklistItems.map((item) => {
                      const state = application.checklistState[item.id] ?? { status: 'pending' as const };
                      return (
                        <div key={item.id} className="p-4 rounded-xl bg-surface-2">
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <div className="text-[13px] font-semibold">{item.label}</div>
                            <select
                              value={state.status}
                              onChange={(e) =>
                                grantId &&
                                updateChecklistItem(grantId, item.id, {
                                  status: e.target.value as ChecklistItemStatus,
                                })
                              }
                              className="text-[11px] font-bold uppercase tracking-wide bg-surface border border-line-2 rounded-lg px-2 py-1 outline-none focus:border-accent shrink-0"
                            >
                              <option value="pending">Pending</option>
                              <option value="complete">Complete</option>
                              <option value="not_applicable">Not applicable</option>
                            </select>
                          </div>
                          <div className="text-[11.5px] text-ink-3">{item.reason}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="glass-card p-7">
                <div className="flex items-center gap-2 mb-1.5">
                  <Gauge className="w-4 h-4 text-accent" />
                  <div className="text-[15px] font-bold">Alignment Score</div>
                </div>
                <div className="text-[12px] text-ink-2 mb-5">
                  Reflects how closely this draft addresses this program's own stated review criteria — it is not a
                  prediction of funding decisions, which depend on the competing applicant pool and available program
                  funds, neither of which any application's content can tell you.
                </div>

                {assessError && (
                  <div className="text-[12px] font-semibold text-required mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {assessError}
                  </div>
                )}

                {alignment == null ? (
                  <button className="glass-btn flex items-center gap-1.5" onClick={handleAssessAlignment} disabled={assessing}>
                    <Sparkles className="w-3.5 h-3.5" />
                    {assessing ? 'Assessing…' : 'Assess Alignment'}
                  </button>
                ) : (
                  <>
                    {isAlignmentStale && (
                      <div className="text-[12px] font-semibold text-inferred mb-4">
                        The narrative has changed since this was last assessed —{' '}
                        <button className="link-btn text-[12px] font-semibold" onClick={handleAssessAlignment}>
                          re-run it
                        </button>{' '}
                        for an up-to-date score.
                      </div>
                    )}
                    <div className="flex items-center gap-6 mb-6">
                      <Ring pct={alignmentScore ?? 0} color={alignmentRingColor(alignmentScore ?? 0)} size={72} fontSize={17} />
                      <div className="flex flex-col gap-1.5 text-[11.5px] text-ink-2">
                        <div>
                          Rubric content quality: <span className="font-bold text-ink">{contentAvg}/100</span>
                        </div>
                        <div>
                          Organization Info completeness:{' '}
                          <span className="font-bold text-ink">{Math.round(orgFraction * 100)}%</span>
                        </div>
                        {placeholderPenalty > 0 && (
                          <div>
                            Placeholder penalty:{' '}
                            <span className="font-bold text-required">-{placeholderPenalty}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-auto self-start">
                        <button
                          className="glass-btn flex items-center gap-1.5"
                          onClick={handleStrengthenDraft}
                          disabled={assessing || strengthening}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          {strengthening ? 'Strengthening…' : 'Strengthen Draft'}
                        </button>
                        <button
                          className="glass-btn-outline flex items-center gap-1.5"
                          onClick={handleAssessAlignment}
                          disabled={assessing || strengthening}
                        >
                          <RefreshCw className={cn('w-3.5 h-3.5', assessing && 'animate-spin')} />
                          {assessing ? 'Re-assessing…' : 'Re-assess'}
                        </button>
                      </div>
                    </div>

                    {strengthenError && (
                      <div className="text-[12px] font-semibold text-required mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {strengthenError}
                      </div>
                    )}

                    {strengthenLog.length > 0 && (
                      <div className="mb-5 p-4 rounded-xl bg-surface-2">
                        <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2 mb-2">
                          Strengthen Draft — what changed
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {strengthenLog.map((line, i) => (
                            <div key={i} className="text-[12px] text-ink-2">
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-3">
                      {sections.map((s) => {
                        const a = alignment[s.id];
                        if (!a) return null;
                        return (
                          <div key={s.id} className="p-4 rounded-xl bg-surface-2">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="text-[13px] font-bold">{s.label}</div>
                              <span className={cn('text-[11px] font-bold uppercase tracking-wide', RATING_COLOR[a.rating] ?? 'text-ink-2')}>
                                {a.rating} · {a.score}/100
                              </span>
                            </div>
                            <div className="text-[12px] text-ink-2">{a.reason}</div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
