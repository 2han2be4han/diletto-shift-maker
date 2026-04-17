import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { getDaysInMonth } from 'date-fns';

/**
 * POST /api/shift-assignments/confirm
 *   body: { year, month }
 *   指定月の shift_assignments を is_confirmed=true に
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  const year = Number(body?.year);
  const month = Number(body?.month);
  if (!year || !month) {
    return NextResponse.json({ error: 'year, month は必須です' }, { status: 400 });
  }

  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = getDaysInMonth(new Date(year, month - 1));
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const supabase = await createClient();
  const { error } = await supabase
    .from('shift_assignments')
    .update({ is_confirmed: true })
    .gte('date', from)
    .lte('date', to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
