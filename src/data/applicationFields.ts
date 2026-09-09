import type { EditableTabId } from '../context/BusinessDNAContext';

export interface ApplicationFieldMapping {
  label: string;
  dnaTab: EditableTabId;
  dnaLabel: string;
}

// Standard SF-424 "Application for Federal Assistance" fields that a Business DNA
// profile can plausibly pre-fill. Mapped to the exact DNA field that supplies each
// one, so the grant detail panel can show real pre-filled values (or an honest
// "not yet provided" with a link to go fill it in) instead of a generic checklist.
export const SF424_FIELD_MAP: ApplicationFieldMapping[] = [
  { label: 'Organization Legal Name', dnaTab: 'identity', dnaLabel: 'Legal Name' },
  { label: 'Employer ID Number (EIN)', dnaTab: 'identity', dnaLabel: 'EIN / Tax ID' },
  { label: 'SAM.gov Unique Entity ID (UEI)', dnaTab: 'identity', dnaLabel: 'SAM.gov Unique Entity ID (UEI)' },
  { label: 'Organization Type', dnaTab: 'identity', dnaLabel: 'Ownership Structure' },
  { label: 'Physical Address / City', dnaTab: 'identity', dnaLabel: 'Headquarters City' },
  { label: 'Authorized Representative', dnaTab: 'identity', dnaLabel: 'Authorized Representative' },
  { label: 'Contact Email', dnaTab: 'identity', dnaLabel: 'Contact Email' },
  { label: 'Contact Phone', dnaTab: 'identity', dnaLabel: 'Contact Phone' },
  { label: 'Federal Funding Requested', dnaTab: 'growth', dnaLabel: 'Capital Requirement' },
];

// These have no Business DNA source — they're inherent to the specific grant/project
// being applied for, not facts about the business, so they're always filled in fresh
// per application rather than pre-filled.
export const PROJECT_SPECIFIC_FIELDS = [
  'Project Title',
  'Project Description / Narrative',
  'Project Period (start – end dates)',
];

// For DNA fields that aren't just data entry — they require actually registering with
// an external authority first. Keyed by the DNA field label (SF424_FIELD_MAP.dnaLabel),
// shown as a direct link when the field is still missing so "go get one" isn't a dead end.
export const EXTERNAL_ACQUIRE_LINKS: Record<string, { linkLabel: string; url: string }> = {
  'EIN / Tax ID': {
    linkLabel: 'Apply for an EIN at IRS.gov',
    url: 'https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online',
  },
  'SAM.gov Unique Entity ID (UEI)': {
    linkLabel: 'Register for a UEI at SAM.gov',
    url: 'https://sam.gov/content/entity-registration',
  },
};
