/**
 * Haftalık e-posta özeti şablonları (saf fonksiyonlar — veritabanına dokunmaz, test edilebilir).
 *
 * Kurallar: Türkçe, sakin dil; sanal para olduğu açıkça yazılır; TL TUTARI YOKTUR (yalnızca yüzde ve sıra).
 * E-posta istemcileri CSS değişkenlerini ve <style> bloklarını güvenilir biçimde desteklemediğinden
 * HTML tablo tabanlıdır ve stiller satır içidir (renkler buradaki sabitlerdir, uygulama arayüzü değildir).
 * Kullanıcıdan gelen tüm metinler (kullanıcı adı, sembol) kaçışlanır.
 */

import type { DigestTip } from './tips';

export interface DigestTrade {
  symbol: string;
  /** Satışın ortalama maliyete göre getirisi, % */
  return_pct: number;
}

export interface DigestPick {
  week_id: string;
  symbol: string;
  direction: 'up' | 'down';
  status: 'active' | 'void';
  return_pct: number | null;
  rank: number | null;
  participants: number | null;
}

export interface DigestData {
  username: string;
  week: { key: string; label: string };
  portfolio: {
    /** Geçen haftanın değişimi, % (veri yoksa null) */
    change_pct: number | null;
    /** Başlangıçtan beri toplam getiri, % */
    total_return_pct: number | null;
  };
  rank: {
    current: number | null;
    previous: number | null;
    players: number | null;
    /** Hesap bu hafta açıldı (önceki sıra yok çünkü yeni) */
    joined_this_week: boolean;
  };
  trades: { count: number; best: DigestTrade | null; worst: DigestTrade | null };
  arena: { rounds: number; best_return_pct: number | null };
  /** null: o hafta seçim yapılmadı */
  picks: DigestPick | null;
  tip: DigestTip;
  links: { site: string; profile: string; unsubscribe: string; preferences: string };
}

const COLORS = {
  bg: '#f2f4f7',
  card: '#ffffff',
  line: '#eaecf0',
  text: '#101828',
  muted: '#667085',
  brand: '#465FFF',
  brandSoft: '#ECF3FF',
  up: '#079455',
  down: '#d92d20',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** '+%1,23' · '−%0,45' · '%0,00' (Türkçe yazım; gösterilen hassasiyete yuvarlanır) */
export function formatPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const r = Math.round(v * 10 ** digits) / 10 ** digits || 0;
  const abs = Math.abs(r).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return r > 0 ? `+%${abs}` : r < 0 ? `−%${abs}` : `%${abs}`;
}

function tone(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return COLORS.muted;
  const r = Math.round(v * 100) / 100;
  return r > 0 ? COLORS.up : r < 0 ? COLORS.down : COLORS.text;
}

/** Sıralama değişimi metni (saf). previous/current: genel sıra (küçük = iyi). */
export function rankChangeText(current: number | null, previous: number | null, joinedThisWeek = false): string {
  if (current === null) return 'Sıralama bilgisi henüz yok';
  if (previous === null) return joinedThisWeek ? 'Bu hafta sıralamaya girdin' : 'Önceki hafta için sıra bilgisi yok';
  const diff = previous - current;
  if (diff > 0) return `▲ ${diff} sıra yükseldin`;
  if (diff < 0) return `▼ ${-diff} sıra geriledin`;
  return 'Sıran değişmedi';
}

function pickText(p: DigestPick | null): { headline: string; detail: string } {
  if (!p) return { headline: 'Katılmadın', detail: 'Yeni haftanın seçimleri Cumartesi açılıyor.' };
  const dir = p.direction === 'up' ? 'yükselir' : 'düşer';
  if (p.status === 'void' || p.return_pct === null) return { headline: `${p.symbol} · ${dir}`, detail: 'Fiyat alınamadığı için sıralama dışı kaldı.' };
  const rank = p.rank !== null ? `${p.rank}. sıra${p.participants ? ` / ${p.participants} kişi` : ''}` : 'Sıra yok';
  return { headline: `${p.symbol} ${dir}`, detail: `${formatPct(p.return_pct)} · ${rank}` };
}

export function digestSubject(d: DigestData): string {
  const change = d.portfolio.change_pct;
  return change === null
    ? `Haftalık özetin hazır (${d.week.label}) · PortfoyGo`
    : `Haftalık özetin: portföyün ${formatPct(change)} (${d.week.label}) · PortfoyGo`;
}

function tile(label: string, value: string, sub: string, valueColor: string = COLORS.text): string {
  return `<td class="tile" width="50%" valign="top" style="padding:6px;">
  <div style="border:1px solid ${COLORS.line};border-radius:14px;padding:14px 16px;background:${COLORS.card};">
    <div style="font-size:12px;line-height:16px;color:${COLORS.muted};">${escapeHtml(label)}</div>
    <div style="margin-top:6px;font-size:20px;line-height:26px;font-weight:700;color:${valueColor};">${escapeHtml(value)}</div>
    <div style="margin-top:4px;font-size:12px;line-height:16px;color:${COLORS.muted};">${escapeHtml(sub)}</div>
  </div>
</td>`;
}

export function renderDigestHtml(d: DigestData): string {
  const name = escapeHtml(d.username);
  const pick = pickText(d.picks);
  const rankValue = d.rank.current !== null ? `#${d.rank.current}` : '—';
  const rankSub = `${rankChangeText(d.rank.current, d.rank.previous)}${d.rank.players ? ` · ${d.rank.players} oyuncu` : ''}`;
  const arenaValue = d.arena.rounds > 0 ? `${d.arena.rounds} tur` : 'Oynamadın';
  const arenaSub = d.arena.rounds > 0 && d.arena.best_return_pct !== null ? `En iyi turun ${formatPct(d.arena.best_return_pct)}` : 'Hızlı bir tur 1 dakika sürer';
  const changeSub = d.portfolio.total_return_pct !== null ? `Başlangıçtan beri ${formatPct(d.portfolio.total_return_pct)}` : 'Geçen hafta';

  const trades =
    d.trades.best || d.trades.worst
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
          ${d.trades.best ? tradeRow('En iyi işlemin', d.trades.best) : ''}
          ${d.trades.worst ? tradeRow('En zorlu işlemin', d.trades.worst) : ''}
        </table>
        <p style="margin:10px 0 0;font-size:12px;line-height:18px;color:${COLORS.muted};">Getiri, satış fiyatının o andaki ortalama maliyetine göre hesaplanır. Bu hafta ${d.trades.count} işlem yaptın.</p>`
      : `<p style="margin:0;font-size:14px;line-height:21px;color:${COLORS.muted};">${
          d.trades.count > 0 ? `Bu hafta ${d.trades.count} işlem yaptın; kapanan (satılan) bir pozisyonun olmadı.` : 'Bu hafta ana portföyünde işlem yapmadın.'
        }</p>`;

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(digestSubject(d))}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(`${d.week.label}: portföy ${formatPct(d.portfolio.change_pct)}, ${rankChangeText(d.rank.current, d.rank.previous).toLocaleLowerCase('tr')}.`)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLORS.bg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;font-family:Arial,Helvetica,sans-serif;color:${COLORS.text};">
  <tr><td style="padding:0 6px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td style="font-size:20px;font-weight:700;color:${COLORS.brand};">PortfoyGo</td>
      <td align="right" style="font-size:12px;color:${COLORS.muted};">Haftalık özet · ${escapeHtml(d.week.label)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:18px;padding:22px 16px;">
    <h1 style="margin:0 6px;font-size:22px;line-height:30px;">Merhaba ${name},</h1>
    <p style="margin:8px 6px 14px;font-size:14px;line-height:21px;color:${COLORS.muted};">Geçen haftanın kısa bir özetini hazırladık. Hepsi sanal para ile; amaç öğrenmek ve eğlenmek.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        ${tile('Portföy (geçen hafta)', formatPct(d.portfolio.change_pct), changeSub, tone(d.portfolio.change_pct))}
        ${tile('Genel sıralama', rankValue, rankSub)}
      </tr>
      <tr>
        ${tile('Arena', arenaValue, arenaSub)}
        ${tile('Haftalık Seçim', pick.headline, pick.detail)}
      </tr>
    </table>

    <h2 style="margin:18px 6px 8px;font-size:16px;line-height:22px;">İşlemlerin</h2>
    <div style="margin:0 6px;">${trades}</div>

    <div style="margin:18px 6px 0;padding:14px 16px;border-radius:14px;background:${COLORS.brandSoft};">
      <div style="font-size:12px;line-height:16px;font-weight:700;color:${COLORS.brand};text-transform:uppercase;letter-spacing:.04em;">Haftanın notu · ${escapeHtml(d.tip.title)}</div>
      <p style="margin:6px 0 0;font-size:14px;line-height:21px;color:${COLORS.text};">${escapeHtml(d.tip.body)}</p>
    </div>

    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 6px 4px;"><tr>
      <td style="border-radius:12px;background:${COLORS.brand};">
        <a href="${escapeHtml(d.links.site)}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">PortfoyGo’ya git</a>
      </td>
      <td style="padding-left:12px;"><a href="${escapeHtml(d.links.profile)}" style="font-size:14px;color:${COLORS.brand};">Profilini gör</a></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:16px 12px 0;font-size:12px;line-height:18px;color:${COLORS.muted};text-align:center;">
    PortfoyGo sanal para ile oynanan bir yatırım simülasyonudur; buradaki hiçbir bilgi yatırım tavsiyesi değildir.<br>
    Bu e-postayı haftalık özet tercihin açık olduğu için aldın.
    <a href="${escapeHtml(d.links.unsubscribe)}" style="color:${COLORS.muted};">Abonelikten çık</a> ·
    <a href="${escapeHtml(d.links.preferences)}" style="color:${COLORS.muted};">Bildirim tercihleri</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function tradeRow(label: string, t: DigestTrade): string {
  return `<tr>
  <td style="padding:8px 0;border-bottom:1px solid ${COLORS.line};font-size:14px;color:${COLORS.muted};">${escapeHtml(label)}</td>
  <td style="padding:8px 0;border-bottom:1px solid ${COLORS.line};font-size:14px;font-weight:700;">${escapeHtml(t.symbol)}</td>
  <td align="right" style="padding:8px 0;border-bottom:1px solid ${COLORS.line};font-size:14px;font-weight:700;color:${tone(t.return_pct)};">${escapeHtml(formatPct(t.return_pct))}</td>
</tr>`;
}

export function renderDigestText(d: DigestData): string {
  const pick = pickText(d.picks);
  const lines = [
    `Merhaba ${d.username},`,
    '',
    `PortfoyGo haftalık özetin (${d.week.label}). Hepsi sanal para ile.`,
    '',
    `Portföy (geçen hafta): ${formatPct(d.portfolio.change_pct)}${d.portfolio.total_return_pct !== null ? ` · başlangıçtan beri ${formatPct(d.portfolio.total_return_pct)}` : ''}`,
    `Genel sıralama: ${d.rank.current !== null ? `#${d.rank.current}` : '—'} (${rankChangeText(d.rank.current, d.rank.previous)})`,
    `Arena: ${d.arena.rounds > 0 ? `${d.arena.rounds} tur${d.arena.best_return_pct !== null ? `, en iyi tur ${formatPct(d.arena.best_return_pct)}` : ''}` : 'bu hafta oynamadın'}`,
    `Haftalık Seçim: ${pick.headline} (${pick.detail})`,
    '',
    d.trades.best ? `En iyi işlemin: ${d.trades.best.symbol} ${formatPct(d.trades.best.return_pct)}` : null,
    d.trades.worst ? `En zorlu işlemin: ${d.trades.worst.symbol} ${formatPct(d.trades.worst.return_pct)}` : null,
    d.trades.best || d.trades.worst ? null : d.trades.count > 0 ? `Bu hafta ${d.trades.count} işlem yaptın; kapanan pozisyonun olmadı.` : 'Bu hafta ana portföyünde işlem yapmadın.',
    '',
    `Haftanın notu — ${d.tip.title}: ${d.tip.body}`,
    '',
    `PortfoyGo: ${d.links.site}`,
    `Profilin: ${d.links.profile}`,
    '',
    'PortfoyGo sanal para ile oynanan bir yatırım simülasyonudur; yatırım tavsiyesi değildir.',
    `Abonelikten çık: ${d.links.unsubscribe}`,
    `Bildirim tercihleri: ${d.links.preferences}`,
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}
