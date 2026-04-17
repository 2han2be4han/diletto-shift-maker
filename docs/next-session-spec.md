# 次セッション用 仕様書 / 実装計画

**対象コミット起点**: [`53586b8`](https://github.com/2han2be4han/diletto-shift-maker/commit/53586b8) (Phase 25 A/B/C 完了時点)
**作成日**: 2026-04-17

---

## 0. 前提作業（セッション冒頭で実施）

### 0-1. Supabase へ未適用マイグレーションを適用
```
supabase/migrations/0022_shift_requests_submitted_by.sql
```
内容: `shift_requests` に `submitted_by_staff_id uuid references staff(id) on delete set null` を追加 + index。
未適用のままだと /request 管理者ビューの代理入力保存で NOT NULL 違反にはならないが、**代理バッジ**が常に非表示になる。

### 0-2. 進捗表の作成（CLAUDE.md §3 必須）
着手前に `docs/progress.html` にフェーズ 26 の行を追加し、下記 5 タスクのステータスを表に含める。各ステップ完了後に更新する。

---

## 1. タスク一覧（優先度順）

| # | タスク | 優先度 | 依存 |
|---|---|---|---|
| 1 | /shift ヘッダー整備 | 高 | なし |
| 2 | 職員の出勤数カウント表示 | 中 | なし |
| 3 | 休み希望ページの並び替え反映確認 | 低 | なし |
| 4 | /transport 改修（4 サブ項目） | 高 | なし |
| 5 | 招待リンクからの職員ログインフロー | 高（独立） | 別ブランチ推奨 |

---

## 2. タスク詳細

### 2-1. /shift ヘッダー整備

#### 目的
`/shift` を `/schedule` 並みの視認性に整える。具体的には以下をヘッダー領域に集約：
- 対象年月（既に `MonthSelector` が配置済み）
- 「シフト確定」ボタン
- 「再生成」ボタン
- 確定後も編集可能なモード切替

#### 対象ファイル
- `src/app/(app)/shift/page.tsx`

#### 現状
ヘッダー下のコンテンツ領域に h2 年月 + ボタン群が置かれている。`Header` の `actions` は未使用（MonthSelector のみ）。

#### 実装指針
1. `Header actions` に「シフト確定」「再生成」を移設
   - 生成前: 「シフト生成」(app-card-cta)
   - 生成済/未確定: 「再生成」(secondary) + 「シフト確定」(primary)
   - 確定済: 「編集モード」トグル or 「再編集」ボタン + 「再生成」(secondary)
2. 確定済のセル編集を有効化
   - 現状: `handleSave` は `is_confirmed: confirmed` で保存しているため、確定状態のまま編集は技術的に可能
   - 必要: 編集モード有効時にセルクリックハンドラを走らせる（今は `disabled={confirmed}` で生成を止めているだけ）
3. 「確定解除」API（`/api/shift-assignments/unconfirm`）を新設するか、既存 `/confirm` エンドポイントを `confirmed: boolean` 引数化
4. h2「{year}年{month}月」+ バッジはコンテンツ先頭から削除し、ヘッダータイトルに統合可

#### 受入条件
- `/schedule` と同じ余白・ボタン配置
- 確定後も「編集モード」に入ると個別セル編集 → 保存できる
- バッジ（確定済み/未確定/警告件数）がヘッダーの下にインラインで見やすく並ぶ

#### 注意点
- 確定済みシフトの自動上書きは禁止（CLAUDE.md §6 破壊的変更）。「再生成」を押すと必ず確認ダイアログを表示
- `tenant_id` を忘れず UPSERT

---

### 2-2. 職員の出勤数カウント表示

#### 目的
シフトグリッドで各職員の「出勤◯日」を名前横に可視化。

#### 対象ファイル
- `src/components/shift/ShiftGrid.tsx`

#### 実装指針
1. `cells` から `staff_id` ごとに `assignment_type === 'normal'` の件数を集計
2. 職員名セル内に `<span>出勤{count}日</span>`（小さめ・`var(--ink-3)`）
3. 可能なら「出勤{count}日 / 希望休{ph}日 / 有給{pl}日」も副次的に

#### 受入条件
- 職員行を見ると月内の出勤日数が一目でわかる
- セル編集後、カウントが即時再計算される

---

### 2-3. 休み希望ページの並び替え反映確認

#### 目的
`display_order` が /request でも反映されることを確認。

#### 対象ファイル
- `src/app/(app)/request/page.tsx`
- `src/components/request/AdminRequestList.tsx`

#### 現状
サーバー側 select に `.order('display_order', { ascending: true, nullsFirst: false }).order('name')` 済。

#### 実装指針
- 実ブラウザで登録順と display_order 順が一致するか確認
- 不一致なら `AdminRequestList` 内部で `staff` を受け取った順に依存していないか再確認（`byStaff` マップ利用のため `staff` 配列順がそのまま出力順になっているはず）

#### 受入条件
- `/settings/staff` でドラッグ並び替え → `/request` のリスト順も追従

---

### 2-4. /transport 改修

#### 対象ファイル
- `src/app/(app)/transport/page.tsx`
- `src/components/transport/TransportDayView.tsx`
- `src/lib/logic/generateTransport.ts`

#### 2-4-a. 担当候補のフィルタ
**要件**: その日出勤している職員 **かつ 退勤時間 ≥ 16:31** のみを割当候補に含める。

**実装指針**:
- `TransportDayView` の `availableStaff` 決定ロジックを修正
- 親コンポから `shiftAssignments`（その日分）を渡し、`assignment_type === 'normal'` かつ `end_time >= '16:31'` で絞る
- 16:31 閾値はテナント設定 `settings.transport_min_end_time` で可変にする余地を残す（デフォルト `'16:31'`）

#### 2-4-b. 保存粒度の変更：件ごと → 日ごと
**要件**: 現状は `handleStaffChange` で 1 件ずつ POST → 1 日分まとめてボタンで保存に変更。

**実装指針**:
1. `transportAssignments` のローカル編集用 state を別途用意（`pendingChanges: Map<scheduleEntryId, TransportAssignmentRow>`）
2. `TransportDayView` 側のセル変更は pending state のみ更新
3. 画面下部に「この日の送迎を保存」ボタン配置 → pending を `assignments` 配列化して /api/transport-assignments に一括 POST
4. 離脱時（日付タブ切替・月切替）に未保存があれば `confirm()` で警告

#### 2-4-c. 保護者送迎の専用表記
**要件**: `schedule_entries.pickup_method === 'self'` または `dropoff_method === 'self'` の時は割当不要かつエラー (`isUnassigned`) 扱いにしない。専用マーク表示。

**実装指針**:
- `currentDayEntries` 構築時に `pickupMethod`/`dropoffMethod` を UI エントリに追加
- `isUnassigned` の計算ロジックを「method が pickup/dropoff かつ staff_ids が空」に限定
- `TransportDayView` のセル: 保護者送迎なら `👪 保護者送迎` のような淡色バッジ + 担当ドロップダウン非表示
- `/api/transport/generate` 側でも method=self の entry は assignment レコード自体を生成しない（あるいは `is_unassigned: false` で空配列を記録）

#### 2-4-d. 場所 + マーク表示
**要件**: 送迎先の場所文字列 + エリア絵文字マークを各セル内に明示表示。

**実装指針**:
- UI エントリに既存の `pickupLocation` / `dropoffLocation` / `pickupAreaLabel` / `dropoffAreaLabel` を使用
- セル内に `{areaLabel} {location}` の 2 行表示（areaLabel は絵文字込み、例: `🏠 田無`）
- Google Maps リンク化を継続（既に実装あり）

#### 受入条件（2-4 全体）
- 候補に 16:30 以前退勤者や休み者が出ない
- 1 日分の編集が 1 クリックで保存できる
- 保護者送迎の行に赤エラーが出ない
- 送迎先場所とエリア絵文字が一目で分かる

---

### 2-5. 招待リンクからの職員ログインフロー

#### 問題
現状のリンク例:
```
/login?error=auth_callback_failed#access_token=eyJ...&refresh_token=...&type=invite
```
- `/auth/callback/route.ts` は `?code=` のみ処理（PKCE 前提）
- Supabase invite はデフォルトで implicit flow の hash fragment を使用
- hash は **サーバーに送られない** → `exchangeCodeForSession` は空振り → auth_callback_failed へ
- 加えて、初回パスワード設定画面が未実装

#### 対象ファイル（新規 + 変更）
- **新規** `src/app/auth/callback/page.tsx` (Client Component) — hash 処理
- **新規** `src/app/auth/set-password/page.tsx` — 初回パスワード設定
- 変更 `src/app/auth/callback/route.ts` — 保持（PKCE 用）
- 変更 `src/app/api/staff/invite/route.ts` — redirectTo を `/auth/callback?next=/auth/set-password` などに変更

#### 実装指針
1. **方針 A（推奨）: PKCE へ切替**
   - `generateInviteLink.ts` / `inviteUserByEmail` 側の設定を確認し、PKCE を強制できるなら `?code=` 方式へ統一。callback route.ts はそのまま使える
   - Supabase の `supabase.auth.admin.inviteUserByEmail` は implicit flow になりがちなので、代替として `admin.generateLink({ type: 'invite' })` の `email_otp` or `magic_link` + PKCE を検証
2. **方針 B: hash 受け**（実装が確実）
   - `/auth/callback` を page.tsx（client）に変え、`window.location.hash` を parse
   - `access_token` + `refresh_token` を `supabase.auth.setSession()` で確立
   - `type=invite` なら `/auth/set-password` へ、それ以外は `next` パラメータへ遷移
   - 同パスで route.ts と page.tsx は共存不可。`/auth/confirm` など別パスで受け、route.ts は残すのが無難
3. **パスワード設定画面**
   - `/auth/set-password`: 2 回入力 + バリデーション（8 文字以上、CLAUDE.md §7 のエラー日本語化）
   - `supabase.auth.updateUser({ password })` で設定 → `/dashboard` へ
   - 既にパスワード設定済みユーザーが直接開いたら弾く（`app_metadata.provider === 'email'` かつ既存確認は困難。シンプルに「パスワード変更」としても運用可）

#### 受入条件
- 招待メールのリンクをクリック → `/auth/set-password` が開く
- パスワード 2 回入力 → `/dashboard` に遷移
- 以降 `/login` から通常ログイン可能

#### 注意点（CLAUDE.md §11 スコープ境界）
- 保護者向けポータル作成は禁止
- `staff` テーブルの `user_id` 紐付けは既存の invite API が handling 済み — 2 重更新しない
- **別ブランチで作業推奨**（動作確認コストが大きく、事故ると全員ログイン不可になり得るため）

---

## 3. 横断的ルール（毎タスク厳守）

1. CLAUDE.md §2 の開発フロー（調査→計画→承認→実装）を各タスク頭で再実行
2. `docs/progress.html` をステップ毎更新
3. `docs/reference-map.md` に新規カラム/定数/型参照を追記
4. エラー発生 → 解決したら `docs/error-log.md` に記録
5. 実装後は `npx tsc --noEmit` で型確認 → ローカル動作確認 → 同意を得てからコミット
6. デザイントークンのみ使用（ハードコード禁止）
7. マルチテナント: 全 API/クエリで `tenant_id` 必須

---

## 4. 既知の未適用事項サマリ

- **Supabase 本番**: migration 0022 未適用 → 適用必要
- **Supabase 本番**: migration 0020/0021 は適用済（前セッションで確認）
- **ローカル Supabase**: 全マイグレーション適用済み前提で進める

---

## 5. 見積もり（目安）

| タスク | 工数目安 |
|---|---|
| 2-1 /shift ヘッダー | 30-45 分 |
| 2-2 出勤数カウント | 15-20 分 |
| 2-3 並び替え確認 | 5-10 分 |
| 2-4 /transport 改修 | 60-90 分（4 サブ項目合算） |
| 2-5 招待フロー | 60-120 分（PKCE 調査込み） |

---

## 6. セッション終了時の checklist

- [ ] 全タスクの受入条件を満たしている
- [ ] `npx tsc --noEmit` がエラーなし
- [ ] `docs/progress.html` がすべて「完了」
- [ ] `docs/reference-map.md` が最新
- [ ] `docs/error-log.md` に発生エラー記録済
- [ ] コミット済・プッシュ済
- [ ] Supabase 本番への migration 適用有無をユーザーに明示報告
