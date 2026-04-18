# docs/reference-map.md

> ShiftPuzzle プロジェクトの参照マップ  
> 初版: 2026-04-15

---

## 1. DBテーブル・カラム参照

### tenants
| カラム | 型 | 参照ファイル |
|---|---|---|
| id | uuid | `src/types/index.ts` (TenantRow) |
| name | text | `src/types/index.ts` (TenantRow) |
| stripe_customer_id | text | `src/types/index.ts` (TenantRow) |
| stripe_subscription_id | text | `src/types/index.ts` (TenantRow) |
| status | text | `src/types/index.ts` (TenantRow) |
| created_at | timestamptz | `src/types/index.ts` (TenantRow) |

### staff
| カラム | 型 | 参照ファイル |
|---|---|---|
| id | uuid | `src/types/index.ts` (StaffRow) |
| tenant_id | uuid | `src/types/index.ts` (StaffRow) |
| user_id | uuid | `src/types/index.ts` (StaffRow) |
| name | text | `src/types/index.ts` (StaffRow) |
| email | text | `src/types/index.ts` (StaffRow) |
| role | text | `src/types/index.ts` (StaffRow, StaffRole) |
| employment_type | text | `src/types/index.ts` (StaffRow, EmploymentType) |
| default_start_time | time | `src/types/index.ts` (StaffRow) |
| default_end_time | time | `src/types/index.ts` (StaffRow) |
| transport_areas | text[] | `src/types/index.ts` (StaffRow)。**旧・後方互換**（Phase 27-D 以降は pickup_/dropoff_ を使用） |
| pickup_transport_areas | text[] | Phase 27-D 追加。`src/types/index.ts` (StaffRow), `src/lib/logic/generateTransport.ts`（迎担当フィルタ）, `src/app/api/staff/*`（POST/PATCH/invite で受け入れ） |
| dropoff_transport_areas | text[] | Phase 27-D 追加。`src/types/index.ts` (StaffRow), `src/lib/logic/generateTransport.ts`（送担当フィルタ）, `src/app/api/staff/*`（POST/PATCH/invite で受け入れ） |
| is_qualified | boolean | `src/types/index.ts` (StaffRow) |
| created_at | timestamptz | `src/types/index.ts` (StaffRow) |
| last_invited_at | timestamptz | `src/app/api/staff/invite/route.ts`, `src/app/api/staff/[id]/resend-invite/route.ts`（招待クールダウン判定） |

### children
| カラム | 型 | 参照ファイル |
|---|---|---|
| id | uuid | `src/types/index.ts` (ChildRow) |
| tenant_id | uuid | `src/types/index.ts` (ChildRow) |
| name | text | `src/types/index.ts` (ChildRow) |
| grade_type | text | `src/types/index.ts` (ChildRow, GradeType) |
| is_active | boolean | `src/types/index.ts` (ChildRow) |
| display_order | integer | `src/types/index.ts` (ChildRow), `src/app/api/children/route.ts` (ORDER BY), `src/app/api/children/reorder/route.ts`, `src/app/(app)/settings/children/page.tsx` (DnD 並び替え) |
| home_address | text | `src/types/index.ts` (ChildRow), `src/app/api/children/route.ts` (POST), `[id]/route.ts` (PATCH), `src/app/(app)/settings/children/page.tsx` (入力UI + 送り住所fallback), `src/app/(app)/transport/page.tsx` (送迎表表示時fallback) |
| pickup_area_labels | text[] | `src/types/index.ts` (ChildRow), `src/app/api/children/route.ts`, `[id]/route.ts`, `src/app/(app)/settings/children/page.tsx` (マーク複数選択 UI), Phase 21 ド王仕様 |
| dropoff_area_labels | text[] | `src/types/index.ts` (ChildRow), `src/app/api/children/route.ts`, `[id]/route.ts`, `src/app/(app)/settings/children/page.tsx`, `src/lib/logic/resolveTransportSpec.ts`, Phase 27 追加 |
| custom_pickup_areas | jsonb (AreaLabel[]) | `src/types/index.ts` (ChildRow), `src/app/api/children/route.ts` + `[id]/route.ts` (sanitize), `src/lib/logic/resolveTransportSpec.ts` (mergeAreas), `src/components/schedule/PdfImportModal.tsx` (assignMarks マージ), `src/components/schedule/PdfConfirmTable.tsx` (警告抑制), `src/app/(app)/settings/children/page.tsx` (CustomAreasEditor), Phase 28 A案 追加 (migration 0029) |
| custom_dropoff_areas | jsonb (AreaLabel[]) | 上記 custom_pickup_areas と同じ参照セット。送り側用。Phase 28 A案 追加 (migration 0029) |
| created_at | timestamptz | `src/types/index.ts` (ChildRow) |

### child_transport_patterns
| カラム | 型 | 参照ファイル |
|---|---|---|
| id | uuid | `src/types/index.ts` (ChildTransportPatternRow) |
| child_id | uuid | `src/types/index.ts` (ChildTransportPatternRow) |
| tenant_id | uuid | `src/types/index.ts` (ChildTransportPatternRow) |
| pattern_name | text | `src/types/index.ts` (ChildTransportPatternRow) |
| pickup_location | text | `src/types/index.ts` (ChildTransportPatternRow) |
| pickup_time | time | `src/types/index.ts` (ChildTransportPatternRow) |
| dropoff_location | text | `src/types/index.ts` (ChildTransportPatternRow) |
| dropoff_time | time | `src/types/index.ts` (ChildTransportPatternRow) |
| area_label | text | `src/types/index.ts` (ChildTransportPatternRow)。旧：パターン全体に 1 つのエリア。後方互換のため残置 |
| pickup_area_label | text | `src/types/index.ts`, `src/app/(app)/settings/children/page.tsx`, `src/app/api/children/[id]/patterns/route.ts` — 迎のエリア |
| dropoff_area_label | text | `src/types/index.ts`, `src/app/(app)/settings/children/page.tsx`, `src/app/api/children/[id]/patterns/route.ts` — 送のエリア |
| created_at | timestamptz | `src/types/index.ts` (ChildTransportPatternRow) |

### schedule_entries
| カラム | 型 | 参照ファイル |
|---|---|---|
| id | uuid | （未実装） |
| tenant_id | uuid | （未実装） |
| child_id | uuid | （未実装） |
| date | date | （未実装） |
| pickup_time | time | （未実装） |
| dropoff_time | time | （未実装） |
| pattern_id | uuid | （未実装） |
| is_confirmed | boolean | （未実装） |
| created_at | timestamptz | （未実装） |

### shift_requests
| カラム | 型 | 参照ファイル |
|---|---|---|
| id | uuid | （未実装） |
| tenant_id | uuid | （未実装） |
| staff_id | uuid | （未実装） |
| month | date | （未実装） |
| request_type | text | （未実装） |
| dates | date[] | （未実装） |
| notes | text | （未実装） |
| submitted_at | timestamptz | （未実装） |

### shift_assignments
| カラム | 型 | 参照ファイル |
|---|---|---|
| id | uuid | （未実装） |
| tenant_id | uuid | （未実装） |
| staff_id | uuid | （未実装） |
| date | date | （未実装） |
| start_time | time | （未実装） |
| end_time | time | （未実装） |
| assignment_type | text | （未実装） |
| is_confirmed | boolean | （未実装） |
| created_at | timestamptz | （未実装） |

### transport_assignments
| カラム | 型 | 参照ファイル |
|---|---|---|
| id | uuid | （未実装） |
| tenant_id | uuid | （未実装） |
| schedule_entry_id | uuid | （未実装） |
| pickup_staff_ids | uuid[] | （未実装） |
| dropoff_staff_ids | uuid[] | （未実装） |
| is_confirmed | boolean | （未実装） |
| is_unassigned | boolean | （未実装） |
| created_at | timestamptz | （未実装） |

---

## 2. ロール参照

| ロール名文字列 | 定義場所 | 参照ファイル |
|---|---|---|
| `'admin'` | `src/types/index.ts` (StaffRole) | DB: staff.role CHECK制約 |
| `'editor'` | `src/types/index.ts` (StaffRole) | DB: staff.role CHECK制約 |
| `'viewer'` | `src/types/index.ts` (StaffRole) | DB: staff.role CHECK制約 |

---

## 3. 主要定数・列挙値

| 定数名 | 値 | 定義ファイル | 参照ファイル |
|---|---|---|---|
| `MAX_STAFF_PER_TRANSPORT` | `2` | `types/index.ts` | （未実装） |
| `DEFAULT_MIN_QUALIFIED_STAFF` | `2` | `types/index.ts` | （未実装） |
| `TRANSPORT_GROUP_TIME_WINDOW_MINUTES` | `30` | `lib/logic/generateTransport.ts` | （未実装） |
| `CLAUDE_MODEL` | `'claude-sonnet-4-20250514'` | `lib/anthropic/parsePdf.ts` | （未実装） |
| `CLAUDE_MAX_TOKENS` | `4000` | `lib/anthropic/parsePdf.ts` | （未実装） |

---

## 4. 型定義の依存チェーン

| 型名 | 定義ファイル | 利用箇所 |
|---|---|---|
| `TenantRow` | `src/types/index.ts` | （未実装） |
| `StaffRow` | `src/types/index.ts` | （未実装） |
| `StaffRole` | `src/types/index.ts` | （未実装） |
| `EmploymentType` | `src/types/index.ts` | （未実装） |
| `ChildRow` | `src/types/index.ts` | （未実装） |
| `GradeType` | `src/types/index.ts` | （未実装） |
| `ChildTransportPatternRow` | `src/types/index.ts` | （未実装） |

---

## 5. APIルート ↔ 呼び出し元

| APIルート | メソッド | 呼び出し元 |
|---|---|---|
| `/api/import/pdf` | POST | （未実装） |
| `/api/shift/generate` | POST | （未実装） |
| `/api/transport/generate` | POST | （未実装） |
| `/api/transport/confirm` | POST | （未実装） |
| `/api/webhooks/stripe` | POST | Stripe（外部） |

---

## 6. 環境変数

| 変数名 | 用途 | 公開可否 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | 公開可（NEXT_PUBLIC） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase匿名キー | 公開可（NEXT_PUBLIC） |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase管理キー | **秘密（サーバーのみ）** |
| `ANTHROPIC_API_KEY` | Claude API | **秘密（サーバーのみ）** |
| `STRIPE_SECRET_KEY` | Stripe秘密キー | **秘密（サーバーのみ）** |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook署名 | **秘密（サーバーのみ）** |
| `STRIPE_PRICE_ID` | StripeサブスクリプションPrice ID | **秘密（サーバーのみ）** |
| `NEXT_PUBLIC_APP_URL` | アプリのURL（Stripe redirect用） | 公開可（NEXT_PUBLIC） |
| `RESEND_API_KEY` | Resend APIキー（職員招待メール送信） | **秘密（サーバーのみ）** |
| `RESEND_FROM_EMAIL` | 招待メールの送信元（Resend検証済みドメイン必須） | **秘密（サーバーのみ）** |
| `RESEND_FROM_NAME` | 送信者表示名 | **秘密（サーバーのみ）** |

---

## 7. ファイル ↔ 役割

| ファイル | 役割 |
|---|---|
| `src/lib/supabase/client.ts` | ブラウザ用Supabaseクライアント（anon key） |
| `src/lib/supabase/server.ts` | サーバー用Supabaseクライアント（anon key + Cookie / service_role） |
| `src/middleware.ts` | 認証ミドルウェア（未認証→/login、認証済み→/dashboard） |
| `src/components/ui/Button.tsx` | ボタン4バリアント（Primary/Secondary/CTA Submit/App Card CTA） |
| `src/components/ui/Modal.tsx` | モーダル共通コンポーネント |
| `src/components/ui/Badge.tsx` | バッジ5バリアント（success/warning/error/info/neutral） |
| `src/components/layout/Sidebar.tsx` | サイドバーナビ（幅調整可・タブレット折りたたみ） |
| `src/components/layout/Header.tsx` | ページヘッダー（ハンバーガーメニュー付き） |
| `src/app/(app)/layout.tsx` | アプリ共通レイアウト（サイドバー+メイン） |
| `src/app/(auth)/login/page.tsx` | ログインページ（dilettoブランドスプリット） |
| `src/lib/email/resend.ts` | Resend SDKクライアント初期化（サーバ専用） |
| `src/lib/email/sendInviteEmail.ts` | 職員招待メール送信（Resend + 日本語HTMLテンプレート） |
| `src/lib/email/generateInviteLink.ts` | Supabase generateLink（invite → magiclink フォールバック） |
| `src/app/api/staff/invite/route.ts` | 新規職員招待（generateLink + Resend送信、last_invited_at 更新） |
| `src/app/api/staff/[id]/resend-invite/route.ts` | 招待メール再送（admin専用・60秒クールダウン・既登録チェック） |

---

## 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-04-15 | 初版作成。テンプレートのみ |
| 2026-04-16 | Phase C実装完了。4テーブル作成・型定義・UIコンポーネント・レイアウト・認証基盤 |
| 2026-04-17 | Phase 11: Resend 招待メール統合・再送機能。staff.last_invited_at 追加、/api/staff/[id]/resend-invite 新設、src/lib/email/* 追加 |
| 2026-04-17 | Phase 12: 職員登録UX改善（qualifications bug fix / 全選択 / 10分ステップ / 09:30-18:30デフォルト）、AreaLabel.time 追加、ChildTransportPatternRow.pickup_area_label / dropoff_area_label 追加、児童モーダル刷新 |
| 2026-04-17 | 児童モーダル微調整：区分/場所メモ削除、迎/送を1行化、視覚的整列（ラベル・方法セレクト固定幅） |
| 2026-04-17 | GradeType 拡張：年少/年中/年長・中1-3・高1-3 追加、Migration 0014 で CHECK 制約更新、GRADE_LABELS を parseChildName.ts で一元管理 |
| 2026-04-17 | Phase 13: TenantSettings.pickup_areas / dropoff_areas 追加。tenant 設定画面を 2 カラム横並び + max-w 撤廃。children モーダルで迎/送別リスト参照。staff モーダルは ユニオンで候補表示。旧 transport_areas は互換残置 |
| 2026-04-17 | Phase 14: 送迎表で場所クリック→Google Maps 起動。googleMaps.ts 新設、TransportDayView に TimeWithMapLink 追加、children モーダルで住所メモ入力復活 (MemoInput)。テナントエリアの時間見切れ修正＆ UI 仕上げ |
| 2026-04-17 | Phase 15: 児童 重複キー修正、「有効→在籍」、tenant 2カラム breakpoint を md に、エリア並び替えを 6点グリップ + HTML5 DnD、staff/page レスポンシブ（md 未満はカード） |
| 2026-04-17 | Phase 16: AreaLabel.address 追加。tenant でエリアごとに住所入力 → 児童モーダルでエリア選択時に住所が自動入力（手入力は尊重）。/settings/children から /settings/tenant へのショートカットリンク |
| 2026-04-17 | Phase 17: 送迎表で児童名クリック→場所詳細カード展開。各カードで Google Maps 起動 |
| 2026-04-17 | Phase 18: area 住所の load 時フォールバック（children モーダル + 送迎表）、children.display_order で児童並べ替え（Migration 0015、/api/children/reorder 新設、ドラッグハンドル UI） |
| 2026-04-17 | Phase 19: VBAのRunAllCoverageChecksをTypeScript移植。ShiftGrid に 有資格者/提供時間/余力 の3行追加（児童11人超は要確認） |
| 2026-04-17 | Phase 20: children.home_address 追加（Migration 0016）、送り先フォールバックに児童自宅住所を追加、/locations 機能撤去（LocationImage→SignedImage汎用化） |
| 2026-04-17 | Phase 21: children.pickup_area_labels text[] 追加（Migration 0017）、児童モーダルでお迎えマーク複数選択UI |
| 2026-04-17 | Phase 22: Excel貼付のNFKC正規化＋児童名の(学年)除去、未登録児童の検出バナー、一括登録サブダイアログ（学年はparseChildName自動推定） |
| 2026-04-17 | Phase 23: 児童一覧の行背景を学年カテゴリでうっすら色分け（未就学=青/年少-年長=赤/小1以降=緑） |
| 2026-04-17 | Phase 25: 職員退職(ソフト削除)・児童出欠+履歴・シフト変更申請・日次出力 |
| 2026-04-18 | Phase 28 A案: children.custom_pickup_areas / custom_dropoff_areas jsonb 追加（Migration 0029）。児童ごとのイレギュラーエリアをマークとしてテナント共通と合流。resolveTransportSpec.mergeAreas / PdfImportModal / PdfConfirmTable / settings/children の CustomAreasEditor で参照 |

---

## Phase 25 変更一覧

### 新規テーブル
- `attendance_audit_logs`（Migration 0024 — Phase 25 マージ時 renumber 0021→0024）: schedule_entry_id, child_id, entry_date, changed_by_staff_id, changed_by_name, old_status, new_status, changed_at
- `shift_change_requests`（Migration 0025 — Phase 25 マージ時 renumber 0022→0025）: staff_id, target_date, change_type('time'|'leave'|'type_change'), requested_payload jsonb, snapshot_before jsonb, reason, status, reviewed_by_staff_id, reviewed_by_name, reviewed_at, admin_note

### カラム追加
- `staff.is_active` bool（Migration 0023 — Phase 25 マージ時 renumber 0020→0023）: `src/types/index.ts` (StaffRow), `src/lib/auth/getCurrentStaff.ts`（退職者除外）, `src/app/api/staff/[id]/route.ts` (DELETE→ソフト削除), `src/app/api/staff/route.ts` (?include_retired=1), `src/app/(app)/settings/staff/page.tsx` (退職バッジ・復帰ボタン)
- `staff.retired_at` timestamptz（Migration 0023）
- `schedule_entries.attendance_status` text（Migration 0024）: `src/types/index.ts` (ScheduleEntryRow, AttendanceStatus), `src/app/(app)/schedule/page.tsx` (出欠UI), `src/app/(app)/output/daily/page.tsx`（absent 除外）, `src/app/api/output/daily/pdf/route.ts`（absent 除外）
- `schedule_entries.attendance_updated_at`, `attendance_updated_by`

### 新規 API ルート
- `PATCH /api/schedule-entries/[id]/attendance`（全ロール・RPC経由）
- `GET /api/attendance-logs`（全ロール）
- `GET/POST /api/shift-change-requests`
- `PATCH /api/shift-change-requests/[id]`（approve/reject=出勤中admin、cancel=本人）
- `GET /api/output/daily/pdf`（全ロール、PDF出力）

### 新規 RPC
- `update_schedule_entry_attendance(p_entry_id uuid, p_status text)`: SECURITY DEFINER, tenant チェック＋履歴自動記録

### 新規 lib
- `src/lib/auth/isOnDutyAdmin.ts`: 現在時刻がシフト内の admin 判定
- `src/lib/auth/requireRole.ts`: requireAuthenticated / requireOnDutyAdmin 追加
- `src/lib/dates/nextBusinessDay.ts`: 土日→翌月曜ロジック、defaultOutputDate

### 新規 UI
- `src/components/request/ShiftChangeRequestSection.tsx`（申請フォーム＋一覧）
- `src/components/shift/ApprovalQueue.tsx`（承認キュー）
- `src/app/(app)/output/daily/page.tsx`（日次出力ページ）

### 変更
- `src/app/api/staff/[id]/route.ts` DELETE: 物理削除→ソフト削除（is_active=false）
- `src/app/api/me/route.ts`: `on_duty_admin` フラグを返す
- `src/components/layout/Sidebar.tsx`: 「日次出力」ナビ追加
- `CLAUDE.md §8`: 権限ルール刷新（出欠例外・退職フラグ・承認フロー）

---

## Phase 26 追加（2026-04-17）

### 新規定数
- `DEFAULT_TRANSPORT_MIN_END_TIME` in `src/types/index.ts`
  - 参照: `src/lib/logic/generateTransport.ts`（minEndTime 省略時フォールバック）/ `src/app/(app)/transport/page.tsx`（テナント設定未設定時）/ `src/app/(app)/settings/tenant/page.tsx`（設定 UI デフォルト）

### TenantSettings 追加フィールド
- `transport_min_end_time?: string` in `src/types/index.ts`
- JSONB 保存（新規マイグレーション不要）
- 設定 UI: `src/app/(app)/settings/tenant/page.tsx` の time input

### ShiftRequestRow 追加フィールド（Phase 25 からの差分）
- `submitted_by_staff_id: string | null` in `src/types/index.ts`
- Migration: `supabase/migrations/0022_shift_requests_submitted_by.sql`（要本番適用）

### API 引数拡張
- `POST /api/shift-assignments/confirm`: body に `confirmed?: boolean` 追加（Phase 26）
- `POST /api/transport/generate`: body に `minEndTime?: string` 追加（Phase 26）
- `POST /api/staff/invite`: `redirectTo` を `/auth/confirm?next=/auth/set-password` に変更（Phase 26）

### 新規ページ（Phase 26）
- `/auth/confirm` in `src/app/auth/confirm/page.tsx` — Supabase invite/recovery の hash fragment 受け
- `/auth/set-password` in `src/app/auth/set-password/page.tsx` — 初回パスワード設定

### 新規コンポーネント（Phase 26）
- `src/components/layout/MonthSelector.tsx` — URL ?month=YYYY-MM の共通月セレクタ

### Phase 26 触ったファイル総覧
| ファイル | 変更点 |
|---|---|
| `src/app/(app)/shift/page.tsx` | Header actions に再生成/確定/編集モード/確定解除を集約、h2 年月削除、editMode state 追加 |
| `src/components/shift/ShiftGrid.tsx` | 職員名セルに 出勤/公休/有給 カウント表示 |
| `src/app/api/shift-assignments/confirm/route.ts` | `confirmed: boolean` 引数対応 |
| `src/app/(app)/transport/page.tsx` | pendingChanges state + 日ごと一括保存 + beforeunload ガード + 候補 endTime 受け渡し + staffAreaMarksForDay |
| `src/components/transport/TransportDayView.tsx` | 8 列化（迎場所/送り場所を分離）+ HH:MM 表示 + 保護者送迎バッジ + 候補フィルタ + 担当マーク絵文字 |
| `src/lib/logic/generateTransport.ts` | minEndTime 引数追加、method=self スキップ、compareTime ヘルパー |
| `src/app/api/transport/generate/route.ts` | minEndTime body パラメータ追加 |
| `src/app/(app)/settings/tenant/page.tsx` | 「送迎担当の最低退勤時刻」time input 追加 |
| `src/app/api/staff/invite/route.ts` | redirectTo を /auth/confirm?next=/auth/set-password に |

---

## Phase 25-C-7a: admin 承認の出勤制約撤廃（2026-04-17）

### 変更
- `src/app/api/shift-change-requests/[id]/route.ts`: approve/reject ゲートを `requireOnDutyAdmin()` → `requireRole('admin')` に変更
- `src/components/shift/ApprovalQueue.tsx`: 「承認は出勤中の管理者のみ」バッジ削除、「現在出勤中の管理者のみ承認/却下できます。」注意文言削除、コメント更新
- `src/app/(app)/shift/page.tsx`: `onDutyAdmin` state → `isAdmin = myRole === 'admin'` に変更、`/api/me` の `on_duty_admin` 参照削除、`canApprove={isAdmin}` に

### 残置（削除しない／将来のメール通知で再利用）
- `src/lib/auth/requireRole.ts` の `requireOnDutyAdmin`
- `src/lib/auth/isOnDutyAdmin.ts`
- `src/app/api/me/route.ts` の `on_duty_admin` レスポンスフィールド

### ロール参照
- `shift_change_requests` approve/reject: admin ロール（API で `requireRole('admin')`）
- `shift_change_requests` cancel: 申請者本人（`requireAuthenticated` + staff_id 一致）

## Phase 25-C-7b: /settings/tenant 文言調整（2026-04-17）

### 変更
- `src/app/(app)/settings/tenant/page.tsx`:
  - ラベル「送迎担当の最低退勤時刻」 → 「送迎候補に含める退勤時刻の下限」
  - 説明文「この時刻以降に退勤する職員のみ、送迎表で割当候補に含めます（標準 16:31 = 送迎最早 16:30 の直後）。」 → 「退勤時刻がこの値より早い職員は、送迎の担当候補に含めません。送り送迎の最早時刻（例 16:30）より少し後に設定するのが標準です。」（ユーザー合意の B 案）

---

## Phase 27-D: 職員対応エリアの迎/送分割（バックエンド先行・2026-04-17）

### 新規 migration
- `supabase/migrations/0026_staff_split_transport_areas.sql`
  - staff に `pickup_transport_areas text[]` と `dropoff_transport_areas text[]` 追加（default '{}'）
  - 既存 `transport_areas` を両カラムにコピー（1 回限り、既に値のあるレコードはスキップ）
  - 旧 `transport_areas` は残置・コメント更新
  - **本番 Supabase への適用はユーザー手動**（Supabase Studio で SQL 実行）

### 型変更
- `StaffRow` に `pickup_transport_areas: string[]` / `dropoff_transport_areas: string[]` 追加（必須）
  - 旧 `transport_areas` は残置・互換用

### API 変更
- `POST /api/staff/route.ts`: `pickup_transport_areas` / `dropoff_transport_areas` 受け入れ。未指定時は `transport_areas` にフォールバック
- `PATCH /api/staff/[id]/route.ts`: allowedFields に 2 カラム追加
- `POST /api/staff/invite/route.ts`: body 型拡張 + insert で 2 カラム設定

### ロジック変更
- `src/lib/logic/generateTransport.ts`:
  - `selectStaff()` に `direction: 'pickup' | 'dropoff'` 引数追加
  - 迎は `s.pickup_transport_areas`、送は `s.dropoff_transport_areas` でフィルタ
  - 両カラムが空（migration 未適用 or 未設定）の場合は旧 `s.transport_areas` にフォールバック
  - 外部公開の `generateTransportAssignments` シグネチャは不変

### UI（2026-04-17 実装完了・同ブランチ追加コミット）
- `src/app/(app)/settings/staff/page.tsx`:
  - 編集モーダル: 「対応エリア」1 セクション → 「迎対応エリア」(accent 青系) + 「送り対応エリア」(green 緑系) 2 セクションに分割。全選択/全解除ボタンも各セクション個別
  - `handleAreaToggle(direction, area)` に改修
  - 保存時 `transport_areas` は pickup ∪ dropoff のユニオンをクライアント側で計算送信（旧テナント互換）
  - 一覧テーブル: プレーンテキスト → 迎=`--accent-pale`/`--accent` チップ、送=`--green-pale`/`--green` チップで分離表示
  - モバイルカード行も同じチップ化
  - 新カラム空時は旧 `transport_areas` にフォールバック表示

### 触らない / 残置
- `src/app/(app)/settings/staff/page.tsx` の既存 `transport_areas` 参照（UI 未更新のため残す。新カラム空時のフォールバックが効く）
- `src/app/(app)/settings/tenant/page.tsx` / `transport/page.tsx` / `output/daily/page.tsx` / `settings/children/page.tsx` の `settings.transport_areas`（**テナント設定**側で別モノ・変更不要）
## Phase 27-A-1: PDF import の pattern selector（2026-04-17）

### 型
- `ParsedScheduleEntry.pattern_id?: string | null` 追加（optional、undefined=未設定／null=該当なし明示）

### schedule/page.tsx
- `patterns` state 追加（`/api/children` から取得、従来は捨てていた）
- `patternUsage: Map<child_id, pattern_id>` 追加（過去12ヶ月の schedule_entries から最頻パターンを集計）
- `handleBulkImport` で `pattern_id` を `/api/schedule-entries` POST に含める

### PdfImportModal
- props に `childList` / `patterns` / `patternUsage` 追加
- 解析結果受け取り時に `assignPatternIds()` で初期 pattern_id 付与
  - 優先順位: 時刻完全一致 → 過去最頻 → 児童の最初の 1 件 → null

### PdfConfirmTable
- props に `childList` / `patterns` 追加
- 「備考」列を「パターン」列に置換。児童の全パターンをドロップダウン表示（pattern_name + area + 時刻）
- 児童名先頭に 🔗（紐付け済）/ ⚠（該当なし）マーク
- 選択パターンの時刻と PDF 時刻が異なる場合は注記表示
- サマリ行に「⚠ パターン未選択: N 件」

### 触らない / 残置
- ExcelPasteModal は A-1 スコープ外。pattern_id=undefined で送信され、API 側で null 保存。Excel 側 UI は A-2 で対応予定
