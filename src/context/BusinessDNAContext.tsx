import { createContext, useContext, useState, type ReactNode } from 'react';
import {
  IDENTITY_FIELDS,
  FINANCIAL_FIELDS,
  OPERATING_FIELDS,
  GROWTH_FIELDS,
  FUNDING_FIELDS,
  type DnaField,
  type DnaTabDef,
} from '../data/sampleData';

export type EditableTabId = Exclude<DnaTabDef['id'], 'readiness'>;

interface BusinessDNAContextValue {
  fieldsByTab: Record<EditableTabId, DnaField[]>;
  editingTab: EditableTabId | null;
  draft: DnaField[] | null;
  startEdit: (tab: EditableTabId) => void;
  cancelEdit: () => void;
  saveEdit: () => void;
  updateDraftValue: (index: number, value: string) => void;
  /** Look up a single field's current (saved, not draft) value by tab + label — used to pre-fill things like grant application fields. */
  getField: (tab: EditableTabId, label: string) => DnaField | undefined;
}

const BusinessDNAContext = createContext<BusinessDNAContextValue | null>(null);

export function BusinessDNAProvider({ children }: { children: ReactNode }) {
  const [fieldsByTab, setFieldsByTab] = useState<Record<EditableTabId, DnaField[]>>({
    identity: IDENTITY_FIELDS,
    financial: FINANCIAL_FIELDS,
    operating: OPERATING_FIELDS,
    growth: GROWTH_FIELDS,
    funding: FUNDING_FIELDS,
  });
  const [editingTab, setEditingTab] = useState<EditableTabId | null>(null);
  const [draft, setDraft] = useState<DnaField[] | null>(null);

  function startEdit(tab: EditableTabId) {
    setEditingTab(tab);
    setDraft(fieldsByTab[tab].map((f) => ({ ...f })));
  }

  function cancelEdit() {
    setEditingTab(null);
    setDraft(null);
  }

  function saveEdit() {
    if (!editingTab || !draft) return;
    const original = fieldsByTab[editingTab];
    const merged = draft.map((f, i) =>
      f.value !== original[i].value
        ? { ...f, status: 'verified' as const, sourceLabel: 'Owner input · just now' }
        : f,
    );
    setFieldsByTab((prev) => ({ ...prev, [editingTab]: merged }));
    setEditingTab(null);
    setDraft(null);
  }

  function updateDraftValue(index: number, value: string) {
    setDraft((prev) => (prev ? prev.map((f, i) => (i === index ? { ...f, value } : f)) : prev));
  }

  function getField(tab: EditableTabId, label: string) {
    return fieldsByTab[tab].find((f) => f.label === label);
  }

  return (
    <BusinessDNAContext.Provider
      value={{ fieldsByTab, editingTab, draft, startEdit, cancelEdit, saveEdit, updateDraftValue, getField }}
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
