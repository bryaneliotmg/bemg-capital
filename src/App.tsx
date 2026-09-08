import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { BusinessDNA } from './pages/BusinessDNA';
import { GrantMatches } from './pages/GrantMatches';
import { Applications } from './pages/Applications';
import { ApplicationsProvider } from './context/ApplicationsContext';
import { OpportunitiesProvider } from './context/OpportunitiesContext';
import { BusinessDNAProvider } from './context/BusinessDNAContext';

export default function App() {
  return (
    <BrowserRouter>
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
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ApplicationsProvider>
        </OpportunitiesProvider>
      </BusinessDNAProvider>
    </BrowserRouter>
  );
}
