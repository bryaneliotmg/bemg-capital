// Standard SF-424A budget categories — the same breakdown virtually every federal
// grant budget form uses, so line items entered here map directly onto what an
// applicant will eventually re-key into the official form.
export const BUDGET_CATEGORIES = [
  { id: 'personnel', label: 'Personnel' },
  { id: 'fringe', label: 'Fringe Benefits' },
  { id: 'travel', label: 'Travel' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'supplies', label: 'Supplies' },
  { id: 'contractual', label: 'Contractual' },
  { id: 'other_direct', label: 'Other Direct Costs' },
  { id: 'indirect', label: 'Indirect Costs' },
] as const;

export type BudgetCategoryId = (typeof BUDGET_CATEGORIES)[number]['id'];

export function budgetCategoryLabel(id: string): string {
  return BUDGET_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export interface BudgetItem {
  id: string;
  grantId: string;
  category: BudgetCategoryId;
  label: string;
  amount: number;
  justification: string | null;
  position: number;
}
