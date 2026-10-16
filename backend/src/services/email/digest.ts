import fs from 'fs';
import path from 'path';
import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { activeHumanSql } from '../../utils/userFilters';
import { EmailService } from '../email';
import { INITIAL_ACCOUNT_BALANCE, LeaderboardService } from '../leaderboard';
import { DigestData, DigestPick, DigestTrade, digestSubject, renderDigestHtml, renderDigestText } from './digestTemplate';
import { tipForWeek } from './tips';
import { signUnsubscribeToken } from './unsubscribe';

/**
 * Haftalık e-posta özeti (iş: 'weekly-digest', Pazartesi 09:00 Europe/Istanbul).
 *
 * Alıcılar: e-postası doğrulanmış, yasaklı/bot/silinmiş olmayan ve users.notification_prefs.email_digest
 * tercihi kapalı OLMAYAN herkes (varsayılan açık).
 * İçerik (önceki tam hafta, Pzt 00:00 → Pzt 00:00 İstanbul): portföyün yüzde değişimi ve genel sıralama
 * değişimi (günlük kapanış noktalarından, portfolio_snapshots), haftanın en iyi / en zorlu satışı
 * (ortalama maliyete göre %), Arena turları, Haftalık Seçim sonucu ve kısa bir eğitim notu. TL tutarı yoktur.
 *
 * İDEMPOTENT: email_digests (user_id, week_key) — her kullanıcıya her hafta en fazla bir kez gönderilir
 * (bkz. 019). Gönderim için ayrılan satır 'sending' olur; süreç gönderim sırasında çökerse TEKRAR gönderilmez.
 * SMTP hatası 'failed' olarak kaydedilir ve iş elle yeniden çalıştırılınca (en fazla 3 deneme) tekrar denenir.
 *
 * GÖNDERİM KORUMASI (geliştirmede gerçek e-posta GİTMEZ): yerel .env gerçek SMTP bilgisi içerebilir.
 *   - NODE_ENV=production → gönderir (EMAIL_DIGEST_SEND=0 ile kapatılabilir)
 *   - diğer ortamlar     → yalnızca önizleme (log + backend/.localdb/digest-previews/<hafta>/<kullanıcı>.html);
 *                          gerçek gönderim için EMAIL_DIGEST_SEND=1 AÇIKÇA verilmelidir.
 */

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000; // Türkiye 2016'dan beri sabit UTC+3
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** Varsayılan önizleme klasörü (git'e girmez: /backend/.localdb/) */
export const DEFAULT_PREVIEW_DIR = path.resolve(__dirname, '../../../.localdb/digest-previews');

// ---------------------------------------------------------------------------
// Saf yardımcılar
// ---------------------------------------------------------------------------

/**
 * Gönderim koruması: production'da açık (EMAIL_DIGEST_SEND=0 ile kapatılır); diğer ortamlarda
 * yalnızca EMAIL_DIGEST_SEND=1 açıkça verilmişse açık.
 */
export function digestSendEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.EMAIL_DIGEST_SEND || '').trim();
  if (flag === '0') return false;
  if (env.NODE_ENV === 'production') return true;
  return flag === '1';
}

export interface DigestWindow {
  /** Özetlenen haftanın ISO haftası (İstanbul), ör. '2026-W41' */
  weekKey: string;
  /** Pazartesi 00:00 İstanbul (dahil) */
  start: Date;
  /** Sonraki Pazartesi 00:00 İstanbul (hariç) */
  end: Date;
  /** '6–12 Ekim 2026' */
  label: string;
}

/** UTC alanları yerel takvim gününü temsil eden tarih için ISO hafta anahtarı. */
export function isoWeekKey(localDay: Date): string {
  const d = new Date(Date.UTC(localDay.getUTCFullYear(), localDay.getUTCMonth(), localDay.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekLabel(first: Date, last: Date): string {
  const d1 = first.getUTCDate();
  const d2 = last.getUTCDate();
  const m1 = MONTHS[first.getUTCMonth()];
  const m2 = MONTHS[last.getUTCMonth()];
  const y1 = first.getUTCFullYear();
  const y2 = last.getUTCFullYear();
  if (y1 !== y2) return `${d1} ${m1} ${y1} – ${d2} ${m2} ${y2}`;
  if (m1 !== m2) return `${d1} ${m1} – ${d2} ${m2} ${y2}`;
  return `${d1}–${d2} ${m2} ${y2}`;
}

/** `now`dan önce TAMAMLANMIŞ son hafta (Pzt 00:00 → Pzt 00:00, Europe/Istanbul). */
export function previousWeekWindow(now: Date): DigestWindow {
  const local = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const dow = local.getUTCDay() || 7; // 1 = Pazartesi … 7 = Pazar
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const thisMondayLocal = localMidnight - (dow - 1) * DAY_MS;
  const prevMondayLocal = thisMondayLocal - 7 * DAY_MS;
  return {
    weekKey: isoWeekKey(new Date(prevMondayLocal)),
    start: new Date(prevMondayLocal - ISTANBUL_OFFSET_MS),
    end: new Date(thisMondayLocal - ISTANBUL_OFFSET_MS),
    label: weekLabel(new Date(prevMondayLocal), new Date(thisMondayLocal - DAY_MS)),
  };
}

export interface DigestTxRow {
  type: 'buy' | 'sell';
  symbol: string;
  asset_type: string;
  quantity: number;
  price: number;
  /** İşlem özetlenen haftanın içinde mi */
  in_window: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/**
 * Haftanın en iyi / en zorlu satışı (saf). İşlemler kronolojik verilmelidir: geçmişten itibaren oynatılır ve
 * haftadaki her satış o andaki ortalama maliyetle karşılaştırılır (alışı görünmeyen satışlar sayılmaz).
 * Tek satış varsa yönüne göre yalnızca "en iyi" ya da "en zorlu" olarak döner.
 */
export function tradeExtremes(rows: DigestTxRow[]): { count: number; best: DigestTrade | null; worst: DigestTrade | null } {
  const pos = new Map<string, { qty: number; cost: number }>();
  const results: DigestTrade[] = [];
  let count = 0;
  for (const t of rows) {
    if (t.in_window) count += 1;
    const key = `${t.asset_type}:${t.symbol}`;
    const p = pos.get(key) ?? { qty: 0, cost: 0 };
    const qty = Number(t.quantity);
    const price = Number(t.price);
    if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0) continue;
    if (t.type === 'buy') {
      p.qty += qty;
      p.cost += qty * price;
    } else if (p.qty > 0) {
      const sold = Math.min(qty, p.qty);
      const avg = p.cost / p.qty;
      if (t.in_window && avg > 0) results.push({ symbol: t.symbol, return_pct: round2(((price - avg) / avg) * 100) });
      p.cost -= avg * sold;
      p.qty -= sold;
      if (p.qty <= 1e-12) {
        p.qty = 0;
        p.cost = 0;
      }
    }
    pos.set(key, p);
  }
  if (results.length === 0) return { count, best: null, worst: null };
  if (results.length === 1) {
    const only = results[0];
    return only.return_pct >= 0 ? { count, best: only, worst: null } : { count, best: null, worst: only };
  }
  let best = results[0];
  let worst = results[0];
  for (const r of results) {
    if (r.return_pct > best.return_pct) best = r;
    if (r.return_pct < worst.return_pct) worst = r;
  }
  return { count, best, worst };
}

/** Site ve API'nin (e-postadaki bağlantılar için) herkese açık kök adresleri. */
export function publicUrls(env: NodeJS.ProcessEnv = process.env): { site: string; api: string } {
  const site = (env.PUBLIC_SITE_URL || env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
  let api = (env.PUBLIC_API_URL || 'http://localhost:5001/api').trim().replace(/\/+$/, '');
  // '/api/backend' gibi göreli adres: site üzerinden (Next rewrite) sunuluyor
  if (api.startsWith('/')) api = `${site}${api}`;
  return { site, api };
}

export function unsubscribeUrl(userId: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${publicUrls(env).api}/email/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(userId))}`;
}

// ---------------------------------------------------------------------------
// Veri toplama
// ---------------------------------------------------------------------------

interface Recipient {
  id: string;
  username: string;
  email: string;
  equity_now: number;
}

interface WeekUserStats {
  v0: number | null;
  v1: number | null;
  rank0: number | null;
  rank1: number | null;
  joined_in_week: boolean;
}

export interface DigestMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

/** true: gönderildi · false: taşıyıcı yok (SMTP tanımsız). SMTP hatasında fırlatır. */
export type DigestMailer = (mail: DigestMail) => Promise<boolean>;

export interface DigestRunOptions {
  now?: Date;
  /** Varsayılan: digestSendEnabled() */
  send?: boolean;
  /** Varsayılan: EmailService (SMTP) */
  mailer?: DigestMailer;
  /** Yalnızca bu kullanıcılar (testler / elle tetikleme) */
  onlyUserIds?: string[];
  /** Önizleme HTML'lerinin yazılacağı klasör; null → yazılmaz (testlerde varsayılan) */
  previewDir?: string | null;
  /** Gönderimler arası bekleme (ms); SMTP sağlayıcısının hız sınırı için */
  delayMs?: number;
}

export interface DigestRunResult {
  week_key: string;
  mode: 'send' | 'preview';
  recipients: number;
  sent: number;
  previewed: number;
  failed: number;
  /** Bu hafta zaten işlenmiş (gönderilmiş / önizlenmiş / deneme hakkı bitmiş) */
  skipped: number;
  /** SMTP yapılandırılmadığı için durduruldu */
  aborted?: 'no_transport';
}

const emailService = new EmailService();
const defaultMailer: DigestMailer = (mail) => emailService.sendMail(mail);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadRecipients(onlyUserIds?: string[]): Promise<Recipient[]> {
  const human = await activeHumanSql('u');
  const params: unknown[] = [];
  let filter = '';
  if (onlyUserIds) {
    params.push(onlyUserIds);
    filter = 'AND u.id = ANY($1::uuid[])';
  }
  const r = await pool.query(
    `SELECT u.id, u.username, u.email,
            COALESCE(u.balance, 0) + COALESCE(u.reserved_cash, 0)
              + COALESCE((SELECT SUM(pi.total_value) FROM portfolio_items pi WHERE pi.user_id = u.id), 0) AS equity_now
       FROM users u
      WHERE u.email_verified = true AND ${human}
        AND (u.notification_prefs -> 'email_digest') IS DISTINCT FROM 'false'::jsonb
        ${filter}
      ORDER BY u.created_at ASC, u.id ASC`,
    params
  );
  return r.rows.map((x: any) => ({ id: String(x.id), username: String(x.username), email: String(x.email), equity_now: num(x.equity_now) ?? INITIAL_ACCOUNT_BALANCE }));
}

/**
 * Haftanın başı ve sonu için tüm sıralanabilir oyuncuların toplam varlığı + genel sırası
 * (günlük kapanış / başlangıç noktalarından; tek sorgu).
 */
async function loadWeekStats(window: DigestWindow): Promise<{ byUser: Map<string, WeekUserStats>; players: number }> {
  const human = await activeHumanSql('u');
  const r = await pool.query(
    `WITH elig AS (
       SELECT u.id, u.created_at FROM users u WHERE u.email_verified = true AND ${human}
     ),
     s0 AS (
       SELECT DISTINCT ON (ps.user_id) ps.user_id, ps.total_value
         FROM portfolio_snapshots ps JOIN elig e ON e.id = ps.user_id
        WHERE ps.granularity IN ('day', 'start') AND ps.taken_at <= $1::timestamptz
        ORDER BY ps.user_id, ps.taken_at DESC
     ),
     s1 AS (
       SELECT DISTINCT ON (ps.user_id) ps.user_id, ps.total_value
         FROM portfolio_snapshots ps JOIN elig e ON e.id = ps.user_id
        WHERE ps.granularity IN ('day', 'start') AND ps.taken_at < $2::timestamptz
        ORDER BY ps.user_id, ps.taken_at DESC
     ),
     r0 AS (
       SELECT s0.user_id, s0.total_value, ROW_NUMBER() OVER (ORDER BY s0.total_value DESC, e.created_at ASC, e.id ASC) AS rk
         FROM s0 JOIN elig e ON e.id = s0.user_id
     ),
     r1 AS (
       SELECT s1.user_id, s1.total_value, ROW_NUMBER() OVER (ORDER BY s1.total_value DESC, e.created_at ASC, e.id ASC) AS rk
         FROM s1 JOIN elig e ON e.id = s1.user_id
     )
     SELECT e.id, r0.total_value AS v0, r0.rk AS rank0, r1.total_value AS v1, r1.rk AS rank1,
            (e.created_at >= $1::timestamptz AND e.created_at < $2::timestamptz) AS joined_in_week,
            (SELECT COUNT(*) FROM r1)::int AS players
       FROM elig e
       LEFT JOIN r0 ON r0.user_id = e.id
       LEFT JOIN r1 ON r1.user_id = e.id`,
    [window.start.toISOString(), window.end.toISOString()]
  );
  const byUser = new Map<string, WeekUserStats>();
  let players = 0;
  for (const x of r.rows as any[]) {
    players = Number(x.players) || 0;
    byUser.set(String(x.id), {
      v0: num(x.v0),
      v1: num(x.v1),
      rank0: x.rank0 === null || x.rank0 === undefined ? null : Number(x.rank0),
      rank1: x.rank1 === null || x.rank1 === undefined ? null : Number(x.rank1),
      joined_in_week: x.joined_in_week === true,
    });
  }
  return { byUser, players };
}

async function loadTrades(userId: string, window: DigestWindow) {
  // created_at TIMESTAMP (saat dilimsiz): karşılaştırma oturum saat dilimiyle yapılır — CURRENT_TIMESTAMP ile yazıldığı gibi
  const r = await pool.query(
    `SELECT type, symbol, asset_type, quantity, price, (created_at >= $2::timestamptz) AS in_window
       FROM transactions
      WHERE user_id = $1 AND created_at < $3::timestamptz
      ORDER BY created_at ASC, id ASC`,
    [userId, window.start.toISOString(), window.end.toISOString()]
  );
  return tradeExtremes(
    r.rows.map((x: any) => ({
      type: x.type === 'sell' ? 'sell' : 'buy',
      symbol: String(x.symbol),
      asset_type: String(x.asset_type),
      quantity: Number(x.quantity),
      price: Number(x.price),
      in_window: x.in_window === true,
    }))
  );
}

async function loadArena(userId: string, window: DigestWindow): Promise<DigestData['arena']> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS rounds, MAX(e.return_pct) AS best
       FROM arena_entries e
       JOIN arena_rounds r ON r.id = e.round_id
      WHERE e.user_id = $1 AND r.status = 'finished' AND e.return_pct IS NOT NULL
        AND r.finished_at >= $2::timestamptz AND r.finished_at < $3::timestamptz`,
    [userId, window.start.toISOString(), window.end.toISOString()]
  );
  const best = num(r.rows[0]?.best);
  return { rounds: Number(r.rows[0]?.rounds ?? 0), best_return_pct: best === null ? null : round2(best) };
}

async function loadPick(userId: string, window: DigestWindow): Promise<DigestPick | null> {
  // Hafta içinde (Cumartesi 00:00) biten ve sonuçlanmış Haftalık Seçim haftası
  const r = await pool.query(
    `SELECT p.week_id, p.symbol, p.direction, p.status, p.return_pct, p.rank, w.participants
       FROM weekly_picks p
       JOIN weekly_pick_weeks w ON w.week_id = p.week_id
      WHERE p.user_id = $1 AND w.settled_at IS NOT NULL
        AND w.ends_at > $2::timestamptz AND w.ends_at <= $3::timestamptz
      ORDER BY w.ends_at DESC
      LIMIT 1`,
    [userId, window.start.toISOString(), window.end.toISOString()]
  );
  const x = r.rows[0];
  if (!x) return null;
  const ret = num(x.return_pct);
  return {
    week_id: String(x.week_id),
    symbol: String(x.symbol),
    direction: x.direction === 'down' ? 'down' : 'up',
    status: x.status === 'void' ? 'void' : 'active',
    return_pct: ret === null ? null : round2(ret),
    rank: x.rank === null || x.rank === undefined ? null : Number(x.rank),
    participants: x.participants === null || x.participants === undefined ? null : Number(x.participants),
  };
}

async function buildDigest(user: Recipient, window: DigestWindow, week: { byUser: Map<string, WeekUserStats>; players: number }): Promise<DigestData> {
  const st = week.byUser.get(user.id);
  const end = st?.v1 ?? user.equity_now;
  const start = st?.v0 ?? (st?.joined_in_week ? INITIAL_ACCOUNT_BALANCE : null);
  const [trades, arena, picks, liveRank] = await Promise.all([
    loadTrades(user.id, window),
    loadArena(user.id, window),
    loadPick(user.id, window),
    st?.rank1 == null ? LeaderboardService.getAllTimeRank(user.id) : Promise.resolve(null),
  ]);
  const { site } = publicUrls();
  return {
    username: user.username,
    week: { key: window.weekKey, label: window.label },
    portfolio: {
      change_pct: start !== null && start > 0 ? round2(((end - start) / start) * 100) : null,
      total_return_pct: round2(((end - INITIAL_ACCOUNT_BALANCE) / INITIAL_ACCOUNT_BALANCE) * 100),
    },
    rank: {
      current: st?.rank1 ?? liveRank,
      previous: st?.rank0 ?? null,
      players: week.players || null,
      joined_this_week: st?.joined_in_week ?? false,
    },
    trades,
    arena,
    picks,
    tip: tipForWeek(window.weekKey),
    links: {
      site,
      profile: `${site}/u/${encodeURIComponent(user.username)}`,
      unsubscribe: unsubscribeUrl(user.id),
      preferences: `${site}/profile`,
    },
  };
}

export function renderDigest(data: DigestData): { subject: string; html: string; text: string } {
  return { subject: digestSubject(data), html: renderDigestHtml(data), text: renderDigestText(data) };
}

function safeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 60) || 'kullanici';
}

// ---------------------------------------------------------------------------
// Servis
// ---------------------------------------------------------------------------

/**
 * Haftalık özet aboneliğini açar/kapatır (users.notification_prefs.email_digest).
 * Kullanıcı yoksa false. Abonelikten çıkma bağlantısı ve profil tercih kartı aynı alanı kullanır.
 */
export async function setDigestSubscription(userId: string, subscribed: boolean): Promise<boolean> {
  const r = await pool.query(
    `UPDATE users SET notification_prefs = COALESCE(notification_prefs, '{}'::jsonb) || jsonb_build_object('email_digest', $2::boolean)
      WHERE id = $1 RETURNING id`,
    [userId, subscribed]
  );
  return r.rows.length > 0;
}

export class DigestService {
  /**
   * Bir hafta için özetleri işler. ASLA aynı kullanıcıya aynı hafta ikinci kez göndermez.
   * Gönderim kapalıysa (geliştirme) yalnızca önizleme yazar / loglar.
   */
  static async run(opts: DigestRunOptions = {}): Promise<DigestRunResult> {
    const now = opts.now ?? new Date();
    const window = previousWeekWindow(now);
    const send = opts.send ?? digestSendEnabled();
    const mailer = opts.mailer ?? defaultMailer;
    // Önizleme dosyaları yalnızca yerel geliştirmede yazılır (test ve production'da — gönderim kapalıysa — yalnızca log)
    const previewDir =
      opts.previewDir !== undefined ? opts.previewDir : process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'production' ? null : DEFAULT_PREVIEW_DIR;
    const delayMs = Math.max(0, opts.delayMs ?? (opts.mailer ? 0 : parseInt(process.env.EMAIL_DIGEST_DELAY_MS || '200', 10) || 0));

    const result: DigestRunResult = { week_key: window.weekKey, mode: send ? 'send' : 'preview', recipients: 0, sent: 0, previewed: 0, failed: 0, skipped: 0 };
    const recipients = await loadRecipients(opts.onlyUserIds);
    result.recipients = recipients.length;
    if (recipients.length === 0) return result;
    const week = await loadWeekStats(window);

    for (const user of recipients) {
      const claimed = await DigestService.claim(user.id, window.weekKey, send);
      if (!claimed) {
        result.skipped += 1;
        continue;
      }
      try {
        const data = await buildDigest(user, window, week);
        const mail = renderDigest(data);
        if (!send) {
          DigestService.writePreview(previewDir, window.weekKey, user.username, mail.html);
          result.previewed += 1;
          continue;
        }
        const delivered = await mailer({
          to: user.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: {
            // RFC 2369 + RFC 8058: e-posta istemcisinin "abonelikten çık" düğmesi (tek tık, POST)
            'List-Unsubscribe': `<${data.links.unsubscribe}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        if (!delivered) {
          // SMTP yok: ayrılan satırı bırak (bu kullanıcı sonra gönderilebilsin) ve turu durdur
          await pool.query(`DELETE FROM email_digests WHERE user_id = $1 AND week_key = $2 AND status = 'sending'`, [user.id, window.weekKey]);
          logger.warn('[digest] SMTP yapılandırılmamış; haftalık özet gönderimi durduruldu');
          result.aborted = 'no_transport';
          break;
        }
        await pool.query(
          `UPDATE email_digests SET status = 'sent', sent_at = now(), updated_at = now(), error = NULL WHERE user_id = $1 AND week_key = $2`,
          [user.id, window.weekKey]
        );
        result.sent += 1;
        if (delayMs > 0) await sleep(delayMs);
      } catch (err: any) {
        result.failed += 1;
        const message = String(err?.message || err).slice(0, 500);
        await pool
          .query(`UPDATE email_digests SET status = 'failed', error = $3, updated_at = now() WHERE user_id = $1 AND week_key = $2`, [
            user.id,
            window.weekKey,
            message,
          ])
          .catch(() => undefined);
        logger.warn({ userId: user.id, week: window.weekKey }, `[digest] özet işlenemedi: ${message}`);
      }
    }
    return result;
  }

  /** Cron işi: 'weekly-digest' */
  static async job(): Promise<DigestRunResult> {
    const r = await DigestService.run();
    logger.info(
      r,
      `[digest] ${r.week_key} (${r.mode === 'send' ? 'gönderim' : 'yalnızca önizleme — gerçek gönderim için EMAIL_DIGEST_SEND=1'}): ` +
        `${r.recipients} alıcı, ${r.sent} gönderildi, ${r.previewed} önizlendi, ${r.failed} hata, ${r.skipped} atlandı`
    );
    return r;
  }

  /**
   * Kullanıcı + hafta satırını ayırır. Gönderimde: yeni satır ya da önizleme / (deneme hakkı kalan) hatalı satır.
   * Önizlemede: yalnızca yeni satır (önizleme satırı sonraki gerçek gönderimi ENGELLEMEZ).
   */
  private static async claim(userId: string, weekKey: string, send: boolean): Promise<boolean> {
    const r = send
      ? await pool.query(
          `INSERT INTO email_digests (user_id, week_key, status, attempts) VALUES ($1, $2, 'sending', 1)
           ON CONFLICT (user_id, week_key) DO UPDATE
              SET status = 'sending', attempts = email_digests.attempts + 1, error = NULL, updated_at = now()
            WHERE email_digests.status = 'preview'
               OR (email_digests.status = 'failed' AND email_digests.attempts < $3)
           RETURNING 1`,
          [userId, weekKey, MAX_ATTEMPTS]
        )
      : await pool.query(
          `INSERT INTO email_digests (user_id, week_key, status, attempts) VALUES ($1, $2, 'preview', 0)
           ON CONFLICT (user_id, week_key) DO NOTHING
           RETURNING 1`,
          [userId, weekKey]
        );
    return r.rows.length > 0;
  }

  private static writePreview(dir: string | null, weekKey: string, username: string, html: string): void {
    if (!dir) {
      logger.info(`[digest:önizleme] ${username} → ${weekKey} (gönderilmedi)`);
      return;
    }
    try {
      const folder = path.join(dir, weekKey);
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, `${safeFileName(username)}.html`);
      fs.writeFileSync(file, html, 'utf8');
      logger.info(`[digest:önizleme] ${username} → ${weekKey} (gönderilmedi; ${file})`);
    } catch (err: any) {
      logger.warn(`[digest:önizleme] yazılamadı: ${err?.message || err}`);
    }
  }

  /**
   * YALNIZCA geliştirme önizlemesi (GET /api/dev/email/digest-preview): kullanıcının son tam haftası için
   * özeti üretir. Hiçbir şey göndermez ve email_digests'e yazmaz. Tercih/doğrulama filtresi uygulanmaz.
   */
  static async preview(username: string, now: Date = new Date()): Promise<{ week_key: string; subject: string; html: string; text: string; data: DigestData }> {
    const human = await activeHumanSql('u');
    const r = await pool.query(
      `SELECT u.id, u.username, u.email,
              COALESCE(u.balance, 0) + COALESCE(u.reserved_cash, 0)
                + COALESCE((SELECT SUM(pi.total_value) FROM portfolio_items pi WHERE pi.user_id = u.id), 0) AS equity_now
         FROM users u
        WHERE LOWER(u.username) = LOWER($1) AND ${human}
        LIMIT 1`,
      [username]
    );
    const x = r.rows[0];
    if (!x) throw new AppError(404, 'Kullanıcı bulunamadı', 'NOT_FOUND');
    const user: Recipient = { id: String(x.id), username: String(x.username), email: String(x.email), equity_now: num(x.equity_now) ?? INITIAL_ACCOUNT_BALANCE };
    const window = previousWeekWindow(now);
    const data = await buildDigest(user, window, await loadWeekStats(window));
    return { week_key: window.weekKey, ...renderDigest(data), data };
  }
}
