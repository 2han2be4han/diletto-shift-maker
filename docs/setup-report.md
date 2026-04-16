# ShiftPuzzle セットアップ報告

## 完了した作業（2026-04-16）

### 1. リポジトリ作成
- **ローカル**: `C:\Users\2han2\Projects\diletto-shift-maker\`
- **GitHub**: `2han2be4han/diletto-shift-maker`（private）
- dilettoとは完全に独立した別リポジトリ（サブモジュール関係なし）

### 2. Next.js 15 プロジェクトセットアップ
- Next.js 15 (App Router) + TypeScript + Tailwind CSS + ESLint
- devサーバーポート: **5000**
- `npm run dev` → localhost:5000 で動作確認済み

### 3. コミット履歴
| ハッシュ | 内容 |
|---|---|
| `fcefcf0` | init: 仕様書・CLAUDE.md |
| `acb01c9` | feat: Next.js 15 + Tailwind CSS セットアップ |

### 4. 既存ドキュメント
- `CLAUDE.md` — 開発フロー・デザインルール・進捗表運用ルール
- `SPEC_ShiftPuzzle.md` — 全仕様書（技術スタック・完成条件・MVP定義・技術スパイク）
- `reference-map.md` — 参照マップ
- `error-log.md` — エラーログ

---

## 次にやること

### A. Vercel連携
- GitHubリポジトリ `diletto-shift-maker` をVercelに新プロジェクトとしてインポート
- dilettoとは別のVercelプロジェクトとしてデプロイ
- mainブランチpush → 自動デプロイの設定

### B. Supabase プロジェクト作成
- ShiftPuzzle用の新しいSupabaseプロジェクトを作成
- マルチテナントRLS設計に基づくDB構築
- 環境変数（`.env.local`）の設定

### C. 基盤実装（CLAUDE.mdのフローに従う）
1. `docs/progress.html` 進捗表を作成
2. デザイントークン・レイアウト基盤（サイドバー + メインエリア）
3. Supabase認証（サインアップ・ログイン）
4. テナント・職員管理のDB + CRUD

### D. MVP実装（仕様書の順序）
1. PDF手動アップロード → Claude APIによる利用予定解析 → DB登録
2. 休み希望フォーム提出 → シフト半自動生成
3. 送迎担当の仮割り当て生成
4. 画面上での手動調整・確定
5. 送迎表・シフト表の画面表示

---

## 開発ルール（引き継ぎ）
- **デプロイ**: GitHub mainにpush → Vercel自動デプロイ。**必ず確認を取ってから**
- **ローカル確認**: localhost:5000での動作確認は**必須**
- **編集**: diletto-shift-maker/ を直接編集、worktree禁止
- **開発フロー**: 調査 → 計画 → 承認 → 実装（いきなり実装禁止）
- **進捗表**: 実装着手前に `docs/progress.html` を作成・更新必須
