import { useState } from 'react';
import { Ring } from '../components/Ring';
import { cn } from '../lib/utils';
import {
  DNA_TAB_DEFS,
  IDENTITY_FIELDS,
  FINANCIAL_FIELDS,
  OPERATING_FIELDS,
  GROWTH_FIELDS,
  FUNDING_FIELDS,
  evidenceCaption,
  type DnaField,
  type DnaTabDef,
  type EvidenceStatus,
} from '../data/sampleData';

const TAB_CONTENT: Record<
  DnaTabDef['id'],
  { title: string; subtitle: string; fields?: DnaField[] } | null
> = {
  identity: { title: 'Identity', subtitle: 'Who Cedar & Co. is on paper.', fields: IDENTITY_FIELDS },
  financial: {
    title: 'Financial DNA',
    subtitle: 'The numbers capital providers will see, with sources.',
    fields: FINANCIAL_FIELDS,
  },
  operating: {
    title: 'Operating DNA',
    subtitle: 'How the business actually runs day to day.',
    fields: OPERATING_FIELDS,
  },
  growth: {
    title: 'Growth DNA',
    subtitle: 'Where the business is headed, and what it needs to get there.',
    fields: GROWTH_FIELDS,
  },
  funding: {
    title: 'Funding History',
    subtitle: 'Every prior grant, loan, and application on record.',
    fields: FUNDING_FIELDS,
  },
  readiness: null,
};

const EVIDENCE_DOT: Record<EvidenceStatus, string> = {
  verified: 'bg-verified',
  inferred: 'bg-inferred',
  required: 'bg-required',
};

function FieldRow({ field }: { field: DnaField }) {
  return (
    <div className="field-row">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2">{field.label}</div>
      <div>
        <div className="text-sm font-semibold">{field.value}</div>
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
      </div>
      <div className="flex items-center gap-1.5 justify-end whitespace-nowrap">
        <span className={cn('w-1.5 h-1.5 rounded-full inline-block', EVIDENCE_DOT[field.status])} />
        <span className="text-[11px] text-ink-3">{evidenceCaption(field)}</span>
      </div>
    </div>
  );
}

export function BusinessDNA() {
  const [activeTab, setActiveTab] = useState<DnaTabDef['id']>('identity');
  const content = TAB_CONTENT[activeTab];

  return (
    <div className="panel-enter flex gap-6 items-start">
      <div className="w-[260px] shrink-0 flex flex-col gap-2.5">
        {DNA_TAB_DEFS.map((tab) => {
          const active = tab.id === activeTab;
          const dotClass = active ? 'bg-accent' : tab.complete ? 'bg-verified' : 'bg-inferred';
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
        {content ? (
          <div className="glass-card p-7">
            <div className="text-[15px] font-bold mb-1.5">{content.title}</div>
            <div className="text-[12.5px] text-ink-2 mb-3.5">{content.subtitle}</div>
            {content.fields!.map((field) => (
              <FieldRow key={field.label} field={field} />
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
