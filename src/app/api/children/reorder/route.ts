import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * POST /api/children/reorder
 * editor 以上: 児童の並び順（display_order）を一括更新
 *
 * body: { orders: [{ id: string, display_order: number }] }
 *
 * 前提:
 *   - すべて同一テナント内の児童 id（RLS で担保）
 *   - display_order は 0,1,2,... と連番を推奨
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  let body: { orders?: Array<{ id?: unknown; display_order?: unknown }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });
  }

  if (!Array.isArray(body.orders)) {
    return NextResponse.json({ error: 'orders は配列である必要があります' }, { status: 400 });
  }

  const updates = body.orders.flatMap((o) => {
    if (typeof o.id !== 'string' || typeof o.display_order !== 'number') return [];
    return [{ id: o.id, display_order: o.display_order }];
  });

  if (updates.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const supabase = await createClient();
  /* RLSで自テナント外のIDは弾かれる。1件ずつUPDATE */
  const results = await Promise.all(
    updates.map((u) =>
      supabase.from('children').update({ display_order: u.display_order }).eq('id', u.id)
    )
  );

  const firstError = results.find((r) => r.error)?.error;
  if (firstError) {
    return NextResponse.json(
      { error: `並び順の更新に失敗しました: ${firstError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, updated: updates.length });
}
