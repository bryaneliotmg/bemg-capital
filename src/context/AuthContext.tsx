import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  tenantId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadTenant(userId: string) {
      const { data, error } = await supabase.from('profiles').select('tenant_id').eq('id', userId).single();
      if (cancelled) return;
      if (error) {
        console.error('Failed to load tenant for logged-in user:', error);
        setTenantId(null);
      } else {
        setTenantId(data?.tenant_id ?? null);
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

  return (
    <AuthContext.Provider value={{ session, tenantId, loading, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
