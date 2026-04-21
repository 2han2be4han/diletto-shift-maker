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
| transport_areas | text[] (AreaLabel.id 配列) | `src/types/index.ts` (StaffRow)。**旧・後方互換**（Phase 27-D 以降は pickup_/dropoff_ を使用 / Phase 30 で id 配列に移行） |
| pickup_transport_areas | text[] (AreaLabel.id 配列) | Phase 27-D 追加。`src/types/index.ts` (StaffRow), `src/lib/logic/generateTransport.ts`（迎担当フィルタ、areaId 比較）, `src/app/api/staff/*`（POST/PATCH/invite で受け入れ + sanitizeIdArray）, `src/app/(app)/settings/staff/page.tsx`（id ベース UI）/ Phase 30 で id 配列に移行 |
| dropoff_transport_areas | text[] (AreaLabel.id 配列) | Phase 27-D 追加。同上の参照セット。送り側用 / Phase 30 で id 配列に移行 |
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
| pickup_area_labels | text[] (AreaLabel.id 配列) | `src/types/index.ts` (ChildRow), `src/app/api/children/route.ts`, `[id]/route.ts` (sanitizeIdArray), `src/app/(app)/settings/children/page.tsx` (id ベースのマーク選択 UI + 件数フィルタ), Phase 21 ド王仕様 / **Phase 30 で id 配列に移行 (migration 0032)** |
| dropoff_area_labels | text[] (AreaLabel.id 配列) | `src/types/index.ts` (ChildRow), `src/app/api/children/route.ts`, `[id]/route.ts` (sanitizeIdArray), `src/app/(app)/settings/children/page.tsx`, `src/lib/logic/resolveTransportSpec.ts` (id 解決), Phase 27 追加 / **Phase 30 で id 配列に移行 (migration 0032)** |
| custom_pickup_areas | jsonb (AreaLabel[]、要 id) | `src/types/index.ts` (ChildRow), `src/app/api/children/route.ts` + `[id]/route.ts` (sanitizeAreaLabels で id 補完), `src/lib/logic/resolveTransportSpec.ts` (mergeAreas, id キー), `src/components/schedule/PdfImportModal.tsx` (assignMarks マージ), `src/components/schedule/PdfConfirmTable.tsx` (id ベース option), `src/app/(app)/settings/children/page.tsx` (CustomAreasEditor で id 採番), `src/app/(app)/transport/page.tsx` (handleAddCustomArea で id 採番), Phase 28 A案 (migration 0029) / Phase 30 で id 必須化 (migration 0032) |
| custom_dropoff_areas | jsonb (AreaLabel[]、要 id) | 上記 custom_pickup_areas と同じ参照セット。送り側用。Phase 28 A案 (migration 0029) / Phase 30 で id 必須化 (migration 0032) |

### tenants.settings.pickup_areas / dropoff_areas / transport_areas（Phase 30 で AreaLabel.id 必須化 / migration 0032）
| キー | 型 | 参照ファイル |
|---|---|---|
| pickup_areas | jsonb (AreaLabel[]、id 必須) | `src/types/index.ts` (TenantSettings), `src/app/api/tenant/route.ts` (sanitizeAreaLabelsWithId), `src/app/(app)/settings/tenant/page.tsx` (id 採番 + ensureAreaIds), `src/lib/logic/resolveTransportSpec.ts` (findAreaById), `src/lib/logic/generateTransport.ts` (areaId フィルタ), `src/app/(app)/transport/page.tsx`, `src/app/(app)/output/daily/page.tsx`, `src/app/api/output/daily/pdf/route.ts`, `src/components/schedule/PdfImportModal.tsx`, `src/components/schedule/PdfConfirmTable.tsx` |
| dropoff_areas | jsonb (AreaLabel[]、id 必須) | 同上 |
| transport_areas | jsonb (AreaLabel[]、id 必須) | 旧（互換）。Phase 13 以降 pickup_areas のミラー。`src/app/(app)/settings/tenant/page.tsx` で書込時に同期 |

### schedule_entries.pickup_mark / dropoff_mark（Phase 30 で AreaLabel.id 化 / migration 0032）
| カラム | 型 | 参照ファイル |
|---|---|---|
| pickup_mark | text (AreaLabel.id) | `src/types/index.ts` (ScheduleEntryRow), `src/app/api/schedule-entries/route.ts`, `src/lib/logic/resolveTransportSpec.ts` (resolveEntryTransportSpec), `src/components/schedule/PdfConfirmTable.tsx` (select value=id) |
| dropoff_mark | text (AreaLabel.id) | 同上 |

### staff.display_name（Phase 28 F案 追加 / migration 0030）
| カラム | 型 | 参照ファイル |
|---|---|---|
| display_name | text (nullable) | `src/types/index.ts` (StaffRow), `src/lib/utils/displayName.ts` (staffDisplayName + STAFF_DISPLAY_NAME_MAX), `src/app/api/staff/route.ts` + `[id]/route.ts` (sanitize), `src/app/(app)/settings/staff/page.tsx` (入力 UI, emptyStaff, handleEdit, handleSave), `src/components/transport/TransportDayView.tsx` (StaffSelect の option 表示 + select title), `src/app/(app)/transport/page.tsx` (TransportStaff に渡す) |
| created_at | timestamptz | `src/types/index.ts` (ChildRow) |

### child_transport_patterns
**Phase 29 で完全撤去**。送迎表への反映はテナント共通マーク + 児童専用 custom_pickup_areas / custom_dropoff_areas に一本化。migration 0031 で DROP 済み。

### schedule_entries
| カラム | 型 | 参照ファイル |
|---|---|---|
| id | uuid | （未実装） |
| tenant_id | uuid | （未実装） |
| child_id | uuid | （未実装） |
| date | date | （未実装） |
| pickup_time | time | （未実装） |
| dropoff_time | time | （未実装） |
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
| `SEPARATE_TRIP_GAP_MINUTES` | `30` | `lib/logic/generateTransport.ts` | 同便/別便の閾値。前便との時刻差がこの値未満なら同便扱いで同じ職員を再利用、以上なら別便として新規選定 |
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
| 2026-04-18 | Phase 28 F案: staff.display_name text 追加（Migration 0030）。送迎表 select の短縮表示用（3文字上限・app バリデーション）。未登録は name の空白除去 → 先頭3文字。src/lib/utils/displayName.ts の staffDisplayName に集約。TransportDayView.StaffSelect 幅 104→60px、マーク slot 2.3em→4.5em、担当列 minWidth 260→220px。settings/staff に入力 UI |

---

## Phase 25 変更一覧

### 新規テーブル
- `attendance_audit_logs`（Migration 0024 — Phase 25 マージ時 renumber 0021→0024）: schedule_entry_id, child_id, entry_date, changed_by_staff_id, changed_by_name, old_status, new_status, changed_at
- `shift_change_requests`（Migration 0025 — Phase 25 マージ時 renumber 0022→0025）: staff_id, target_date, change_type('time'|'leave'|'type_change'), requested_payload jsonb, snapshot_before jsonb, reason, status, reviewed_by_staff_id, reviewed_by_name, reviewed_at, admin_note

### カラム追加
- `staff.is_active` bool（Migration 0023 — Phase 25 マージ時 renumber 0020→0023）: `src/types/index.ts` (StaffRow), `src/lib/auth/getCurrentStaff.ts`（退職者除外）, `src/app/api/staff/[id]/route.ts` (DELETE→ソフト削除), `src/app/api/staff/route.ts` (?include_retired=1), `src/app/(app)/settings/staff/page.tsx` (退職バッジ・復帰ボタン)
- `staff.retired_at` timestamptz（Migration 0023）
- `schedule_entries.attendance_status` text（Migration 0024 + 0039 で 'leave' 追加）: `src/types/index.ts` (ScheduleEntryRow, AttendanceStatus: planned/present/absent/late/early_leave/leave), `src/app/(app)/schedule/page.tsx` (出欠UI — お休み=leave, 欠席=absent を別ステータスで独立保存), `src/components/schedule/ScheduleGrid.tsx` (leave → お休み表示), `src/app/(app)/output/daily/page.tsx`（absent / leave 除外）, `src/app/(app)/output/weekly-transport/page.tsx`（absent / leave 除外）, `src/app/(app)/transport/page.tsx`（absent / leave 除外）, `src/app/api/schedule-entries/[id]/attendance/route.ts` (VALID_STATUSES), `supabase/migrations/0039_attendance_leave_status.sql` (check 制約 + RPC 検証)
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

---

## Phase 35 変更一覧（2026-04-19）

### 新規テーブル
- `child_display_order_memory`（Migration 0033）: tenant_id, slot_signature(text), child_id, display_order(int), updated_at, unique(tenant_id, slot_signature, child_id)
  - RLS: 同テナント内で全ロール（viewer 含む）SELECT/INSERT/UPDATE/DELETE 可。出欠 RPC と同じく現場運用前提。
  - signature 形式: `"HH:MM|pickup|dropoff|areaIdsSorted.join(',')"`（buildSlotSignature in `src/app/(app)/output/daily/page.tsx`）

### 新規 API ルート
- `GET /api/transport/child-order`（viewer 以上）: テナント全 memory rows
- `POST /api/transport/child-order`（viewer 以上）: { signature, orders: [{child_id, display_order}] } を upsert（onConflict: tenant_id+slot_signature+child_id）

### 新規型
- `ChildDisplayOrderMemoryRow` in `src/types/index.ts`

### UI 変更
- `src/app/(app)/output/daily/page.tsx`:
  - TransportBlock 本体レイアウトを「児童 ｜ 区切り縦線 ｜ 職員」横並び 1 段に変更（旧: 児童横並び＋下に職員横並びの 2 段）
  - 児童バッジを @dnd-kit/sortable で並び替え可能に（horizontalListSortingStrategy）
  - 並び順は dragEnd で local 反映 + サーバー upsert（楽観更新、失敗時サイレント）
  - fetchAll で memory 全件取得、slots 組立後に signature ヒット児童を sort、未登録は末尾
  - TransportSlot に `areaIds: string[]` と `children[].id` を追加

### 依存追加
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`（package.json）

---

## Phase 36 変更一覧（2026-04-19）

### スキーマ変更
- `shift_requests.request_type` CHECK 制約拡張（Migration 0034）:
  - 旧: 'public_holiday'|'paid_leave'|'available_day'
  - 新: 'public_holiday'|'paid_leave'|'full_day_available'|'am_off'|'pm_off'|'comment'
  - 既存 'available_day' は migration で 'full_day_available' に自動変換

### 新規テーブル
- `shift_request_comments`（Migration 0034）: tenant_id, staff_id, month, date, comment_text, updated_at, unique(tenant_id, staff_id, date)
  - RLS: shift_requests と同等（admin/editor は全員、viewer は自分のみ書込み、同テナント SELECT 可）
  - 用途: 休み希望の自由入力（他施設応援/会議/研修等）。シフト表の ⚠ 赤マーク判定にも使用

### 新規 API ルート
- `GET /api/shift-request-comments?month=YYYY-MM`（viewer 以上）
- `POST /api/shift-request-comments`（viewer 以上、空文字 comment_text で delete）

### 新規/変更型
- `ShiftRequestType` 拡張 in `src/types/index.ts`
- `ShiftRequestCommentRow` 追加 in `src/types/index.ts`

### UI 変更
- `src/app/(app)/request/page.tsx`: staff fetch に `is_active=true` フィルタ追加（退職者除外）
- `src/components/request/MyRequestCalendar.tsx`: 全面リライト
  - 6 種ステータス + コメント（排他）対応
  - AM休/PM休 はセル背景の半月色塗りで視覚区別
  - DayPopover サブコンポーネント新設（viewport 端で上下反転 + 横方向 shift）
  - クリック外しで close、scroll/resize で位置再計算
  - shift_request_comments 初期 fetch + per-date upsert
- `src/components/request/AdminRequestList.tsx`: detail modal の Badge を 6 種対応（labelOf / badgeVariantOf ヘルパー）
- `src/components/shift/ShiftGrid.tsx`: requestComments prop 追加、該当セルに ⚠ 赤色表示 + tooltip
- `src/app/(app)/shift/page.tsx`: shift_request_comments 月一括 fetch、ShiftGrid に渡す

### ロジック変更
- `src/lib/logic/generateShift.ts`: 'available_day' → 'full_day_available' (+ am_off/pm_off も availableDays に追加)

---

## Phase 37 変更一覧（2026-04-19）

### UI 修正
- `src/components/shift/ShiftGrid.tsx`:
  - getCellBg: 半透明 rgba を opaque RGB (rgb(252,249,249)/rgb(248,249,253)/var(--white)) に変更。sticky セルでスクロール中の文字被りを解消
  - CoverageRow「有資格者」「提供時間」: dow=0 かつ childrenCount=0 のセルは判定対象外（空表示）
  - 関連: getCellBg!=='transparent' 判定が型不整合になったため簡略化
- `src/app/(app)/shift/page.tsx`:
  - 上余白詰め: p-6 → px-6 pb-6 pt-0、バッジ行 mb-4 → pt-2 mb-2
  - handleGenerate: 再生成前に shift_requests と schedule_entries を再 fetch（state スタレ対策）
- `src/app/(app)/output/daily/page.tsx`:
  - getGradeColors: 背景 0.14→0.28、ボーダー 0.75→1.0 に濃化
- `src/components/request/AdminRequestList.tsx`:
  - 詳細モーダルの日付一覧を DateRangeChips（連続日範囲圧縮 + 曜日付き chip）に変更

---

## Phase 38 変更一覧（2026-04-19）

### UI 変更
- `src/app/(app)/output/daily/page.tsx`:
  - TransportSlot.children に areaName 追加
  - TransportBlock ヘッダーから場所名を撤去、代わりに担当者チップを移動配置
  - 児童バッジ上部に「emoji 場所名」を併記（DnD で場所も追従）
  - 旧: 「時刻 ｜ 場所」+ 「児童 ｜ 職員」 → 新: 「時刻 ｜ 担当者」 + 「児童(emoji 場所名)」
- `src/app/(app)/transport/page.tsx`:
  - fetchAll で attendance_status='absent' の schedule_entries を除外（/transport から欠席児童完全非表示）
  - DateHeaderPicker コンポーネント新設: 「YYYY年M月D日（曜）▾」クリックで OS 標準カレンダー → setSelectedDate で日付遷移
  - staffAreaMarksForDay: 30 分超で別便扱いし同マークを複数回出す（同便は dedup 維持）
- `src/components/shift/ShiftGrid.tsx`:
  - 有資格者の行を gold-pale で全幅ハイライト（職員名セル + 通常出勤セル両方）

---

## Phase 39 変更一覧（2026-04-19）

### UI 変更
- `src/app/(app)/output/daily/page.tsx`:
  - 保護者送迎 (pickup_method='self' / dropoff_method='self') のスロットでは児童バッジ上部の場所 emoji+名前を非表示
- `src/app/(app)/transport/page.tsx`:
  - 日付タブ列（workDays.map のブロック）を削除。日付遷移はヘッダー DateHeaderPicker (📅) に集約
  - DateHeaderPicker のラベル末尾を ▾ → 📅 に変更
- `src/app/(app)/schedule/page.tsx`:
  - 利用予定編集モーダルから「出欠種類 (出席/欠席/お休み)」セクションを撤去
  - 「当日の出欠記録 (予定/出席/欠席/遅刻/早退) + 履歴」のみ残す
  - attendance state は load 値を保持→ handleSave に渡すので既存エントリの挙動は維持

---

## Phase 40 変更一覧（2026-04-19）

### UI 変更
- `src/app/(app)/transport/page.tsx` (DateHeaderPicker):
  - ▾→📅 の表示をボタンらしく装飾（border + padding + hover で background/shadow を強調）
- `src/app/(app)/schedule/page.tsx` (handleAttendanceChange):
  - entry_id がない（空セル）場合に POST /api/schedule-entries で空 entry (times=null) を auto-create → その id で attendance 更新
  - 旧アラート「先に時間などを保存してください」を撤廃。1 操作で完結
  - cells に未反映の場合は fetchAll() で同期

---

## Phase 41 変更一覧（2026-04-19）

### UI 変更
- `src/app/(app)/schedule/page.tsx`:
  - 旧 attendance state (attend/absent/off) を撤去
  - 時間/送迎 UI と handleSave の保存判定を attendanceStatus !== 'absent' に統一
  - cell ロード時の setAttendance 分岐 (L207-213) も削除
  - ルール: 「欠席以外は時間入力可、欠席なら times=null で保存して /transport から除外」

---

## Phase 42 変更一覧（2026-04-19）

### UI 変更
- `src/components/schedule/ScheduleGrid.tsx`:
  - ScheduleCellData に entry_id?, attendance_status? 追加
  - セル描画を 4 状態に: 未入力(−) / 出席(時間+送迎マーク) / 欠席(赤バッジ + 赤背景) / お休み(灰バッジ + 灰背景)
  - title 属性で状態 hover ヒント付き
  - 状態判定: !entry → 未入力 / status='absent' → 欠席 / entry あり times 両方 null → お休み / それ以外 → 出席

---

## Phase 42b 変更一覧（2026-04-19）

### 業務ルール
- 欠席 (attendance_status='absent'): 国保連請求対象、送迎不要
- お休み (entry あり / pickup_time も dropoff_time も null): 国保連請求対象外、送迎不要
- 両方とも /transport の児童行と /output/daily の利用者カウントから除外する

### 実装
- `src/app/(app)/transport/page.tsx`:
  - fetchAll の setScheduleEntries フィルタに `(!e.pickup_time && !e.dropoff_time)` を追加
- `src/app/(app)/output/daily/page.tsx`:
  - activeChildCount から times 両方 null を除外
  - 送迎スロット (TransportSlot) 側は既に entry.pickup_time / dropoff_time チェックで skip 済

---

## Phase 43 変更一覧（2026-04-19）

### UI 変更
- `src/app/(app)/output/daily/page.tsx`:
  - 印刷時 .whiteboard-frame の border/角丸/padding を撤去 + .daily-output-root と .flex-1 を強制白化（印刷プレビューが「白い紙」そのものに見える）
  - slot 構築の主軸を transportAssignments → scheduleEntries に変更:
    - taByEntry Map で transport_assignment を lookup
    - ta が無くても entry が描画される。ta?.is_unassigned ?? true で「担当未割当」赤枠
    - これで送迎再生成前の児童も日次出力に出る
  - SortableChildBadge: エリア名 0.78→0.95rem、児童名 text-sm→1.05rem、バッジ 64→76px に拡大

---

## Phase 44 変更一覧（2026-04-19）

### UI 変更
- `src/components/transport/TransportDayView.tsx`:
  - StaffSelect SELECT_WIDTH 60 → 80px、padding 4px 6px → 4px 2px 4px 6px に。3 文字名（「あやせ」「ヨハン」）が省略されない
  - 場所セル (LocationCellInline) で pickup/dropoff method='self' のときは areaLabel/location を null 化して非表示

---

## Phase 45 変更一覧（2026-04-19）

### スキーマ
- `transport_assignments.is_locked boolean default false`（Migration 0035）
  - 用途: 「保存」ボタン押下で true。再生成 (handleGenerate) はこの flag が true の row を含む日をスキップ
  - is_confirmed (確定) とは別軸: ロック=編集中保護、確定=最終承認

### 型・API
- `src/types/index.ts`: TransportAssignmentRow に is_locked: boolean 追加
- `src/app/api/transport-assignments/route.ts`: POST で is_locked を受け取り upsert

### ロジック
- `src/app/(app)/transport/page.tsx`:
  - handleSaveDay: payload に is_locked: true をセットして DB upsert
  - handleGenerate: 事前に lockedDates Set を構築、targetDates から除外
  - 完了トーストに「🔒 保存済 N 日はスキップ」を併記
  - ヘッダーに「🔒 保存済(再生成スキップ)」バッジ
- `src/lib/logic/generateTransport.ts`: 自動生成 row は is_locked: false で出力

### 印刷背景修正（追加）
- `src/app/(app)/output/daily/page.tsx`:
  - body > div { background: #fff }, body > div > div { background: #fff } を print CSS に追加
  - 原因: AppShell.tsx 最外周 div の inline style="background: var(--bg)" が紙面内に灰色として透けていた

---

## Phase 56 変更一覧（2026-04-20）

### 新規ファイル
- `src/lib/date/isToday.ts`: todayStr() / isToday(s) ユーティリティ（JST 基準, format(new Date(), 'yyyy-MM-dd')）
- `src/hooks/useTransportDate.ts`: 送迎表の (year, month, date, setDate) を URL 唯一の真実から派生させるフック
  - URL ?month + ?date を読み、整合性チェック（date.slice(0,7) === month）
  - フォールバック順: 有効な urlDate → sessionStorage[lastDate:YYYY-MM] → 今日(当月) → 月初
  - setDate = router.replace（state を持たない）
  - sessionStorage キー: `shift-puzzle.transport.lastDate:${YYYY-MM}`（月ごとに分離）

### 削除（旧 split-brain 同期コード）
- `src/app/(app)/transport/page.tsx`:
  - useState<selectedDate> 削除
  - sessionStorage 復元 useEffect 削除（旧 SESSION_DATE_KEY = 'shift-puzzle.transport.lastDate'）
  - selectedDate→URL 同期 useEffect 削除（history.replaceState 直接呼び）
  - フォールバック useEffect 削除（!selectedDate 検出）
  - defaultNextMonthStr 関数も削除（useTransportDate 内部に移動）
  - useSearchParams import 削除

### UI 変更
- `src/app/(app)/transport/page.tsx`:
  - DateHeaderPicker 横に「今日」バッジ（isToday 時）or 「→ 今日へ」ジャンプボタン（当月かつ非選択時）
- `src/components/shift/ShiftGrid.tsx`:
  - 今日列の th/td に accent border + accent-pale-solid 背景
  - todayHeaderRef で scrollIntoView({ inline: 'center' }) を mount 時実行
- `src/components/schedule/ScheduleGrid.tsx`:
  - 同上（th, td, dailyCounts 行に統一適用）

---

## Phase 57 変更一覧（2026-04-21）

### 新規コンポーネント
- `src/components/ui/DatePopover.tsx`: 自前カレンダーポップオーバー。
  - Props: value, onChange, dayStates (Map<YYYY-MM-DD, {locked?, unassigned?}>), anchorRef, open, onClose, allowMonthBrowse
  - 今日 = accent リング、選択中 = accent 塗り、🔒 = accent ドット、⚠ = red ドット
  - 凡例 + 「今日へ」ボタン、Esc/外クリックで閉じる
- `src/components/ui/DateStepper.tsx`: ⟪前月 ⟨前日 [日付📅] 翌日⟩ 翌月⟫ + 「今日へ」
  - DatePopover を内蔵。onChange(YYYY-MM-DD) を親に伝える
  - 月境界跨ぎで日付クリップ（31日→30日など）
- `src/components/ui/MonthStepper.tsx`: ⟪前年 ⟨前月 [月📅] 翌月⟩ 翌年⟫ + 「今月へ」
  - URL ?month=YYYY-MM を直接書く（内部で useSearchParams + router.push）
  - 月変更時に ?date= を削除

### Header の変更
- `src/components/layout/Header.tsx`: showMonthSelector prop 廃止（互換 deprecated 残存）。MonthSelector import 削除
- `src/components/layout/MonthSelector.tsx`: 依然存在するが Header からは使われない（将来的に削除候補）

### 各ページの変更
- `src/app/(app)/transport/page.tsx`:
  - DateHeaderPicker 関数削除
  - Phase 56 の今日バッジ/今日へボタン削除（DateStepper に統合）
  - Header actions に 週次印刷ボタン移動
  - dayStates useMemo 追加（transportAssignments から is_locked / is_unassigned を派生）
  - ページ本体に DateStepper 配置
- `src/app/(app)/shift/page.tsx`: Header から showMonthSelector 除去、本体に MonthStepper
- `src/app/(app)/schedule/page.tsx`: 同上。タイトルから「YYYY年M月」削除（MonthStepper に表示あり）
- `src/app/(app)/request/page.tsx`: 同上
- `src/app/(app)/output/weekly-transport/page.tsx`: 同上

### 設計不変条件
- ヘッダーにはページ名 + ページ固有アクション + 通知ベルのみ。月/日ナビは置かない
- 月/日ナビはページ本体の先頭行に専用コンポーネント（MonthStepper/DateStepper）で配置
- URL ?month=YYYY-MM / ?date=YYYY-MM-DD が唯一の真実
- MonthStepper 月変更時に ?date= を自動削除（useTransportDate フォールバックに委ねる）

---

## Phase 58 変更一覧（2026-04-21）

### 依存追加
- `@holiday-jp/holiday_jp` ^2.5.1（MIT）: 日本の祝日判定（振替休日含む）

### 新規ファイル
- `src/lib/date/holidays.ts`: isJpHoliday(dateStr) / jpHolidayName(dateStr)
- `src/components/ui/MonthStatusBadge.tsx`: 完成状態バッジ（empty/incomplete/complete × gray/gold/green）
- `src/app/api/status/month/route.ts`: GET /api/status/month?month=YYYY-MM → { transport, shift } 状態を返す（viewer ロール許可）

### UI 変更
- `src/components/ui/DatePopover.tsx`: 祝日セルを赤表示 + tooltip に祝日名
- `src/components/shift/ShiftGrid.tsx`: 日付列ヘッダの祝日対応（getDowColor に isHoliday 引数）
- `src/components/schedule/ScheduleGrid.tsx`: 同上 + 「祝」表示（「営」「休」と並ぶ）
- `src/components/layout/Sidebar.tsx`:
  - /api/status/month をフェッチ（URL ?month 追従 / 無ければ来月）
  - 送迎表/シフト表 menu item に状態ドット（開時=右端、ミニ時=アイコン右上）
- `src/app/(app)/transport/page.tsx`:
  - Header actions に MonthStatusBadge
  - 「未割当 N件」バッジ削除
- `src/app/(app)/shift/page.tsx`: headerActions の先頭に MonthStatusBadge

---

## Phase 59 変更一覧（2026-04-21）

### 依存追加
なし（既存 Supabase schema を拡張）

### Migration
- `supabase/migrations/0037_staff_driver_attendant.sql`: staff テーブルに is_driver / is_attendant (boolean, default false) 追加

### 型
- `src/types/index.ts` StaffRow に is_driver / is_attendant 追加
- `src/components/transport/TransportDayView.tsx` TransportStaff 型に isDriver / isAttendant 追加

### API
- `src/app/api/staff/route.ts` POST: is_driver/is_attendant を insert payload に
- `src/app/api/staff/[id]/route.ts` PATCH: allowed 配列に is_driver/is_attendant
- `src/app/api/staff/invite/route.ts` POST: body 型 + insert payload に is_driver/is_attendant

### UI / ロジック
- `src/app/(app)/settings/staff/page.tsx`:
  - emptyStaff() / handleEdit() / handleSave() で is_driver/is_attendant の初期値・ペイロード対応
  - 編集モーダル先頭付近に「🚐 送迎役割」ブロック（accent 背景で目立たせ）追加
  - 氏名/メールのグリッドを再構成し、表示名はヘルプ文を含めて full-width 分離
- `src/components/transport/TransportDayView.tsx` StaffSelect:
  - slot i===0 は is_driver のみ候補、i===1 は is_driver || is_attendant を候補に
  - 運転手ゼロ時の左スロット placeholder を「運転手なし」に切替
- `src/lib/logic/generateTransport.ts` selectStaff: 候補フィルタ先頭に `if (!s.is_driver) return false` を追加。自動割り当ては運転手限定
- `src/app/(app)/transport/page.tsx`: availableStaffForDay の TransportStaff に isDriver/isAttendant を populate。ヘッダー「👤 出勤 N人」バッジ横に「⚠ 運転手不在」警告バッジ（当日出勤あり & 運転手 0 人時）

### 設計方針・確認済み仕様
- デフォルト: 両フラグ false。管理者が settings/staff で個別設定する（暫定的に全員 driver=true にする移行は行わない）
- 既存 is_locked=true 行は温存。migration 後に再生成しても非ロック日のみ新ルールで上書き
- 運転手不在日の手動オーバーライドはスコープ外（警告バッジで通知するのみ）
- 2 人目自動割り当ては Phase 59 スコープ外（現状 AUTO_ASSIGN_STAFF_COUNT=1）
