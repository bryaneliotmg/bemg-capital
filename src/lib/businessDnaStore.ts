import { supabase } from './supabase';
import type { DnaField, EvidenceStatus, EditableTabId } from '../data/sampleData';
import { OWNER_FIELD_OPTIONS, blankOwnerFields } from './ownerIdentity';

interface DnaFieldRow {
  tab: string;
  label: string;
  value: string;
  status: string;
  source_label: string;
  multiline: boolean;
  sparkline: boolean;
}

export async function fetchBusinessDnaFields(tenantId: string): Promise<Record<EditableTabId, DnaField[]>> {
  const { data, error } = await supabase
    .from('business_dna_fields')
    .select('tab, label, value, status, source_label, multiline, sparkline')
    .eq('tenant_id', tenantId)
    .order('position');
  if (error) throw error;

  const byTab: Record<EditableTabId, DnaField[]> = {
    identity: [],
    financial: [],
    operating: [],
    growth: [],
    funding: [],
  };
  for (const row of (data ?? []) as DnaFieldRow[]) {
    const tab = row.tab as EditableTabId;
    if (!byTab[tab]) continue;
    byTab[tab].push({
      label: row.label,
      value: row.value,
      status: row.status as EvidenceStatus,
      sourceLabel: row.source_label,
      multiline: row.multiline || undefined,
      sparkline: row.sparkline || undefined,
      options: tab === 'identity' ? OWNER_FIELD_OPTIONS[row.label] : undefined,
    });
  }
  // The owner fields were added after most tenants' Business DNA was seeded, so they're
  // appended here as blank rows rather than backfilled into the table — they only get
  // written when the owner actually saves an answer. They have to live in fieldsByTab
  // (not just render-time) because the section editor saves by index against it.
  const present = new Set(byTab.identity.map((f) => f.label));
  byTab.identity.push(...blankOwnerFields().filter((f) => !present.has(f.label)));
  return byTab;
}

function toRow(tenantId: string, tab: EditableTabId, field: DnaField) {
  return {
    tenant_id: tenantId,
    tab,
    label: field.label,
    value: field.value,
    status: field.status,
    source_label: field.sourceLabel,
    multiline: field.multiline ?? false,
    sparkline: field.sparkline ?? false,
    updated_at: new Date().toISOString(),
    // position defaults to 0 on insert, which would jump a newly-saved owner field to
    // the top of Identity — pinned after every seeded field instead.
    ...(tab === 'identity' && field.label in OWNER_FIELD_OPTIONS
      ? { position: 100 + Object.keys(OWNER_FIELD_OPTIONS).indexOf(field.label) }
      : {}),
  };
}

export async function persistDnaField(tenantId: string, tab: EditableTabId, field: DnaField): Promise<void> {
  const { error } = await supabase
    .from('business_dna_fields')
    .upsert(toRow(tenantId, tab, field), { onConflict: 'tenant_id,tab,label' });
  if (error) throw error;
}

export async function persistDnaFieldsBulk(tenantId: string, tab: EditableTabId, fields: DnaField[]): Promise<void> {
  const rows = fields.map((field) => toRow(tenantId, tab, field));
  const { error } = await supabase.from('business_dna_fields').upsert(rows, { onConflict: 'tenant_id,tab,label' });
  if (error) throw error;
}
