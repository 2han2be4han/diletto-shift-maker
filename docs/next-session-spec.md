# 次セッション仕様書（2026-04-16作成）

## 前提：現在の状態

### 完了済み
- Phase C（基盤）: デザイントークン、サイドバーレイアウト、Supabase クライアント、認証ミドルウェア（開発中はスキップ）、ログインページ（dilettoブランド）
- Phase D（MVP UI）: 利用予定グリッド、PDFインポート、Excelコピペ、休み希望（管理者一覧+職員提出）、シフト生成+グリッド、送迎割り当て+日別ビュー
- 設定: テナント設定（エリア・資格・締切）、職員管理（資格複数選択）、児童管理（送迎パターン最大5件）、契約管理
- DB: Supabase に8テーブル作成済み（tenants, staff, children, child_transport_patterns, schedule_entries, shift_requests, shift_assignments, transport_assignments）+ RLS

### 未完了・課題
- 全ページがモックデータで動作中（Supabase未接続）
- 認証はDEV_SKIP_AUTHで開発中スキップ中
- Vercel未接続

---

## 1. 送迎パターンの大規模リファクタ

### 背景
現在の児童設定は「児童ごとに個別パターン」だが、実際の運用では：
- **迎え**は学校/保育園単位で共通（同じ学校の子は同じ時間に迎えに行く）
- **送り**も方面グルーピングがある（同じ方面の子をまとめて送る）
- マーク（🍇🌳🏭等）でグルーピングを視覚化
- 1回の送迎で複数マークが並ぶ = 複数方面の子を組み合わせ

### 設計

#### テナント設定に追加する項目

```
迎え共通パターン（テナント全体で共有）:
  id | パターン名     | 時間  | マーク
  1  | 学校（通常）    | 14:20 | 🍇
  2  | 学校（短縮）    | 11:30 | 🍇
  3  | 保育園          | 13:25 | 🌳
  4  | 自宅（午前）    | 10:30 | 🏭
  ...

送り共通パターン（テナント全体で共有）:
  id | パターン名     | 時間  | マーク
  1  | 自宅送り（通常）| 16:00 | -（児童固有マークを使用）
  2  | 自宅送り（遅）  | 17:00 | -
  3  | 大府方面        | 16:40 | 🏭
  ...
```

#### 児童設定の変更

```
児童ごとの設定:
  - 氏名、学年
  - 迎えパターン: 共通パターンから複数選択（その児童に適用されるもの）
  - 送りマーク: 児童固有のエリアマーク（🍇など）
  - 送りパターン: 共通パターンから選択 or 個別設定
```

#### 送迎割り当て表の表示

```
迎え列の表示:
  🍇🌳 = 藤江方面の子 + 豊明方面の子をまとめて迎え
  マークは迎え時間が早い順に左から並べる

送り列の表示:
  🍇 = この子の固有マーク（帰り先エリア）
  複数方面まとめ送りの場合: 🍇🏭
```

### 表示順ルール
- パターン名 → 時間 → マーク の順で表示
- 例: `学校（通常） 14:20 🍇`

### DBの変更（必要に応じて）
- `tenant_pickup_patterns` テーブル新設（共通迎えパターン）
- `tenant_dropoff_patterns` テーブル新設（共通送りパターン）
- `child_transport_patterns` テーブルを拡張（共通パターンへの参照 + 児童固有マーク）

### UI変更箇所
- `/settings/tenant` — 共通パターン管理セクション追加
- `/settings/children` — パターン選択を共通パターンからの選択に変更
- `/transport` — マーク表示をグルーピング対応に
- `/schedule` — グリッドセルにマーク表示

---

## 2. イレギュラー送迎ログ

### 背景
通常の送迎パターンに当てはまらない「この日だけの特殊対応」がある。
例: 「今日だけ保護者が直接送迎」「病院寄りで時間変更」等。

### 設計
- `transport_logs` テーブル新設
  ```
  transport_logs:
    id, tenant_id, schedule_entry_id, date,
    log_type: 'irregular' | 'note' | 'cancel',
    description: text,
    original_pickup_time, actual_pickup_time,
    original_dropoff_time, actual_dropoff_time,
    created_by (staff_id), created_at
  ```
- 送迎表のセルに「メモ」アイコン追加 → クリックでログ入力
- 管理者画面でイレギュラーログの一覧・検索

---

## 3. 学年自動進級

### 背景
毎年4月1日に全児童の学年が自動で+1される。

### 設計
- Supabase Edge Function or cron で毎年 4/1 00:00 JST に実行
- `children.grade_type` を1つ進める
  - preschool → elementary_1
  - elementary_1 → elementary_2
  - ... → elementary_6 → junior_high
  - junior_high → 自動で `is_active: false`（卒業扱い）
- 進級ログを記録（誰が何年生から何年生になったか）
- 手動で「今すぐ進級実行」ボタンも設置（テナント設定画面）

---

## 4. Supabase Auth 接続

### 背景
現在は DEV_SKIP_AUTH で全ページアクセス可能。本番運用にはAuth接続が必要。

### 実装項目
1. ログインページ（`/login`）で `supabase.auth.signInWithPassword` を接続
2. ミドルウェアの DEV_SKIP_AUTH を削除
3. セッションからtenant_id を取得して全APIルートで使用
4. Supabase Auth の user_metadata に tenant_id と staff_id を格納
5. ユーザー招待フロー（管理者が職員をメールで招待）

### 注意
- `lib/supabase/server.ts` は変更時にユーザーに報告（CLAUDE.md §6）
- RLSポリシーが正しく動作するかテスト必須

---

## 5. Supabase データ連携

### 背景
現在は全ページがモックデータ。DBのテーブルは作成済みだが未接続。

### 実装順序（依存関係順）
1. テナント設定 → `tenants` テーブル読み書き
2. 職員管理 → `staff` テーブル読み書き
3. 児童管理 → `children` + `child_transport_patterns` 読み書き
4. 利用予定 → `schedule_entries` 読み書き
5. 休み希望 → `shift_requests` 読み書き
6. シフト生成 → `shift_assignments` 読み書き
7. 送迎割り当て → `transport_assignments` 読み書き

### 各ページの変更
- モックデータ（`const MOCK_*`）→ `useEffect` で Supabase から fetch
- 保存ボタン → Supabase に upsert
- 生成ボタン → APIルートを呼び出し → DBに保存 → 画面をリフレッシュ

---

## 6. その他の改善（優先度低）

### テナント設定の送迎エリアマーク
- 現在ハードコードの `MOCK_AREAS` → テナント設定から取得
- テナント設定で追加/削除 → 児童設定・職員設定に自動反映

### ダッシュボード
- 今月のサマリー（利用児童数、シフト状況、送迎割り当て状況）
- 直近の送迎表プレビュー
- 警告（人員不足日、未割当、休み希望未提出者）

### Excelコピペのグリッドプレビュー進化
- テキストエリア → グリッド表示（実装済み）のさらなるUX改善
- セル直接編集の操作性向上

### Stripe連携
- Stripe Checkout → テナント有効化
- Webhook → subscription status 更新
- billing ページで Stripe Customer Portal リンク

---

## 実装優先順位（推奨）

```
1. 送迎パターンリファクタ（最重要・設計変更が大きい）
2. Supabase Auth接続（本番運用に必須）
3. Supabase データ連携（モック→実データ）
4. イレギュラー送迎ログ
5. 学年自動進級
6. その他改善
```

---

## 開発ルール（引き継ぎ）
- **CLAUDE.md を必ず読んでから着手**
- **いきなり実装禁止**: 調査 → 計画 → 承認 → 実装
- **進捗表**: `docs/progress.html` を更新必須
- **参照マップ**: `reference-map.md` を更新必須
- **コミット**: 5回に1回でOK
- **ローカル確認**: localhost:5000（`npm run dev`）で必ず確認
- **Vercel**: まだ接続しない
- **デザイン**: diletto design rulebook準拠（ライトテーマ）
- **pushはOK**: `git push origin main`
