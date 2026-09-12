import { supabase } from './supabase';
import type { Application, OpportunityStatus, OpportunityType, OrgInfoField } from '../data/sampleData';
import type { ChecklistItemState } from '../data/checklistItems';
import type { BudgetCategoryId, BudgetItem } from '../data/budgetCategories';

interface ApplicationRow {
  grant_id: string;
  name: string;
  opportunity_type: string;
  status: string;
  outcome_reason: string | null;
  alignment_score: number | null;
  alignment_computed_at: string | null;
  checklist_state: Record<string, ChecklistItemState> | null;
  deadline: string;
  org_info: Record<string, OrgInfoField> | null;
}

interface NarrativeRow {
  grant_id: string;
  section_id: string;
  content: string;
}

export async function fetchApplications(): Promise<Application[]> {
  const { data, error } = await supabase
    .from('applications')
    .select(
      'grant_id, name, opportunity_type, status, outcome_reason, alignment_score, alignment_computed_at, checklist_state, deadline, org_info',
    );
  if (error) throw error;
  return (data ?? []).map((row: ApplicationRow) => ({
    grantId: row.grant_id,
    name: row.name,
    opportunityType: row.opportunity_type as OpportunityType,
    status: row.status as OpportunityStatus,
    outcomeReason: row.outcome_reason,
    alignmentScore: row.alignment_score,
    alignmentComputedAt: row.alignment_computed_at,
    checklistState: row.checklist_state ?? {},
    deadline: row.deadline,
    orgInfo: row.org_info ?? {},
  }));
}

export async function insertApplication(app: Application, tenantId: string): Promise<void> {
  const { error } = await supabase.from('applications').insert({
    grant_id: app.grantId,
    name: app.name,
    opportunity_type: app.opportunityType,
    status: app.status,
    deadline: app.deadline,
    org_info: app.orgInfo,
    tenant_id: tenantId,
  });
  if (error) throw error;
}

export async function persistApplicationStatus(
  grantId: string,
  status: OpportunityStatus,
  outcomeReason?: string | null,
): Promise<void> {
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (outcomeReason !== undefined) update.outcome_reason = outcomeReason;
  const { error } = await supabase.from('applications').update(update).eq('grant_id', grantId);
  if (error) throw error;
}

export async function persistAlignmentScore(grantId: string, score: number): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({ alignment_score: score, alignment_computed_at: new Date().toISOString() })
    .eq('grant_id', grantId);
  if (error) throw error;
}

export async function persistOrgInfo(grantId: string, orgInfo: Record<string, OrgInfoField>): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({ org_info: orgInfo, updated_at: new Date().toISOString() })
    .eq('grant_id', grantId);
  if (error) throw error;
}

export async function persistChecklistState(
  grantId: string,
  checklistState: Record<string, ChecklistItemState>,
): Promise<void> {
  const { error } = await supabase
    .from('applications')
    .update({ checklist_state: checklistState, updated_at: new Date().toISOString() })
    .eq('grant_id', grantId);
  if (error) throw error;
}

export async function fetchNarratives(): Promise<Record<string, Record<string, string>>> {
  const { data, error } = await supabase.from('application_narratives').select('grant_id, section_id, content');
  if (error) throw error;
  const byGrant: Record<string, Record<string, string>> = {};
  for (const row of (data ?? []) as NarrativeRow[]) {
    byGrant[row.grant_id] = byGrant[row.grant_id] ?? {};
    byGrant[row.grant_id][row.section_id] = row.content;
  }
  return byGrant;
}

export async function persistNarrativeSection(
  grantId: string,
  sectionId: string,
  content: string,
  tenantId: string,
): Promise<void> {
  const { error } = await supabase
    .from('application_narratives')
    .upsert(
      { grant_id: grantId, section_id: sectionId, content, tenant_id: tenantId, updated_at: new Date().toISOString() },
      { onConflict: 'grant_id,section_id' },
    );
  if (error) throw error;
}

export async function persistNarrativeBulk(
  grantId: string,
  sections: Record<string, string>,
  tenantId: string,
): Promise<void> {
  const rows = Object.entries(sections).map(([sectionId, content]) => ({
    grant_id: grantId,
    section_id: sectionId,
    content,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from('application_narratives').upsert(rows, { onConflict: 'grant_id,section_id' });
  if (error) throw error;
}

interface BudgetItemRow {
  id: string;
  grant_id: string;
  category: string;
  label: string;
  // supabase-js returns a Postgres `numeric` column as a string, not a number —
  // must convert explicitly or the running total silently string-concatenates.
  amount: string;
  justification: string | null;
  position: number;
}

// Real CRUD, not the composite-upsert shape narratives use — a category can hold
// multiple line items, so there's no natural (grant_id, X) unique key to upsert on;
// each row needs its own id-addressed insert/update/delete.
export async function fetchBudgetItems(): Promise<Record<string, BudgetItem[]>> {
  const { data, error } = await supabase
    .from('application_budget_items')
    .select('id, grant_id, category, label, amount, justification, position')
    .order('position', { ascending: true });
  if (error) throw error;
  const byGrant: Record<string, BudgetItem[]> = {};
  for (const row of (data ?? []) as BudgetItemRow[]) {
    byGrant[row.grant_id] = byGrant[row.grant_id] ?? [];
    byGrant[row.grant_id].push({
      id: row.id,
      grantId: row.grant_id,
      category: row.category as BudgetCategoryId,
      label: row.label,
      amount: Number(row.amount),
      justification: row.justification,
      position: row.position,
    });
  }
  return byGrant;
}

export async function insertBudgetItem(
  item: Omit<BudgetItem, 'id'>,
  tenantId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('application_budget_items')
    .insert({
      grant_id: item.grantId,
      category: item.category,
      label: item.label,
      amount: item.amount,
      justification: item.justification,
      position: item.position,
      tenant_id: tenantId,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateBudgetItem(
  id: string,
  patch: Partial<Pick<BudgetItem, 'category' | 'label' | 'amount' | 'justification'>>,
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.amount !== undefined) update.amount = patch.amount;
  if (patch.justification !== undefined) update.justification = patch.justification;
  const { error } = await supabase.from('application_budget_items').update(update).eq('id', id);
  if (error) throw error;
}

export async function deleteBudgetItem(id: string): Promise<void> {
  const { error } = await supabase.from('application_budget_items').delete().eq('id', id);
  if (error) throw error;
}
