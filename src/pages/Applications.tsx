import { STATUS_META } from '../data/sampleData';
import { useApplications } from '../context/ApplicationsContext';

export function Applications() {
  const { applications } = useApplications();

  return (
    <div className="panel-enter glass-card py-2">
      <div className="grid gap-4 px-[26px] py-4 border-b border-outline-variant" style={{ gridTemplateColumns: '1fr 120px 140px 120px' }}>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant">Opportunity</div>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant">Type</div>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant">Status</div>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-on-surface-variant">Deadline</div>
      </div>
      {applications.map((app) => {
        const status = STATUS_META[app.status];
        return (
          <div
            key={app.grantId}
            className="grid gap-4 px-[26px] py-[18px] border-b border-outline-variant last:border-b-0 items-center"
            style={{ gridTemplateColumns: '1fr 120px 140px 120px' }}
          >
            <div className="text-[13.5px] font-bold">{app.name}</div>
            <div className="text-[12.5px] text-on-surface-variant">{app.type}</div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${status.dotClass}`} />
              <span className="text-[11.5px] font-bold uppercase tracking-wide text-on-surface-variant">
                {status.label}
              </span>
            </div>
            <div className="text-[12.5px] text-ink3">{app.deadline}</div>
          </div>
        );
      })}
    </div>
  );
}
