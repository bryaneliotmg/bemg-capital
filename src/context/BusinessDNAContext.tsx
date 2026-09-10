import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DnaField } from '../data/sampleData';
import type { EditableTabId } from '../data/sampleData';
import { fetchBusinessDnaFields, persistDnaField } from '../lib/businessDnaStore';
import { useAuth } from './AuthContext';

export type { EditableTabId };

const EMPTY_FIELDS: Record<EditableTabId, DnaField[]> = {
  identity: [],
  financial: [],
  operating: [],
  growth: [],
  funding: [],
};

interface BusinessDNAContextValue {
  fieldsByTab: Record<EditableTabId, DnaField[]>;
  loading: boolean;
  editingTab: EditableTabId | null;
  draft: DnaField[] | null;
  startEdit: (tab: EditableTabId) => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  updateDraftValue: (index: number, value: string) => void;
  /** Look up a single field's current (saved, not draft) value by tab + label — used to pre-fill things like grant application fields. */
  getField: (tab: EditableTabId, label: string) => DnaField | undefined;
  /** Save one field directly, outside the section-wide edit/draft flow — for quick inline fixes (e.g. from an Application page). */
  setFieldValue: (tab: EditableTabId, label: string, value: string) => void;
}

const BusinessDNAContext = createContext<BusinessDNAContextValue | null>(null);

export function BusinessDNAProvider({ children }: { children: ReactNode }) {
  const { activeTenantId } = useAuth();
  const [fieldsByTab, setFieldsByTab] = useState<Record<EditableTabId, DnaField[]>>(EMPTY_FIELDS);
  const [loading, setLoading] = useState(true);
  const [editingTab, setEditingTab] = useState<EditableTabId | null>(null);
  const [draft, setDraft] = useState<DnaField[] | null>(null);

  useEffect(() => {
    if (!activeTenantId) {
      setFieldsByTab(EMPTY_FIELDS);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setEditingTab(null);
    setDraft(null);
    fetchBusinessDnaFields(activeTenantId)
      .then((data) => {
        if (!cancelled) setFieldsByTab(data);
      })
      .catch((err) => console.error('Failed to load Business DNA:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTenantId]);

  function startEdit(tab: EditableTabId) {
    setEditingTab(tab);
    setDraft(fieldsByTab[tab].map((f) => ({ ...f })));
  }

  function cancelEdit() {
    setEditingTab(null);
    setDraft(null);
  }

  function saveEdit() {
    if (!editingTab || !draft || !activeTenantId) return;
    const original = fieldsByTab[editingTab];
    const merged = draft.map((f, i) =>
      f.value !== original[i].value ? { ...f, status: 'verified' as const, sourceLabel: 'Owner input · just now' } : f,
    );
    setFieldsByTab((prev) => ({ ...prev, [editingTab]: merged }));
    const changedTab = editingTab;
    setEditingTab(null);
    setDraft(null);
    merged.forEach((field, i) => {
      if (field.value === original[i].value) return;
      persistDnaField(activeTenantId, changedTab, field).catch((err) =>
        console.error('Failed to save Business DNA field:', err),
      );
    });
  }

  function updateDraftValue(index: number, value: string) {
    setDraft((prev) => (prev ? prev.map((f, i) => (i === index ? { ...f, value } : f)) : prev));
  }

  function getField(tab: EditableTabId, label: string) {
    return fieldsByTab[tab].find((f) => f.label === label);
  }

  function setFieldValue(tab: EditableTabId, label: string, value: string) {
    if (!activeTenantId) return;
    const updated: DnaField = {
      ...(fieldsByTab[tab].find((f) => f.label === label) ?? { label, value: '', status: 'required', sourceLabel: '' }),
      value,
      status: 'verified',
      sourceLabel: 'Owner input · just now',
    };
    setFieldsByTab((prev) => ({
      ...prev,
      [tab]: prev[tab].map((f) => (f.label === label ? updated : f)),
    }));
    persistDnaField(activeTenantId, tab, updated).catch((err) => console.error('Failed to save Business DNA field:', err));
  }

  return (
    <BusinessDNAContext.Provider
      value={{
        fieldsByTab,
        loading,
        editingTab,
        draft,
        startEdit,
        cancelEdit,
        saveEdit,
        updateDraftValue,
        getField,
        setFieldValue,
      }}
    >
      {children}
    </BusinessDNAContext.Provider>
  );
}

export function useBusinessDNA() {
  const ctx = useContext(BusinessDNAContext);
  if (!ctx) throw new Error('useBusinessDNA must be used within a BusinessDNAProvider');
  return ctx;
}
