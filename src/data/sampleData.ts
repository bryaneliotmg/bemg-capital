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

export interface FundingOpportunity {
  id: string;
  opportunityType: OpportunityType;
  name: string;
  funder: string;
  amount: string;
  matchPct: number;
  deadline: string;
  status: OpportunityStatus;
  evidence: string[];
}

export const FUNDING_OPPORTUNITIES: FundingOpportunity[] = [
  {
    id: 'g1',
    opportunityType: 'GRANT',
    name: 'Mississippi Small Business Innovation Grant',
    funder: 'MS Development Authority',
    amount: '$10,000 – $25,000',
    matchPct: 94,
    deadline: '18 days',
    status: 'new',
    evidence: [
      'Revenue $250K–$2M — verified via QuickBooks sync',
      'Mississippi-registered LLC — verified via Secretary of State',
      'Operating 3+ years — verified, 6 years on file',
    ],
  },
  {
    id: 'g2',
    opportunityType: 'GRANT',
    name: 'USDA Rural Business Development Grant',
    funder: 'USDA Rural Development',
    amount: '$25,000 – $75,000',
    matchPct: 88,
    deadline: '34 days',
    status: 'new',
    evidence: [
      'Located in eligible rural area — verified via address',
      'For-profit small business — verified via entity type',
      'Job creation plan on file — self-reported',
    ],
  },
  {
    id: 'g3',
    opportunityType: 'GRANT',
    name: 'Local Craft Manufacturing Fund',
    funder: 'Delta Regional Authority',
    amount: '$15,000 – $50,000',
    matchPct: 81,
    deadline: '9 days',
    status: 'in_progress',
    evidence: [
      'Manufacturing NAICS code — verified',
      '3+ years operating history — verified',
      'Regional economic impact — self-reported',
    ],
  },
  {
    id: 'g4',
    opportunityType: 'GRANT',
    name: 'Minority Business Development Grant',
    funder: 'MBDA',
    amount: '$5,000 – $20,000',
    matchPct: 76,
    deadline: '52 days',
    status: 'new',
    evidence: [
      'Woman-owned business — verified via certification',
      'Under $1M revenue — verified',
      'Growth plan documented — self-reported',
    ],
  },
  {
    id: 'g5',
    opportunityType: 'GRANT',
    name: 'Community Development Block Grant',
    funder: 'HUD / State of Mississippi',
    amount: '$50,000 – $150,000',
    matchPct: 63,
    deadline: '61 days',
    status: 'new',
    evidence: [
      'Job creation for LMI persons — needs additional verification',
      'Located in qualifying census tract — verified',
      'Facility expansion plan — self-reported',
    ],
  },
];

export interface Application {
  grantId: string;
  name: string;
  opportunityType: OpportunityType;
  status: OpportunityStatus;
  deadline: string;
}

export const DEFAULT_APPLICATIONS: Application[] = [
  { grantId: 'g3', name: 'Local Craft Manufacturing Fund', opportunityType: 'GRANT', status: 'draft', deadline: '9 days' },
  { grantId: 'g_old', name: 'MS Rural Small Business Grant (2023)', opportunityType: 'GRANT', status: 'awarded', deadline: '—' },
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
  { label: 'Legal Name', value: 'Cedar & Co. Millwork LLC', status: 'verified', sourceLabel: 'Secretary of State · 2d ago' },
  { label: 'Industry', value: 'Wood Product Manufacturing · NAICS 321999', status: 'verified', sourceLabel: 'Business registration · 2d ago' },
  { label: 'Location', value: 'Jackson, Mississippi', status: 'verified', sourceLabel: 'Business registration · 2d ago' },
  { label: 'Years Operating', value: '6 years', status: 'verified', sourceLabel: 'Formation date · 2d ago' },
  { label: 'Ownership', value: 'Woman-owned · Single-member LLC', status: 'verified', sourceLabel: 'WBENC certification · 30d ago' },
  { label: 'Employees', value: '8 full-time', status: 'verified', sourceLabel: 'Owner input · 14d ago' },
];

export const FINANCIAL_FIELDS: DnaField[] = [
  { label: 'Revenue (TTM)', value: '$620,000', status: 'verified', sourceLabel: 'QuickBooks sync · 2h ago', sparkline: true },
  { label: 'Revenue Growth', value: '+18% YoY', status: 'inferred', sourceLabel: 'calculated from revenue history · 2h ago' },
  { label: 'Net Margin', value: '12%', status: 'verified', sourceLabel: 'QuickBooks sync · 2h ago' },
  { label: 'Cash Flow', value: 'Positive · 3.2 months runway', status: 'inferred', sourceLabel: 'calculated from bank feed + expenses · 2h ago' },
  { label: 'Outstanding Debt', value: '$45,000 equipment loan', status: 'verified', sourceLabel: 'Bank feed · 2h ago' },
  { label: 'Total Assets', value: '$210,000', status: 'verified', sourceLabel: 'Owner input · 45d ago' },
  { label: '2024 Tax Return', value: 'Not yet provided', status: 'required', sourceLabel: 'Upload to strengthen Loan Readiness' },
];

export const OPERATING_FIELDS: DnaField[] = [
  { label: 'Business Model', value: 'B2B wholesale + direct-to-consumer', status: 'verified', sourceLabel: 'Owner input · 45d ago' },
  { label: 'Products', value: 'Custom furniture & architectural millwork', status: 'verified', sourceLabel: 'Owner input · 45d ago' },
  { label: 'Customers', value: '120+ active retail & trade accounts', status: 'verified', sourceLabel: 'CRM sync · 5d ago' },
  { label: 'Market', value: 'Southeast United States', status: 'verified', sourceLabel: 'Owner input · 45d ago' },
  { label: 'Team', value: '8 FTE + 2 apprentices', status: 'verified', sourceLabel: 'Owner input · 14d ago' },
];

export const GROWTH_FIELDS: DnaField[] = [
  { label: 'Trajectory', value: 'Expanding to a second production facility', status: 'verified', sourceLabel: 'Owner input · 20d ago' },
  { label: 'Expansion Plan', value: '6,000 sq ft facility, target Q3 2026', status: 'verified', sourceLabel: 'Owner input · 20d ago' },
  { label: 'Capital Requirement', value: '$150,000 – $250,000', status: 'verified', sourceLabel: 'Owner input · 20d ago' },
  { label: 'Intended Use of Funds', value: 'Equipment (60%) · Facility buildout (40%)', status: 'verified', sourceLabel: 'Owner input · 20d ago' },
];

export const FUNDING_FIELDS: DnaField[] = [
  { label: 'Grants Awarded', value: '1 of 3 applied · $12,000 (MS Rural Grant, 2023)', status: 'verified', sourceLabel: 'Award letter · 90d ago' },
  { label: 'Loans', value: 'SBA 7(a) · $85,000 · originated 2022', status: 'verified', sourceLabel: 'Bank feed · 2h ago' },
  { label: 'Equity Raised', value: 'None to date', status: 'verified', sourceLabel: 'Owner input · 90d ago' },
  { label: 'Applications Submitted', value: '7 total', status: 'verified', sourceLabel: 'Platform history · Live' },
];

export interface DnaTabDef {
  id: 'identity' | 'financial' | 'operating' | 'growth' | 'funding' | 'readiness';
  label: string;
  desc: string;
  complete: boolean;
}

export const DNA_TAB_DEFS: DnaTabDef[] = [
  { id: 'identity', label: 'Identity', desc: 'Legal, location, ownership', complete: true },
  { id: 'financial', label: 'Financial DNA', desc: 'Revenue, margin, cash flow', complete: false },
  { id: 'operating', label: 'Operating DNA', desc: 'Model, customers, team', complete: true },
  { id: 'growth', label: 'Growth DNA', desc: 'Trajectory, capital needs', complete: false },
  { id: 'funding', label: 'Funding History', desc: 'Prior grants & loans', complete: true },
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
