import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getMatchedOpportunities, searchGrants, type MatchedOpportunity } from '../lib/opportunities';
import { deriveKeywordsFromDnaFields, buildProfileText } from '../lib/keywords';
import { extractStateFromLocation } from '../lib/location';
import { useBusinessDNA } from './BusinessDNAContext';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

function parseDollarAmount(raw: string): number | null {
  const cleaned = raw.replace(/[, ]/g, '');
  const match = cleaned.match(/\$?([\d.]+)\s*(k|m)?/i);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return null;
  const suffix = match[2]?.toLowerCase();
  if (suffix === 'k') return num * 1_000;
  if (suffix === 'm') return num * 1_000_000;
  return num;
}

interface OpportunitiesContextValue {
  opportunities: MatchedOpportunity[];
  loading: boolean;
  error: string | null;
  searching: boolean;
  searchError: string | null;
  /** Live-search Grants.gov by keyword, cache whatever it finds, then refresh the list. */
  search: (keyword: string) => Promise<void>;
  /** Re-fetch and re-score without a live Grants.gov search — used after a manual
   * grant import so the newly-added rows show up immediately. */
  refresh: () => Promise<void>;
}

const OpportunitiesContext = createContext<OpportunitiesContextValue>({
  opportunities: [],
  loading: true,
  error: null,
  searching: false,
  searchError: null,
  search: async () => {},
  refresh: async () => {},
});

export function OpportunitiesProvider({ children }: { children: ReactNode }) {
  const { fieldsByTab, getField, loading: dnaLoading } = useBusinessDNA();
  const { activeTenantId } = useAuth();
  const [opportunities, setOpportunities] = useState<MatchedOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [tenantDomain, setTenantDomain] = useState<string | undefined>(undefined);

  const capitalField = getField('growth', 'Capital Requirement');
  const capitalRequirementMin =
    capitalField && capitalField.status !== 'required' ? parseDollarAmount(capitalField.value) ?? undefined : undefined;
  const keywords = deriveKeywordsFromDnaFields(fieldsByTab);
  const profileText = buildProfileText(fieldsByTab);
  const hqField = getField('identity', 'Headquarters City');
  const tenantState =
    hqField && hqField.status !== 'required' ? extractStateFromLocation(hqField.value) ?? undefined : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMatchedOpportunities({ keywords, capitalRequirementMin, domain: tenantDomain, state: tenantState });
      setOpportunities(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load opportunities');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywords.join('|'), capitalRequirementMin, tenantDomain, tenantState]);

  useEffect(() => {
    if (dnaLoading) return;
    load();
  }, [load, dnaLoading]);

  // One-time-per-profile-change AI domain classification (see api/_lib/domainTaxonomy.ts)
  // — never a live call at match time. Reads whatever's already on file immediately
  // (no AI call, just a lookup), and only hits the classification endpoint when the
  // stored fingerprint doesn't match the tenant's current profile text (i.e. their
  // Business DNA has meaningfully changed since it was last classified, or never was).
  useEffect(() => {
    if (dnaLoading || !activeTenantId || !profileText.trim()) {
      setTenantDomain(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('tenant_domain_classification')
        .select('primary_domain, profile_fingerprint')
        .eq('tenant_id', activeTenantId)
        .maybeSingle();
      if (cancelled) return;
      if (data) setTenantDomain(data.primary_domain);
      if (data?.profile_fingerprint === profileText) return; // already fresh
      try {
        const res = await fetch('/api/classify-tenant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: activeTenantId, profileText }),
        });
        const body = await res.json();
        if (!cancelled && body.primaryDomain) setTenantDomain(body.primaryDomain);
      } catch {
        // Best-effort — matching just proceeds without the domain signal if this
        // fails, same as any grant that hasn't been classified yet either.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTenantId, profileText, dnaLoading]);

  const search = useCallback(
    async (keyword: string) => {
      setSearching(true);
      setSearchError(null);
      try {
        await searchGrants(keyword);
        await load();
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setSearching(false);
      }
    },
    [load],
  );

  return (
    <OpportunitiesContext.Provider value={{ opportunities, loading, error, searching, searchError, search, refresh: load }}>
      {children}
    </OpportunitiesContext.Provider>
  );
}

export function useOpportunities() {
  return useContext(OpportunitiesContext);
}
