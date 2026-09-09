import { createContext, useContext, useState, type ReactNode } from 'react';
import { DEFAULT_APPLICATIONS, type Application, type OpportunityStatus } from '../data/sampleData';
import { NARRATIVE_SECTIONS } from '../data/narrativeSections';

interface StartableOpportunity {
  id: string;
  name: string;
  deadline: string;
}

type NarrativeByGrant = Record<string, Record<string, string>>;

interface ApplicationsContextValue {
  applications: Application[];
  hasApplication: (grantId: string) => boolean;
  startApplication: (opportunity: StartableOpportunity) => void;
  getApplication: (grantId: string) => Application | undefined;
  setApplicationStatus: (grantId: string, status: OpportunityStatus) => void;
  getNarrative: (grantId: string) => Record<string, string>;
  updateNarrative: (grantId: string, sectionId: string, value: string) => void;
  narrativeProgress: (grantId: string) => { done: number; total: number };
}

const ApplicationsContext = createContext<ApplicationsContextValue | null>(null);

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] = useState<Application[]>(DEFAULT_APPLICATIONS);
  const [narrativeByGrant, setNarrativeByGrant] = useState<NarrativeByGrant>({});

  const hasApplication = (grantId: string) => applications.some((a) => a.grantId === grantId);
  const getApplication = (grantId: string) => applications.find((a) => a.grantId === grantId);

  const startApplication = (opportunity: StartableOpportunity) => {
    if (hasApplication(opportunity.id)) return;
    setApplications((prev) => [
      { grantId: opportunity.id, name: opportunity.name, opportunityType: 'GRANT', status: 'draft', deadline: opportunity.deadline },
      ...prev,
    ]);
  };

  const setApplicationStatus = (grantId: string, status: OpportunityStatus) => {
    setApplications((prev) => prev.map((a) => (a.grantId === grantId ? { ...a, status } : a)));
  };

  const getNarrative = (grantId: string) => narrativeByGrant[grantId] ?? {};

  const updateNarrative = (grantId: string, sectionId: string, value: string) => {
    setNarrativeByGrant((prev) => ({
      ...prev,
      [grantId]: { ...(prev[grantId] ?? {}), [sectionId]: value },
    }));
  };

  const narrativeProgress = (grantId: string) => {
    const narrative = narrativeByGrant[grantId] ?? {};
    const done = NARRATIVE_SECTIONS.filter((s) => (narrative[s.id] ?? '').trim().length > 0).length;
    return { done, total: NARRATIVE_SECTIONS.length };
  };

  return (
    <ApplicationsContext.Provider
      value={{
        applications,
        hasApplication,
        startApplication,
        getApplication,
        setApplicationStatus,
        getNarrative,
        updateNarrative,
        narrativeProgress,
      }}
    >
      {children}
    </ApplicationsContext.Provider>
  );
}

export function useApplications() {
  const ctx = useContext(ApplicationsContext);
  if (!ctx) throw new Error('useApplications must be used within an ApplicationsProvider');
  return ctx;
}
