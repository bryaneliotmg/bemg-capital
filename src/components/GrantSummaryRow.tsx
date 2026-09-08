import { Calendar } from 'lucide-react';
import { Ring } from './Ring';
import { STATUS_META, ringColorForMatch, type Grant } from '../data/sampleData';

interface GrantSummaryRowProps {
  grant: Grant;
  trailing?: React.ReactNode;
}

export function GrantSummaryRow({ grant, trailing }: GrantSummaryRowProps) {
  const status = STATUS_META[grant.status];
  return (
    <div className="flex items-center gap-4">
      <Ring pct={grant.matchPct} color={ringColorForMatch(grant.matchPct)} />
      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-bold truncate">{grant.name}</div>
        <div className="text-xs text-on-surface-variant mt-0.5">
          {grant.funder} · {grant.amount}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-center gap-1.5 justify-end">
          <span className={`w-1.5 h-1.5 rounded-full inline-block status-pulse ${status.dotClass}`} />
          <span className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">
            {status.label}
          </span>
        </div>
        <div className="text-[11.5px] text-ink3 mt-1 flex items-center gap-1 justify-end">
          <Calendar className="w-3 h-3" />
          {grant.deadline} left
        </div>
      </div>
      {trailing}
    </div>
  );
}
