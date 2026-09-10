import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getMatchedOpportunities, searchGrants, type MatchedOpportunity } from '../lib/opportunities';
import { deriveKeywordsFromDnaFields } from '../lib/keywords';
import { useBusinessDNA } from './BusinessDNAContext';

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
  const [opportunities, setOpportunities] = useState<MatchedOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const capitalField = getField('growth', 'Capital Requirement');
  const capitalRequirementMin =
    capitalField && capitalField.status !== 'required' ? parseDollarAmount(capitalField.value) ?? undefined : undefined;
  const keywords = deriveKeywordsFromDnaFields(fieldsByTab);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMatchedOpportunities({ keywords, capitalRequirementMin });
      setOpportunities(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load opportunities');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywords.join('|'), capitalRequirementMin]);

  useEffect(() => {
    if (dnaLoading) return;
    load();
  }, [load, dnaLoading]);

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
