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
| transport_areas | text[] | `src/types/index.ts` (StaffRow) |
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
