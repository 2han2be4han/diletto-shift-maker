import { NextRequest, NextResponse } from 'next/server';
import { parsePdfToSchedule } from '@/lib/anthropic/parsePdf';

/**
 * POST /api/import/pdf
 * PDFファイルをアップロードしてClaude APIで利用予定を解析
 *
 * リクエスト: FormData { file: PDF }
 * レスポンス: { entries: ParsedScheduleEntry[], isMock: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'PDFファイルが送信されていません' },
        { status: 400 }
      );
    }

    /* ファイルタイプチェック */
    if (!file.type.includes('pdf')) {
      return NextResponse.json(
        { error: 'PDF形式のファイルのみアップロードできます' },
        { status: 400 }
      );
    }

    /* ファイルサイズチェック（10MB上限） */
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'ファイルサイズが10MBを超えています' },
        { status: 400 }
      );
    }

    /* PDFをbase64に変換 */
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    /* Claude APIで解析 */
    const result = await parsePdfToSchedule(base64, file.type);

    return NextResponse.json({
      entries: result.entries,
      isMock: result.isMock,
      fileName: file.name,
      entryCount: result.entries.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'PDF解析中に予期しないエラーが発生しました';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
