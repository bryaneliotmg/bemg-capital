export type OpportunityStatus = 'new' | 'in_progress' | 'submitted' | 'awarded' | 'draft';

export const STATUS_META: Record<OpportunityStatus, { dotClass: string; label: string }> = {
  new: { dotClass: 'bg-verified', label: 'New match' },
  in_progress: { dotClass: 'bg-inferred', label: 'In progress' },
  submitted: { dotClass: 'bg-ink-3', label: 'Submitted' },
  awarded: { dotClass: 'bg-verified', label: 'Awarded' },
  draft: { dotClass: 'bg-inferred', label: 'Draft' },
};

export type OpportunityType =
  | 'GRANT'
  | 'COMPETITION'
  | 'GOVERNMENT_PROGRAM'
  | 'INCENTIVE'
  | 'LOAN'
  | 'CDFI'
  | 'ANGEL'
  | 'VC'
  | 'PE'
  | 'CROWDFUNDING'
  | 'ACCELERATOR';

export const OPPORTUNITY_TYPE_LABEL: Record<OpportunityType, string> = {
  GRANT: 'Grant',
  COMPETITION: 'Competition',
  GOVERNMENT_PROGRAM: 'Government Program',
  INCENTIVE: 'Incentive',
  LOAN: 'Loan',
  CDFI: 'CDFI',
  ANGEL: 'Angel',
  VC: 'VC',
  PE: 'Private Equity',
  CROWDFUNDING: 'Crowdfunding',
  ACCELERATOR: 'Accelerator',
};

export interface OrgInfoField {
  value: string;
  status: EvidenceStatus;
}

export interface Application {
  grantId: string;
  name: string;
  opportunityType: OpportunityType;
  status: OpportunityStatus;
  deadline: string;
  /** A one-time snapshot of SF-424 org fields taken from Business DNA when the
   * application was started — edited independently per application from then on,
   * since the same field (e.g. Legal Name) may need to be phrased differently
   * across different submissions rather than always mirroring the live DNA. */
  orgInfo: Record<string, OrgInfoField>;
}

// No applications yet — bEMG hasn't used the platform to apply for anything, and
// matched opportunities now come from the real Grants.gov sync (src/lib/opportunities.ts)
// rather than this file, so there are no fictional ids left to seed against.
export const DEFAULT_APPLICATIONS: Application[] = [];

export function ringColorForMatch(pct: number): string {
  if (pct >= 85) return '#059669'; // verified
  if (pct >= 70) return '#d97706'; // inferred
  return '#8a8178'; // muted warm gray
}

export type EvidenceStatus = 'verified' | 'inferred' | 'required';

export interface DnaField {
  label: string;
  value: string;
  status: EvidenceStatus;
  sourceLabel: string;
  sparkline?: boolean;
  /** Renders as a textarea, not a single-line input — for fields meant to be a real
   * paragraph the owner writes and refines themselves, not a discrete fact. */
  multiline?: boolean;
}

const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  verified: 'Verified',
  inferred: 'Inferred',
  required: 'Required input',
};

export function evidenceCaption(field: DnaField): string {
  return `${EVIDENCE_LABEL[field.status]} · ${field.sourceLabel}`;
}

// Business DNA field data lives in Supabase now (business_dna_fields, tenant-scoped —
// see src/lib/businessDnaStore.ts), not here. Every tenant's actual facts were migrated
// in via a one-time seed migration when this moved from a single hardcoded bEMG profile
// to a real multi-tenant model.

export interface DnaTabDef {
  id: 'identity' | 'financial' | 'operating' | 'growth' | 'funding' | 'readiness';
  label: string;
  desc: string;
  complete: boolean;
}

export type EditableTabId = Exclude<DnaTabDef['id'], 'readiness'>;

export const DNA_TAB_DEFS: DnaTabDef[] = [
  { id: 'identity', label: 'Identity', desc: 'Legal, location, ownership', complete: false },
  { id: 'financial', label: 'Financial DNA', desc: 'Revenue, margin, cash flow', complete: false },
  { id: 'operating', label: 'Operating DNA', desc: 'Model, customers, team', complete: false },
  { id: 'growth', label: 'Growth DNA', desc: 'Trajectory, capital needs', complete: false },
  { id: 'funding', label: 'Funding History', desc: 'Prior grants & loans', complete: false },
  { id: 'readiness', label: 'Readiness', desc: 'Grant, loan & investment scores', complete: true },
];

export interface ReadinessBand {
  label: string;
  color: string;
}

export function readinessBand(score: number): ReadinessBand {
  if (score >= 90) return { label: 'Fully Ready', color: '#047857' };
  if (score >= 70) return { label: 'Grant Ready', color: '#059669' };
  if (score >= 40) return { label: 'Developing', color: '#d97706' };
  return { label: 'Building', color: '#8a8178' };
}

// Percentage of a tenant's Business DNA fields that are actually filled in
// (status !== 'required') — used for the Dashboard's Business DNA metric so it
// reflects whichever tenant is currently active, not a fixed demo number.
export function dnaCompleteness(fieldsByTab: Record<EditableTabId, DnaField[]>): number {
  const fields = Object.values(fieldsByTab).flat();
  if (fields.length === 0) return 0;
  const filled = fields.filter((f) => f.status !== 'required').length;
  return Math.round((filled / fields.length) * 100);
}
