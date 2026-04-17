# docs/error-log.md

> ShiftPuzzle プロジェクトのエラーログ  
> 初版: 2026-04-15 / エラー未発生・実装はこれから

---

## このファイルの目的

実装中に発生したエラーと解決方法を記録する。同じエラーで二度詰まらないための学習ログ。Claude Codeはエラー解決のたびに必ずこのファイルに記録すること。

---

## 記録フォーマット（テンプレート）

---
## [エラー名 or 現象の一言説明]

- **発生日**: YYYY-MM-DD
- **発生箇所**: ファイル名・関数名・行番号
- **エラー内容**: 実際のエラーメッセージをそのまま記載
- **原因**: なぜ発生したか
- **解決方法**: 何をしたら直ったか（コードスニペット含む）
- **再発防止**: 同じエラーを起こさないために注意すること
---

---

## エラーログ一覧

---
## データ取得不可（全ページで /login にリダイレクトループ）

- **発生日**: 2026-04-16
- **発生箇所**: `src/middleware.ts` / 全 `(app)/*` ページ
- **エラー内容**: ログイン画面から進めず、全画面で「データが取得できない」状態。`NEXT_PUBLIC_SUPABASE_URL` 等を変えても解消しない。
- **原因**: コミット f3015bd（UIリファクタ）で middleware 冒頭の `DEV_SKIP_AUTH` 早期 return が削除され、開発中でも Supabase Auth を強制チェックするようになった。Supabase 接続がない開発環境では `supabase.auth.getUser()` が常に null を返し、全ルートが `/login` にリダイレクトされ続ける。
- **解決方法**: middleware の先頭に `if (DEV_SKIP_AUTH) return NextResponse.next();` を復活させ、開発モードでは認証をスキップするように戻した。
- **再発防止**: DEV_SKIP_AUTH を定義したまま使用箇所だけ削除しない。Supabase Auth 本番接続のタイミングで定数ごと削除する（次セッション仕様書 §4）。

---
## 静的エクスポート (output:'export' + basePath) でアプリが壊れる

- **発生日**: 2026-04-16
- **発生箇所**: `next.config.ts`, `.github/workflows/deploy.yml`
- **エラー内容**: GitHub Pages デプロイ用に `output: 'export'` と `basePath: '/diletto-shift-maker'` を追加した結果、API ルート（`/api/import/pdf` 等）が静的エクスポートで落ち、ログイン後の遷移・PDF解析・シフト生成がすべて失敗。ビルドも `Failed to type check` や prerender エラーで転ぶ。
- **原因**: 本プロジェクトは API ルート・middleware・Supabase Cookieセッションを前提にした Next.js アプリのため、静的エクスポートでは動作しない。デプロイ先は Vercel を想定（SPEC §技術スタック／次セッション仕様書 §前提）。
- **解決方法**:
  1. `next.config.ts` から `output: 'export'` と `basePath` を削除。
  2. `.github/workflows/deploy.yml` を削除。
  3. 型エラー（`dailyCounts` 未定義、`media_type` の文字列型不一致）を本体ロジック側で修正。
- **再発防止**: API ルート・middleware を持つ Next.js アプリに `output: 'export'` を付けない。GitHub Pages ではなく Vercel にデプロイする（CLAUDE.md §1 技術スタック）。

---
## prerender 時に Supabase クライアント初期化で落ちる

- **発生日**: 2026-04-16
- **発生箇所**: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/middleware.ts`, `src/app/(auth)/login/page.tsx`
- **エラー内容**: `next build` 時に `@supabase/ssr: Your project's URL and API key are required to create a Supabase client!` が発生。
- **原因**: `NEXT_PUBLIC_SUPABASE_URL!` のように非null アサーションで env を読んでおり、env 未設定のビルド環境でモジュール評価時に throw していた。ログインページは `'use client'` でも component body は prerender 時に実行される。
- **解決方法**:
  1. Supabase クライアント生成を env 未設定時はプレースホルダ URL にフォールバック。
  2. ログインページの `createClient()` を handler 内に移動し、レンダリング時ではなくサインイン時に評価するようにした。
- **再発防止**: `NEXT_PUBLIC_*` でも「必ず設定されている」前提の `!` は使わない。プリレンダリングでコンポーネント本体が走ることを忘れない。

---

## 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-04-15 | 初版作成。エラー未発生・実装はこれから |
| 2026-04-16 | GitHub Pages 静的エクスポート導入で壊れた認証・データ取得・ビルドの3件を記録／復旧 |
| 2026-04-17 | Supabase 本接続（Phase 1-9 完了）。migrations 0001-0009、RLS、認証、個別ログイン、ロール別ダッシュボード、送り場所、コメント承認、通知ベルまで実装 |
