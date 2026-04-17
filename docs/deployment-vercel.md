# Vercel 本番デプロイ手順

本番ドメイン: **https://shift-maker.diletto-s.com**

---

## 1. Vercel 環境変数

Vercel Dashboard → Project → Settings → Environment Variables に以下を登録（Production / Preview / Development すべて）。

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://munermdzzygwlpxsfyar.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` と同じ |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` と同じ |
| `ANTHROPIC_API_KEY` | （PDF解析を使うなら） |
| `DEV_SKIP_AUTH` | Production では**未設定 or `false`** |

---

## 2. Supabase Auth URL 設定

Supabase Dashboard → Authentication → URL Configuration:

**Site URL**:
```
https://shift-maker.diletto-s.com
```

**Redirect URLs** (既に設定済):
```
https://shift-maker.diletto-s.com/auth/callback
http://localhost:5000/**
```

> ⚠️ 招待メールのリンク戻り先は Site URL に依存するため、本番ドメインに変更すること。

---

## 3. デプロイ

`main` ブランチに push すると Vercel が自動ビルド。

```bash
git checkout main
git merge claude/fix-data-retrieval-build-Vbqwb
git push origin main
```

---

## 4. デプロイ後チェックリスト

- [ ] https://shift-maker.diletto-s.com/login が表示される
- [ ] 初代 admin のメール+パスワードでログインできる
- [ ] `/dashboard` に遷移し、メニューが admin 向けに表示される
- [ ] `/settings/staff` で職員を追加して招待メールが届く
- [ ] 招待リンクをクリック → パスワード設定 → `/dashboard` 遷移
- [ ] 職員として `/request` で休み希望を提出 → admin に通知が来る
- [ ] admin の `/comments` で承認待ちコメントが見える
- [ ] `/locations` で画像付きの送り場所が登録できる

---

## 5. 既知の注意点

### Supabase Auth で確認メール
- 招待メールテンプレートは Supabase Dashboard → Authentication → Email Templates で日本語化可
- SMTP の送信上限に注意（Supabase 無料枠は 1 時間に 30 通程度）

### PDF インポートの Claude API
- `ANTHROPIC_API_KEY` が未設定だとモックデータが返る
- 本番で実際の解析を使うなら必ず設定

### Stripe（契約管理）
- 本機能は未接続（SPEC §1 の対象）
- 必要になったら `.env.local` に `STRIPE_SECRET_KEY` 等を追加
