import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { getJwtSecret } from '../config/env';
import { User, LoginRequest, RegisterRequest, AuthResponse, mapUserRow } from '../types';
import { LeaderboardService } from './leaderboard';

const BCRYPT_ROUNDS = 10;
const JWT_ALGORITHM = 'HS256' as const;
const JWT_EXPIRES_IN = '7d';

// Kullanıcı bulunamadığında da bcrypt karşılaştırması yapılır (zamanlama farkı ile email tespiti engellenir)
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', BCRYPT_ROUNDS);

const USER_COLUMNS = `id, username, email, email_verified, balance, portfolio_value, total_profit_loss,
                      rank, created_at, is_admin, is_banned`;

export class AuthService {
  // Kullanıcı kayıt (girdi route katmanında zod ile doğrulanır ve normalize edilir)
  static async register(data: RegisterRequest): Promise<AuthResponse & { status: number }> {
    const email = data.email.trim().toLowerCase();
    const username = data.username.trim();

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = $2 LIMIT 1',
      [username, email]
    );
    if (existingUser.rows.length > 0) {
      return { success: false, status: 409, message: 'Kullanıcı adı veya email zaten kullanılıyor' };
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    try {
      // Haftalık liderlik referansı: başlangıç 100.000 TL + mevcut ISO hafta
      const result = await pool.query(
        `INSERT INTO users (
            username, email, password_hash, email_verified,
            week_baseline_equity, week_baseline_iso_key
          )
         VALUES (
            $1, $2, $3, false,
            100000,
            to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IYYY')
              || '-' ||
            to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Istanbul')::date, 'IW')
          )
         RETURNING ${USER_COLUMNS}`,
        [username, email, passwordHash]
      );
      return { success: true, status: 201, user: mapUserRow(result.rows[0]) };
    } catch (error: any) {
      if (error?.code === '23505') {
        return { success: false, status: 409, message: 'Kullanıcı adı veya email zaten kullanılıyor' };
      }
      throw error;
    }
  }

  // Kullanıcı giriş
  static async login(data: LoginRequest): Promise<AuthResponse & { status: number }> {
    const email = data.email.trim().toLowerCase();
    const result = await pool.query(
      `SELECT ${USER_COLUMNS}, password_hash, token_version FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [email]
    );
    const user = result.rows[0];

    // Önce şifre (kullanıcı yoksa sahte hash ile) — yasaklı durumu şifre doğrulanmadan açıklanmaz
    const isValidPassword = await bcrypt.compare(data.password, user?.password_hash || DUMMY_HASH);
    if (!user || !isValidPassword) {
      return { success: false, status: 401, message: 'Email veya şifre hatalı' };
    }

    if (user.is_banned) {
      return {
        success: false,
        status: 403,
        message: 'Hesabınız yasaklanmış. Lütfen yönetici ile iletişime geçin.',
      };
    }

    const token = AuthService.signSessionToken(user.id, user.token_version);

    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const rank = await LeaderboardService.getAllTimeRank(user.id);
    return { success: true, status: 200, user: mapUserRow(user, rank), token };
  }

  /** Güncel kullanıcı bilgisi (rank sorgu anında window function ile hesaplanır). */
  static async getProfile(userId: string): Promise<User | null> {
    const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [userId]);
    const row = result.rows[0];
    if (!row || row.is_banned) return null;
    const rank = await LeaderboardService.getAllTimeRank(userId);
    return mapUserRow(row, rank);
  }

  /**
   * Oturum JWT'si üretir. `tv` (users.token_version) her doğrulamada veritabanıyla karşılaştırılır;
   * değer artırıldığında (tüm cihazlardan çıkış, şifre sıfırlama) eski token'lar geçersiz olur.
   * Token istemciye gövdede DÖNMEZ; route katmanı httpOnly çereze yazar.
   */
  static signSessionToken(userId: string, tokenVersion: unknown): string {
    const tv = Number(tokenVersion ?? 0);
    return jwt.sign({ userId, tv: Number.isInteger(tv) ? tv : 0 }, getJwtSecret(), {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_EXPIRES_IN,
    });
  }

  /** Kullanıcının tüm oturumlarını iptal eder (token_version + 1). */
  static async revokeAllSessions(userId: string): Promise<void> {
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
  }

  /**
   * Token doğrulama. Geçersiz/süresi dolmuş token, iptal edilmiş oturum (tv uyuşmazlığı),
   * silinmiş veya yasaklı kullanıcı → null.
   * (Her istekte çalıştığı için rank burada yeniden hesaplanmaz; cron'un yazdığı değer döner.)
   */
  static async verifyToken(token: string): Promise<User | null> {
    let decoded: unknown;
    try {
      decoded = jwt.verify(token, getJwtSecret(), { algorithms: [JWT_ALGORITHM] });
    } catch {
      return null;
    }

    const payload = typeof decoded === 'object' && decoded !== null ? (decoded as Record<string, unknown>) : {};
    const userId = payload.userId;
    const tv = payload.tv;
    if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return null;
    }
    // `tv` içermeyen (eski) token'lar kabul edilmez
    if (typeof tv !== 'number' || !Number.isInteger(tv)) {
      return null;
    }

    const result = await pool.query(`SELECT ${USER_COLUMNS}, token_version FROM users WHERE id = $1`, [userId]);
    const row = result.rows[0];
    if (!row || row.is_banned || Number(row.token_version) !== tv) {
      return null;
    }
    return mapUserRow(row);
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }
}
