import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * Phase 60: 同テナント全児童の child_area_eligible_staff を一括取得。
 * 送迎表画面で対応外職員の警告表示に使う。
 */
export async function GET(_: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('child_area_eligible_staff')
    .select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
