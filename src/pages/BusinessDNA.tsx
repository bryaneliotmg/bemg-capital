import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Pencil, Check, X, ExternalLink, Copy } from 'lucide-react';
import { Ring } from '../components/Ring';
import { cn } from '../lib/utils';
import { DNA_TAB_DEFS, evidenceCaption, type DnaField, type DnaTabDef, type EvidenceStatus } from '../data/sampleData';
import { EXTERNAL_ACQUIRE_LINKS } from '../data/applicationFields';
import { buildIdentityPrompt } from '../lib/prompts';
import { useBusinessDNA, type EditableTabId } from '../context/BusinessDNAContext';

const TAB_CONTENT: Record<EditableTabId, { title: string; subtitle: string }> = {
  identity: { title: 'Identity', subtitle: 'Who bEMG Business is on paper.' },
  financial: { title: 'Financial DNA', subtitle: 'The numbers capital providers will see, with sources.' },
  operating: { title: 'Operating DNA', subtitle: 'How the business actually runs day to day.' },
  growth: { title: 'Growth DNA', subtitle: 'Where the business is headed, and what it needs to get there.' },
  funding: { title: 'Funding History', subtitle: 'Every prior grant, loan, and application on record.' },
};

const EVIDENCE_DOT: Record<EvidenceStatus, string> = {
  verified: 'bg-verified',
  inferred: 'bg-inferred',
  required: 'bg-required',
};

function FieldRow({
  field,
  editing,
  onChange,
}: {
  field: DnaField;
  editing?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <div className={cn('field-row', field.multiline && 'items-start')}>
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2">{field.label}</div>
      <div>
        {editing ? (
          field.multiline ? (
            <textarea
              value={field.value === 'Not yet provided' ? '' : field.value}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder="What does your business do, who do you serve, and why does it matter? Write this in your own words — it's the story every AI-assisted draft in this app will build on."
              rows={6}
              className="w-full bg-surface-2 border border-line-2 rounded-lg px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-accent resize-y"
            />
          ) : (
            <input
              value={field.value}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder="Not yet provided"
              className="w-full bg-surface-2 border border-line-2 rounded-lg px-3 py-1.5 text-sm font-semibold outline-none focus:border-accent"
            />
          )
        ) : (
          <>
            <div className={cn(field.multiline ? 'text-[13px] leading-relaxed whitespace-pre-line' : 'text-sm font-semibold')}>
              {field.value}
            </div>
            {field.status === 'required' && EXTERNAL_ACQUIRE_LINKS[field.label] && (
              <a
                href={EXTERNAL_ACQUIRE_LINKS[field.label].url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] font-bold text-accent mt-1"
              >
                <ExternalLink className="w-3 h-3" />
                {EXTERNAL_ACQUIRE_LINKS[field.label].linkLabel}
              </a>
            )}
            {field.sparkline && (
              <svg width="110" height="24" viewBox="0 0 110 24" fill="none" className="mt-1">
                <polyline
                  points="0,20 18,17 36,18 54,12 72,9 90,5 110,3"
                  stroke="var(--color-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 justify-end whitespace-nowrap">
        <span className={cn('w-1.5 h-1.5 rounded-full inline-block', EVIDENCE_DOT[field.status])} />
        <span className="text-[11px] text-ink-3">{evidenceCaption(field)}</span>
      </div>
    </div>
  );
}

export function BusinessDNA() {
  const location = useLocation();
  const initialTab = (location.state as { tab?: DnaTabDef['id'] } | null)?.tab ?? 'identity';
  const [activeTab, setActiveTab] = useState<DnaTabDef['id']>(initialTab);
  const [promptCopied, setPromptCopied] = useState(false);
  const { fieldsByTab, editingTab, draft, startEdit, cancelEdit, saveEdit, updateDraftValue } = useBusinessDNA();

  const isEditable = activeTab !== 'readiness';
  const isEditingActive = isEditable && editingTab === activeTab;

  async function handleCopyIdentityPrompt() {
    const fields = fieldsByTab.identity.map((f) => ({ label: f.label, value: f.value, status: f.status }));
    await navigator.clipboard.writeText(buildIdentityPrompt(fields));
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2500);
  }

  return (
    <div className="panel-enter flex gap-6 items-start">
      <div className="w-[260px] shrink-0 flex flex-col gap-2.5">
        {DNA_TAB_DEFS.map((tab) => {
          const active = tab.id === activeTab;
          const complete = tab.id === 'readiness' ? tab.complete : !fieldsByTab[tab.id].some((f) => f.status === 'required');
          const dotClass = active ? 'bg-accent' : complete ? 'bg-verified' : 'bg-inferred';
          return (
            <button
              key={tab.id}
              className={cn('section-nav-card', active && 'active')}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={cn('w-[7px] h-[7px] rounded-full mt-1.5 shrink-0', dotClass)} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold">{tab.label}</div>
                <div className="text-[11.5px] text-ink-3 mt-0.5">{tab.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-w-0 panel-enter">
        {isEditable ? (
          <div className="glass-card p-7">
            <div className="flex items-start justify-between gap-4 mb-3.5">
              <div>
                <div className="text-[15px] font-bold mb-1.5">{TAB_CONTENT[activeTab].title}</div>
                <div className="text-[12.5px] text-ink-2">{TAB_CONTENT[activeTab].subtitle}</div>
              </div>
              {isEditingActive ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button className="glass-btn-outline" onClick={cancelEdit}>
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                  <button className="glass-btn" onClick={saveEdit}>
                    <Check className="w-3.5 h-3.5" />
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  {activeTab === 'identity' && (
                    <button className="glass-btn-outline" onClick={handleCopyIdentityPrompt}>
                      <Copy className="w-3.5 h-3.5" />
                      {promptCopied ? 'Copied — paste into your AI' : 'Copy a prompt for your AI'}
                    </button>
                  )}
                  <button className="glass-btn-outline" onClick={() => startEdit(activeTab)}>
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                </div>
              )}
            </div>
            {(isEditingActive ? draft! : fieldsByTab[activeTab]).map((field, i) => (
              <FieldRow
                key={field.label}
                field={field}
                editing={isEditingActive}
                onChange={(value) => updateDraftValue(i, value)}
              />
            ))}
          </div>
        ) : (
          <div className="glass-card p-7">
            <div className="text-[15px] font-bold mb-1.5">Readiness</div>
            <div className="text-[12.5px] text-ink-2 mb-[22px]">
              What bEMG Business is ready to pursue right now.
            </div>
            <div className="grid grid-cols-3 gap-5">
              <div>
                <Ring pct={24} color="#8a8178" size={88} thickness={8} fontSize={20}>
                  24
                </Ring>
                <div className="text-center text-xs font-extrabold uppercase tracking-wide mt-3.5 text-ink-3">
                  Grant · Building
                </div>
                <div className="text-center text-[11.5px] text-ink-3 mt-2 leading-relaxed">
                  Identity and Operating DNA are solid, but no financial documentation is on file yet.
                </div>
              </div>
              <div>
                <Ring pct={12} color="#8a8178" size={88} thickness={8} fontSize={20}>
                  12
                </Ring>
                <div className="text-center text-xs font-extrabold uppercase tracking-wide mt-3.5 text-ink-3">
                  Loan · Building
                </div>
                <div className="text-center text-[11.5px] text-ink-3 mt-2 leading-relaxed">
                  Loans typically need more financial history than grants — nothing to evaluate yet.
                </div>
              </div>
              <div>
                <Ring pct={8} color="#8a8178" size={88} thickness={8} fontSize={20}>
                  8
                </Ring>
                <div className="text-center text-xs font-extrabold uppercase tracking-wide mt-3.5 text-ink-3">
                  Investment · Not applicable
                </div>
                <div className="text-center text-[11.5px] text-ink-3 mt-2 leading-relaxed">
                  No equity history on file. Informational only — bEMG does not assess investment suitability.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
