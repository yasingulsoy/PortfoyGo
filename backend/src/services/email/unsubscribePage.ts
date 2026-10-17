import { escapeHtml } from './digestTemplate';

/**
 * GET/POST /api/email/unsubscribe yanıt sayfası (basit, bağımsız HTML; harici kaynak yok).
 * Stiller satır içi <style> ile (helmet CSP: style-src 'unsafe-inline' izinli, form-action 'self').
 */

export type UnsubscribePageState = 'unsubscribed' | 'resubscribed' | 'invalid' | 'not_found';

export function renderUnsubscribePage(opts: { state: UnsubscribePageState; token?: string; siteUrl: string }): string {
  const site = escapeHtml(opts.siteUrl);
  const copy: Record<UnsubscribePageState, { title: string; body: string }> = {
    unsubscribed: {
      title: 'Haftalık özet aboneliğin iptal edildi',
      body: 'Artık PortfoyGo haftalık e-posta özetini almayacaksın. Fikrini değiştirirsen aşağıdan tek tıkla yeniden abone olabilir ya da profilindeki bildirim tercihlerinden açabilirsin.',
    },
    resubscribed: {
      title: 'Yeniden abone oldun',
      body: 'Haftalık e-posta özeti her Pazartesi sabahı yeniden gelecek. İstediğin zaman e-postadaki bağlantıdan ya da profilinden kapatabilirsin.',
    },
    invalid: {
      title: 'Bağlantı geçersiz',
      body: 'Bu abonelik bağlantısı geçersiz ya da eksik kopyalanmış. E-postadaki bağlantıyı yeniden açmayı dene ya da profilindeki bildirim tercihlerini kullan.',
    },
    not_found: {
      title: 'Hesap bulunamadı',
      body: 'Bu bağlantıya ait bir hesap bulunamadı; hesap silinmiş olabilir. Yapılacak başka bir şey yok.',
    },
  };
  const c = copy[opts.state];
  const action =
    opts.state === 'unsubscribed' && opts.token
      ? `<form method="post" action="?token=${encodeURIComponent(opts.token)}">
          <input type="hidden" name="action" value="resubscribe">
          <button type="submit">Yeniden abone ol</button>
        </form>`
      : '';
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(c.title)} · PortfoyGo</title>
<style>
  :root { color-scheme: light dark; --bg:#f2f4f7; --card:#fff; --text:#101828; --muted:#667085; --line:#eaecf0; --brand:#465FFF; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b0f19; --card:#111827; --text:#f2f4f7; --muted:#98a2b3; --line:#1f2937; --brand:#7592FF; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px; background:var(--bg); color:var(--text); font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  main { width:100%; max-width:480px; background:var(--card); border:1px solid var(--line); border-radius:18px; padding:28px 24px; }
  .brand { font-weight:700; color:var(--brand); margin:0 0 18px; }
  h1 { font-size:20px; line-height:1.35; margin:0 0 10px; }
  p { color:var(--muted); line-height:1.6; margin:0 0 18px; font-size:15px; }
  .row { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
  button, a.btn { appearance:none; border:0; border-radius:12px; padding:11px 18px; font:inherit; font-weight:600; font-size:14px; cursor:pointer; text-decoration:none; }
  button { background:var(--brand); color:#fff; }
  a.btn { color:var(--brand); border:1px solid var(--line); background:transparent; }
  button:focus-visible, a.btn:focus-visible { outline:3px solid color-mix(in srgb, var(--brand) 40%, transparent); outline-offset:2px; }
  form { margin:0; }
</style>
</head>
<body>
<main>
  <p class="brand">PortfoyGo</p>
  <h1>${escapeHtml(c.title)}</h1>
  <p>${escapeHtml(c.body)}</p>
  <div class="row">
    ${action}
    <a class="btn" href="${site}">PortfoyGo’ya git</a>
  </div>
</main>
</body>
</html>`;
}
