# error-log.md

実装中に発生したエラーと解決方法の学習ログ。
同じエラーで二度詰まらないために記録する。

初版: Phase 26（2026-04-17）。

---

## DateHeaderPicker の 📅 ボタンがクリックに反応しない（Safari / iOS 等）

- **発生日**: 2026-04-19
- **発生箇所**: `src/app/(app)/transport/page.tsx` — `DateHeaderPicker` コンポーネント
- **エラー内容**: 送迎表の日付ボタン（年月日 + 📅）をクリック/タップしてもネイティブ date picker が開かない
- **原因**:
  1. `<input type="date">` を `opacity:0 + pointer-events-none` で隠し、ボタンの `onClick` から `input.showPicker()` を呼ぶ実装だった
  2. `showPicker()` は Chrome では動くが Safari/iOS で未実装 or 制限があり、フォールバックの `el.click()` も pointer-events-none の input では不発
  3. ボタンに `whiteSpace: nowrap` が無く、狭幅ビューで文字が縦に 1 文字ずつ折り返していた（レイアウト破綻）
- **解決方法**: `<label>` で UI を囲み、その中に `<input type="date">` を `absolute inset-0 opacity:0 cursor-pointer` で重ねる。ラベル上の任意位置をタップすると input にフォーカス/クリックが届き、ネイティブ picker が開く。`showPicker()` への依存を廃止
- **再発防止**: 隠し input を用いた独自ピッカーは避け、**label + input の重ね合わせ**を第一候補にする。`showPicker()` を使う場合は必ず try-catch とフォールバック経路を用意する

---

## 送迎表が月遷移しない（selectedDate が旧月のまま固定）

- **発生日**: 2026-04-19
- **発生箇所**: `src/app/(app)/transport/page.tsx` — `selectedDate` state と `MonthSelector` の連携
- **エラー内容**: 4月→5月へ `MonthSelector` で切り替えても送迎表の日別ビューが空表示になり、選択日が旧月のまま固定される
- **原因**:
  1. `selectedDate` は `useState` 初期値でのみ URL `?date=` から読み取られる（以降は URL と片方向同期のみ）
  2. `MonthSelector` は `?month` のみ更新して `?date` を旧月のまま残す
  3. 結果として `year/month` は新月になるが `selectedDate` は旧月の日付が残り、`currentDayEntries` が `e.date === selectedDate` のフィルタで全滅する
- **解決方法**: 月変更時に `selectedDate` が新しい月の範囲外なら `workDays[0]`（新月の初日）にリセットする `useEffect` を追加。
  ```tsx
  useEffect(() => {
    if (workDays.length === 0) return;
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}-`;
    if (selectedDate && !selectedDate.startsWith(monthPrefix)) {
      setSelectedDate(workDays[0]);
    }
  }, [year, month, workDays, selectedDate]);
  ```
- **再発防止**: URL クエリを複数 state の初期値にだけ使う場合、それらの整合性（例: month と date が同じ月を指すか）をランタイムで再検証する useEffect を必ず添える。`useState(initFromUrl)` は「初回のみ」という制約を見落としやすい

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
