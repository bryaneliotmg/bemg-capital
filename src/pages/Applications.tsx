import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { STATUS_META, OPPORTUNITY_TYPE_LABEL } from '../data/sampleData';
import { useApplications } from '../context/ApplicationsContext';

export function Applications() {
  const navigate = useNavigate();
  const { applications, loading } = useApplications();

  if (loading) {
    return <div className="glass-card p-10 text-center text-ink-3 text-sm font-semibold">Loading applications…</div>;
  }

  if (applications.length === 0) {
    return (
      <div className="glass-card p-10 text-center text-ink-3">
        <div className="text-sm font-semibold">No applications yet.</div>
        <div className="text-[12.5px] mt-1">Start one from a match on the Grant Matches page.</div>
      </div>
    );
  }

  return (
    <div className="panel-enter glass-card py-2">
      <div
        className="grid gap-4 px-[26px] py-4 border-b border-line"
        style={{ gridTemplateColumns: '1fr 120px 140px 120px 24px' }}
      >
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2">Opportunity</div>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2">Type</div>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2">Status</div>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-2">Deadline</div>
        <div />
      </div>
      {applications.map((app) => {
        const status = STATUS_META[app.status];
        return (
          <div
            key={app.grantId}
            className="grid gap-4 px-[26px] py-[18px] border-b border-line last:border-b-0 items-center cursor-pointer hover:bg-surface-2 transition-colors"
            style={{ gridTemplateColumns: '1fr 120px 140px 120px 24px' }}
            onClick={() => navigate(`/applications/${app.grantId}`)}
          >
            <div className="text-[13.5px] font-bold">{app.name}</div>
            <div className="text-[12.5px] text-ink-2">{OPPORTUNITY_TYPE_LABEL[app.opportunityType]}</div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${status.dotClass}`} />
              <span className="text-[11.5px] font-bold uppercase tracking-wide text-ink-2">{status.label}</span>
            </div>
            <div className="text-[12.5px] text-ink-3">{app.deadline}</div>
            <ChevronRight className="w-4 h-4 text-ink-3" />
          </div>
        );
      })}
    </div>
  );
}
