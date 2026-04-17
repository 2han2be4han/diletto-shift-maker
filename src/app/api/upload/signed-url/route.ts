import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { COMMENT_IMAGES_BUCKET, CHILD_LOCATION_IMAGES_BUCKET } from '@/types';

/**
 * GET /api/upload/signed-url?bucket=...&path=...
 *  非公開 bucket の画像を表示するための署名付き URL を発行（1時間有効）
 */
export async function GET(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const bucket = request.nextUrl.searchParams.get('bucket') ?? '';
  const path = request.nextUrl.searchParams.get('path') ?? '';

  if (bucket !== COMMENT_IMAGES_BUCKET && bucket !== CHILD_LOCATION_IMAGES_BUCKET) {
    return NextResponse.json({ error: 'bucket が不正です' }, { status: 400 });
  }
  if (!path.startsWith(`${gate.staff.tenant_id}/`)) {
    return NextResponse.json({ error: 'アクセス権がありません' }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'URL 発行失敗' }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl });
}
