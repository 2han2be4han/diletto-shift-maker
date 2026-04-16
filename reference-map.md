# docs/reference-map.md

> ShiftPuzzle プロジェクトの参照マップ  
> 初版: 2026-04-15 / テンプレートのみ、実装はこれから

---

## 1. DBテーブル・カラム参照

### tenants
| カラム | 型 | 参照ファイル（実装後に記載） |
|---|---|---|
| id | uuid | （未実装） |
| name | text | （未実装） |
| stripe_customer_id | text | （未実装） |
| stripe_subscription_id | text | （未実装） |
| status | text | （未実装） |
| created_at | timestamptz | （未実装） |

### staff
| カラム | 型 | 参照ファイル（実装後に記載） |
|---|---|---|
| id | uuid | （未実装） |
| tenant_id | uuid | （未実装） |
| name | text | （未実装） |
| email | text | （未実装） |
| role | text | （未実装） |
| employment_type | text | （未実装） |
| default_start_time | time | （未実装） |
| default_end_time | time | （未実装） |
| transport_areas | text[] | （未実装） |
| is_qualified | boolean | （未実装） |
| created_at | timestamptz | （未実装） |

### children
| カラム | 型 | 参照ファイル（実装後に記載） |
|---|---|---|
| id | uuid | （未実装） |
| tenant_id | uuid | （未実装） |
| name | text | （未実装） |
| grade_type | text | （未実装） |
| is_active | boolean | （未実装） |
| created_at | timestamptz | （未実装） |

### child_transport_patterns
| カラム | 型 | 参照ファイル（実装後に記載） |
|---|---|---|
| id | uuid | （未実装） |
| child_id | uuid | （未実装） |
| tenant_id | uuid | （未実装） |
| pattern_name | text | （未実装） |
| pickup_location | text | （未実装） |
| pickup_time | time | （未実装） |
| dropoff_location | text | （未実装） |
| dropoff_time | time | （未実装） |
| area_label | text | （未実装） |

### schedule_entries
| カラム | 型 | 参照ファイル（実装後に記載） |
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
| カラム | 型 | 参照ファイル（実装後に記載） |
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
| カラム | 型 | 参照ファイル（実装後に記載） |
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
| カラム | 型 | 参照ファイル（実装後に記載） |
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

| ロール名文字列 | 定義場所 | 参照ファイル（実装後に記載） |
|---|---|---|
| `'admin'` | `types/index.ts` | （未実装） |
| `'editor'` | `types/index.ts` | （未実装） |
| `'viewer'` | `types/index.ts` | （未実装） |

---

## 3. 主要定数・列挙値

| 定数名 | 値 | 定義ファイル | 参照ファイル（実装後に記載） |
|---|---|---|---|
| `MAX_STAFF_PER_TRANSPORT` | `2` | `types/index.ts` | （未実装） |
| `DEFAULT_MIN_QUALIFIED_STAFF` | `2` | `types/index.ts` | （未実装） |
| `TRANSPORT_GROUP_TIME_WINDOW_MINUTES` | `30` | `lib/logic/generateTransport.ts` | （未実装） |
| `CLAUDE_MODEL` | `'claude-sonnet-4-20250514'` | `lib/anthropic/parsePdf.ts` | （未実装） |
| `CLAUDE_MAX_TOKENS` | `4000` | `lib/anthropic/parsePdf.ts` | （未実装） |

---

## 4. 型定義の依存チェーン

| 型名 | 定義ファイル | 利用箇所（実装後に記載） |
|---|---|---|
| `TenantRow` | `types/index.ts` | （未実装） |
| `StaffRow` | `types/index.ts` | （未実装） |
| `ChildRow` | `types/index.ts` | （未実装） |
| `ChildPattern` | `types/index.ts` | （未実装） |
| `ScheduleEntry` | `types/index.ts` | （未実装） |
| `ShiftRequest` | `types/index.ts` | （未実装） |
| `ShiftAssignment` | `types/index.ts` | （未実装） |
| `TransportAssignment` | `types/index.ts` | （未実装） |
| `UserRole` | `types/index.ts` | （未実装） |
| `ParsedSchedulePdf` | `types/index.ts` | （未実装） |

---

## 5. APIルート ↔ 呼び出し元

| APIルート | メソッド | 呼び出し元（実装後に記載） |
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

---

## 更新履歴

| 日付 | 内容 |
|---|---|
| 2026-04-15 | 初版作成。テンプレートのみ、実装はこれから |
