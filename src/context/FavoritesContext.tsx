import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface FavoritesContextValue {
  favoriteIds: Set<string>;
  loading: boolean;
  isFavorited: (opportunityId: string) => boolean;
  toggleFavorite: (opportunityId: string) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextValue>({
  favoriteIds: new Set(),
  loading: true,
  isFavorited: () => false,
  toggleFavorite: async () => {},
});

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { activeTenantId } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeTenantId) {
      setFavoriteIds(new Set());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('favorite_opportunities')
        .select('opportunity_id')
        .eq('tenant_id', activeTenantId);
      if (cancelled) return;
      setFavoriteIds(new Set((data ?? []).map((r) => r.opportunity_id)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTenantId]);

  const toggleFavorite = useCallback(
    async (opportunityId: string) => {
      if (!activeTenantId) return;
      const isCurrentlyFavorited = favoriteIds.has(opportunityId);

      // Optimistic — favoriting is a low-stakes toggle, no reason to make the user
      // wait on a round trip to see it happen.
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyFavorited) next.delete(opportunityId);
        else next.add(opportunityId);
        return next;
      });

      const { error } = isCurrentlyFavorited
        ? await supabase
            .from('favorite_opportunities')
            .delete()
            .eq('tenant_id', activeTenantId)
            .eq('opportunity_id', opportunityId)
        : await supabase.from('favorite_opportunities').insert({ tenant_id: activeTenantId, opportunity_id: opportunityId });

      if (error) {
        // Roll back on failure rather than leaving the UI showing a state that isn't
        // actually saved.
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlyFavorited) next.add(opportunityId);
          else next.delete(opportunityId);
          return next;
        });
      }
    },
    [activeTenantId, favoriteIds],
  );

  const isFavorited = useCallback((opportunityId: string) => favoriteIds.has(opportunityId), [favoriteIds]);

  return (
    <FavoritesContext.Provider value={{ favoriteIds, loading, isFavorited, toggleFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  return useContext(FavoritesContext);
}
