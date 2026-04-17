import { Resend } from 'resend';

/**
 * Resend SDK クライアント（サーバ専用）
 *
 * 環境変数が未設定の場合は null を返し、呼び出し側で明示的にエラーを投げる。
 * ランタイムで毎回 getResendClient() を呼ぶ形にすることで、
 * 環境変数未設定時にビルドが落ちないようにしている。
 */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export function getResendFrom(): string | null {
  const email = process.env.RESEND_FROM_EMAIL;
  const name = process.env.RESEND_FROM_NAME;
  if (!email) return null;
  return name ? `${name} <${email}>` : email;
}
