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

export interface Application {
  grantId: string;
  name: string;
  opportunityType: OpportunityType;
  status: OpportunityStatus;
  deadline: string;
}

// No applications yet — bEMG hasn't used the platform to apply for anything, and
// matched opportunities now come from the real Grants.gov sync (src/lib/opportunities.ts)
// rather than this file, so there are no fictional ids left to seed against.
export const DEFAULT_APPLICATIONS: Application[] = [];

// Keywords grounded in bEMG's actual Identity/Operating DNA ("Brand Management, AI
// Consulting & Web Development"), used for deterministic title/description overlap
// scoring in src/lib/matching.ts — not fabricated, drawn from the real profile above.
export const BUSINESS_PROFILE_KEYWORDS = [
  'small business',
  'marketing',
  'brand',
  'branding',
  'consulting',
  'artificial intelligence',
  ' ai ',
  'website',
  'web development',
  'digital',
  'technology',
  'social media',
  'advertising',
];

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
}

const EVIDENCE_LABEL: Record<EvidenceStatus, string> = {
  verified: 'Verified',
  inferred: 'Inferred',
  required: 'Required input',
};

export function evidenceCaption(field: DnaField): string {
  return `${EVIDENCE_LABEL[field.status]} · ${field.sourceLabel}`;
}

export const IDENTITY_FIELDS: DnaField[] = [
  { label: 'Legal Name', value: 'bEMG Business', status: 'verified', sourceLabel: 'bemg-platform tenant record · synced today' },
  { label: 'Industry', value: 'Brand Management, AI Consulting & Web Development', status: 'verified', sourceLabel: 'bemg-platform tenant record · synced today' },
  { label: 'Website', value: 'bryaneliotmg.com', status: 'verified', sourceLabel: 'bemg-platform tenant record · synced today' },
  { label: 'Service Area', value: 'National', status: 'verified', sourceLabel: 'bemg-platform tenant record · synced today' },
  { label: 'Headquarters City', value: 'Not yet provided', status: 'required', sourceLabel: 'No city on file — add to unlock location-based programs' },
  { label: 'Ownership Structure', value: 'Not yet provided', status: 'required', sourceLabel: 'Entity type/ownership not recorded yet' },
  { label: 'Authorized Representative', value: 'Bryan Willis', status: 'verified', sourceLabel: 'bemg-platform company profile · founder listed' },
  { label: 'Contact Email', value: 'bryan@bemgbusiness.com', status: 'verified', sourceLabel: 'bemg-platform tenant record · synced today' },
  { label: 'Contact Phone', value: '+1 (601) 331-6132', status: 'verified', sourceLabel: 'bemg-platform tenant record · synced today' },
  { label: 'EIN / Tax ID', value: 'Not yet provided', status: 'required', sourceLabel: 'Required for federal grant applications' },
  { label: 'SAM.gov Unique Entity ID (UEI)', value: 'Not yet provided', status: 'required', sourceLabel: 'Register at SAM.gov — required before applying to any federal grant' },
];

export const FINANCIAL_FIELDS: DnaField[] = [
  { label: 'Subscription Tier', value: 'Starter', status: 'verified', sourceLabel: 'bemg-platform tenant record · synced today' },
  { label: 'Revenue (TTM)', value: 'Not yet provided', status: 'required', sourceLabel: 'Connect accounting software or enter manually' },
  { label: 'Revenue Growth', value: 'Not available', status: 'required', sourceLabel: 'Needs revenue history to calculate' },
  { label: 'Net Margin', value: 'Not yet provided', status: 'required', sourceLabel: 'Needs revenue + expense data' },
  { label: 'Cash Flow', value: 'Not yet provided', status: 'required', sourceLabel: 'Connect a bank feed to calculate' },
  { label: 'Outstanding Debt', value: 'Not yet provided', status: 'required', sourceLabel: 'Not recorded yet' },
  { label: '2024 Tax Return', value: 'Not yet provided', status: 'required', sourceLabel: 'Upload to unlock Financial DNA' },
];

export const OPERATING_FIELDS: DnaField[] = [
  {
    label: 'Business Model',
    value: 'Done-for-you subscription platform for solo entrepreneurs and small service businesses',
    status: 'verified',
    sourceLabel: 'bemg-platform company profile · synced today',
  },
  {
    label: 'Products & Services',
    value: 'Social Media Automation, Website Design & Management, App Development, AI Receptionist, Digital Business Card, Lead Manager, Signal Newsletter, Directory Listing',
    status: 'verified',
    sourceLabel: 'bemg-platform company profile · synced today',
  },
  { label: 'Customers', value: '605 contacts in CRM', status: 'verified', sourceLabel: 'bemg-platform contacts table · live' },
  { label: 'Content Activity', value: '85 posts drafted · 79 published', status: 'verified', sourceLabel: 'bemg-platform content table · live' },
  { label: 'Newsletter', value: '14 Signal issues sent', status: 'verified', sourceLabel: 'bemg-platform signals table · live' },
  {
    label: 'Market',
    value: 'Solo entrepreneurs & small service businesses — barbershops, salons, restaurants, spas, fitness studios, consultants',
    status: 'verified',
    sourceLabel: 'bemg-platform company profile · synced today',
  },
  { label: 'Team', value: 'Not yet provided', status: 'required', sourceLabel: 'Employee count not recorded yet' },
];

export const GROWTH_FIELDS: DnaField[] = [
  { label: 'Trajectory', value: 'Not yet provided', status: 'required', sourceLabel: 'No growth trajectory on file yet' },
  { label: 'Expansion Plan', value: 'Not yet provided', status: 'required', sourceLabel: 'No expansion plan on file yet' },
  { label: 'Capital Requirement', value: 'Not yet provided', status: 'required', sourceLabel: 'Tell us what you need funding for' },
  { label: 'Intended Use of Funds', value: 'Not yet provided', status: 'required', sourceLabel: 'No use-of-funds breakdown yet' },
];

export const FUNDING_FIELDS: DnaField[] = [
  { label: 'Grants Awarded', value: 'Not yet provided', status: 'required', sourceLabel: 'No prior grant history on file' },
  { label: 'Loans', value: 'Not yet provided', status: 'required', sourceLabel: 'No prior loan history on file' },
  { label: 'Equity Raised', value: 'None to date', status: 'verified', sourceLabel: 'No equity or cap table on file' },
  { label: 'Applications Submitted', value: '0 total', status: 'verified', sourceLabel: 'bEMG Capital platform history · live' },
];

export interface DnaTabDef {
  id: 'identity' | 'financial' | 'operating' | 'growth' | 'funding' | 'readiness';
  label: string;
  desc: string;
  complete: boolean;
}

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
