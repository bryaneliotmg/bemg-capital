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
      setActiveTenantId(ownTenantId);
      setIsAdmin(admin);

      if (admin) {
        const { data: tenants, error: tenantsError } = await supabase
          .from('tenants')
          .select('tenant_id, business_name')
          .order('business_name');
        if (!cancelled && !tenantsError) {
          setAvailableTenants((tenants ?? []).map((t) => ({ id: t.tenant_id, name: t.business_name })));
        }
      } else {
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
        setActiveTenantId,
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
