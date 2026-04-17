# 計画書: シフト変更申請の承認権限から「出勤中」条件を外す

**作成日**: 2026-04-17
**起票**: local-verify 検証中のユーザー要望（§3-4 関連）
**対象ブランチ（予定）**: `feat/admin-approval-no-onduty-gate`
**main への push / Vercel デプロイ**: 本計画には含めない（実装後にユーザー判断）

---

## 1. 背景

Phase 25-C-7（`ApprovalQueue` + `/api/shift-change-requests`）で以下の設計を採用していた:

- 承認 / 却下操作は **「出勤中 admin」** に限定（`requireOnDutyAdmin` で現在時刻が admin 自身のシフト内か判定）
- 通常 admin は閲覧のみ、操作不可

ローカル検証時、admin ユーザーが自分のシフト時間外だと承認ボタンが活性化せず、「承認できるのは出勤中 admin のみ」の UX がユーザー運用に合わないことが判明。

## 2. 目的（ユーザー要望）

1. **承認 / 却下は全 admin に開放**（出勤時間外でも実行可能にする）
2. **メール通知だけ出勤中 admin に絞る**（通知機能の実装時に適用）

## 3. スコープ

### 含む
- 承認 / 却下 API ゲートの変更（`requireOnDutyAdmin` → `requireAdmin` 相当）
- `ApprovalQueue` UI から「出勤中管理者のみ承認」文言・バッジを削除
- `/shift` ページで `canApprove` を admin ロール判定に変更
- 参照マップ更新
- ローカルでの動作確認

### 含まない（別タスク）
- メール通知機能の実装そのもの（現時点で通知パイプラインが未構築）
  - 通知実装時に受信者フィルタとして `isOnDutyAdmin` を再利用する方針を `docs/reference-map.md` または将来の spec に残す
- `requireOnDutyAdmin` / `isOnDutyAdmin` / `/api/me.on_duty_admin` の **削除**
  - 将来の通知機能で再利用するため、**残置**して未参照状態にしておく
- `docs/local-verify-spec.md` の書き換え（検証スクリプトは別フェーズで更新）

## 4. 影響範囲

| # | ファイル | 変更種別 | 内容 |
|---|---|---|---|
| 1 | `src/app/api/shift-change-requests/[id]/route.ts` | edit | approve / reject の認可を `requireOnDutyAdmin()` から admin ロール判定に変更。cancel は従来通り `requireAuthenticated`。 |
| 2 | `src/lib/auth/requireRole.ts` | 必要に応じて edit | admin 限定ゲート `requireAdmin()` が未実装なら追加（既存の `requireAuthenticated` / `requireOnDutyAdmin` と同じ shape で）。既存で代替可能ならそのまま使う。 |
| 3 | `src/components/shift/ApprovalQueue.tsx` | edit | `canApprove` prop の意味を「admin ロール」に変更。「承認は出勤中の管理者のみ（閲覧のみ）」バッジと「現在出勤中の管理者のみ承認/却下できます。」注意文言を削除。 |
| 4 | `src/app/(app)/shift/page.tsx` | edit | `canApprove = (me?.on_duty_admin ?? false)` を `canApprove = me?.role === 'admin'` に変更。`/api/me` の `on_duty_admin` 参照を外す（他用途が無ければ）。 |
| 5 | `docs/reference-map.md` | edit | 変更した API・コンポーネント・ロール判定箇所を追記／修正 |
| 6 | `docs/progress.html` | edit | 新規フェーズ行（例: Phase 25-C-7a「admin 承認の出勤制約撤廃」）を追加し、完了率を追跡 |
| 7 | `docs/error-log.md` | 必要に応じて edit | 実装中に発生したエラーを記録 |

### 触らない / 残置
- `src/lib/auth/isOnDutyAdmin.ts` — 将来のメール通知フィルタで再利用
- `src/app/api/me/route.ts` — `on_duty_admin` フラグは通知のためそのまま返す
- DB migration は不要（RLS にもこの制約は含まれていない設計）

## 5. 変更詳細

### 5-1. `src/app/api/shift-change-requests/[id]/route.ts`

- `requireOnDutyAdmin` の import を外す
- `action === 'cancel'` → `requireAuthenticated()`（変更なし）
- `action === 'approve' | 'reject'` → admin ロール判定のゲートに変更
- コメント冒頭の「approve / reject: 出勤中 admin のみ。」を **「admin ロールのみ。」** に書き換え

### 5-2. `src/lib/auth/requireRole.ts`

`requireAdmin()` が未実装なら追加。既存の `hasRoleAtLeast(staff, 'admin')` を使うユーティリティなど既存の仕組みで表現できる場合はそれを使い、新規追加しない。

### 5-3. `src/components/shift/ApprovalQueue.tsx`

- `canApprove` prop はそのまま（意味が「admin ロールか」に変わる）
- バッジ `{!canApprove && <Badge variant="warning">承認は出勤中の管理者のみ（閲覧のみ）</Badge>}` を削除
- モーダル下部の注意文言 `現在出勤中の管理者のみ承認/却下できます。` ブロックを削除
- 動作は「admin 以外（editor/viewer）が何らかの経路でキューを見た場合に閲覧のみになる」形にするか、**親側で非表示**（admin のみ表示）に統一する。現状は親 `/shift/page.tsx` で admin のみレンダリングしているため、それを維持すれば子側の `!canApprove` 分岐自体が不要になる。削除して問題ないか確認のうえ、シンプル化。

### 5-4. `src/app/(app)/shift/page.tsx`

- `canApprove={me?.on_duty_admin ?? false}` → `canApprove={me?.role === 'admin'}`
- `/api/me` レスポンスの `on_duty_admin` 参照を削除（この画面で他用途が無ければ）

## 6. 動作確認手順（ローカル）

1. `npm run dev` で起動（既に起動中）
2. admin アカウントでログイン
3. `/request` から任意職員のシフト変更申請を 1 件提出（既存テストデータ活用）
4. **出勤時間外**にあたるタイミングで `/shift?month=2026-04` を開く
5. 承認キューの「詳細」→ 承認ボタン / 却下ボタンが **活性** であること
6. 承認 → 対応する `shift_assignments` が `requested_payload` どおりに更新されること（Supabase Studio で確認）
7. editor / viewer でログイン → 承認キューが非表示（親側制御のまま）
8. `npx tsc --noEmit` で型エラーなし
9. サーバーログに 500/4xx が出ていないこと

### Supabase 側チェック SQL
```sql
-- 承認後の shift_change_requests
select id, status, reviewed_by_name, reviewed_at, admin_note
from shift_change_requests
order by updated_at desc limit 5;

-- 対象日の shift_assignments が更新されているか
select staff_id, date, assignment_type, start_time, end_time, is_confirmed
from shift_assignments
where date = '2026-05-13'  -- ← 申請対象日に置換
  and staff_id = 'a1bb6247-3505-4b64-9999-4153632170b7';
```

## 7. リスクと対応

| リスク | 影響 | 対応 |
|---|---|---|
| 全 admin が承認可になることで誤承認が増える | 運用事故 | 承認モーダルで「変更前 → 変更後」を必ず表示（既存のまま）。必要なら確認ダイアログ追加は将来検討 |
| `requireOnDutyAdmin` を残置することで死コードに見える | 可読性 | `isOnDutyAdmin` / `requireOnDutyAdmin` にコメントで「通知機能で再利用予定」と明記 |
| `/api/me.on_duty_admin` を使用している他箇所の見落とし | バグ | 実装前に `grep "on_duty_admin"` で全参照確認（docs を除く実コードが /shift のみであることを確定させる） |
| ApprovalQueue を admin 以外が開いた時の UI 崩れ | UX | 親で admin のみレンダリング前提を維持し、子の `canApprove=false` 分岐は削除 |

## 8. 後続タスク（メモ）

- **メール通知機能の実装**（未着手フェーズ）
  - SMTP / Resend 等のメール送信パイプライン選定
  - 通知トリガ: `shift_change_requests` INSERT / `status` 変更
  - 受信者フィルタ: `isOnDutyAdmin(admin_id)` が true の admin のみ
  - テンプレート: 申請時 / 承認時 / 却下時
- **`/transport` の pattern_id 未紐付け問題**（別計画書で起票予定）
  - PDF import に pattern selector を追加
  - 既存データの backfill UI
  - schedule_entries 作成時に pattern_id 必須化

## 9. 進め方

1. 別セッション（または同セッションで承認後）で `feat/admin-approval-no-onduty-gate` ブランチを切る
2. 本計画書のスコープ内のみ実装
3. `docs/progress.html` に新規フェーズ行を追加し、ステップごとに更新
4. ローカル確認完了後、ユーザーに報告 → コミット
5. main へのマージ判断はユーザーが行う（本計画書の範囲外）
