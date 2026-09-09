import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { BusinessDNA } from './pages/BusinessDNA';
import { GrantMatches } from './pages/GrantMatches';
import { Applications } from './pages/Applications';
import { ApplicationDetail } from './pages/ApplicationDetail';
import { Login } from './pages/Login';
import { ApplicationsProvider } from './context/ApplicationsContext';
import { OpportunitiesProvider } from './context/OpportunitiesContext';
import { BusinessDNAProvider } from './context/BusinessDNAContext';
import { AuthProvider, useAuth } from './context/AuthContext';

function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-ink-3 text-sm font-semibold">Loading…</div>;
  }
  if (!session) return <Login />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate>
          <BusinessDNAProvider>
            <OpportunitiesProvider>
              <ApplicationsProvider>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="business-dna" element={<BusinessDNA />} />
                    <Route path="grants" element={<GrantMatches />} />
                    <Route path="applications" element={<Applications />} />
                    <Route path="applications/:grantId" element={<ApplicationDetail />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </ApplicationsProvider>
            </OpportunitiesProvider>
          </BusinessDNAProvider>
        </AuthGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
