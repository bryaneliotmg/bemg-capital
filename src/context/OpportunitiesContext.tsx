import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getMatchedOpportunities, type MatchedOpportunity } from '../lib/opportunities';

interface OpportunitiesContextValue {
  opportunities: MatchedOpportunity[];
  loading: boolean;
  error: string | null;
}

const OpportunitiesContext = createContext<OpportunitiesContextValue>({
  opportunities: [],
  loading: true,
  error: null,
});

export function OpportunitiesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpportunitiesContextValue>({
    opportunities: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    getMatchedOpportunities()
      .then((opportunities) => {
        if (!cancelled) setState({ opportunities, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            opportunities: [],
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load opportunities',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <OpportunitiesContext.Provider value={state}>{children}</OpportunitiesContext.Provider>;
}

export function useOpportunities() {
  return useContext(OpportunitiesContext);
}
