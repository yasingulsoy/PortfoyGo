import { Pool } from 'pg';
import { COMMODITY_NAMES, PRICES, PickAssetType, PickDirection, QuoteCurrency } from '../services/picks/config';
import { crowdSummary, pickReturnPct, rankPicks, round4 } from '../services/picks/scoring';
import { WeekTimes, activeWeekTimes, phaseAt, shiftWeekId, weekTimes } from '../services/picks/timeline';

/**
 * Çalışan YEREL PGlite veritabanına Haftalık Seçim örnek verisini bir kez uygular (idempotent):
 *
 *   npx ts-node --transpile-only src/dev/seedPicksLocal.ts
 *
 *  - Geçen hafta: örnek kullanıcıların seçimleri, giriş/çıkış fiyatları (fiyat geçmişinden), getiri, sıra,
 *    kitle istatistikleri ve yorumlar → 'finished' (ödül / bildirim adımları "yapıldı" işaretlenir; ödül verilmez)
 *  - Bu hafta (etkin hafta): örnek kullanıcıların seçimleri; yarışma başladıysa giriş fiyatlarıyla
 *  - Bu hafta canlıysa: sonraki haftaya demo DIŞINDAKİ kullanıcıların (gizli) seçimleri → geliştirme saatiyle
 *    Cumartesiye geçince 'submit' evresi katılımcılarla görülebilir; demo kendi seçimini gönderebilir.
 *
 * Yalnızca 127.0.0.1:54329 (npm run db:local / dev:local) kabul edilir; başka her adres REDDEDİLİR.
 * backend/.env OKUNMAZ (dotenv / config yüklenmez). Adres PICKS_SEED_DATABASE_URL ile verilebilir (yine yalnızca yerel).
 * Önce 017_weekly_picks.sql uygulanmış olmalıdır. Zaman: gerçek saat (geliştirme saati bu süreçte yok).
 */
const DEFAULT_URL = 'postgres://postgres:postgres@127.0.0.1:54329/postgres';

function assertLocal(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Geçersiz veritabanı adresi');
  }
  if (u.hostname !== '127.0.0.1' || u.port !== '54329') {
    throw new Error(`Reddedildi: yalnızca yerel PGlite (127.0.0.1:54329) kabul edilir, verilen: ${u.hostname}:${u.port || '(varsayılan)'}`);
  }
}

interface SeedPick {
  username: string;
  asset_type: PickAssetType;
  symbol: string;
  direction: PickDirection;
  note: string | null;
}

const PREVIOUS: SeedPick[] = [
  { username: 'demo', asset_type: 'stock', symbol: 'NVDA', direction: 'up', note: 'Yapay zekâ talebi sürüyor; bilanço öncesi momentum güçlü.' },
  { username: 'aylin_trader', asset_type: 'commodity', symbol: 'GOLD', direction: 'up', note: 'Faiz indirimi beklentisi altını destekler.' },
  { username: 'can_hisse', asset_type: 'stock', symbol: 'TSLA', direction: 'down', note: 'Teslimat beklentileri fazla iyimser.' },
  { username: 'mert_kripto', asset_type: 'crypto', symbol: 'BTC', direction: 'up', note: 'ETF girişleri güçlü, 120 bin test edilebilir.' },
  { username: 'zeynep_uzun', asset_type: 'currency', symbol: 'EUR', direction: 'up', note: null },
];

const CURRENT: SeedPick[] = [
  { username: 'demo', asset_type: 'crypto', symbol: 'ETH', direction: 'up', note: 'Ağ ücretleri düştü, kullanım artıyor.' },
  { username: 'aylin_trader', asset_type: 'stock', symbol: 'AAPL', direction: 'down', note: 'Talep zayıflığı fiyatlanmadı.' },
  { username: 'can_hisse', asset_type: 'stock', symbol: 'MSFT', direction: 'up', note: 'Bulut büyümesi hızlanıyor.' },
  { username: 'mert_kripto', asset_type: 'crypto', symbol: 'SOL', direction: 'up', note: null },
  { username: 'zeynep_uzun', asset_type: 'currency', symbol: 'USD', direction: 'up', note: 'Kur sepeti için dolar ağırlığını artırıyorum.' },
];

const NEXT: SeedPick[] = [
  { username: 'aylin_trader', asset_type: 'stock', symbol: 'NVDA', direction: 'up', note: 'Bilanço haftası.' },
  { username: 'can_hisse', asset_type: 'stock', symbol: 'AMZN', direction: 'down', note: null },
  { username: 'mert_kripto', asset_type: 'crypto', symbol: 'BTC', direction: 'down', note: 'Kısa vadeli düzeltme bekliyorum.' },
  { username: 'zeynep_uzun', asset_type: 'currency', symbol: 'EUR', direction: 'down', note: null },
];

const PREVIOUS_COMMENTS: [string, string][] = [
  ['mert_kripto', "BTC'de ETF girişleri sürerse hafta içinde yeni zirve görebiliriz."],
  ['can_hisse', 'Kitle yine çoğunlukla yükselişte; ben ters köşeyi deniyorum.'],
  ['aylin_trader', 'Altın her belirsizlikte sığınak, bu hafta da öyle olacak gibi.'],
  ['demo', 'Sonuçlar ilginç: kitle portföyü tek tek seçimlerin çoğunu geçti.'],
];

const CURRENT_COMMENTS: [string, string][] = [
  ['can_hisse', 'Bu hafta teknoloji ağırlıklı bir kitle var.'],
  ['zeynep_uzun', 'Ben kuru seçtim; oynaklık bu hafta yüksek olabilir.'],
];

type Db = Pool;

/** prices.ts capturePrices ile aynı kural: hedefe kadar KAPANMIŞ en son kova, en fazla 6 saat geriye */
async function historyPriceAt(db: Db, assetType: string, symbol: string, currency: QuoteCurrency, target: Date): Promise<number | null> {
  const end = `(bucket_start + CASE granularity WHEN 'm15' THEN INTERVAL '15 minutes' WHEN 'hour' THEN INTERVAL '1 hour' ELSE INTERVAL '1 day' END)`;
  const r = await db.query(
    `SELECT price FROM price_history
      WHERE asset_type = $1 AND symbol = $2 AND currency = $3
        AND bucket_start < $4::timestamptz
        AND bucket_start >= $4::timestamptz - INTERVAL '1 day' - ($5::int * INTERVAL '1 millisecond')
        AND ${end} <= $4::timestamptz AND ${end} >= $4::timestamptz - ($5::int * INTERVAL '1 millisecond')
      ORDER BY ${end} DESC, CASE granularity WHEN 'm15' THEN 0 WHEN 'hour' THEN 1 ELSE 2 END
      LIMIT 1`,
    [assetType, symbol, currency, target.toISOString(), PRICES.historyLookbackMs]
  );
  const n = parseFloat(String(r.rows[0]?.price ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function assetInfo(db: Db, p: SeedPick): Promise<{ name: string; currency: QuoteCurrency }> {
  if (p.asset_type === 'stock' || p.asset_type === 'crypto') {
    const r = await db.query(`SELECT name FROM market_data_cache WHERE asset_type = $1 AND UPPER(symbol) = $2 LIMIT 1`, [p.asset_type, p.symbol]);
    return { name: r.rows[0]?.name || p.symbol, currency: 'USD' };
  }
  if (p.asset_type === 'currency') {
    const r = await db.query(`SELECT name FROM currency_rates WHERE UPPER(code) = $1 LIMIT 1`, [p.symbol]);
    return { name: r.rows[0]?.name || p.symbol, currency: 'TRY' };
  }
  const r = await db.query(`SELECT currency FROM price_history WHERE asset_type = 'commodity' AND symbol = $1 ORDER BY bucket_start DESC LIMIT 1`, [p.symbol]);
  return { name: COMMODITY_NAMES[p.symbol] ?? p.symbol, currency: r.rows[0]?.currency === 'TRY' ? 'TRY' : 'USD' };
}

async function ensureWeekRow(db: Db, t: WeekTimes): Promise<void> {
  await db.query(
    `INSERT INTO weekly_pick_weeks (week_id, opens_at, reveal_at, starts_at, ends_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (week_id) DO NOTHING`,
    [t.week_id, t.opens_at.toISOString(), t.reveal_at.toISOString(), t.starts_at.toISOString(), t.ends_at.toISOString()]
  );
}

async function hasPicks(db: Db, weekId: string, userIds: string[]): Promise<boolean> {
  const r = await db.query(`SELECT 1 FROM weekly_picks WHERE week_id = $1 AND user_id = ANY($2::uuid[]) LIMIT 1`, [weekId, userIds]);
  return r.rows.length > 0;
}

async function addComments(db: Db, weekId: string, from: Date, users: Map<string, string>, list: [string, string][]): Promise<number> {
  const exists = await db.query(`SELECT 1 FROM weekly_pick_comments WHERE week_id = $1 LIMIT 1`, [weekId]);
  if (exists.rows.length > 0) return 0;
  let n = 0;
  for (const [i, [username, text]] of list.entries()) {
    const uid = users.get(username);
    if (!uid) continue;
    const at = new Date(from.getTime() + (i + 1) * 47 * 60 * 1000);
    if (at.getTime() > Date.now()) break;
    await db.query(`INSERT INTO weekly_pick_comments (week_id, user_id, text, created_at) VALUES ($1, $2, $3, $4)`, [weekId, uid, text, at.toISOString()]);
    n += 1;
  }
  return n;
}

async function insertPicks(
  db: Db,
  t: WeekTimes,
  picks: SeedPick[],
  users: Map<string, string>,
  withEntry: boolean
): Promise<number> {
  let n = 0;
  for (const [i, p] of picks.entries()) {
    const uid = users.get(p.username);
    if (!uid) continue;
    const info = await assetInfo(db, p);
    const entry = withEntry ? await historyPriceAt(db, p.asset_type, p.symbol, info.currency, t.starts_at) : null;
    const submitted = new Date(t.opens_at.getTime() + (i + 1) * 53 * 60 * 1000);
    const r = await db.query(
      `INSERT INTO weekly_picks (week_id, user_id, asset_type, symbol, name, direction, note, quote_currency, submitted_at, updated_at,
                                 entry_price, entry_at, status, void_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, $13)
       ON CONFLICT (week_id, user_id) DO NOTHING RETURNING id`,
      [
        t.week_id,
        uid,
        p.asset_type,
        p.symbol,
        info.name,
        p.direction,
        p.note,
        info.currency,
        submitted.toISOString(),
        entry,
        entry ? t.starts_at.toISOString() : null,
        withEntry && !entry ? 'void' : 'active',
        withEntry && !entry ? 'no_entry_price' : null,
      ]
    );
    n += r.rows.length;
  }
  return n;
}

async function seedPrevious(db: Db, t: WeekTimes, users: Map<string, string>): Promise<string> {
  if (await hasPicks(db, t.week_id, [...users.values()])) return `${t.week_id}: zaten var`;
  await ensureWeekRow(db, t);
  const rows: { id: string; p: SeedPick; submitted: Date; entry: number | null; exit: number | null; name: string; currency: QuoteCurrency }[] = [];
  for (const [i, p] of PREVIOUS.entries()) {
    const uid = users.get(p.username);
    if (!uid) continue;
    const info = await assetInfo(db, p);
    const entry = await historyPriceAt(db, p.asset_type, p.symbol, info.currency, t.starts_at);
    const exit = await historyPriceAt(db, p.asset_type, p.symbol, info.currency, t.ends_at);
    rows.push({ id: uid, p, submitted: new Date(t.opens_at.getTime() + (i + 1) * 53 * 60 * 1000), entry, exit, name: info.name, currency: info.currency });
  }
  const results = rows.map((r) => {
    const ret = r.entry && r.exit ? pickReturnPct(r.entry, r.exit, r.p.direction) : null;
    return {
      ...r,
      ret: ret === null ? null : round4(ret),
      status: (ret === null ? 'void' : 'active') as 'active' | 'void',
      voidReason: !r.entry ? 'no_entry_price' : ret === null ? 'no_exit_price' : null,
    };
  });
  const ranks = rankPicks(results.map((r) => ({ id: r.id, status: r.status, return_pct: r.ret, submitted_at: r.submitted })));
  for (const r of results) {
    await db.query(
      `INSERT INTO weekly_picks (week_id, user_id, asset_type, symbol, name, direction, note, quote_currency, submitted_at, updated_at,
                                 entry_price, entry_at, exit_price, exit_at, status, void_reason, return_pct, rank)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (week_id, user_id) DO NOTHING`,
      [
        t.week_id,
        r.id,
        r.p.asset_type,
        r.p.symbol,
        r.name,
        r.p.direction,
        r.p.note,
        r.currency,
        r.submitted.toISOString(),
        r.entry,
        r.entry ? t.starts_at.toISOString() : null,
        r.exit,
        r.exit ? t.ends_at.toISOString() : null,
        r.status,
        r.voidReason,
        r.ret,
        ranks.get(r.id) ?? null,
      ]
    );
  }
  const s = crowdSummary(
    results.map((r) => ({ asset_type: r.p.asset_type, symbol: r.p.symbol, name: r.name, direction: r.p.direction, status: r.status, return_pct: r.ret }))
  );
  await db.query(
    `UPDATE weekly_pick_weeks
        SET revealed_notified_at = COALESCE(revealed_notified_at, reveal_at), entry_captured_at = COALESCE(entry_captured_at, starts_at),
            settled_at = COALESCE(settled_at, ends_at), rewarded_at = COALESCE(rewarded_at, ends_at),
            participants = $2, valid_picks = $3, bullish_pct = $4, crowd_return_pct = $5, beat_pct = $6
      WHERE week_id = $1`,
    [t.week_id, s.participants, s.valid, s.bullish_pct, s.crowd_return === null ? null : round4(s.crowd_return), s.beat_pct]
  );
  const c = await addComments(db, t.week_id, t.reveal_at, users, PREVIOUS_COMMENTS);
  return `${t.week_id}: bitmiş hafta, ${results.length} seçim (${results.filter((r) => r.status === 'active').length} geçerli), ${c} yorum`;
}

async function main(): Promise<void> {
  const url = process.env.PICKS_SEED_DATABASE_URL || DEFAULT_URL;
  assertLocal(url);
  const db = new Pool({ connectionString: url, max: 2, ssl: false });
  try {
    const ok = await db.query(`SELECT to_regclass('weekly_pick_weeks') IS NOT NULL AS ok`);
    if (!ok.rows[0]?.ok) throw new Error('017_weekly_picks.sql uygulanmamış');
    const u = await db.query(`SELECT id, username FROM users WHERE username = ANY($1::text[])`, [
      ['demo', 'aylin_trader', 'can_hisse', 'mert_kripto', 'zeynep_uzun'],
    ]);
    const users = new Map<string, string>(u.rows.map((r: any) => [r.username as string, r.id as string]));
    if (users.size === 0) throw new Error('Örnek kullanıcılar yok (npm run db:local ile tohumlayın)');

    const now = new Date();
    const active = activeWeekTimes(now);
    const prev = weekTimes(shiftWeekId(active.week_id, -1)!)!;
    const next = weekTimes(shiftWeekId(active.week_id, 1)!)!;
    const phase = phaseAt(active, now, false);
    const out: string[] = [await seedPrevious(db, prev, users)];

    // Etkin hafta
    if (await hasPicks(db, active.week_id, [...users.values()])) {
      out.push(`${active.week_id}: zaten var`);
    } else {
      await ensureWeekRow(db, active);
      // Geliştirme saati ileri alınıp geri çekildiyse hafta (seçimsizken) "kapanmış" işaretlenmiş olabilir: henüz
      // bitmemiş ve sonucu olmayan haftanın kapanış bayraklarını temizle (gerçek kapanışı iş yapsın)
      await db.query(
        `UPDATE weekly_pick_weeks
            SET settled_at = NULL, rewarded_at = NULL, participants = NULL, valid_picks = NULL,
                bullish_pct = NULL, crowd_return_pct = NULL, beat_pct = NULL
          WHERE week_id = $1 AND ends_at > $2 AND settled_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM weekly_picks p WHERE p.week_id = $1 AND p.exit_price IS NOT NULL)`,
        [active.week_id, now.toISOString()]
      );
      const started = phase === 'live' || phase === 'settling';
      const list = phase === 'submit' ? CURRENT.filter((p) => p.username !== 'demo') : CURRENT;
      const n = await insertPicks(db, active, list, users, started);
      if (started || phase === 'revealed') {
        await db.query(
          `UPDATE weekly_pick_weeks SET revealed_notified_at = COALESCE(revealed_notified_at, reveal_at)
             ${started ? ', entry_captured_at = COALESCE(entry_captured_at, starts_at)' : ''}
           WHERE week_id = $1`,
          [active.week_id]
        );
      }
      const c = phase === 'submit' ? 0 : await addComments(db, active.week_id, active.reveal_at, users, CURRENT_COMMENTS);
      out.push(`${active.week_id} (${phase}): ${n} seçim${started ? ' (giriş fiyatlarıyla)' : ''}, ${c} yorum`);
    }

    // Sonraki hafta (yalnızca etkin hafta canlıyken): demo hariç gizli seçimler
    if (phase === 'live') {
      if (await hasPicks(db, next.week_id, [...users.values()])) {
        out.push(`${next.week_id}: zaten var`);
      } else {
        await ensureWeekRow(db, next);
        out.push(`${next.week_id} (yaklaşan): ${await insertPicks(db, next, NEXT, users, false)} gizli seçim (demo hariç)`);
      }
    }
    console.log(`[seed:picks] ${out.join(' | ')}`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(`[seed:picks] HATA: ${err?.message || err}`);
  process.exit(1);
});
