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
  type DnaField,
  type DnaTabDef,
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

function FieldRow({ field }: { field: DnaField }) {
  return (
    <div className="field-row">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant">
        {field.label}
      </div>
      <div>
        <div className="text-sm font-semibold">{field.value}</div>
        {field.sparkline && (
          <svg width="110" height="24" viewBox="0 0 110 24" fill="none" className="mt-1">
            <polyline
              points="0,20 18,17 36,18 54,12 72,9 90,5 110,3"
              stroke="var(--color-secondary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <div className="flex items-center gap-1.5 justify-end whitespace-nowrap">
        <span className={cn('w-1.5 h-1.5 rounded-full inline-block', field.verified ? 'bg-emerald-500' : 'bg-amber-500')} />
        <span className="text-[11px] text-ink3">
          {field.verified ? 'Verified' : 'Self-reported'} · {field.sourceLabel}
        </span>
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
          const dotClass = active ? 'bg-secondary' : tab.complete ? 'bg-emerald-500' : 'bg-amber-500';
          return (
            <button
              key={tab.id}
              className={cn('section-nav-card', active && 'active')}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={cn('w-[7px] h-[7px] rounded-full mt-1.5 shrink-0', dotClass)} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold">{tab.label}</div>
                <div className="text-[11.5px] text-ink3 mt-0.5">{tab.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-w-0 panel-enter">
        {content ? (
          <div className="glass-card p-7">
            <div className="text-[15px] font-extrabold mb-1.5">{content.title}</div>
            <div className="text-[12.5px] text-on-surface-variant mb-3.5">{content.subtitle}</div>
            {content.fields!.map((field) => (
              <FieldRow key={field.label} field={field} />
            ))}
          </div>
        ) : (
          <div className="glass-card p-7">
            <div className="text-[15px] font-extrabold mb-1.5">Readiness</div>
            <div className="text-[12.5px] text-on-surface-variant mb-[22px]">
              What Cedar &amp; Co. is ready to pursue right now.
            </div>
            <div className="grid grid-cols-3 gap-5">
              <div>
                <Ring pct={72} color="#059669" size={88} thickness={8} fontSize={20}>
                  72
                </Ring>
                <div className="text-center text-xs font-extrabold uppercase tracking-wide mt-3.5" style={{ color: '#059669' }}>
                  Grant · Grant Ready
                </div>
                <div className="text-center text-[11.5px] text-ink3 mt-2 leading-relaxed">
                  Strong documentation and verified eligibility across active programs.
                </div>
              </div>
              <div>
                <Ring pct={68} color="#d97706" size={88} thickness={8} fontSize={20}>
                  68
                </Ring>
                <div className="text-center text-xs font-extrabold uppercase tracking-wide mt-3.5" style={{ color: '#d97706' }}>
                  Loan · Developing
                </div>
                <div className="text-center text-[11.5px] text-ink3 mt-2 leading-relaxed">
                  Add 2024 tax returns to strengthen debt-service coverage evidence.
                </div>
              </div>
              <div>
                <Ring pct={24} color="#64748b" size={88} thickness={8} fontSize={20}>
                  24
                </Ring>
                <div className="text-center text-xs font-extrabold uppercase tracking-wide mt-3.5 text-ink3">
                  Investment · Not applicable
                </div>
                <div className="text-center text-[11.5px] text-ink3 mt-2 leading-relaxed">
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
