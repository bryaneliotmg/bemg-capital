import type { DnaField } from '../data/sampleData';
import type { OwnerGroup, OwnerIdentity } from './matching';

// Who owns the business — the fact that decides eligibility for the many private grants
// aimed at Black-owned, women-owned, veteran-owned, etc. businesses (Hello Alice,
// corporate and foundation programs). Business DNA never recorded it before, so a grant
// like "Fund Her Future" (eligibility: "Women-owned businesses") scored the same for
// every tenant regardless of whether they could actually apply. These are chosen from a
// fixed list rather than typed, so matching parses an exact label, never a guess.
export const OWNER_IDENTITY_LABEL = 'Majority Owner Identity';
export const CERTIFICATIONS_LABEL = 'Certifications';

const NOT_PROVIDED = 'Not yet provided';

const OWNER_IDENTITY_OPTIONS: Record<string, OwnerGroup[]> = {
  'Black / African American': ['black'],
  'Hispanic / Latino': ['hispanic'],
  'Asian American': ['asian'],
  'Native American / Alaska Native': ['native'],
  'Pacific Islander': ['pacific'],
  Woman: ['women'],
  Veteran: ['veteran'],
  'Service-Disabled Veteran': ['veteran', 'disabled_veteran'],
  'LGBTQ+': ['lgbtq'],
  'Person with a Disability': ['disability'],
  'Prefer not to say': [],
};

// A certification is third-party proof of the same ownership facts above, so it counts
// toward the same groups — a tenant who only filled in "WBE" still matches women-owned
// grants. DBE, 8(a) and HUBZone don't map to one specific group, so they're recorded
// (applications ask for them) but don't change matching.
const CERTIFICATION_OPTIONS: Record<string, OwnerGroup[]> = {
  MBE: ['minority'],
  WBE: ['women'],
  DBE: [],
  '8(a)': [],
  HUBZone: [],
  VOSB: ['veteran'],
  SDVOSB: ['veteran', 'disabled_veteran'],
  'WOSB / EDWOSB': ['women'],
  LGBTBE: ['lgbtq'],
  None: [],
};

const RACE_GROUPS = new Set<OwnerGroup>(['black', 'hispanic', 'asian', 'native', 'pacific']);

export const OWNER_FIELD_OPTIONS: Record<string, string[]> = {
  [OWNER_IDENTITY_LABEL]: Object.keys(OWNER_IDENTITY_OPTIONS),
  [CERTIFICATIONS_LABEL]: Object.keys(CERTIFICATION_OPTIONS),
};

/** The two owner fields as blank rows, for tenants whose Business DNA predates them. */
export function blankOwnerFields(): DnaField[] {
  return Object.entries(OWNER_FIELD_OPTIONS).map(([label, options]) => ({
    label,
    value: NOT_PROVIDED,
    status: 'required' as const,
    sourceLabel: '',
    options,
  }));
}

export function splitOptionValue(value: string): string[] {
  if (!value || value === NOT_PROVIDED) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * The tenant's owner groups for matching, or undefined if neither field gives any.
 * `identityAnswered` stays separate from the groups themselves: "unknown" and "answered,
 * none of these" mean different things to matching (nudge to fill it in vs. treat as a
 * fact). Only the identity field can say what the owner is NOT — a certifications-only
 * answer like "WBE" proves women-owned but says nothing about race, and "Prefer not to
 * say" on its own is treated as unanswered for the same reason.
 */
export function parseOwnerIdentity(
  identityValue: string | undefined,
  certificationsValue: string | undefined,
): OwnerIdentity | undefined {
  const identity = splitOptionValue(identityValue ?? '');
  const certs = splitOptionValue(certificationsValue ?? '');
  const identityAnswered = identity.some((v) => v !== 'Prefer not to say' && v in OWNER_IDENTITY_OPTIONS);

  const groups = new Set<OwnerGroup>();
  for (const v of identity) for (const g of OWNER_IDENTITY_OPTIONS[v] ?? []) groups.add(g);
  for (const v of certs) for (const g of CERTIFICATION_OPTIONS[v] ?? []) groups.add(g);
  if ([...groups].some((g) => RACE_GROUPS.has(g))) groups.add('minority');

  if (!identityAnswered && groups.size === 0) return undefined;
  return { groups: [...groups], identityAnswered };
}
