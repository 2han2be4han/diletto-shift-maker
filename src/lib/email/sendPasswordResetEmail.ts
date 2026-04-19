import { getResendClient, getResendFrom } from './resend';

/**
 * パスワード再発行メール送信（Phase 47）
 *
 * admin が職員のパスワードを再発行したいときに、Resend 経由で自前テンプレートを送信する。
 * 招待メール (sendInviteEmail) と同じ見た目で、文言だけ「パスワード再発行」用に差し替え。
 */
export type SendPasswordResetEmailParams = {
  to: string;
  staffName: string;
  tenantName: string;
  actionLink: string;
  siteUrl: string;
};

export type SendPasswordResetEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendPasswordResetEmail(
  params: SendPasswordResetEmailParams,
): Promise<SendPasswordResetEmailResult> {
  const resend = getResendClient();
  const from = getResendFrom();

  if (!resend || !from) {
    return {
      ok: false,
      error: 'Resend の設定が未完了です。環境変数 RESEND_API_KEY / RESEND_FROM_EMAIL を設定してください',
    };
  }

  const subject = `【${params.tenantName}】パスワード再発行のご案内`;
  const html = buildHtml(params);
  const text = buildText(params);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
      text,
    });

    if (error) {
      return { ok: false, error: translate(error.message ?? String(error)) };
    }
    if (!data?.id) {
      return { ok: false, error: 'Resend からレスポンスが不正でした' };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: translate(e instanceof Error ? e.message : String(e)) };
  }
}

function translate(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('rate') && lower.includes('limit')) {
    return 'メール送信の回数制限に達しました。しばらく時間をおいて再試行してください';
  }
  if (lower.includes('domain') && lower.includes('verif')) {
    return '送信元ドメインが Resend で検証されていません。管理者に連絡してください';
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return '送信先メールアドレスの形式が正しくありません';
  }
  if (lower.includes('api key') || lower.includes('unauthorized')) {
    return 'Resend の API キーが無効です。環境変数 RESEND_API_KEY を確認してください';
  }
  return `メール送信に失敗しました: ${message}`;
}

function buildHtml(p: SendPasswordResetEmailParams): string {
  const safeTenant = escapeHtml(p.tenantName);
  const safeName = escapeHtml(p.staffName);
  const safeLink = escapeAttr(p.actionLink);
  const safeSite = escapeAttr(p.siteUrl);
  const safeSiteLabel = escapeHtml(p.siteUrl);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTenant} パスワード再発行</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#f5f5f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="background-color:#0a0a0a;padding:48px 24px;border-radius:8px 8px 0 0;">
              <div style="color:#ffffff;font-size:28px;font-weight:700;letter-spacing:0.02em;line-height:1.3;">
                ${safeTenant}
              </div>
              <div style="color:#999999;font-size:12px;margin-top:8px;letter-spacing:0.1em;">
                by ShiftPuzzle
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:48px 40px;border-radius:0 0 8px 8px;">
              <h1 style="color:#1a1a1a;font-size:22px;font-weight:700;margin:0 0 24px 0;line-height:1.4;">
                パスワード再発行のお願い
              </h1>
              <p style="color:#333333;font-size:15px;line-height:1.8;margin:0 0 16px 0;">
                ${safeName} さん
              </p>
              <p style="color:#333333;font-size:15px;line-height:1.8;margin:0 0 16px 0;">
                <strong>${safeTenant}</strong> の管理者がパスワードの再発行を行いました。<br>
                下のボタンから新しいパスワードを設定してください。
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:32px 0;">
                <tr>
                  <td align="center" style="background-color:#2e86de;border-radius:6px;">
                    <a href="${safeLink}" target="_blank" style="display:inline-block;padding:14px 36px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                      新しいパスワードを設定する
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#666666;font-size:13px;line-height:1.7;margin:0 0 8px 0;">
                このリンクは 1 時間有効です。
              </p>
              <p style="color:#666666;font-size:13px;line-height:1.7;margin:0 0 32px 0;">
                心当たりがない場合は管理者にお問い合わせいただくか、このメールを破棄してください。
              </p>
              <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;">
              <p style="color:#999999;font-size:12px;line-height:1.6;margin:0;">
                ShiftPuzzle<br>
                <a href="${safeSite}" style="color:#999999;text-decoration:underline;">${safeSiteLabel}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText(p: SendPasswordResetEmailParams): string {
  return [
    `${p.staffName} さん`,
    '',
    `${p.tenantName} の管理者がパスワードの再発行を行いました。`,
    '下記のリンクから新しいパスワードを設定してください。',
    '',
    p.actionLink,
    '',
    'このリンクは 1 時間有効です。',
    '心当たりがない場合は管理者にお問い合わせいただくか、このメールを破棄してください。',
    '',
    '— ShiftPuzzle',
    p.siteUrl,
  ].join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
