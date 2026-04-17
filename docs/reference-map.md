# reference-map.md

プロジェクト内の「カラム・定数・型・テーブル」がどのファイルで参照されているかの台帳。
影響範囲を把握する際に最初に開くファイル。

初版: Phase 26（2026-04-17）。既存フェーズ（Phase 1〜25）の参照は必要時に順次追記。

---

## 定数

### `MAX_STAFF_PER_TRANSPORT`
- 定義: `src/types/index.ts`
- 参照: `src/lib/logic/generateTransport.ts`

### `DEFAULT_MIN_QUALIFIED_STAFF`
- 定義: `src/types/index.ts`
- 参照: （未使用。TenantSettings.min_qualified_staff で上書き運用）

### `TRANSPORT_GROUP_TIME_WINDOW_MINUTES`
- 定義: `src/types/index.ts`
- 参照: `src/lib/logic/generateTransport.ts`

### `DEFAULT_TRANSPORT_MIN_END_TIME`（Phase 26 新規）
- 定義: `src/types/index.ts`
- 参照:
  - `src/lib/logic/generateTransport.ts` — `minEndTime` 省略時のフォールバック
  - `src/app/(app)/transport/page.tsx` — テナント設定未設定時のフォールバック
  - `src/app/(app)/settings/tenant/page.tsx` — 設定 UI のプレースホルダ + リセット値

---

## 型

### `TenantSettings`
- 定義: `src/types/index.ts`
- 参照:
  - `src/app/(app)/settings/tenant/page.tsx`
  - `src/app/(app)/transport/page.tsx`
  - `src/app/api/tenant/route.ts`（GET/PATCH）
- **Phase 26 追加フィールド**: `transport_min_end_time?: string`

### `ScheduleEntryRow`
- フィールド `pickup_method` / `dropoff_method` (`'pickup' | 'self'` / `'dropoff' | 'self'`)
- 参照箇所（Phase 26 で `self` 判定を追加）:
  - `src/lib/logic/generateTransport.ts`
  - `src/app/(app)/transport/page.tsx` — `currentDayEntries` / `handleSaveDay`
  - `src/components/transport/TransportDayView.tsx` — `pickupMethod` / `dropoffMethod` prop

### `ShiftAssignmentRow`
- フィールド `end_time`（Phase 26: 送迎候補フィルタに使用）
- 参照:
  - `src/lib/logic/generateTransport.ts` — `compareTime` で `end_time >= minEndTime` 判定
  - `src/app/(app)/transport/page.tsx` — `availableStaffForDay` で `endTime` を各職員に渡す

---

## API エンドポイント

### `POST /api/shift-assignments/confirm`
- body: `{ year, month, confirmed?: boolean }`（Phase 26: `confirmed` 引数追加）
- 参照元:
  - `src/app/(app)/shift/page.tsx` — `handleConfirm`（confirmed:true）/ `handleUnconfirm`（confirmed:false）

### `POST /api/transport/generate`
- body: `{ date, scheduleEntries, patterns, staff, shiftAssignments, minEndTime? }`（Phase 26: `minEndTime` 追加）
- 参照元:
  - `src/app/(app)/transport/page.tsx` — `handleGenerate`

### `POST /api/staff/invite`
- Phase 26 変更: `redirectTo` を `/auth/confirm?next=/auth/set-password` に
- 参照元: 管理画面 `/settings/staff`

---

## 新規ページ（Phase 26）

### `/auth/confirm`
- `src/app/auth/confirm/page.tsx`
- 役割: Supabase invite / recovery の implicit flow（hash fragment）を受け、`supabase.auth.setSession()` でクッキーを立てる
- `type=invite` → `/auth/set-password` へ、`type=recovery` → `/auth/set-password?recovery=1` へ、それ以外は `next` クエリへ
- 既存 `/auth/callback/route.ts`（PKCE 用）と共存

### `/auth/set-password`
- `src/app/auth/set-password/page.tsx`
- 役割: 初回パスワード設定 / パスワード再設定
- セッション未確立時は `/login` へリダイレクト
- 成功後 `/dashboard`

---

## 主要ファイル（Phase 26 で触ったもの）

| ファイル | Phase 26 変更点 |
|---|---|
| `src/types/index.ts` | `TenantSettings.transport_min_end_time` / `DEFAULT_TRANSPORT_MIN_END_TIME` 追加 |
| `src/app/(app)/shift/page.tsx` | Header actions に再生成/確定/編集モード/確定解除を集約、h2 年月削除、`editMode` state 追加 |
| `src/components/shift/ShiftGrid.tsx` | 職員名セルに 出勤/公休/有給 カウント表示 |
| `src/app/api/shift-assignments/confirm/route.ts` | `confirmed: boolean` 引数対応 |
| `src/app/(app)/transport/page.tsx` | `pendingChanges` state + 日ごと一括保存 + `beforeunload` ガード + 候補 endTime 受け渡し |
| `src/components/transport/TransportDayView.tsx` | 候補フィルタ / 保護者送迎バッジ / 時刻下の エリア+住所 表示 / 候補外職員の警告色 |
| `src/lib/logic/generateTransport.ts` | `minEndTime` 引数追加、method=self のスキップ、`compareTime` ヘルパー |
| `src/app/api/transport/generate/route.ts` | `minEndTime` body パラメータ追加 |
| `src/app/(app)/settings/tenant/page.tsx` | 「送迎担当の最低退勤時刻」入力欄追加 |
| `src/app/api/staff/invite/route.ts` | `redirectTo` を `/auth/confirm?next=/auth/set-password` に変更 |
| `src/app/auth/confirm/page.tsx` | **新規**: hash fragment 受け |
| `src/app/auth/set-password/page.tsx` | **新規**: 初回パスワード設定 |

---

## ロール参照（Phase 26 時点）

ロール文字列 `'admin' | 'editor' | 'viewer'` は `StaffRole` 型経由でのみ使用。
変更前に必ずこの表を更新のこと。

- `requireRole('admin')`: 職員管理 (`/api/staff/*`)、テナント設定
- `requireRole('editor')`: シフト/送迎/利用予定/休み希望の書き込み系
- 読み取り: 認証済みなら全ロール可
