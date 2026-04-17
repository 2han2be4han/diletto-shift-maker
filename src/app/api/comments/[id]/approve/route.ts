import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

/**
 * POST /api/comments/[id]/approve    - 承認（admin）
 * POST /api/comments/[id]/approve?action=reject  - 却下（admin）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('admin');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const action = request.nextUrl.searchParams.get('action') === 'reject' ? 'rejected' : 'approved';

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('comments')
    .update({
      status: action,
      approved_by_staff_id: gate.staff.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: data });
}
