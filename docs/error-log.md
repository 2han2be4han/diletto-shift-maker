# error-log.md

実装中に発生したエラーと解決方法の学習ログ。
同じエラーで二度詰まらないために記録する。

初版: Phase 26（2026-04-17）。

---

## node_modules 未インストール状態での `tsc --noEmit` 大量エラー

- **発生日**: 2026-04-17
- **発生箇所**: Phase 26 実装完了直後、セッション初期の型チェック
- **エラー内容**:
  ```
  next.config.ts(1,33): error TS2307: Cannot find module 'next' ...
  src/app/.../page.tsx: Cannot find module 'react'
  JSX element implicitly has type 'any' because no interface 'JSX.IntrinsicElements' exists.
  ```
- **原因**: セッション初期は `node_modules` が存在せず、Next.js / React / @types/\* など全ての依存型が解決できない状態だった
- **解決方法**: `npm install` を先に実行してから `npx tsc --noEmit` を走らせる（Phase 26 では 394 パッケージ導入、その後 exit 0）
- **再発防止**: 新セッション開始時は **最初に `npm install`** を済ませてから型チェック / dev サーバ起動を行う。CI 相当として `npm ci` を推奨

---

## Phase 26 実装中に判明した仕様詰め事項（エラーではないが記録）

- **月切替時の pending 保存ガード**: URL ベースの month 切替を client 側で intercept するのは MonthSelector の改修が必要で、本フェーズでは未対応。代替として `beforeunload` リスナーを追加（リロード/閉じる時のみ警告）。日付タブ切替は `handleSelectDate` で `confirm()` ガード済み
- **Supabase invite の implicit flow**: `admin.generateLink({ type: 'invite' })` はデフォルトで hash fragment（implicit flow）で token を返すため、サーバ route.ts では拾えない。`/auth/confirm` (client page) で `window.location.hash` を parse → `setSession` で解決
