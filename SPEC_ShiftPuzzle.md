# ShiftPuzzle 仕様書
> 放課後等デイサービス向け 送迎・シフト半自動生成SaaS

---

## 1. アプリ概要

### 目的・解決する課題
放課後等デイサービス事業所における「利用予定の管理→送迎担当の割り当て→シフト作成」という月次オペレーションを半自動化する。現状はExcel+VBA+手入力で行われている1ヶ月分の送迎担当割り当て（1日10名×30日）を、システムが仮割り当てを生成し、管理者が調整するだけで完了する状態にする。

### 対象ユーザー
- **編集者**：数名の職員（利用予定入力・シフト調整・担当割り当て修正）
- **閲覧者**：全職員（送迎表・シフト表の確認）
- **テナント管理者**：事業所の管理者（職員アカウント管理・請求）
- **将来的な販売先**：他の放課後等デイサービス事業所（マルチテナントSaaS）

### 技術スタック
| カテゴリ | 採用技術 |
|---|---|
| フロントエンド | Next.js 15 (App Router) |
| スタイリング | Tailwind CSS |
| バックエンド | Next.js API Routes |
| DB・認証 | Supabase (RLS・マルチテナント) |
| 決済 | Stripe |
| デプロイ | Vercel |
| PDF解析 | Anthropic Claude API (claude-sonnet-4-20250514) |
| バッチ処理 | Playwright + node-cron（常時起動PC上で動作） |
| カレンダーUI | FullCalendar (@fullcalendar/react) |
| 日付処理 | date-fns |

---

## 2. 完成形の定義

### 完成の条件
- [ ] テナント登録・職員アカウント管理ができる
- [ ] 児童情報（送迎パターン）を登録・編集できる
- [ ] 職員情報（勤務パターン・エリア対応）を登録・編集できる
- [ ] 利用予定をデイロボPDF自動取得またはPDF手動アップロードでインポートできる
- [ ] 職員が休み希望をウェブフォームから提出できる
- [ ] シフト表を休み希望を反映した上で半自動生成できる
- [ ] 送迎担当を「児童の送迎時間・場所」「職員の出勤時間・エリア対応」を考慮して仮割り当てできる
- [ ] 仮割り当て結果を画面上で手動調整できる
- [ ] 確定した送迎表・シフト表を画面表示・印刷できる
- [ ] StripeによるサブスクリプションでSaaS課金が動作する

### MVPの定義
以下が動作すれば完成とみなす：
1. PDF手動アップロード→Claude APIによる利用予定解析→DB登録
2. 休み希望フォーム提出→シフト半自動生成
3. 送迎担当の仮割り当て生成
4. 画面上での手動調整・確定
5. 送迎表・シフト表の画面表示

### スコープ外（将来拡張）
- デイロボへの自動ログイン・PDF自動取得バッチ（利用規約確認後に別フェーズで実装）
- 保護者向けポータル
- 請求書・記録書類の自動生成
- モバイルアプリ

---

## 3. 技術スパイク結果

### PDF解析（Claude API）
- **採用方式**：PDFをbase64エンコードしてClaude APIに直接渡す（`document`タイプ）
- **注意点**：1回のAPI呼び出しで1PDFを処理。月次PDFは1ファイルで全児童・全日程を含むため、レスポンスのJSONパース処理を堅牢に実装すること
- **プロンプト設計**：「以下のPDFから児童ごと・日付ごとの利用予定を抽出し、指定のJSON形式で返してください」と厳密に指定する
- **地雷**：PDFのレイアウトが変わるとプロンプト調整が必要。初回は必ず確認画面を挟む

### Playwright バッチ（将来フェーズ）
- **採用方式**：常時起動PCでnode-cronが毎日深夜に実行、Playwrightでデイロボに自動ログイン→PDF保存→APIエンドポイントに送信
- **注意点**：デイロボのログイン認証方式が変わると動作しなくなる。エラー時はSlackまたはメール通知を実装する
- **地雷**：デイロボがSPA(シングルページアプリ)の場合、ページロード待機の実装が必要（`waitForSelector`を使う）

### 送迎担当割り当てロジック
- **採用方式**：ルールベースの割り当て（AIではなくロジック処理）
- **ルール**：①出勤している職員のみ候補、②送迎時間が勤務時間内に収まること、③送迎エリアが対応エリアと一致すること、④1回の送迎で複数児童をまとめられる場合はグルーピング
- **注意点**：完全自動は困難（現場の暗黙知が多い）。必ず「仮割り当て→手動調整」のフローを維持する

### マルチテナント（Supabase RLS）
- **採用方式**：全テーブルに`tenant_id`カラムを持ち、RLSポリシーで他テナントのデータを完全遮断
- **注意点**：RLSのポリシー漏れが最大のリスク。テスト時に別テナントからのアクセスを必ず確認する

### 人間側が事前に確認すべきこと
- [ ] デイロボの利用規約でPlaywrightによる自動操作が許可されているか確認する（**実装前に必須**）
- [ ] デイロボのPDF出力のレイアウトが毎月安定しているか、過去PDFを数ヶ月分確認する
- [ ] 送迎エリアの絵文字（🍇🌳🏭✈など）とエリア名の対応表を作成する
- [ ] 職員ごとの「対応可能エリア」を事前に整理する
- [ ] Stripeのアカウントを作成し、Price IDを取得する
- [ ] Supabaseプロジェクトをこのアプリ専用に新規作成する（既存製品とは分離）

### リスク・不明点
- デイロボPDFのレイアウトが施設によって異なる可能性がある（SaaS展開時に要検証）
- 送迎担当の割り当てロジックに施設ごとの固有ルールがある可能性が高い（ヒアリング継続が必要）

---

## 4. デザインシステム

### 参照元
- dilettoデザインルールブック: `memory/global/reference_design_rulebook.md`
- **適用テーマ**: ライトテーマ（SalesLensのアプリUIを参考にしたライト版）
- 参考: SalesLensのサイドバーレイアウト・カードコンポーネント構造を流用

### このアプリで使用するデザイントークン
- **カラー**: `--accent`（ボタン・強調）、`--ink`（テキスト）、`--bg`（背景白系）、`--surface`（カード背景）
- **フォント**: Inter（UI全般）、Noto Sans JP（日本語テキスト）
- **ボタンバリアント**: Primary（確定・保存）、Secondary（キャンセル・戻る）、App Card CTA（割り当て生成ボタン）
- **レイアウトパターン**: サイドバー固定 + メインエリアスクロール
- **アニメーション**: Revealパターンなし（業務ツールのため不要）

### 画面別レイアウト構造
全画面共通：左サイドバー（幅240px固定）＋右メインエリア（スクロール）

| 画面 | メインエリアの構成 |
|---|---|
| ダッシュボード | 今月のサマリーカード群 |
| 利用予定 | 月カレンダー＋児童リスト |
| 送迎表 | 日別タブ＋児童×担当グリッド |
| シフト表 | 月カレンダー形式グリッド |
| 休み希望フォーム | シンプルフォーム（職員向け） |
| 設定 | タブ形式（テナント・職員・児童） |

**ブレークポイント対応**: タブレット以下は横スクロール（業務ツールのためモバイル最適化は優先度低）

---

## 5. 機能一覧

### 5-1. 認証・テナント管理
- **機能**: Supabase Authによるメール認証、テナント登録、職員招待
- **優先度**: 高
- **詳細**: 
  - テナント管理者がStripeで契約後、テナントが作成される
  - 管理者が職員をメールで招待（role: `admin` / `editor` / `viewer`）
  - `admin`: 全機能利用可能
  - `editor`: 利用予定・シフト・送迎表の編集可能
  - `viewer`: 閲覧のみ

### 5-2. 児童情報管理
- **機能**: 児童ごとの送迎パターンを登録・編集
- **優先度**: 高
- **詳細**:
  - 登録項目: 児童名・学年区分（未就学/小1〜6）・送迎エリア・送迎場所・送迎時間パターン（複数登録可能）
  - パターン区分: 「保育園」「学校（通常）」「学校（短縮）」「自宅（休日）」「保護者送迎」など
  - 1児童につき複数パターンを登録し、利用予定に応じて自動選択

### 5-3. 職員情報管理
- **機能**: 職員ごとの勤務パターン・対応エリアを登録
- **優先度**: 高
- **詳細**:
  - 登録項目: 氏名・雇用形態・標準勤務時間・対応可能送迎エリア（複数選択）
  - エリアは絵文字ラベルで管理（🍇=藤江、🌳=豊明、🏭=大府、✈=常滑、🍶=学童エリアなど）
  - エリアラベルはテナントごとにカスタマイズ可能

### 5-4. 利用予定インポート（PDF解析）
- **機能**: デイロボのPDFをアップロードしてClaude APIで解析・DB登録
- **優先度**: 高
- **詳細**:
  - PDFアップロード→Claude APIで児童名・日付・利用時間を抽出→JSON化
  - 確認画面で抽出結果を表示（修正可能）→確定でDB登録
  - 既存データとの差分のみ更新（上書きではなく差分マージ）
  - 解析失敗時はエラー詳細を表示し手動入力に切り替え可能

### 5-5. 利用予定の手動編集
- **機能**: 月カレンダーで各日の利用児童・時間を直接編集
- **優先度**: 高
- **詳細**:
  - 月カレンダー表示で日付をクリック→その日の利用予定を編集
  - 児童の追加・削除・時間変更が可能
  - 変更時は「送迎表を再生成する必要があります」のアラートを表示

### 5-6. 職員休み希望フォーム
- **機能**: 職員が翌月の休み希望・出勤可能日を提出
- **優先度**: 高
- **詳細**:
  - 職員がログイン後、カレンダーUIで希望休・出勤可能日を選択して提出
  - 申請種別: 公休希望・有給希望・出勤可能日（パートのみ）・特記事項（テキスト）
  - 提出後の修正は締切日まで可能（管理者が締切日を設定）
  - 管理者は全職員の提出状況を一覧確認できる

### 5-7. シフト半自動生成
- **機能**: 休み希望・利用人数・必要職員数を考慮してシフトを生成
- **優先度**: 高
- **詳細**:
  - 生成ルール:
    1. 職員の休み希望を反映（公休・有給を割り当て）
    2. 利用人数に応じた最低出勤人数を確保（利用人数÷2を切り上げ、最低3名）
    3. 有資格者が規定数以上出勤するよう確保
    4. 休憩が取れる人員配置かチェック
  - 生成結果をカレンダーグリッドで表示
  - 不足・警告箇所をハイライト表示（赤：人員不足、黄：要確認）
  - ドラッグ&ドロップまたはセル直接編集で調整可能

### 5-8. 送迎担当仮割り当て生成
- **機能**: 確定シフト・利用予定を元に送迎担当を自動仮割り当て
- **優先度**: 高
- **詳細**:
  - 割り当てロジック（優先順位順）:
    1. その日に出勤している職員のみ候補
    2. 送迎時間が勤務時間内に収まること
    3. 送迎エリアが職員の対応エリアと一致すること
    4. 同一エリア・同一時間帯の児童は同一職員でグルーピング
    5. 1日の送迎回数が均等になるよう分散
  - 「迎え担当」「送り担当」を別々に割り当て
  - 複数担当（例：金田・加藤）にも対応（1人または2人まで）
  - 割り当て不可（条件を満たす職員なし）の場合は赤くハイライトして管理者に通知

### 5-9. 送迎表の手動調整・確定
- **機能**: 仮割り当て結果を画面上で調整して確定
- **優先度**: 高
- **詳細**:
  - 日別タブで各日の送迎表を表示
  - 担当者をドロップダウンで変更可能
  - 確定ボタンで月次送迎表を確定（確定後は変更に「再確定」が必要）
  - 確定した送迎表はExcelファイルの「印　送迎表」「作　送迎表」と同等の情報を表示

### 5-10. 送迎表・シフト表の表示・印刷
- **機能**: 確定した送迎表・シフト表を印刷用レイアウトで出力
- **優先度**: 中
- **詳細**:
  - ブラウザの印刷機能でA4横向きに対応したCSSを適用
  - 送迎表: 日付・利用者名・場所・時間・迎え担当・送り担当を表示
  - シフト表: 職員名×日付のグリッド、勤務時間・公休・有給を表示

### 5-11. Stripe課金
- **機能**: SaaSのサブスクリプション契約・管理
- **優先度**: 中（MVP後でもよいが設計には含める）
- **詳細**:
  - プランは単一プラン（月額固定、金額はTBD）
  - Stripe Checkoutで契約、Webhookでテナント有効化
  - 支払い失敗時はアクセスを制限

---

## 6. 画面・ページ一覧

| ページ名 | パス | 役割 | アクセス権限 |
|---|---|---|---|
| ログイン | `/login` | メール+パスワード認証 | 全員 |
| ダッシュボード | `/dashboard` | 今月のサマリー・直近の送迎表 | viewer以上 |
| 利用予定 | `/schedule` | 月カレンダー・PDFインポート | editor以上 |
| シフト表 | `/shift` | シフト生成・調整・確定 | editor以上（閲覧はviewer） |
| 送迎表 | `/transport` | 担当割り当て・調整・確定 | editor以上（閲覧はviewer） |
| 休み希望フォーム | `/request` | 職員が休み希望を提出 | viewer以上（自分の分のみ） |
| 設定 > テナント | `/settings/tenant` | 事業所名・エリア設定 | admin |
| 設定 > 職員 | `/settings/staff` | 職員招待・権限・対応エリア | admin |
| 設定 > 児童 | `/settings/children` | 児童情報・送迎パターン | admin・editor |
| 契約管理 | `/billing` | Stripe Portalへのリンク | admin |

### 画面遷移
```
ログイン → ダッシュボード
ダッシュボード → 利用予定 / シフト表 / 送迎表 / 休み希望フォーム / 設定
利用予定（確定）→ シフト表（生成）→ 送迎表（生成・調整・確定）
```

---

## 7. ファイル・コンポーネント構成

```
shift-puzzle/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx              # ログインページ
│   ├── (app)/
│   │   ├── layout.tsx                  # サイドバー付きレイアウト
│   │   ├── dashboard/page.tsx          # ダッシュボード
│   │   ├── schedule/page.tsx           # 利用予定
│   │   ├── shift/page.tsx              # シフト表
│   │   ├── transport/page.tsx          # 送迎表
│   │   ├── request/page.tsx            # 休み希望フォーム
│   │   ├── settings/
│   │   │   ├── tenant/page.tsx         # テナント設定
│   │   │   ├── staff/page.tsx          # 職員管理
│   │   │   └── children/page.tsx       # 児童管理
│   │   └── billing/page.tsx            # 契約管理
│   └── api/
│       ├── import/pdf/route.ts         # PDF解析エンドポイント
│       ├── shift/generate/route.ts     # シフト生成エンドポイント
│       ├── transport/generate/route.ts # 送迎担当生成エンドポイント
│       ├── transport/confirm/route.ts  # 送迎表確定エンドポイント
│       └── webhooks/stripe/route.ts    # Stripe Webhook
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                 # サイドバーナビゲーション
│   │   └── Header.tsx                 # ページヘッダー
│   ├── schedule/
│   │   ├── ScheduleCalendar.tsx        # 利用予定カレンダー
│   │   ├── PdfImportModal.tsx          # PDFインポートモーダル
│   │   └── PdfConfirmTable.tsx         # PDF解析結果確認テーブル
│   ├── shift/
│   │   ├── ShiftGrid.tsx              # シフトグリッド（月×職員）
│   │   └── ShiftCell.tsx             # シフトセル（編集可能）
│   ├── transport/
│   │   ├── TransportDayView.tsx        # 日別送迎表
│   │   └── AssignmentCell.tsx          # 担当割り当てセル
│   └── ui/
│       ├── Button.tsx                  # ボタンコンポーネント
│       ├── Modal.tsx                   # モーダル
│       └── Badge.tsx                   # バッジ（警告・確定済みなど）
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # Supabaseクライアント
│   │   └── server.ts                   # Supabaseサーバークライアント
│   ├── anthropic/
│   │   └── parsePdf.ts                 # Claude APIによるPDF解析
│   ├── logic/
│   │   ├── generateShift.ts            # シフト生成ロジック
│   │   └── generateTransport.ts        # 送迎担当割り当てロジック
│   └── stripe/
│       └── client.ts                   # Stripeクライアント
├── batch/
│   ├── fetchDayrobo.ts                 # デイロボ自動取得バッチ（将来）
│   └── cron.ts                         # cronスケジューラー（将来）
├── types/
│   └── index.ts                        # 全型定義
├── docs/
│   ├── progress.html                   # 実装進捗表
│   ├── reference-map.md                # 参照マップ
│   └── error-log.md                    # エラーログ
├── .env.example                        # 環境変数テンプレート
├── CLAUDE.md                           # Claude Code用指示書
└── SPEC.md                             # この仕様書
```

---

## 8. 名称定義

### 用語集
| 用語 | 定義 |
|---|---|
| テナント | 1事業所＝1テナント |
| 児童 | 放課後等デイサービスを利用する子ども |
| 利用予定 | 児童が各日に利用するかどうか・時間のデータ |
| 送迎パターン | 児童の区分（保育園/学校/自宅など）ごとの送迎場所・時間の組み合わせ |
| 迎え | 施設が児童を迎えに行く行為 |
| 送り | 施設が児童を送り届ける行為 |
| 担当 | 送迎を担当する職員（1〜2名） |
| 仮割り当て | システムが自動生成した送迎担当（確定前） |
| 確定 | 管理者が承認した送迎表・シフト表の状態 |
| 公休 | 通常の休日（シフトで定められた休み） |
| 有資格者 | 児童発達支援管理責任者・保育士・教員免許等の有資格職員 |

### 命名規則
- **ファイル名**: kebab-case（例: `generate-shift.ts`）
- **コンポーネント**: PascalCase（例: `TransportDayView`）
- **関数名**: camelCase（例: `generateTransportAssignment`）
- **型名**: PascalCase + 末尾に型の種類（例: `StaffRow`, `ChildPattern`）
- **定数**: SCREAMING_SNAKE_CASE（例: `MAX_CHILDREN_PER_DAY`）
- **DBテーブル**: snake_case・複数形（例: `shift_requests`, `transport_assignments`）
- **APIルート**: kebab-case（例: `/api/transport/generate`）
- **環境変数**: SCREAMING_SNAKE_CASE（例: `NEXT_PUBLIC_SUPABASE_URL`）

---

## 9. 因果関係・相関関係

### データフロー
```
[デイロボPDF]
    ↓ アップロード
[api/import/pdf/route.ts]
    ↓ Claude APIで解析
[lib/anthropic/parsePdf.ts]
    ↓ 確認画面（PdfConfirmTable.tsx）
[Supabase: schedule_entries テーブル]
    ↓ 利用予定確定
[api/shift/generate/route.ts]
    ↓ lib/logic/generateShift.ts
[Supabase: shift_assignments テーブル]
    ↓ シフト確定
[api/transport/generate/route.ts]
    ↓ lib/logic/generateTransport.ts
[Supabase: transport_assignments テーブル]
    ↓ 手動調整・確定
[送迎表表示・印刷]
```

### 機能間の依存関係
- 送迎担当生成は**シフト確定後**でないと実行不可
- シフト生成は**利用予定の入力後**でないと実行不可
- 送迎パターンは**児童情報に登録済み**でないと利用予定に反映不可

### 連動ポイント（触ったら必ず確認）
| 変更箇所 | 影響を受けるファイル |
|---|---|
| DBテーブル構造変更 | `types/index.ts` + 該当APIルート + 該当コンポーネント |
| 送迎割り当てロジック変更 | `lib/logic/generateTransport.ts` + `api/transport/generate/route.ts` |
| シフト生成ロジック変更 | `lib/logic/generateShift.ts` + `api/shift/generate/route.ts` |
| エリアラベル（絵文字）変更 | `settings/tenant` + `types/index.ts` + `lib/logic/generateTransport.ts` |
| Stripe Price ID変更 | `lib/stripe/client.ts` + `api/webhooks/stripe/route.ts` + `.env.example` |
| Claude APIモデル変更 | `lib/anthropic/parsePdf.ts` のみ |

---

## 10. DBテーブル設計（概要）

```sql
-- テナント
tenants (id, name, stripe_customer_id, stripe_subscription_id, status, created_at)

-- 職員
staff (id, tenant_id, name, email, role, employment_type, default_start_time, default_end_time, transport_areas[], is_qualified, created_at)

-- 児童
children (id, tenant_id, name, grade_type, is_active, created_at)

-- 児童の送迎パターン
child_transport_patterns (id, child_id, tenant_id, pattern_name, pickup_location, pickup_time, dropoff_location, dropoff_time, area_label)

-- 利用予定
schedule_entries (id, tenant_id, child_id, date, pickup_time, dropoff_time, pattern_id, is_confirmed, created_at)

-- シフト希望
shift_requests (id, tenant_id, staff_id, month, request_type, dates[], notes, submitted_at)

-- シフト確定
shift_assignments (id, tenant_id, staff_id, date, start_time, end_time, assignment_type, is_confirmed, created_at)

-- 送迎担当
transport_assignments (id, tenant_id, schedule_entry_id, pickup_staff_ids[], dropoff_staff_ids[], is_confirmed, created_at)
```
