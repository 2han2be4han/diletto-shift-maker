# Supabase セットアップ手順（ShiftPuzzle）

ShiftPuzzle を Supabase と本接続するための手順です。**一度だけ**実行してください。

---

## 0. 前提

- Supabase プロジェクトが作成済み
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` が `.env.local` に設定済み
- ローカルで `npm run dev` が起動できる状態

---

## 1. マイグレーションを適用

Supabase Dashboard → **SQL Editor** で以下のファイルを **順番に**コピー＆実行してください。

| 順 | ファイル | 内容 |
|---|---|---|
| 1 | `supabase/migrations/0001_initial_schema.sql` | 8 テーブル作成（tenants / staff / children / ...） |
| 2 | `supabase/migrations/0002_comments_and_notifications.sql` | コメント・通知・送り場所テーブル |
| 3 | `supabase/migrations/0003_rls_policies.sql` | RLS ポリシー（全テーブル） |
| 4 | `supabase/migrations/0004_storage.sql` | Storage バケット + ポリシー |
| 5 | `supabase/migrations/0005_auth_trigger.sql` | auth.users ↔ staff 自動リンク |
| 6 | `supabase/migrations/0006_notification_triggers.sql` | コメント→通知トリガー |

※ 全て `if not exists` / `drop … if exists` 付きなので、再実行しても安全です。

---

## 2. 初代 admin ユーザーを作成

1. **Dashboard → Authentication → Users → Add user**  
   - メールアドレス: `admin@your-company.com` （任意）
   - パスワード: 任意の強めのパスワード
   - **"Auto Confirm User"** に✅（メール確認スキップ）
2. 作成されたユーザーの **UUID** をコピー

---

## 3. テナント初期化

`supabase/migrations/0007_seed_first_tenant.sql` を開いて、先頭の `v_tenant_name` / `v_admin_email` / `v_admin_name` を書き換えてから SQL Editor で実行してください。

実行すると、
- `tenants` に事業所が1行作成
- `staff` に初代 admin が作成（`user_id` は auth.users の UUID と自動リンク）

完了すると Notice に `✅ テナント作成: xxx / 初代 admin: admin@your-company.com` が出ます。

---

## 4. 動作確認

```bash
npm run dev
```

ブラウザで `http://localhost:5000/login` を開き、手順 2 のメール＋パスワードでログイン → `/dashboard` に遷移すれば OK。

---

## 5. 職員を招待する

admin としてログイン後、`/settings/staff` で「職員を招待」ボタンから追加できます（メールアドレス・ロール・氏名を入力）。

招待メールが届いた職員はリンクからパスワードを設定 → そのまま `/login` でログインできます。

---

## トラブルシュート

### 「データが取得できない」「ログイン後に `/login` に戻される」
- `.env.local` の URL/キーが正しいか確認
- `staff` テーブルに自分の `user_id` が入った行があるか確認（RLS は staff 行がないと全拒否になる）
- `DEV_SKIP_AUTH=true` を `.env.local` に入れておくと middleware をバイパスできます（開発中の退避用）

### RLS で `permission denied` が出る
- 0003 のポリシーが適用済みか再確認
- `select public.current_tenant_id();` を SQL Editor で実行して自分の tenant_id が返るか確認

### トリガーが動かない
- 0005 / 0006 が適用済みか再確認
- `select tgname from pg_trigger where tgrelid = 'public.comments'::regclass;` で存在確認

---

## ロールの権限まとめ

| 機能 | admin | editor | viewer |
|---|---|---|---|
| 全画面閲覧 | ✅ | ✅ | ✅（設定画面除く） |
| 利用予定/シフト/送迎編集 | ✅ | ✅ | ❌ |
| テナント設定/職員管理/児童管理 | ✅ | ❌ | ❌ |
| 自分の休み希望提出 | ✅ | ✅ | ✅ |
| 他人の休み希望編集 | ✅ | ✅ | ❌ |
| コメント投稿 | ✅ | ✅ | ✅ |
| コメント承認/却下 | ✅ | ❌ | ❌ |
| 児童の送り場所編集 | ✅ | ✅ | ❌ |
