import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Check, X, ExternalLink, ClipboardCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { useApplications } from '../context/ApplicationsContext';
import { useOpportunities } from '../context/OpportunitiesContext';
import { useBusinessDNA } from '../context/BusinessDNAContext';
import { STATUS_META } from '../data/sampleData';
import { SF424_FIELD_MAP, PROJECT_SPECIFIC_FIELDS } from '../data/applicationFields';
import { NARRATIVE_SECTIONS } from '../data/narrativeSections';

type Section = 'overview' | 'organization' | 'narrative' | 'review';

const SECTION_DEFS: { id: Section; label: string; desc: string }[] = [
  { id: 'overview', label: 'Overview', desc: 'What this grant needs' },
  { id: 'organization', label: 'Organization Info', desc: 'SF-424 fields, pre-filled' },
  { id: 'narrative', label: 'Project Narrative', desc: 'Guided, section by section' },
  { id: 'review', label: 'Review & Submit', desc: 'Final checklist' },
];

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
  const { getApplication, setApplicationStatus, getNarrative, updateNarrative, narrativeProgress } =
    useApplications();
  const { opportunities } = useOpportunities();
  const { getField, setFieldValue } = useBusinessDNA();
  const [activeSection, setActiveSection] = useState<Section>('overview');

  const application = grantId ? getApplication(grantId) : undefined;
  const opportunity = opportunities.find((o) => o.id === grantId);
  const narrative = grantId ? getNarrative(grantId) : {};
  const progress = grantId ? narrativeProgress(grantId) : { done: 0, total: NARRATIVE_SECTIONS.length };

  const applicationFields = SF424_FIELD_MAP.map((mapping) => {
    const field = getField(mapping.dnaTab, mapping.dnaLabel);
    const ready = !!field && field.status !== 'required';
    return { ...mapping, value: field?.value ?? 'Not yet provided', ready };
  });
  const orgReadyCount = applicationFields.filter((f) => f.ready).length;

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
        <div className="flex items-center gap-2 shrink-0">
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
                      className="flex items-center gap-1.5 text-[12.5px] font-bold text-accent"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View the full official announcement
                    </a>
                  )}
                </>
              )}
              <button className="glass-btn mt-6" onClick={() => setActiveSection('organization')}>
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
              <div className="glass-card p-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-accent" />
                  <span className="text-[13px] font-bold">Project Narrative</span>
                </div>
                <span className="text-[11px] font-bold text-ink-3">
                  {progress.done} of {progress.total} sections drafted
                </span>
              </div>
              {NARRATIVE_SECTIONS.map((section) => {
                const value = narrative[section.id] ?? '';
                const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
                return (
                  <div key={section.id} className="glass-card p-6">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={cn('w-2 h-2 rounded-full', value.trim() ? 'bg-verified' : 'bg-inferred')}
                      />
                      <div className="text-[14px] font-bold">{section.label}</div>
                    </div>
                    <p className="text-[12px] text-ink-2 leading-relaxed mb-2">{section.guidance}</p>
                    <p className="text-[11.5px] text-ink-3 italic mb-3">{section.prompt}</p>
                    <textarea
                      value={value}
                      onChange={(e) => grantId && updateNarrative(grantId, section.id, e.target.value)}
                      rows={5}
                      placeholder="Start writing…"
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
