import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 });

  const allowed = ['name', 'grade_type', 'is_active', 'parent_contact', 'home_address'] as const;
  const payload: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) payload[k] = body[k];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('children')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ child: data });
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from('children').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
