import { createContext, useContext, useState, type ReactNode } from 'react';
import { DEFAULT_APPLICATIONS, type Application, type Grant } from '../data/sampleData';

interface ApplicationsContextValue {
  applications: Application[];
  hasApplication: (grantId: string) => boolean;
  startApplication: (grant: Grant) => void;
}

const ApplicationsContext = createContext<ApplicationsContextValue | null>(null);

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] = useState<Application[]>(DEFAULT_APPLICATIONS);

  const hasApplication = (grantId: string) => applications.some((a) => a.grantId === grantId);

  const startApplication = (grant: Grant) => {
    if (hasApplication(grant.id)) return;
    setApplications((prev) => [
      { grantId: grant.id, name: grant.name, type: grant.type, status: 'draft', deadline: grant.deadline },
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
