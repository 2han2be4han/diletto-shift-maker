# CLAUDE.md — ShiftPuzzle

## 1. プロジェクト概要

**アプリ名**: ShiftPuzzle  
**目的**: 放課後等デイサービス事業所向けの送迎・シフト半自動生成SaaS。利用予定（PDFインポート）→シフト生成→送迎担当仮割り当て→手動調整→確定の一連フローをウェブ上で完結させる。  
**対象ユーザー**: 事業所職員（admin / editor / viewer の3ロール）

### 技術スタック
| カテゴリ | 技術 |
|---|---|
| フロントエンド | Next.js 15 (App Router) |
| スタイリング | Tailwind CSS |
| DB・認証 | Supabase (RLS・マルチテナント) |
| 決済 | Stripe Checkout + Webhook |
| デプロイ | Vercel |
| PDF解析 | Anthropic Claude API (`claude-sonnet-4-20250514`) |
| カレンダーUI | @fullcalendar/react |
| 日付処理 | date-fns |

---

## 2. 開発フロー（固定・省略禁止）

1. **いきなり実装は禁止**。必ず調査 → 計画 → 承認 → 実装の順
2. **デプロイは最小限**。必ずローカルホスト（`npm run dev`）で動作確認してから次へ
3. 新機能着手前に「影響範囲」「依存ファイル」「連動ポイント」を文書化して提示すること
4. **実装着手前に進捗表（`docs/progress.html`）を作成し、ステップ完了ごとに更新すること**
5. 新技術・ライブラリ使用前に既知の地雷・注意点を調査し、人間側が事前確認すべき事項をリストアップしてユーザーに提示すること
6. 詰まりそうなポイントは実装前にユーザーへ事前報告すること
7. 想定外の挙動が発生した場合は勝手に解決せず即報告すること

---

## 3. 進捗表の運用（固定・省略禁止）

#### docs/progress.html とは
実装の進捗を可視化するHTMLファイル。Claude Codeは実装着手前に作成し、ステップ完了ごとに更新する。
各ステップごとに別視点やステップ間で実装のずれや齟齬がないか確認する項目を必ず加えること。

#### 含める項目
- フェーズ名
- 機能名
- 対象ファイル名
- ステータス（未着手／進行中／完了）
- 完了率（%）
- 備考（エラー・ブロッカー・確認事項など）

#### Claude Codeが必ず守ること
1. 実装着手前に `docs/progress.html` を作成してユーザーに確認を求める
2. 各ステップ完了後に該当行のステータスと完了率を更新する
3. ブロッカーが発生した場合は備考欄に記載しユーザーに報告する
4. 進捗表の更新を忘れた場合、その作業は未完了とみなす

---

## 4. デザインシステム（固定・省略禁止）

#### 参照ルール
- 実装前に必ず `memory/global/reference_design_rulebook.md` を読み込んでから着手すること
- **適用テーマ: ライトテーマ**（SalesLensのアプリUIを参考にしたライト版）
- デザインルールブックに定義されていない色・フォント・角丸・シャドウの使用禁止

#### 使用するデザイントークン
- **カラー変数**: `--accent`（ボタン・強調）、`--ink`（テキスト）、`--bg`（背景）、`--surface`（カード背景）
- **フォント**: Inter（UI全般）+ Noto Sans JP（日本語テキスト）
- **ボタンバリアント**: Primary（確定・保存）、Secondary（キャンセル・戻る）、App Card CTA（割り当て生成ボタン）
- **レイアウト**: 左サイドバー固定（240px）＋右メインエリアスクロール
- **アニメーション**: Revealパターン不使用（業務ツールのため）

#### 統一ルール（省略禁止）
- CSSカラーのハードコード禁止（必ず `--変数名` を使う）
- ボタンは4種のバリアントから選ぶ（Primary / Secondary / CTA Submit / App Card CTA）
- 新規バリアント作成前にユーザーに確認すること
- フォントはInter + Noto Sans JPのみ（追加フォント禁止）
- 角丸は統一値を使う（カード: 8px、ボタン: 4px、画像フレーム: 12px）
- `btn-shimmer` はdilettoのLP系ページ以外では使用禁止

#### 実装前UIチェック（省略禁止）
- 各画面の実装前にUI案（構造・レイアウト）をユーザーに提示し承認を得ること
- 承認なしに画面実装を開始しないこと

---

## 5. ディレクトリ構成

```
shift-puzzle/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx              # ログインページ
│   ├── (app)/
│   │   ├── layout.tsx                  # サイドバー付き共通レイアウト
│   │   ├── dashboard/page.tsx          # ダッシュボード
│   │   ├── schedule/page.tsx           # 利用予定（PDFインポート・カレンダー）
│   │   ├── shift/page.tsx              # シフト表（生成・調整・確定）
│   │   ├── transport/page.tsx          # 送迎表（仮割り当て・調整・確定）
│   │   ├── request/page.tsx            # 職員の休み希望フォーム
│   │   ├── settings/
│   │   │   ├── tenant/page.tsx         # テナント設定（事業所名・エリア）
│   │   │   ├── staff/page.tsx          # 職員管理（招待・権限・対応エリア）
│   │   │   └── children/page.tsx       # 児童管理（情報・送迎パターン）
│   │   └── billing/page.tsx            # 契約管理（Stripe Portal）
│   └── api/
│       ├── import/pdf/route.ts         # PDFアップロード→Claude API解析
│       ├── shift/generate/route.ts     # シフト自動生成
│       ├── transport/generate/route.ts # 送迎担当仮割り当て生成
│       ├── transport/confirm/route.ts  # 送迎表確定
│       └── webhooks/stripe/route.ts    # Stripe Webhook処理
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                 # サイドバーナビゲーション
│   │   └── Header.tsx                 # ページヘッダー
│   ├── schedule/
│   │   ├── ScheduleCalendar.tsx        # 利用予定カレンダー（FullCalendar）
│   │   ├── PdfImportModal.tsx          # PDFインポートモーダル
│   │   └── PdfConfirmTable.tsx         # PDF解析結果確認テーブル
│   ├── shift/
│   │   ├── ShiftGrid.tsx              # シフトグリッド（職員×日付）
│   │   └── ShiftCell.tsx             # シフトセル（直接編集可能）
│   ├── transport/
│   │   ├── TransportDayView.tsx        # 日別送迎表ビュー
│   │   └── AssignmentCell.tsx          # 担当割り当てセル（ドロップダウン）
│   └── ui/
│       ├── Button.tsx                  # ボタン（4バリアント）
│       ├── Modal.tsx                   # モーダル共通
│       └── Badge.tsx                   # バッジ（警告・確定済み・不足など）
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # ブラウザ用Supabaseクライアント
│   │   └── server.ts                   # サーバー用Supabaseクライアント
│   ├── anthropic/
│   │   └── parsePdf.ts                 # Claude APIによるPDF解析・JSON変換
│   ├── logic/
│   │   ├── generateShift.ts            # シフト生成ロジック（ルールベース）
│   │   └── generateTransport.ts        # 送迎担当割り当てロジック（ルールベース）
│   └── stripe/
│       └── client.ts                   # Stripeクライアント初期化
├── types/
│   └── index.ts                        # 全型定義（DBRow型・ロジック型）
├── docs/
│   ├── progress.html                   # 実装進捗表（着手前に作成）
│   ├── reference-map.md                # 参照マップ
│   └── error-log.md                    # エラーログ
├── .env.local                          # 環境変数（gitignore対象）
├── .env.example                        # 環境変数テンプレート（項目名のみ）
├── CLAUDE.md                           # このファイル
└── SPEC.md                             # 仕様書
```

---

## 6. 編集ルール

#### 変更してよいファイル
| ファイル | 変更してよい範囲 |
|---|---|
| `app/(app)/*/page.tsx` | UIの追加・修正。既存のコンポーネントのpropsを壊さない範囲 |
| `components/**/*.tsx` | 既存のprops型定義を変更しない範囲での機能追加 |
| `lib/logic/generateShift.ts` | ルール追加・修正。関数シグネチャを変えない範囲 |
| `lib/logic/generateTransport.ts` | 割り当てロジックの修正。関数シグネチャを変えない範囲 |
| `lib/anthropic/parsePdf.ts` | プロンプトの修正・改善のみ |
| `types/index.ts` | 型の追加は可。既存の型定義の削除・変更は禁止 |

#### 変更してはいけないファイル
| ファイル | 理由 |
|---|---|
| `app/api/webhooks/stripe/route.ts` | Stripe署名検証ロジックを破壊するリスクがあるため。変更時は必ずユーザーに報告してから |
| `lib/supabase/server.ts` | RLSを破壊するリスクがあるため。変更時は必ずユーザーに報告してから |
| `.env.local` | シークレットのため直接編集禁止。`.env.example` に項目名のみ追記すること |

#### 新機能追加時に必ず行うこと
1. `docs/reference-map.md` を開き、影響するDBカラム・定数・型を確認する
2. `types/index.ts` に必要な型を追加する
3. Supabaseのマイグレーションファイルを作成する（`tenant_id` と RLSポリシーを必ず含める）
4. `docs/progress.html` に新機能のステップを追加する
5. UIを実装する前にユーザーにUI案を提示し承認を得る
6. 実装後は `docs/reference-map.md` を更新する

#### 破壊的変更の禁止事項
- `tenant_id` カラムのないテーブルを作成禁止
- RLSポリシーを設定せずにテーブルを公開禁止
- 既存の型定義（`types/index.ts`）を削除・変更禁止
- `transport_assignments` テーブルの確定済みレコード（`is_confirmed: true`）を自動上書き禁止
- `shift_assignments` テーブルの確定済みレコード（`is_confirmed: true`）を自動上書き禁止

---

## 7. 実装時の必須ルール（固定・省略禁止）

#### コード品質
- `console.log` を本番コードに残さない
- TypeScriptで `any` を使わない（型定義から逃げない）
- コメントは「何をしているか」でなく「なぜそうしているか」を書く
- エラーハンドリングを省略しない
- ユーザーに見えるエラーメッセージは日本語で統一する

#### セキュリティ
- APIキー・シークレットをコードに直書き禁止
- `.env.local` を `.gitignore` に必ず含める
- 環境変数は必ず `.env.example` に項目名のみ記載する
- Supabase APIへのアクセスはサーバーサイドのみで行う（`SUPABASE_SERVICE_ROLE_KEY` をブラウザに露出禁止）
- `NEXT_PUBLIC_` プレフィックスの変数には絶対にシークレットを入れない

#### パッケージ管理
- 新規パッケージ追加前にライセンスを確認する
- 既存パッケージで代替できないか先に確認する
- パッケージのバージョン・互換性を事前確認する

#### 動作確認
- 正常系だけでなく異常系（空・上限・エラー）も確認してから報告する
- PC・タブレット両サイズでの表示確認を必ず行う（モバイルは優先度低）
- ローカルホスト（`npm run dev`）で確認してからユーザーに報告する

---

## 8. 機能ごとの制約

#### PDF解析（Claude API）
- 使用モデル: `claude-sonnet-4-20250514` 固定（変更禁止）
- `max_tokens`: 4000 固定
- レスポンスは必ずJSON形式で返すようプロンプトに明記すること
- JSON以外のテキストが含まれた場合のパースエラーは必ずcatch してユーザーに日本語でエラー表示する
- 解析結果は必ず確認画面（`PdfConfirmTable.tsx`）を経由してからDBに保存する（直接保存禁止）

#### シフト生成ロジック
- 最低出勤人数: `Math.ceil(利用人数 / 2)`、最低3名
- 有資格者の最低出勤数: テナント設定値（デフォルト: 2名）
- 生成結果は `is_confirmed: false` で保存する（自動確定禁止）
- 確定済みシフト（`is_confirmed: true`）がある月は「再生成」の明示的な操作なしに上書き禁止

#### 送迎担当割り当てロジック
- 1回の送迎につき担当者は最大2名まで
- 割り当て優先ルール（この順番で評価すること）:
  1. その日に出勤している職員のみ候補
  2. 送迎時間が職員の勤務時間内に収まること
  3. 送迎エリアが職員の対応エリアと一致すること
  4. 同一エリア・同一時間帯（±30分以内）の児童はグルーピング
  5. 1日の送迎回数が均等になるよう分散
- 条件を満たす職員が存在しない場合: `is_unassigned: true` フラグを立て、赤ハイライトで表示する（空欄のまま確定は禁止）
- 生成結果は `is_confirmed: false` で保存する（自動確定禁止）

#### 権限制御（Phase 25 更新）
- `viewer` ロール: 原則 GET 系のみ。例外:
  - 自分の `shift_requests`（休み希望）の書き込み可
  - 自分の `shift_change_requests`（シフト変更申請）の書き込み可
  - 児童の出欠ステータス更新可（RPC `update_schedule_entry_attendance` 経由、履歴必須）
- `editor` ロール: 利用予定・シフト・送迎表の編集可。テナント設定・職員管理禁止
- `admin` ロール: 全操作可。ただし「シフト変更申請の承認/却下」は**現在出勤中の admin のみ**（`isOnDutyAdmin` で判定、`requireOnDutyAdmin` で強制）
- 職員の退職はソフト削除のみ（`is_active=false` + `retired_at` 設定）。物理削除は完全廃止
- 退職者は `current_staff()` 等の補助関数で自動除外され、全 RLS を通過できない（ログイン不可）
- ロールチェックはAPIルート側で必ず実施する（フロントエンドのみの制御禁止）

#### 出欠記録（Phase 25）
- `schedule_entries.attendance_status`（planned/present/absent/late/early_leave）で管理
- 更新は必ず RPC `update_schedule_entry_attendance(p_entry_id, p_status)` 経由（全ロール許可）
- 更新のたびに `attendance_audit_logs` に履歴を自動記録（changed_by_name スナップショット保持で退職後も参照可）
- `attendance_status='absent'` の児童は日次出力・送迎表から除外される

#### シフト変更申請（Phase 25）
- `shift_change_requests` テーブル。`change_type` は `time`/`leave`/`type_change` の3種
- 申請: viewer は自分の `staff_id` のみ、editor/admin は他人分も可
- 承認/却下: 出勤中 admin のみ。承認時は `shift_assignments` をトランザクション更新
- 承認後の変更取消は新規申請として提出（過去の申請を書き換えない）

#### マルチテナント
- 全テーブルに `tenant_id` カラムを必ず含める
- 全APIルートで `tenant_id` をセッションから取得し、クエリに必ず含める
- RLSポリシーは全テーブルに設定する（設定漏れ禁止）

#### Stripe
- Webhook署名の検証を省略禁止
- `stripe_subscription_id` が `null` または `status !== 'active'` のテナントはAPIアクセスを制限する
- Price IDは `.env.example` の `STRIPE_PRICE_ID` から取得する（ハードコード禁止）

---

## 9. 命名規則

| カテゴリ | 規則 | 例 |
|---|---|---|
| ファイル名 | kebab-case | `generate-transport.ts`, `pdf-import-modal.tsx` |
| Reactコンポーネント | PascalCase | `TransportDayView`, `ShiftGrid` |
| 関数名 | camelCase | `generateShiftAssignment`, `parsePdfToJson` |
| 型名 | PascalCase + 用途suffix | `StaffRow`, `ChildPattern`, `TransportAssignment` |
| 定数 | SCREAMING_SNAKE_CASE | `MAX_STAFF_PER_TRANSPORT`, `DEFAULT_MIN_QUALIFIED_STAFF` |
| DBテーブル | snake_case・複数形 | `shift_requests`, `transport_assignments`, `schedule_entries` |
| DBカラム | snake_case | `tenant_id`, `is_confirmed`, `pickup_time` |
| APIルート | kebab-case | `/api/transport/generate`, `/api/import/pdf` |
| 環境変数 | SCREAMING_SNAKE_CASE | `NEXT_PUBLIC_SUPABASE_URL`, `ANTHROPIC_API_KEY` |

---

## 10. 連動ポイント（触ったら必ず確認）

| 変更箇所 | 確認が必要なファイル |
|---|---|
| `types/index.ts` の型変更 | 該当型を使用している全コンポーネント・APIルート |
| DBテーブル構造変更 | `types/index.ts` + 該当APIルート + 該当コンポーネント + `docs/reference-map.md` |
| `generateTransport.ts` のロジック変更 | `api/transport/generate/route.ts` + `TransportDayView.tsx` |
| `generateShift.ts` のロジック変更 | `api/shift/generate/route.ts` + `ShiftGrid.tsx` |
| `parsePdf.ts` のプロンプト変更 | `PdfConfirmTable.tsx`（解析結果の表示項目と一致しているか確認） |
| エリアラベル（絵文字）の追加・変更 | `types/index.ts` + `generateTransport.ts` + `settings/tenant/page.tsx` |
| Stripe Price ID変更 | `lib/stripe/client.ts` + `api/webhooks/stripe/route.ts` + `.env.example` |
| Supabaseテーブル追加 | RLSポリシー設定 + `types/index.ts` + `docs/reference-map.md` |
| ロール定義変更 | 全APIルートのロールチェック箇所 + `settings/staff/page.tsx` |

---

## 11. スコープ外（実装禁止）

以下はClaude Codeが勝手に追加してはいけない。要望があってもユーザー承認なしに着手しない。

- デイロボへの自動ログイン・PDF自動取得バッチ（Playwright）→利用規約確認後に別フェーズ
- 保護者向けポータル・通知機能
- 請求書・支援記録などの書類自動生成
- モバイルアプリ（iOS・Android）
- 多言語対応
- ChatGPT・Geminiなど他AIモデルへの切り替え機能
- 送迎担当の完全自動確定（必ず人間が確認・確定するフローを維持すること）
- 利用予定データのデイロボへの書き戻し

---

## 12. 参照マップ運用（固定・省略禁止）

#### docs/reference-map.md とは
プロジェクト内の「カラム・定数・型・テーブル」が、どのファイルのどの行で参照されているかを記録する台帳。Claude Codeはこれを見て影響範囲を把握する。

#### Claude Codeが必ず守ること
1. **新規ファイル作成時**: そのファイルが参照している「DBカラム名」「プラン名文字列」「定数」「型」を全て `docs/reference-map.md` に追記する
2. **既存ファイル編集時**: 編集後、参照マップの該当エントリを更新する（行番号がズレた場合も含む）
3. **DBカラム追加時**: `docs/reference-map.md` に新エントリを作成してから実装に着手する
4. **ロール・権限関連の変更前**: `docs/reference-map.md` の「ロール参照」セクションを開き、列挙された全ファイルをユーザーに報告してから着手する
5. **参照マップの更新を忘れた場合は、その作業は未完了とみなす**

#### 更新タイミング
- ファイル新規作成 → 即時追記
- カラム追加・削除 → 着手前に追記
- リファクタ・ファイル分割 → 完了後に更新
- コミット前に必ず参照マップとコードの整合性を確認

#### 禁止事項
- 参照マップを更新せずにDBカラムを追加すること
- 参照マップに載っていないロール名文字列をハードコードすること（必ず定数ファイル経由）
- 参照マップの存在を無視して「grepすればわかる」と判断すること

---

## 13. エラーログ運用（固定・省略禁止）

#### docs/error-log.md とは
実装中に発生したエラーと解決方法を記録するファイル。同じエラーで二度詰まらないための学習ログ。Claude Codeはエラー解決のたびに必ず記録する。

#### 記録フォーマット
```
---
## [エラー名 or 現象の一言説明]

- **発生日**: YYYY-MM-DD
- **発生箇所**: ファイル名・関数名・行番号
- **エラー内容**: 実際のエラーメッセージをそのまま記載
- **原因**: なぜ発生したか
- **解決方法**: 何をしたら直ったか（コードスニペット含む）
- **再発防止**: 同じエラーを起こさないために注意すること
---
```

#### Claude Codeが必ず守ること
1. エラーが発生して解決したら、作業完了前に必ず `docs/error-log.md` に記録する
2. 同種のエラーが発生したら、まず `docs/error-log.md` を参照してから対処する
3. ユーザーが指摘して初めて発覚したエラーも必ず記録する
4. 解決できなかったエラーも「未解決」として記録しユーザーに報告する
5. エラーログの記録を忘れた場合、その作業は未完了とみなす

#### 禁止事項
- エラーを解決したのに記録しないこと
- エラーログを確認せずに同じエラーに対処しようとすること
- 原因不明のまま「とりあえず動いた」で記録を終わらせること
