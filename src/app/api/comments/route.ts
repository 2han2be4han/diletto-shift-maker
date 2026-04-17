import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import type { CommentTargetType } from '@/types';

/**
 * GET /api/comments?target_type=...&target_id=...
 *   指定ターゲットのコメント一覧（画像パスも込み）
 * POST /api/comments
 *   新規コメント（status=pending で作成）
 */

export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const target_type = request.nextUrl.searchParams.get('target_type') as CommentTargetType | null;
  const target_id = request.nextUrl.searchParams.get('target_id');

  const supabase = await createClient();
  let q = supabase
    .from('comments')
    .select('*, staff:author_staff_id(name), comment_images(id, storage_path)')
    .order('created_at', { ascending: true });
  if (target_type) q = q.eq('target_type', target_type);
  if (target_id) q = q.eq('target_id', target_id);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => null);
  if (!body?.target_type || !body?.target_id || !body?.body) {
    return NextResponse.json(
      { error: 'target_type, target_id, body は必須です' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: comment, error } = await supabase
    .from('comments')
    .insert({
      tenant_id: gate.staff.tenant_id,
      author_staff_id: gate.staff.id,
      target_type: body.target_type,
      target_id: body.target_id,
      body: body.body,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* 画像がある場合は comment_images に insert */
  const imagePaths: string[] = Array.isArray(body.image_storage_paths) ? body.image_storage_paths : [];
  if (imagePaths.length > 0) {
    await supabase.from('comment_images').insert(
      imagePaths.map((p) => ({ comment_id: comment.id, storage_path: p }))
    );
  }

  return NextResponse.json({ comment });
}
