import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_APPLICATIONS, type Application, type OpportunityStatus } from '../data/sampleData';
import type { NarrativeSectionDef } from '../data/narrativeSections';
import { useAuth } from './AuthContext';
import {
  fetchApplications,
  fetchNarratives,
  insertApplication,
  persistApplicationStatus,
  persistNarrativeBulk,
  persistNarrativeSection,
} from '../lib/applicationsStore';

interface StartableOpportunity {
  id: string;
  name: string;
  deadline: string;
}

type NarrativeByGrant = Record<string, Record<string, string>>;
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ApplicationsContextValue {
  applications: Application[];
  loading: boolean;
  saveStatus: SaveStatus;
  hasApplication: (grantId: string) => boolean;
  startApplication: (opportunity: StartableOpportunity) => void;
  getApplication: (grantId: string) => Application | undefined;
  setApplicationStatus: (grantId: string, status: OpportunityStatus) => void;
  getNarrative: (grantId: string) => Record<string, string>;
  updateNarrative: (grantId: string, sectionId: string, value: string) => void;
  setNarrativeBulk: (grantId: string, sections: Record<string, string>) => void;
  narrativeProgress: (grantId: string, sections: NarrativeSectionDef[]) => { done: number; total: number };
}

const ApplicationsContext = createContext<ApplicationsContextValue | null>(null);

const NARRATIVE_SAVE_DEBOUNCE_MS = 1000;

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const { tenantId } = useAuth();
  const [applications, setApplications] = useState<Application[]>(DEFAULT_APPLICATIONS);
  const [narrativeByGrant, setNarrativeByGrant] = useState<NarrativeByGrant>({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([fetchApplications(), fetchNarratives()])
      .then(([apps, narratives]) => {
        if (cancelled) return;
        setApplications(apps);
        setNarrativeByGrant(narratives);
      })
      .catch((err) => console.error('Failed to load saved applications:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  function runPersist(fn: () => Promise<void>) {
    setSaveStatus('saving');
    fn()
      .then(() => setSaveStatus('saved'))
      .catch((err) => {
        console.error('Failed to save application data:', err);
        setSaveStatus('error');
      });
  }

  const hasApplication = (grantId: string) => applications.some((a) => a.grantId === grantId);
  const getApplication = (grantId: string) => applications.find((a) => a.grantId === grantId);

  const startApplication = (opportunity: StartableOpportunity) => {
    if (hasApplication(opportunity.id) || !tenantId) return;
    const app: Application = {
      grantId: opportunity.id,
      name: opportunity.name,
      opportunityType: 'GRANT',
      status: 'draft',
      deadline: opportunity.deadline,
    };
    setApplications((prev) => [app, ...prev]);
    runPersist(() => insertApplication(app, tenantId));
  };

  const setApplicationStatus = (grantId: string, status: OpportunityStatus) => {
    setApplications((prev) => prev.map((a) => (a.grantId === grantId ? { ...a, status } : a)));
    runPersist(() => persistApplicationStatus(grantId, status));
  };

  const getNarrative = (grantId: string) => narrativeByGrant[grantId] ?? {};

  const updateNarrative = (grantId: string, sectionId: string, value: string) => {
    setNarrativeByGrant((prev) => ({
      ...prev,
      [grantId]: { ...(prev[grantId] ?? {}), [sectionId]: value },
    }));
    if (!tenantId) return;

    const key = `${grantId}:${sectionId}`;
    const existing = debounceTimers.current.get(key);
    if (existing) clearTimeout(existing);
    setSaveStatus('saving');
    debounceTimers.current.set(
      key,
      setTimeout(() => {
        debounceTimers.current.delete(key);
        runPersist(() => persistNarrativeSection(grantId, sectionId, value, tenantId));
      }, NARRATIVE_SAVE_DEBOUNCE_MS),
    );
  };

  const setNarrativeBulk = (grantId: string, sections: Record<string, string>) => {
    setNarrativeByGrant((prev) => ({
      ...prev,
      [grantId]: { ...(prev[grantId] ?? {}), ...sections },
    }));
    if (!tenantId) return;
    runPersist(() => persistNarrativeBulk(grantId, sections, tenantId));
  };

  const narrativeProgress = (grantId: string, sections: NarrativeSectionDef[]) => {
    const narrative = narrativeByGrant[grantId] ?? {};
    const done = sections.filter((s) => (narrative[s.id] ?? '').trim().length > 0).length;
    return { done, total: sections.length };
  };

  return (
    <ApplicationsContext.Provider
      value={{
        applications,
        loading,
        saveStatus,
        hasApplication,
        startApplication,
        getApplication,
        setApplicationStatus,
        getNarrative,
        updateNarrative,
        setNarrativeBulk,
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
