import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getMatchedOpportunities, searchGrants, type MatchedOpportunity } from '../lib/opportunities';

interface OpportunitiesContextValue {
  opportunities: MatchedOpportunity[];
  loading: boolean;
  error: string | null;
  searching: boolean;
  searchError: string | null;
  /** Live-search Grants.gov by keyword, cache whatever it finds, then refresh the list. */
  search: (keyword: string) => Promise<void>;
}

const OpportunitiesContext = createContext<OpportunitiesContextValue>({
  opportunities: [],
  loading: true,
  error: null,
  searching: false,
  searchError: null,
  search: async () => {},
});

export function OpportunitiesProvider({ children }: { children: ReactNode }) {
  const [opportunities, setOpportunities] = useState<MatchedOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getMatchedOpportunities();
      setOpportunities(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load opportunities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    <OpportunitiesContext.Provider value={{ opportunities, loading, error, searching, searchError, search }}>
      {children}
    </OpportunitiesContext.Provider>
  );
}

export function useOpportunities() {
  return useContext(OpportunitiesContext);
}
