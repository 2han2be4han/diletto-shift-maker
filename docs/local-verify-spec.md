# ローカル検証用 仕様書 — main 最新状態（Phase 25 + 26 統合版）

**対象コミット**: `d9bc15a`（main HEAD、2026-04-17）
**マージ済み内容**:
- Phase 26 + 26.1 — `/shift` ヘッダー / `/transport` 列刷新・日ごと保存 / 招待認証フロー
- Phase 25 B-E — 出欠編集 + 履歴 / シフト変更申請 + 承認キュー / 日次出力 / 職員ソフト削除
**Vercel**: 両マージコミットに `[skip ci]` 付き → 自動デプロイはスキップ済み

---

## 0. 前提

- **本ドキュメントはユーザーのローカル Claude Code セッションに読ませる**ための手順書
- ローカル Claude は CLAUDE.md §2（調査→計画→承認→実装）に従い、本ドキュメントを順番通りに実行
- 新規 Supabase マイグレーション **4 本** が未適用の可能性あり（セクション 4 参照）
- 動作確認完了まで `main` に追加 push 禁止（UI 問題が見つかった場合は新ブランチを切る）

---

## 1. セットアップ（ローカル Claude が順に実行するコマンド）

```bash
# 1-1. main 最新化
git fetch origin main
git checkout main
git pull --ff-only origin main

# 期待: HEAD が d9bc15a （Merge Phase 25 ...）であること
git log --oneline -3

# 1-2. 依存関係の同期（両ブランチで package-lock を触ったため）
npm install

# 1-3. Next.js のビルドキャッシュを完全削除
rm -rf .next

# 1-4. 型チェック（0 エラーなら合格）
npx tsc --noEmit

# 1-5. dev サーバ起動（ユーザーがブラウザで目視確認する）
npm run dev
# → 起動ログで表示される URL（例: http://localhost:3000 or http://localhost:5000）をブラウザで開く
```

---

## 2. main に存在する主な新機能（どのファイルで実装されているか）

### 2-A. Phase 25-A スキーマ基盤
読み込み対象（コードを開く必要はない、リファレンス用）:
- `supabase/migrations/0023_staff_retirement.sql` — 職員ソフト削除 + RLS 退職者除外
- `supabase/migrations/0024_attendance.sql` — 児童出欠カラム + 履歴テーブル + RPC
- `supabase/migrations/0025_shift_change_requests.sql` — シフト変更申請テーブル
- `src/types/index.ts` — `AttendanceStatus`, `AttendanceAuditLogRow`, `ShiftChangeRequestRow`, `StaffRow.is_active/retired_at`

### 2-B. Phase 25-B 認可・セッション
- `src/lib/auth/getCurrentStaff.ts` — `is_active=true` 絞り込み（退職者ログイン不可）
- `src/lib/auth/requireRole.ts` — `requireAuthenticated`, `requireOnDutyAdmin` 追加
- `src/lib/auth/isOnDutyAdmin.ts` — 現在時刻 ∈ admin のシフト内か判定
- `src/lib/dates/nextBusinessDay.ts` — 土日スキップで翌営業日

### 2-C. Phase 25-C 出欠・承認・職員管理
- `src/app/api/schedule-entries/[id]/attendance/route.ts` — 出欠更新（全ロール・RPC経由）
- `src/app/api/attendance-logs/route.ts` — 履歴取得
- `src/app/api/shift-change-requests/route.ts` + `[id]/route.ts` — 申請 CRUD
- `src/app/api/staff/[id]/route.ts` — DELETE → `is_active=false` ソフト削除
- `src/app/(app)/schedule/page.tsx` — モーダルに出欠5段階 UI + 履歴
- `src/components/request/ShiftChangeRequestSection.tsx` — 申請フォーム + 自分の申請一覧
- `src/components/shift/ApprovalQueue.tsx` — admin 承認キュー
- `src/app/(app)/settings/staff/page.tsx` — 退職ボタン/復帰ボタン/退職者表示切替
- `src/app/api/me/route.ts` — `on_duty_admin` フラグ返却

### 2-D. Phase 25-D 日次出力
- `src/app/(app)/output/daily/page.tsx` — 2 カラム（送迎 + 出勤）表示
- `src/app/api/output/daily/pdf/route.ts` — PDF ダウンロード（全ロール）
- `src/components/layout/Sidebar.tsx` — 「日次出力」ナビ追加

### 2-E. Phase 26 /shift ヘッダー整備 + 出勤数カウント
- `src/app/(app)/shift/page.tsx` — Header.actions に再生成/確定/編集モード/確定解除を集約（Phase 25 の `ApprovalQueue` 表示も維持）
- `src/components/shift/ShiftGrid.tsx` — 職員名セルに出勤 N 日 / 公休 / 有給カウント
- `src/app/api/shift-assignments/confirm/route.ts` — `confirmed: boolean` 引数化

### 2-F. Phase 26 /transport 列刷新
- `src/app/(app)/transport/page.tsx` — `pendingChanges` + 日ごと一括保存 + `staffAreaMarksForDay` 集計
- `src/components/transport/TransportDayView.tsx` — 8 列（児童名/迎え時間/迎場所/迎え担当/送り時間/送り場所/送り担当/設定）+ HH:MM 表示 + 候補フィルタ + 保護者送迎バッジ + 担当マーク絵文字
- `src/lib/logic/generateTransport.ts` — `minEndTime` 引数 + `method=self` スキップ
- `src/app/(app)/settings/tenant/page.tsx` — 「送迎担当の最低退勤時刻」入力欄

### 2-G. Phase 26 招待フロー
- `src/app/auth/confirm/page.tsx` — Supabase implicit flow（hash fragment）受け
- `src/app/auth/set-password/page.tsx` — 初回パスワード設定
- `src/app/api/staff/invite/route.ts` — `redirectTo` を `/auth/confirm?next=/auth/set-password` に

---

## 3. 目視確認チェックリスト

ブラウザは **ハードリフレッシュ**（`⌘+Shift+R` / `Ctrl+Shift+R`）してから各画面を確認。

### 3-1. `/shift?month=2026-04`
- [ ] Header 右に MonthSelector + ボタンが **同じ行** に並ぶ
- [ ] 未確定: `[再生成][シフト確定]` / 確定済: `[編集モード][確定解除]`
- [ ] 本文先頭にバッジのみ（旧 h2 年月は削除済み）
- [ ] **admin でログイン時**: `ApprovalQueue` が本文上部に表示（Phase 25-C-7）
- [ ] 職員名の下に「出勤 N 日」表示（Phase 26）
- [ ] 出勤中 admin のときのみ承認ボタンが活性化（それ以外は非活性）

### 3-2. `/transport?month=2026-04`
**期待する列構成（8 列）**:
```
児童名 | 迎え時間 | 迎場所 | 迎え担当 | 送り時間 | 送り場所 | 送り担当 | 設定
```
- [ ] 時刻が `HH:MM` 形式（`10:15:00` ではなく `10:15`）
- [ ] 迎場所 / 送り場所列に絵文字 + 名称 + 住所（Google Maps リンク）
- [ ] 担当 option ラベル: `🌳🍶 本岡 恵` の形式（マーク先頭）
- [ ] 候補: 「出勤 かつ `end_time >= 16:31`」のみ表示
- [ ] 保護者送迎（method=self）行: 「👪 保護者送迎」バッジ、担当ドロップダウン非表示、赤エラーなし
- [ ] 画面下部に「この日の送迎を保存（N件）」ボタン
- [ ] 日付タブ切替時、未保存なら confirm() 警告
- [ ] ブラウザ離脱時 beforeunload 警告

### 3-3. `/schedule?month=2026-04`
- [ ] セルクリック → モーダルに **出欠 5 段階ステータスボタン**（予定/出席/欠席/遅刻/早退）
- [ ] 変更すると履歴インラインパネルに記録が出る（Phase 25-A-2）
- [ ] 全ロール（viewer 含む）で出欠編集可

### 3-4. `/request` — admin / editor でログイン
- [ ] 職員並び替え（`/settings/staff`）が反映される
- [ ] ページ下部に `ShiftChangeRequestSection` — シフト変更申請フォーム + 自分の申請一覧

### 3-5. `/output/daily`（新規・全ロール可）
- [ ] サイドバーに「日次出力」ナビが表示
- [ ] 2 カラム: 左=送迎カード / 右=出勤リスト
- [ ] `attendance_status='absent'` の児童は送迎側から除外
- [ ] 「PDF ダウンロード」ボタン → A4 縦 PDF が取得できる

### 3-6. `/settings/staff`
- [ ] 職員行の末尾に「退職」ボタン（Phase 25-C-8）
- [ ] 「退職者も表示」チェックボックス
- [ ] 退職済み職員に「退職」バッジ + 「復帰」ボタン
- [ ] 物理削除は発生しない（DB 上は `is_active=false`）

### 3-7. `/settings/tenant`
- [ ] 「送迎担当の最低退勤時刻」 time input（デフォルト `16:31`）
- [ ] 保存後に再読込しても保持

### 3-8. 招待フロー（本番メール経由が必要）
- [ ] `/settings/staff` から招待 → 受信メールリンク → `/auth/confirm` → `/auth/set-password`
- [ ] パスワード 2 回入力 → `/dashboard`

---

## 4. 本番 Supabase への適用 TODO

**マイグレーション 4 本が本番 DB に未適用の可能性あり**。Supabase Studio SQL エディタで実行:

| 番号 | ファイル | 内容 |
|---|---|---|
| 0022 | `supabase/migrations/0022_shift_requests_submitted_by.sql` | shift_requests に submitted_by_staff_id 追加（代理入力バッジ用） |
| 0023 | `supabase/migrations/0023_staff_retirement.sql` | staff ソフト削除 + RLS 退職者除外 |
| 0024 | `supabase/migrations/0024_attendance.sql` | schedule_entries 出欠カラム + 履歴テーブル + RPC |
| 0025 | `supabase/migrations/0025_shift_change_requests.sql` | シフト変更申請テーブル + RLS |

**Supabase Auth URL Configuration** にも追加が必要:
- `${SITE_URL}/auth/confirm` — 招待リンクの hash 受けページ

---

## 5. 問題切り分け表

| 症状 | 原因候補 | 対処 |
|---|---|---|
| 古い UI が表示される | ブラウザ JS キャッシュ | シークレットウィンドウで開く。`DevTools → Application → Clear storage` |
| マークが出ない（送迎表） | 児童に送迎パターン未登録 | `/settings/children` でパターン追加 or `pickup_area_labels` 登録 |
| 時刻が `HH:MM:SS` | `.next` キャッシュ残り | `rm -rf .next && npm run dev` |
| 候補ドロップダウンが空 | 当日出勤者なし or 勤務時間未設定 | `/shift` でシフト生成済み確認、職員 `default_start/end_time` 確認 |
| 招待リンクで `auth_callback_failed` | Supabase Auth URL 未登録 | Supabase Dashboard → Auth → URL Configuration に `/auth/confirm` 追加 |
| `/output/daily` でエラー | migration 0024 未適用 | 本番 Supabase で適用 |
| 退職ボタンで 500 | migration 0023 未適用 | 同上 |
| シフト変更申請で 500 | migration 0025 未適用 | 同上 |
| admin なのに承認ボタン非活性 | 現在時刻が admin のシフト外 | `src/lib/auth/isOnDutyAdmin.ts` の判定仕様を確認 |

---

## 6. ローカル Claude への指示（省略禁止）

- **`npm run dev` は前景で走らせる**（ユーザーがブラウザで確認するため止めない）
- 各コマンドの実行結果を都度ユーザーに報告
- `npx tsc --noEmit` でエラーが出たら **実装を中止して** ユーザーに報告
- 目視確認は Claude が勝手に「全部 ✅」と判断しない。ユーザーと 1 項目ずつ確認
- 改善要望があったら新規ブランチを切って対応（main への直接 push 禁止、Vercel デプロイしないようにする場合は `[skip ci]` 付きで）
- 未適用マイグレーションの有無は Supabase Studio で `select version from supabase_migrations.schema_migrations order by version desc limit 10;` で確認

---

## 7. 参考: main のコミット構造

```
main:
  d9bc15a Merge Phase 25 (出欠+シフト変更申請+日次出力) into main [skip ci]
  4d039fa Merge Phase 26: /shift header + /transport bulk-save + invite auth flow [skip ci]
  ... (Phase 25 と Phase 26 はそれぞれ別 branch で開発され、main に順次マージ)
```

両マージコミットに `[skip ci]` 付き → **Vercel は自動デプロイしていません**。
本番リリース時は通常 push（[skip ci] 無し）でデプロイが走ります。
