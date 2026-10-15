import pool from '../../config/database';
import { AppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { getInstrument } from '../arena/instruments';
import { ArenaService, loadRound, roundPaths } from '../arena/service';
import { COACH_VERSION, analyzeRound, type CoachPositionInput, type CoachReport } from './analyze';

/**
 * Arena Koçu yükleyicisi: bitmiş turun pozisyonlarını ve (varsa) fiyat yolunu okur, analyzeRound ile
 * raporu üretir ve coach_reports tablosuna önbellekler (tur × kullanıcı). Önbellekteki raporun sürümü
 * COACH_VERSION'dan eskiyse yeniden hesaplanır.
 *
 * Hatalar: 404 ROUND_NOT_FOUND, 403 NOT_PARTICIPANT, 409 ROUND_NOT_FINISHED.
 */

const num = (v: unknown): number => (typeof v === 'number' ? v : parseFloat(String(v)));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

function parseJson<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}

function toCoachPosition(row: any): CoachPositionInput {
  return {
    id: row.id,
    instrument: row.instrument,
    side: row.side,
    amount: num(row.amount),
    qty: num(row.qty),
    entry_price: num(row.entry_price),
    entry_tick: Number(row.entry_tick),
    stop_loss: numOrNull(row.stop_loss),
    take_profit: numOrNull(row.take_profit),
    close_price: numOrNull(row.close_price),
    close_tick: row.close_tick === null || row.close_tick === undefined ? null : Number(row.close_tick),
    pnl: numOrNull(row.pnl),
    close_reason: row.close_reason ?? null,
  };
}

export class CoachService {
  static async getReport(roundId: string, userId: string): Promise<CoachReport> {
    const cached = await pool.query('SELECT report FROM coach_reports WHERE round_id = $1 AND user_id = $2', [roundId, userId]);
    const hit = parseJson<CoachReport>(cached.rows[0]?.report);
    if (hit && hit.version === COACH_VERSION) return hit;

    let round = await loadRound(roundId);
    if (!round) throw new AppError(404, 'Tur bulunamadı', 'ROUND_NOT_FOUND');

    const entry = await pool.query('SELECT return_pct FROM arena_entries WHERE round_id = $1 AND user_id = $2', [roundId, userId]);
    if (!entry.rows[0]) throw new AppError(403, 'Bu turun katılımcısı değilsin', 'NOT_PARTICIPANT');

    // Süresi dolmuş ama henüz kapatılmamış tur: tembel kapanışı tetikle
    if ((round.status === 'running' || round.status === 'scheduled') && Date.now() >= round.ends_at.getTime()) {
      round = await ArenaService.refreshLifecycle(round);
    }
    if (round.status !== 'finished') {
      throw new AppError(409, 'Koç raporu tur bittikten sonra hazırlanır', 'ROUND_NOT_FINISHED');
    }

    const pos = await pool.query(
      `SELECT * FROM arena_positions WHERE round_id = $1 AND user_id = $2 ORDER BY entry_tick, opened_at, id`,
      [roundId, userId]
    );

    let paths: Map<string, number[]> | null = null;
    try {
      paths = roundPaths(round);
    } catch (err: any) {
      logger.warn({ roundId, err: err?.message }, '[coach] fiyat yolu üretilemedi; yalnızca kayıtlı fiyatlar kullanılacak');
    }

    const labels: Record<string, string> = {};
    for (const code of round.instruments) labels[code] = getInstrument(code)?.label ?? code;

    const report = analyzeRound({
      round_id: round.id,
      duration_s: round.duration_s,
      starting_cash: round.starting_cash,
      instruments: round.instruments,
      positions: pos.rows.map(toCoachPosition),
      paths,
      return_pct: numOrNull(entry.rows[0].return_pct),
      labels,
    });

    await pool.query(
      `INSERT INTO coach_reports (round_id, user_id, report, created_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (round_id, user_id) DO UPDATE SET report = EXCLUDED.report, created_at = now()`,
      [roundId, userId, JSON.stringify(report)]
    );
    return report;
  }
}
