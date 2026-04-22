# 引き継ぎ書: デモプレイ機能 (Phase D)

> 作成日: 2026-04-22
> ブランチ: `claude/plan-demo-play-feature-yKS7p`
> 直近コミット: `c2e98e2 feat(demo): デモプレイ機能の基盤 (D-1 / D-2)`
> 進捗表: `docs/progress.html` の「Phase D」セクションを参照

---

## 1. 機能概要（要件）

ログイン画面に「デモプレイしてみる」ボタンを追加し、認証なしで主要機能を試せる体験版を実装する。
**操作データはブラウザを閉じると消える**（本番DBに一切書かない）。

---

## 2. 採用方式（決定済み・変更不可）

| 項目 | 採用 | 却下した代替 |
|---|---|---|
| データ層 | **クライアント完全モック** | サーバー Map / 本物テナント seed |
| 永続化 | **sessionStorage**（タブ閉じたら消える）+ メモリキャッシュ | localStorage（残ってしまう）|
| API 横取り | **`window.fetch` モンキーパッチ** | Service Worker（互換性問題で却下）|
| PDF 取込 | **「有料版でご利用可能」モーダル** | サンプル取込演出 |
| ログイン UI | Secondary バリアントのボタンを既存フォーム下に追加 | — |
| noindex | デモ Cookie 検知時のみ `<meta name="robots" content="noindex">` | 全画面 noindex |

**理由メモ**:
- Service Worker は Firefox プライベートモードで動かない・HTTPS 限定など互換問題が多いため却下
- サーバーサイド Map は Vercel のサーバーレスでインスタンス間共有できず崩壊するため却下

---

## 3. 完了済み（D-1 / D-2、コミット `c2e98e2`）

| ステップ | ファイル | 役割 |
|---|---|---|
| D-1 | `src/lib/demo/flag.ts` | `DEMO_COOKIE_NAME='sp_demo'` / `DEMO_STORAGE_KEY='sp_demo_state_v1'` / `isDemoClient()` / `enableDemoCookie()` / `disableDemoClient()` / `isDemoCookie(value)` |
| D-2 | `src/lib/demo/seedData.ts` | `DemoState` 型 / `buildSeedState()` で tenant 1, staff 3 (admin/editor/viewer), children 5, 当月+来月の平日 schedule_entries, shift_assignments, 来月用 shift_requests を生成 |
| D-2 | `src/lib/demo/store.ts` | `loadDemoState()` / `saveDemoState()` / `mutateDemoState(fn)` / `resetDemoState()` / `reseedDemoState()` / `genId(prefix)` |
| 進捗表 | `docs/progress.html` | Phase D 15 ステップを追記 |

**重要な前提**:
- `DemoState` は **既存 `types/index.ts` の Row 型** を全て使っている（追加型なし、既存型変更なし → CLAUDE.md §6 準拠）
- seed の id は固定文字列 `demo-...` プレフィックス。本番と衝突しても sessionStorage 内で完結するので影響なし
- `DEMO_TENANT_ID` / `DEMO_STAFF_ID_ME`（admin）/ `DEMO_STAFF_ID_2`（editor）/ `DEMO_STAFF_ID_3`（viewer）

---

## 4. 残タスク（D-3 〜 D-15）

### D-3 + D-4: モックバックエンド（最重要・最大ボリューム）
**ファイル**: `src/lib/demo/demoBackend.ts`（新規）

**設計**: 単一エクスポート関数 `handleDemoRequest(input: RequestInfo, init?: RequestInit): Response | null`
- `input` の URL を解析、`/api/...` 配下なら処理、それ以外は `null` 返して本物 fetch に委譲
- 内部で `pathname + method` から switch、`store.ts` の `loadDemoState()` / `mutateDemoState()` を叩く
- 返り値は `new Response(JSON.stringify({...}), { status, headers: { 'Content-Type': 'application/json' } })`

**実装すべきエンドポイント一覧**（grep 済み、全 fetch 呼び出し URL）:

```
GET    /api/me                                 → { staff: 合成 staff, on_duty_admin: true }
GET    /api/tenant                             → { tenant: state.tenants[0] }
PATCH  /api/tenant                             → tenants[0] を merge update
GET/POST /api/tenant/transport-column-order    → settings.transport_column_order
GET    /api/staff                              → { staff: state.staff }
POST   /api/staff                              → 追加して { staff: row }
PATCH  /api/staff/[id]                         → 更新
DELETE /api/staff/[id]                         → ソフト削除（is_active=false）
POST   /api/staff/invite                       → { ok: true } no-op + フロントでトースト
POST   /api/staff/[id]/resend-invite           → { ok: true } no-op
POST   /api/staff/[id]/reset-password          → { ok: true } no-op
POST   /api/staff/reorder                      → display_order 更新
GET    /api/children                           → { children: state.children }
POST   /api/children                           → 追加
PATCH/DELETE /api/children/[id]                → 更新/削除
GET/PUT /api/children/[id]/area-eligibility    → child_area_eligible_staff 操作
POST   /api/children/reorder                   → display_order 更新
GET    /api/child-area-eligibility             → state.child_area_eligible_staff 全件
GET    /api/schedule-entries?from&to           → 日付フィルタして返す
POST   /api/schedule-entries                   → upsert (tenant_id+child_id+date が unique)
DELETE /api/schedule-entries?id                → 削除
PATCH  /api/schedule-entries/[id]/attendance   → attendance_status 更新 + audit log push
GET    /api/attendance-logs?entry_id           → state.attendance_audit_logs フィルタ
GET    /api/shift-assignments?from&to          → フィルタ
POST   /api/shift-assignments                  → upsert
POST   /api/shift-assignments/confirm          → 該当範囲を is_confirmed=true
POST   /api/shift/generate                     → ※簡易ロジック: 各職員の default_start/end を平日に流し込む
GET/POST /api/shift-requests?month             → フィルタ / upsert
GET/POST /api/shift-request-comments?month     → フィルタ / upsert
GET/POST /api/shift-change-requests            → フィルタ / 追加
PATCH  /api/shift-change-requests/[id]         → status 更新
GET/POST /api/transport-assignments?from&to    → フィルタ / upsert
POST   /api/transport/generate                 → ※簡易ロジック: 各 schedule_entry に対し空き職員を 1 人ずつ割り当て、足りなければ is_unassigned=true
GET/POST /api/transport/child-order            → child_display_order_memory 操作
GET/POST /api/comments                         → フィルタ / 追加
POST   /api/comments/[id]/approve              → status='approved' + 通知
GET/POST /api/notifications                    → フィルタ / 既読化
GET    /api/status/month?month                 → 内部で entries / shifts / requests を集計（既存 route.ts のロジック移植が一番楽）
POST   /api/upload                             → { storage_path: 'demo/' + 元ファイル名, signed_url: blob URL } 等
GET    /api/upload/signed-url                  → 同上
POST   /api/import/pdf                         → 403 + エラーメッセージ「デモではPDF取込は使用不可。/api/import/pdf を呼ぶ前にフロントで 有料ロックモーダル 表示」
POST   /api/signup                             → 403（デモから signup されない想定）
```

**フォールバック**: 上記以外の `/api/*` は `{ ok: true }` を 200 で返して握りつぶす（通知ポーリング等が未対応でも壊れないように）。

**実装ヒント**:
- `URL` constructor で `new URL(input.toString(), window.location.origin)` するとパス・クエリが取れる
- `init?.body` は string か FormData。JSON.parse() を try/catch
- 既存 API ルート（例: `src/app/api/status/month/route.ts`）のロジックは Supabase を `state.xxx` 配列の filter/map に置き換えるだけで概ね移植できる

### D-5: DemoProvider + fetch パッチ
**ファイル**: `src/lib/demo/DemoProvider.tsx`（新規・`'use client'`）

```tsx
'use client';
import { useEffect } from 'react';
import { isDemoClient } from './flag';
import { handleDemoRequest } from './demoBackend';
import { loadDemoState } from './store';

export default function DemoProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isDemoClient()) return;
    loadDemoState(); // hydrate
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      // 相対パスでも Request の場合でも /api/ を含むかで判定
      if (url.includes('/api/') && !url.includes('/_next/')) {
        const res = handleDemoRequest(input, init);
        if (res) return res;
      }
      return realFetch(input, init);
    };
    return () => { window.fetch = realFetch; };
  }, []);
  return <>{children}</>;
}
```

**注意**:
- 絶対 URL（http://localhost:5000/api/...）と相対 URL（/api/...）両方ケアする
- `_next/` の RSC payload リクエストは触らない
- React StrictMode で useEffect が 2 回走るので、すでに patch 済みかチェック（`window.fetch.__demo_patched` フラグ等）したい

### D-6: middleware バイパス
**ファイル**: `src/middleware.ts` を編集

`SUPABASE_CONFIGURED` チェックの直後に追加:
```ts
import { DEMO_COOKIE_NAME, isDemoCookie } from '@/lib/demo/flag';

const demoCookie = request.cookies.get(DEMO_COOKIE_NAME)?.value;
if (isDemoCookie(demoCookie)) {
  // 認証バイパス。/login にいたら /dashboard へ飛ばす
  const { pathname } = request.nextUrl;
  if (pathname === '/login' || pathname === '/signup') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
```

### D-7: (app)/layout.tsx 合成 staff
**ファイル**: `src/app/(app)/layout.tsx` を編集

```ts
import { cookies } from 'next/headers';
import { DEMO_COOKIE_NAME, isDemoCookie } from '@/lib/demo/flag';
import { DEMO_STAFF_ID_ME, DEMO_TENANT_ID } from '@/lib/demo/seedData';

const cookieStore = await cookies();
if (isDemoCookie(cookieStore.get(DEMO_COOKIE_NAME)?.value)) {
  const demoStaff = {
    id: DEMO_STAFF_ID_ME, tenant_id: DEMO_TENANT_ID,
    name: 'デモ太郎', email: 'demo@example.com', role: 'admin' as const,
  };
  return (
    <DemoProvider>
      <AppShell staff={demoStaff}>{children}</AppShell>
    </DemoProvider>
  );
}
// 既存ロジックはそのまま
```

`DemoProvider` を import するために `(app)/layout.tsx` の周辺をクライアント分離する必要があるかも → DemoProvider 自体は client、layout は server なので、間に挟むだけで OK。

### D-8: SSR 3 ページの CSR 分岐
対象: `src/app/(app)/dashboard/page.tsx` / `request/page.tsx` / `comments/page.tsx`

各ページ冒頭で:
```ts
const cookieStore = await cookies();
if (isDemoCookie(cookieStore.get(DEMO_COOKIE_NAME)?.value)) {
  return <DashboardClientShell />; // 子で fetch('/api/...') する CSR 版
}
// 既存 SSR ロジックはそのまま
```

`DashboardClientShell` は新規 client component。既存 SSR ロジックを真似て fetch ベースで書き直す（コピペ + Supabase → fetch 置換）。

### D-9: ログインボタン追加
**ファイル**:
- `src/components/demo/DemoLoginButton.tsx`（新規・client）
- `src/app/(auth)/login/page.tsx`（既存編集、`<form>` 直後に追加）

ボタンの動作:
```ts
import { enableDemoCookie } from '@/lib/demo/flag';
import { reseedDemoState } from '@/lib/demo/store';

const handleStart = () => {
  reseedDemoState();   // 既存 sessionStorage 上書き
  enableDemoCookie();  // session cookie セット
  window.location.href = '/dashboard'; // hard reload で middleware を必ず通す
};
```

UI: `style={{background:'var(--surface)', color:'var(--ink)', border:'1px solid var(--rule)'}}` + サブテキスト「ブラウザを閉じるとデータは消えます」

### D-10: デモバナー
**ファイル**: `src/components/demo/DemoBanner.tsx`（新規・client）

`AppShell` 内、`<main>` の上に挿入。または `DemoProvider` の子として表示。
内容: 「🎮 デモモード中・データは保存されません [リセット] [終了]」
- リセット = `reseedDemoState()` + `location.reload()`
- 終了 = `disableDemoClient()` + `location.href='/login'`

### D-11: PDF 取込ロックモーダル
**ファイル**: `src/components/schedule/PdfImportModal.tsx` を編集

冒頭で `isDemoClient()` を判定し、true なら有料版ロックモーダルに置換:
```
🔒 PDF 取り込み機能
この機能は有料版でご利用いただけます。
[ お問い合わせ ] [ 閉じる ]
```

`/api/import/pdf` を絶対に叩かない。

### D-12: 無効化ガード
- `src/app/(app)/billing/page.tsx`: demo 時は「デモでは契約管理を利用できません」表示
- `src/app/(app)/settings/staff/page.tsx`: 招待ボタン押下時に `isDemoClient()` ならトーストで「デモでは無効」
- `src/components/layout/Sidebar.tsx`: サインアウトボタンを `disableDemoClient()` + `/login` 遷移に切替（demo 時のみ）

### D-13: ローカル動作確認
```
npm run dev   # → http://localhost:5000
```
チェック観点:
1. `/login` で「デモプレイしてみる」ボタン表示
2. クリック → `/dashboard` 遷移、デモバナー表示
3. 児童・職員・利用予定・シフトの CRUD がエラー無く動く
4. シフト自動生成・送迎自動割り当てが動く（ロジックは簡易でOK）
5. タブを閉じて再度 `/login` → デモボタンを押すと **データがリセット** されている
6. ブラウザリロード（`Cmd+R`）では **データが残っている**（sessionStorage の挙動確認）
7. PDF 取込ボタン → 有料版ロックモーダル
8. **デモ Cookie が無い状態**で本番ログインフロー（既存ユーザー）が無傷
9. **DEV_SKIP_AUTH=true** 環境（Supabase 未接続）でも壊れない

### D-14: ドキュメント更新
- `docs/reference-map.md`: 新規 `src/lib/demo/*` と `src/components/demo/*` を「9. デモモード」セクションとして追記
- `docs/error-log.md`: 実装中に踏んだエラーを記録

### D-15: noindex
- `src/app/(app)/layout.tsx` で demo Cookie 検知時に `export const metadata = { robots: { index: false, follow: false } }` 相当を返す
- `public/robots.txt` は既存があれば触らない、無ければ作成（`User-agent: * \n Disallow: /` は**やりすぎ** なので、Disallow しない）

---

## 5. 触ってはいけないファイル（CLAUDE.md §6 厳守）

| ファイル | 理由 |
|---|---|
| `src/app/api/webhooks/stripe/route.ts` | Stripe 署名検証を壊すリスク |
| `src/lib/supabase/server.ts` | RLS 破壊リスク |
| `types/index.ts` の **既存型** | 追加のみ可、変更・削除禁止 |
| `.env.local` | 直接編集禁止 |

`src/middleware.ts` と `src/app/(app)/layout.tsx` は編集対象だが、**本番ユーザーの auth 経路を壊さない** よう細心の注意を。
変更前 / 変更後で「Cookie 無し」「Supabase 接続済み」「DEV_SKIP_AUTH=true」の 3 パターンが回帰なく動くことを確認。

---

## 6. 既知の罠

1. **React StrictMode で useEffect 2 回**: fetch パッチを多重適用しないようガード
2. **絶対 URL vs 相対 URL**: `fetch('/api/...')` も `fetch('http://localhost:5000/api/...')` もケア
3. **Request オブジェクト**: `fetch(new Request(...))` で渡されるパターンも考慮
4. **sessionStorage 容量上限 ~5MB**: seed が太りすぎないよう、当月のみ生成にしてある（来月までで止めている）
5. **Next.js RSC payload**: `_next/` の fetch は触らない
6. **既存 SSR ページ**: `dashboard/request/comments` の SSR ロジックは絶対に壊さない（demo 時のみ早期 return で逃がす）
7. **PDF 取込**: 絶対に Claude API を叩かない（料金発生 + デモ趣旨に反する）
8. **DEV_SKIP_AUTH=true 環境**: middleware が auth 全スキップになる経路でも、デモボタンは独立して動く必要あり

---

## 7. 動作確認の最低限シナリオ

```
[A] 本番ユーザー回帰
1. デモ Cookie 削除
2. 既存ユーザーで /login → ログイン → /dashboard 表示
3. 各ページで通常操作

[B] デモプレイ正常系
1. シークレットウィンドウで /login
2. 「デモプレイしてみる」クリック
3. /dashboard でデモバナー表示確認
4. 設定→児童管理 で新規追加・編集・削除
5. 設定→職員管理 で新規追加（招待は無効化されてること確認）
6. 利用予定で手動追加
7. シフト表で自動生成→確定
8. 送迎表で自動割り当て→確定
9. 休み希望でカレンダー操作
10. リロード → データ残存確認
11. タブ閉じて再オープン → /login → デモ起動 → データリセット確認

[C] PDF ロック
1. デモ起動
2. 利用予定でPDF取込ボタン
3. 「有料版でご利用いただけます」モーダル表示
4. ネットワークタブで /api/import/pdf に通信が飛んでないことを確認
```

---

## 8. デプロイ可否（push 注意）

- `vercel.json` も `.github/workflows` も存在しないため、**コード上は自動デプロイの仕組みが見えない**
- Vercel ダッシュボード側でブランチ Preview Deploy が有効化されている可能性は **未確認**
- 本作業を push する前に、Vercel ダッシュボードでこのブランチの Preview Deploy 設定を確認するか、必要なら無効化してから push すること
- 検証だけしたいなら **ローカル `npm run dev` (http://localhost:5000) で十分** 確認可能

---

## 9. 完了の定義（DoD）

- [ ] D-3〜D-15 全ステップ完了
- [ ] `docs/progress.html` の Phase D が全て「完了」表示
- [ ] §7 のシナリオ A/B/C を全て pass
- [ ] `npm run lint` と `npx tsc --noEmit` がクリーン
- [ ] `docs/reference-map.md` 更新済み
- [ ] 本番ユーザー経路（Cookie 無し）に副作用ゼロを目視確認
