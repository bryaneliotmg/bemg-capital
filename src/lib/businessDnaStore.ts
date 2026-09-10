import { supabase } from './supabase';
import type { DnaField, EvidenceStatus, EditableTabId } from '../data/sampleData';

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
    });
  }
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
