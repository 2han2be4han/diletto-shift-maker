import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';

export async function GET() {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const supabase = await createClient();
  /* display_order が NULL のレコードは末尾、その後 created_at ASC で安定ソート */
  const { data: children, error: cErr } = await supabase
    .from('children')
    .select('*')
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const { data: patterns, error: pErr } = await supabase
    .from('child_transport_patterns')
    .select('*');
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  return NextResponse.json({ children, patterns });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('editor');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.grade_type) {
    return NextResponse.json({ error: '氏名と学年は必須です' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('children')
    .insert({
      tenant_id: gate.staff.tenant_id,
      name: body.name,
      grade_type: body.grade_type,
      is_active: body.is_active ?? true,
      parent_contact: body.parent_contact ?? null,
      home_address: body.home_address ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ child: data });
}
