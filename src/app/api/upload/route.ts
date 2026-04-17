import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/requireRole';
import { COMMENT_IMAGES_BUCKET, CHILD_LOCATION_IMAGES_BUCKET } from '@/types';

/**
 * POST /api/upload
 *  FormData: file (File), bucket ('comment-images' | 'child-location-images'), subpath (string)
 *  tenant_id は認証済み staff から強制
 *  成功時: { storage_path }
 */
export async function POST(request: NextRequest) {
  const gate = await requireRole('viewer');
  if (!gate.ok) return gate.response;

  const formData = await request.formData();
  const file = formData.get('file');
  const bucket = String(formData.get('bucket') ?? '');
  const subpath = String(formData.get('subpath') ?? 'misc');

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'file がありません' }, { status: 400 });
  }
  if (bucket !== COMMENT_IMAGES_BUCKET && bucket !== CHILD_LOCATION_IMAGES_BUCKET) {
    return NextResponse.json({ error: 'bucket が不正です' }, { status: 400 });
  }

  /* 送り場所画像は editor 以上のみ書き込み可能 */
  if (bucket === CHILD_LOCATION_IMAGES_BUCKET && gate.staff.role === 'viewer') {
    return NextResponse.json({ error: '送り場所の画像を登録する権限がありません' }, { status: 403 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: '画像サイズが10MBを超えています' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const storage_path = `${gate.staff.tenant_id}/${subpath}/${filename}`;

  const supabase = await createClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storage_path, buf, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ storage_path });
}
