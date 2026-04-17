# 計画書: ローカル検証 Phase 25+26 フォローアップ

**作成**: 2026-04-17 / 実装は次回セッション / ここでは計画のみ

## 0. 検証結果

| § | 画面 | 結果 | 後続 |
|---|---|---|---|
| 3-1 | /shift | OK | — |
| 3-2 | /transport | 既存バグ: `schedule_entries.pattern_id` 全件 NULL → 場所・マーク欠落 | **A** |
| 3-3 | /schedule | OK | — |
| 3-4 | /request | OK（承認ゲート要望） | **B** |
| 3-5 | /output/daily | 動作 OK / レイアウト要調整（サンプル待ち） | **C** |
| 3-6 | /settings/staff | OK / 一覧 UI 不細工 + 対応エリア分割要望 | **D + G** |
| 3-7 | /settings/tenant | OK（文言要調整） | **E** |
| 3-8 | 招待フロー | 本番メール必須 | **F** |

---

## A. `schedule_entries.pattern_id` 根治

- **現象**: PDF import / 手動登録で pattern_id を保存していない → /transport の area_label・担当マーク欠落
- **原因**: 登録時の pattern 紐付けロジック未実装。事後マッチは pattern.pickup_time と entry.pickup_time が揃わず困難
- **段階実装**:
  - A-1 `PdfConfirmTable.tsx` に pattern selector 追加
  - A-2 `/schedule` 手動追加モーダルにも pattern selector
  - A-3 既存データ backfill 支援 UI（「未紐付け N 件」バッジ → クリックで紐付け）
  - A-4 `/transport` の暫定フォールバック（A-3 完了後削除可）
- **影響**: `src/components/schedule/PdfConfirmTable.tsx`, `src/app/(app)/schedule/page.tsx`, `src/app/api/schedule-entries/route.ts`, `src/app/(app)/transport/page.tsx`
- **リスク**: PDF import UX 変更 → 「直近パターン自動選択」等の補助が必要

## B. 承認ゲートから「出勤中」撤廃

詳細: [plan_admin_approval_no_onduty.md](plan_admin_approval_no_onduty.md)（単独計画書あり）

要点のみ:
- `PATCH /api/shift-change-requests/:id` の approve/reject を admin ロールのみに
- `ApprovalQueue` の出勤中文言削除
- `isOnDutyAdmin` / `/api/me.on_duty_admin` は残置（将来の通知で再利用）

## C. `/output/daily` レイアウト調整

- 現状: 2 カラム + PDF 動作。デザインが要件と差異大
- ユーザー手元サンプル受領後に着手
- 影響: `src/app/(app)/output/daily/page.tsx`, `src/app/api/output/daily/pdf/route.ts`

## D. 対応エリアを「迎対応 / 送り対応」に分割

- **要望**: `/settings/staff` 編集モーダルを迎/送で別チェック可能にする
- **変更項目**:
  - migration `0026_staff_split_transport_areas.sql`: `pickup_transport_areas` / `dropoff_transport_areas` カラム追加、既存 `transport_areas` を両方にコピー、旧カラム残置
  - `types/index.ts` の StaffRow に 2 フィールド追加
  - `/api/staff` POST/PATCH/invite
  - `/settings/staff` UI（セクション 2 分割、全選択/全解除も各個別）
  - `generateTransport.ts` の候補フィルタを分岐（迎は pickup_、送は dropoff_）
  - 参照波及: `/settings/children`, `/transport`, `/output/daily`
- **リスク**: 初回移行で全員「迎も送も全対応」になる → 案内要

## E. `/settings/tenant` 文言調整

- 現状: `送迎担当の最低退勤時刻` + 注釈が読み取りにくい
- 方針: 実装時に 2〜3 案提示し合意を取る
- 影響: `src/app/(app)/settings/tenant/page.tsx`

## F. 招待フロー 本番確認

- Supabase Auth URL Configuration に `${SITE_URL}/auth/confirm` 追加（未確認）
- 本番 Vercel にデプロイ → `/settings/staff` から招待 → 受信メール → `/auth/confirm` → `/auth/set-password` → `/dashboard`
- 問題あれば `src/app/auth/confirm/page.tsx` / `src/app/auth/set-password/page.tsx` / `src/app/api/staff/invite/route.ts` を修正

## G. 対応エリア表示のポップ化

- **現状**: `/settings/staff` 一覧の対応エリア列がプレーン表示で視認性悪い（ユーザー指摘「UI が不細工」）
- **改善案**: カラフル丸角チップ化（絵文字大きめ + 名称小さめ、`--accent-pale` 等のテーマ変数使用）
- **注意**: 新規色・新規バリアント追加はユーザー確認必須（CLAUDE.md §4）
- **影響**: `src/app/(app)/settings/staff/page.tsx`（必要なら `Badge.tsx` 拡張）
- **D と同セッション推奨**

---

## 優先度と実装順

| 順 | タスク | 備考 |
|---|---|---|
| 1 | B + E | 小スコープ。計画書完備 |
| 2 | C | サンプル受領後 |
| 3 | A（A-1 → A-4 段階） | UX 影響大 |
| 4 | D + G | DB 変更 + UI |
| 5 | F | デプロイ後 |

---

## 残置（触らない）

- `src/lib/auth/isOnDutyAdmin.ts`（通知で再利用予定）
- `/api/me.on_duty_admin` フラグ（同上）
- 旧 `staff.transport_areas` カラム（D 後も後方互換で残置）
- `docs/local-verify-spec.md`（検証仕様は別フェーズで更新）

---

## 遵守事項（CLAUDE.md）

- §2: 各タスク実装時は調査→計画→承認→実装
- §3: `docs/progress.html` に該当フェーズ行を追加し都度更新
- §6: `types/index.ts` 既存型は削除せず追加
- §7: RLS 破壊禁止（D の migration は追加のみ）
- §10: 連動ポイント（`reference-map.md` 更新）を忘れない
- main への直接 push / Vercel 自動デプロイは避ける（必要なら `[skip ci]` 付き）
