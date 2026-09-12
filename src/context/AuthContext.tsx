import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface TenantOption {
  id: string;
  name: string;
}

interface AuthContextValue {
  session: Session | null;
  /** The signed-in user's own tenant, from their profile — never changes with the switcher. */
  tenantId: string | null;
  /** The tenant whose data the app is currently reading/writing — equals tenantId unless an
   * admin has switched to a different one. Every data context should key off this, not tenantId. */
  activeTenantId: string | null;
  activeTenantName: string | null;
  isAdmin: boolean;
  /** Only populated for admins — every tenant they're allowed to switch into. */
  availableTenants: TenantOption[];
  setActiveTenantId: (id: string) => void;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Persists which tenant an admin has switched to, so a page refresh doesn't silently
// snap back to their own tenant — activeTenantId was pure in-memory React state,
// re-initialized to the admin's own tenant on every load with no memory of a prior
// switch.
const ACTIVE_TENANT_STORAGE_KEY = 'bemg-capital:active-tenant-id';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [availableTenants, setAvailableTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadTenant(userId: string) {
      const { data, error } = await supabase.from('profiles').select('tenant_id, role').eq('id', userId).single();
      if (cancelled) return;
      if (error) {
        console.error('Failed to load tenant for logged-in user:', error);
        setTenantId(null);
        setActiveTenantId(null);
        return;
      }
      const ownTenantId = data?.tenant_id ?? null;
      const admin = data?.role === 'admin';
      setTenantId(ownTenantId);
      setIsAdmin(admin);

      if (admin) {
        // Restore whichever tenant the admin was last viewing rather than defaulting
        // straight to their own — this is what actually fixes the "refresh always
        // jumps back to bEMG" bug.
        let persisted: string | null = null;
        try {
          persisted = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
        } catch {
          // Private window / blocked storage — just means switches won't survive a
          // refresh, not a functional failure.
        }
        setActiveTenantId(persisted || ownTenantId);

        const { data: tenants, error: tenantsError } = await supabase
          .from('tenants')
          .select('tenant_id, business_name')
          .order('business_name');
        if (!cancelled && !tenantsError) {
          const options = (tenants ?? []).map((t) => ({ id: t.tenant_id, name: t.business_name }));
          setAvailableTenants(options);
          // The persisted tenant may no longer exist (removed since) — fall back
          // rather than silently pointing the app at a dead id.
          if (persisted && !options.some((t) => t.id === persisted)) {
            setActiveTenantId(ownTenantId);
            try {
              localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
            } catch {
              // ignore
            }
          }
        }
      } else {
        setActiveTenantId(ownTenantId);
        setAvailableTenants([]);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) loadTenant(data.session.user.id).finally(() => !cancelled && setLoading(false));
      else setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      setSession(newSession);
      if (newSession?.user) {
        setLoading(true);
        loadTenant(newSession.user.id).finally(() => !cancelled && setLoading(false));
      } else {
        setTenantId(null);
        setActiveTenantId(null);
        setIsAdmin(false);
        setAvailableTenants([]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  function updateActiveTenantId(id: string) {
    setActiveTenantId(id);
    try {
      localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, id);
    } catch {
      // Private window / blocked storage — the switch still works for this session,
      // it just won't be remembered across a refresh.
    }
  }

  const activeTenantName = availableTenants.find((t) => t.id === activeTenantId)?.name ?? null;

  return (
    <AuthContext.Provider
      value={{
        session,
        tenantId,
        activeTenantId,
        activeTenantName,
        isAdmin,
        availableTenants,
        setActiveTenantId: updateActiveTenantId,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
