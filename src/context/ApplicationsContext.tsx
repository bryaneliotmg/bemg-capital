import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_APPLICATIONS, type Application, type OpportunityStatus, type OrgInfoField } from '../data/sampleData';
import type { NarrativeSectionDef } from '../data/narrativeSections';
import type { ChecklistItemState } from '../data/checklistItems';
import type { BudgetCategoryId, BudgetItem } from '../data/budgetCategories';
import { useAuth } from './AuthContext';
import {
  deleteBudgetItem,
  fetchApplications,
  fetchBudgetItems,
  fetchNarratives,
  insertApplication,
  insertBudgetItem,
  persistAlignmentScore,
  persistApplicationStatus,
  persistChecklistState,
  persistNarrativeBulk,
  persistNarrativeSection,
  persistOrgInfo,
  updateBudgetItem,
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
  startApplication: (opportunity: StartableOpportunity, orgInfo: Record<string, OrgInfoField>) => void;
  getApplication: (grantId: string) => Application | undefined;
  setApplicationStatus: (grantId: string, status: OpportunityStatus, outcomeReason?: string | null) => void;
  recordAlignmentScore: (grantId: string, score: number) => void;
  updateChecklistItem: (grantId: string, itemId: string, patch: Partial<ChecklistItemState>) => void;
  getBudgetItems: (grantId: string) => BudgetItem[];
  addBudgetItem: (grantId: string, category: BudgetCategoryId) => void;
  updateBudgetItemField: (
    grantId: string,
    itemId: string,
    patch: Partial<Pick<BudgetItem, 'category' | 'label' | 'amount' | 'justification'>>,
  ) => void;
  removeBudgetItem: (grantId: string, itemId: string) => void;
  updateOrgField: (grantId: string, dnaLabel: string, value: string) => void;
  getNarrative: (grantId: string) => Record<string, string>;
  updateNarrative: (grantId: string, sectionId: string, value: string) => void;
  setNarrativeBulk: (grantId: string, sections: Record<string, string>) => void;
  narrativeProgress: (grantId: string, sections: NarrativeSectionDef[]) => { done: number; total: number };
}

const ApplicationsContext = createContext<ApplicationsContextValue | null>(null);

const NARRATIVE_SAVE_DEBOUNCE_MS = 1000;

export function ApplicationsProvider({ children }: { children: ReactNode }) {
  const { activeTenantId: tenantId } = useAuth();
  const [applications, setApplications] = useState<Application[]>(DEFAULT_APPLICATIONS);
  const [narrativeByGrant, setNarrativeByGrant] = useState<NarrativeByGrant>({});
  const [budgetItemsByGrant, setBudgetItemsByGrant] = useState<Record<string, BudgetItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([fetchApplications(), fetchNarratives(), fetchBudgetItems()])
      .then(([apps, narratives, budgetItems]) => {
        if (cancelled) return;
        setApplications(apps);
        setNarrativeByGrant(narratives);
        setBudgetItemsByGrant(budgetItems);
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

  const startApplication = (opportunity: StartableOpportunity, orgInfo: Record<string, OrgInfoField>) => {
    if (hasApplication(opportunity.id) || !tenantId) return;
    const app: Application = {
      grantId: opportunity.id,
      name: opportunity.name,
      opportunityType: 'GRANT',
      status: 'draft',
      outcomeReason: null,
      alignmentScore: null,
      alignmentComputedAt: null,
      checklistState: {},
      deadline: opportunity.deadline,
      orgInfo,
    };
    setApplications((prev) => [app, ...prev]);
    runPersist(() => insertApplication(app, tenantId));
  };

  const setApplicationStatus = (grantId: string, status: OpportunityStatus, outcomeReason?: string | null) => {
    setApplications((prev) =>
      prev.map((a) => (a.grantId === grantId ? { ...a, status, ...(outcomeReason !== undefined ? { outcomeReason } : {}) } : a)),
    );
    runPersist(() => persistApplicationStatus(grantId, status, outcomeReason));
  };

  const recordAlignmentScore = (grantId: string, score: number) => {
    const computedAt = new Date().toISOString();
    setApplications((prev) =>
      prev.map((a) => (a.grantId === grantId ? { ...a, alignmentScore: score, alignmentComputedAt: computedAt } : a)),
    );
    runPersist(() => persistAlignmentScore(grantId, score));
  };

  const updateChecklistItem = (grantId: string, itemId: string, patch: Partial<ChecklistItemState>) => {
    let updatedState: Record<string, ChecklistItemState> | null = null;
    setApplications((prev) =>
      prev.map((a) => {
        if (a.grantId !== grantId) return a;
        const current = a.checklistState[itemId] ?? { status: 'pending' as const };
        updatedState = { ...a.checklistState, [itemId]: { ...current, ...patch } };
        return { ...a, checklistState: updatedState };
      }),
    );
    if (!tenantId || !updatedState) return;
    runPersist(() => persistChecklistState(grantId, updatedState!));
  };

  const getBudgetItems = (grantId: string) => budgetItemsByGrant[grantId] ?? [];

  // Real CRUD against application_budget_items — doesn't fit this file's dominant
  // "optimistic local update + fire-and-forget persist, surface failure via
  // saveStatus" pattern quite as cleanly as the other mutators, because a freshly
  // added row needs the server-assigned id before it can be edited or deleted. Add a
  // temporary client-side id immediately for a responsive UI, then swap it for the
  // real one once the insert resolves.
  const addBudgetItem = (grantId: string, category: BudgetCategoryId) => {
    if (!tenantId) return;
    const tempId = `temp-${crypto.randomUUID()}`;
    const existing = budgetItemsByGrant[grantId] ?? [];
    const newItem: BudgetItem = {
      id: tempId,
      grantId,
      category,
      label: '',
      amount: 0,
      justification: null,
      position: existing.length,
    };
    setBudgetItemsByGrant((prev) => ({ ...prev, [grantId]: [...(prev[grantId] ?? []), newItem] }));
    setSaveStatus('saving');
    insertBudgetItem(
      { grantId, category, label: '', amount: 0, justification: null, position: existing.length },
      tenantId,
    )
      .then((realId) => {
        setBudgetItemsByGrant((prev) => ({
          ...prev,
          [grantId]: (prev[grantId] ?? []).map((item) => (item.id === tempId ? { ...item, id: realId } : item)),
        }));
        setSaveStatus('saved');
      })
      .catch((err) => {
        console.error('Failed to add budget item:', err);
        setBudgetItemsByGrant((prev) => ({
          ...prev,
          [grantId]: (prev[grantId] ?? []).filter((item) => item.id !== tempId),
        }));
        setSaveStatus('error');
      });
  };

  const updateBudgetItemField = (
    grantId: string,
    itemId: string,
    patch: Partial<Pick<BudgetItem, 'category' | 'label' | 'amount' | 'justification'>>,
  ) => {
    setBudgetItemsByGrant((prev) => ({
      ...prev,
      [grantId]: (prev[grantId] ?? []).map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    }));
    if (itemId.startsWith('temp-')) return; // still being inserted — the insert already carries the initial values
    runPersist(() => updateBudgetItem(itemId, patch));
  };

  const removeBudgetItem = (grantId: string, itemId: string) => {
    setBudgetItemsByGrant((prev) => ({
      ...prev,
      [grantId]: (prev[grantId] ?? []).filter((item) => item.id !== itemId),
    }));
    if (itemId.startsWith('temp-')) return;
    runPersist(() => deleteBudgetItem(itemId));
  };

  const updateOrgField = (grantId: string, dnaLabel: string, value: string) => {
    let updatedOrgInfo: Record<string, OrgInfoField> | null = null;
    setApplications((prev) =>
      prev.map((a) => {
        if (a.grantId !== grantId) return a;
        updatedOrgInfo = { ...a.orgInfo, [dnaLabel]: { value, status: 'verified' } };
        return { ...a, orgInfo: updatedOrgInfo };
      }),
    );
    if (!tenantId || !updatedOrgInfo) return;
    runPersist(() => persistOrgInfo(grantId, updatedOrgInfo!));
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
        recordAlignmentScore,
        updateChecklistItem,
        getBudgetItems,
        addBudgetItem,
        updateBudgetItemField,
        removeBudgetItem,
        updateOrgField,
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
