import { createContext, useContext, useState, type ReactNode } from 'react';
import { DEFAULT_APPLICATIONS, type Application } from '../data/sampleData';

interface StartableOpportunity {
  id: string;
  name: string;
  deadline: string;
}

interface ApplicationsContextValue {
  applications: Application[];
  hasApplication: (grantId: string) => boolean;
  startApplication: (opportunity: StartableOpportunity) => void;
}

const ApplicationsContext = createContext<ApplicationsContextValue | null>(null);

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] = useState<Application[]>(DEFAULT_APPLICATIONS);

  const hasApplication = (grantId: string) => applications.some((a) => a.grantId === grantId);

  const startApplication = (opportunity: StartableOpportunity) => {
    if (hasApplication(opportunity.id)) return;
    setApplications((prev) => [
      { grantId: opportunity.id, name: opportunity.name, opportunityType: 'GRANT', status: 'draft', deadline: opportunity.deadline },
      ...prev,
    ]);
  };

  return (
    <ApplicationsContext.Provider value={{ applications, hasApplication, startApplication }}>
      {children}
    </ApplicationsContext.Provider>
  );
}

export function useApplications() {
  const ctx = useContext(ApplicationsContext);
  if (!ctx) throw new Error('useApplications must be used within an ApplicationsProvider');
  return ctx;
}
