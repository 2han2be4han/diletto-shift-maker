import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * Phase 35: 日次出力カードの児童 DnD 並び順学習記憶
 *
 * GET  /api/transport/child-order
 *   同テナントの memory rows を全件返す（数百行想定なので軽量）。
 *
 * POST /api/transport/child-order
 *   { signature: string, orders: Array<{ child_id: string, display_order: number }> }
 *   指定 signature 配下を upsert（onConflict: tenant_id+signature+child_id）。
 *
 * 権限: viewer 含む全ロール可（出欠と同じく現場運用前提）。
 */

export async function GET() {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('child_display_order_memory')
    .select('*')
    .order('slot_signature', { ascending: true })
    .order('display_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const signature: unknown = body?.signature;
  const orders: unknown = body?.orders;

  if (typeof signature !== 'string' || signature.length === 0) {
    return NextResponse.json({ error: 'signature が必要です' }, { status: 400 });
  }
  if (!Array.isArray(orders) || orders.length === 0) {
    return NextResponse.json({ error: 'orders が必要です' }, { status: 400 });
  }

  const rows: Array<{
    tenant_id: string;
    slot_signature: string;
    child_id: string;
    display_order: number;
    updated_at: string;
  }> = [];
  const now = new Date().toISOString();
  const seenChildIds = new Set<string>();
  for (const o of orders) {
    const childId = (o as { child_id?: unknown })?.child_id;
    const order = (o as { display_order?: unknown })?.display_order;
    if (typeof childId !== 'string' || childId.length === 0) continue;
    if (typeof order !== 'number' || !Number.isFinite(order)) continue;
    if (seenChildIds.has(childId)) continue;
    seenChildIds.add(childId);
    rows.push({
      tenant_id: gate.staff.tenant_id,
      slot_signature: signature,
      child_id: childId,
      display_order: Math.trunc(order),
      updated_at: now,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: '有効な orders がありません' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('child_display_order_memory')
    .upsert(rows, { onConflict: 'tenant_id,slot_signature,child_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: rows.length });
}
