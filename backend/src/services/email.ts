import crypto from 'crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import pool from '../config/database';
import { AuthService } from './auth';

/**
 * Not: email_verifications tablosunda `purpose` ('verify' | 'reset') ve `attempts`
 * kolonları gereklidir (migrations/001_hardening.sql).
 */

const MAX_ATTEMPTS = 5;
const VERIFY_TTL_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
/** Aynı kullanıcı için aynı anda geçerli en fazla sıfırlama kodu */
const MAX_ACTIVE_RESET_CODES = 3;

export const RESET_REQUEST_MESSAGE =
  'Bu email adresi kayıtlıysa şifre sıfırlama kodu gönderildi. Lütfen gelen kutunuzu kontrol edin.';

type Result = { success: boolean; message: string; status?: number };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** Sabit zamanlı karşılaştırma */
function codesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export class EmailService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) {
      console.warn('[email] SMTP_USER / SMTP_PASS tanımlı değil; email gönderilemiyor.');
      return null;
    }
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  private fromAddress(): string {
    return process.env.SMTP_FROM || `"PortfoyGo" <${process.env.SMTP_USER}>`;
  }

  /** Kriptografik olarak güvenli 6 haneli kod */
  generateVerificationCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /** Oturum açmış kullanıcının KAYITLI email adresine doğrulama kodu gönderir. */
  async sendVerificationCode(userId: string): Promise<Result> {
    const userRes = await pool.query('SELECT id, email, email_verified FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];
    if (!user) {
      return { success: false, status: 404, message: 'Kullanıcı bulunamadı' };
    }
    if (user.email_verified) {
      return { success: true, message: 'Email adresiniz zaten doğrulanmış' };
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      return { success: false, status: 503, message: 'Email servisi şu an kullanılamıyor' };
    }

    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFY_TTL_MS);

    // Sadece BU kullanıcının bekleyen doğrulama kodlarını geçersiz kıl
    await pool.query(
      `UPDATE email_verifications SET used = true
        WHERE user_id = $1 AND purpose = 'verify' AND used = false`,
      [user.id]
    );
    await pool.query(
      `INSERT INTO email_verifications (user_id, email, verification_code, expires_at, purpose, attempts)
       VALUES ($1, $2, $3, $4, 'verify', 0)`,
      [user.id, user.email, code, expiresAt]
    );

    try {
      await transporter.sendMail({
        from: this.fromAddress(),
        to: user.email,
        subject: 'Email Doğrulama Kodu - PortfoyGo',
        html: verificationTemplate(code),
      });
    } catch (error: any) {
      console.error('[email] Doğrulama emaili gönderilemedi:', error?.message);
      return { success: false, status: 502, message: 'Email gönderilemedi. Lütfen tekrar deneyin.' };
    }

    return { success: true, message: 'Doğrulama kodu email adresinize gönderildi' };
  }

  /** Oturum açmış kullanıcı için kodu doğrular (kod başına en fazla 5 deneme). */
  async verifyCode(userId: string, code: string): Promise<Result> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query('SELECT id, email, email_verified FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const user = userRes.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return { success: false, status: 404, message: 'Kullanıcı bulunamadı' };
      }
      if (user.email_verified) {
        await client.query('COMMIT');
        return { success: true, message: 'Email adresiniz zaten doğrulanmış' };
      }

      const r = await client.query(
        `SELECT id, email, verification_code, expires_at, attempts
           FROM email_verifications
          WHERE user_id = $1 AND purpose = 'verify' AND used = false
          ORDER BY created_at DESC
          LIMIT 1
          FOR UPDATE`,
        [userId]
      );
      const row = r.rows[0];
      if (!row) {
        await client.query('COMMIT');
        return { success: false, status: 400, message: 'Geçerli bir doğrulama kodu yok. Lütfen yeni kod isteyin.' };
      }

      if (new Date() > new Date(row.expires_at)) {
        await client.query('UPDATE email_verifications SET used = true WHERE id = $1', [row.id]);
        await client.query('COMMIT');
        return { success: false, status: 400, message: 'Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin.' };
      }

      if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
        await client.query('UPDATE email_verifications SET used = true WHERE id = $1', [row.id]);
        await client.query('COMMIT');
        return { success: false, status: 400, message: 'Çok fazla hatalı deneme. Lütfen yeni kod isteyin.' };
      }

      if (!codesEqual(row.verification_code, code)) {
        const attempts = (row.attempts ?? 0) + 1;
        await client.query('UPDATE email_verifications SET attempts = $2, used = $3 WHERE id = $1', [
          row.id,
          attempts,
          attempts >= MAX_ATTEMPTS,
        ]);
        await client.query('COMMIT');
        return {
          success: false,
          status: 400,
          message:
            attempts >= MAX_ATTEMPTS
              ? 'Çok fazla hatalı deneme. Lütfen yeni kod isteyin.'
              : 'Geçersiz doğrulama kodu',
        };
      }

      await client.query('UPDATE email_verifications SET used = true WHERE id = $1', [row.id]);
      // Kod gönderildikten sonra email değiştiyse doğrulama yapılmaz
      const upd = await client.query(
        'UPDATE users SET email_verified = true WHERE id = $1 AND LOWER(email) = LOWER($2)',
        [userId, row.email]
      );
      await client.query('COMMIT');

      if (upd.rowCount === 0) {
        return { success: false, status: 400, message: 'Geçerli bir doğrulama kodu yok. Lütfen yeni kod isteyin.' };
      }
      return { success: true, message: 'Email başarıyla doğrulandı' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Şifre sıfırlama kodu ister. Email kayıtlı olsun ya da olmasın aynı yanıt döner;
   * gönderim arka planda yapılır (yanıt süresi de email varlığını sızdırmaz).
   * Mevcut kodlar silinmez (başkası adına istek atılarak kullanıcının kodu geçersiz kılınamaz).
   */
  async requestPasswordReset(email: string): Promise<Result> {
    const normalized = email.trim().toLowerCase();
    setImmediate(() => {
      this.sendPasswordResetCodeInternal(normalized).catch((err) => {
        console.error('[email] Şifre sıfırlama işlemi hatası:', err?.message);
      });
    });
    return { success: true, message: RESET_REQUEST_MESSAGE };
  }

  private async sendPasswordResetCodeInternal(email: string): Promise<void> {
    const userRes = await pool.query('SELECT id, username, email, is_banned FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
    const user = userRes.rows[0];
    if (!user || user.is_banned) return;

    const active = await pool.query(
      `SELECT COUNT(*)::int AS n FROM email_verifications
        WHERE user_id = $1 AND purpose = 'reset' AND used = false
          AND expires_at > CURRENT_TIMESTAMP AND attempts < $2`,
      [user.id, MAX_ATTEMPTS]
    );
    if ((active.rows[0]?.n ?? 0) >= MAX_ACTIVE_RESET_CODES) {
      return; // sessizce yoksay (spam / kota koruması)
    }

    const transporter = this.getTransporter();
    if (!transporter) return;

    const code = this.generateVerificationCode();
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await pool.query(
      `INSERT INTO email_verifications (user_id, email, verification_code, expires_at, purpose, attempts)
       VALUES ($1, $2, $3, $4, 'reset', 0)`,
      [user.id, user.email, code, expiresAt]
    );

    await transporter.sendMail({
      from: this.fromAddress(),
      to: user.email,
      subject: 'Şifre Sıfırlama Kodu - PortfoyGo',
      html: resetTemplate(code, user.username),
    });
  }

  /**
   * Şifreyi sıfırlama koduyla değiştirir. Sadece purpose='reset' kodları kabul edilir
   * (doğrulama kodları burada, sıfırlama kodları /email/verify'da kullanılamaz).
   * Hatalı denemede kullanıcının tüm aktif sıfırlama kodlarının deneme sayacı artar.
   */
  async resetPassword(email: string, code: string, newPassword: string): Promise<Result> {
    const normalized = email.trim().toLowerCase();
    const invalid: Result = { success: false, status: 400, message: 'Geçersiz veya süresi dolmuş kod' };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const userRes = await client.query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1 FOR UPDATE', [normalized]);
      const user = userRes.rows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return invalid;
      }

      const codes = await client.query(
        `SELECT id, verification_code FROM email_verifications
          WHERE user_id = $1 AND purpose = 'reset' AND used = false
            AND expires_at > CURRENT_TIMESTAMP AND attempts < $2
          FOR UPDATE`,
        [user.id, MAX_ATTEMPTS]
      );
      const match = codes.rows.find((r: any) => codesEqual(r.verification_code, code));

      if (!match) {
        if (codes.rows.length > 0) {
          await client.query(
            `UPDATE email_verifications
                SET attempts = attempts + 1,
                    used = (attempts + 1 >= $2)
              WHERE id = ANY($1::uuid[])`,
            [codes.rows.map((r: any) => r.id), MAX_ATTEMPTS]
          );
        }
        await client.query('COMMIT');
        return invalid;
      }

      const hash = await AuthService.hashPassword(newPassword);
      await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [user.id, hash]);
      await client.query(
        `UPDATE email_verifications SET used = true
          WHERE user_id = $1 AND purpose = 'reset' AND used = false`,
        [user.id]
      );
      await client.query('COMMIT');
      return { success: true, message: 'Şifreniz başarıyla güncellendi. Yeni şifrenizle giriş yapabilirsiniz.' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function verificationTemplate(code: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">PortfoyGo</h1>
        <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Email Doğrulama</p>
      </div>
      <div style="padding: 40px 30px; background: #f8f9fa;">
        <h2 style="color: #333; margin: 0 0 20px 0;">Hesabınızı Doğrulayın</h2>
        <p style="color: #666; line-height: 1.6; margin: 0 0 20px 0;">
          Merhaba!<br><br>
          PortfoyGo'ya hoş geldiniz. Hesabınızı aktifleştirmek için aşağıdaki doğrulama kodunu kullanın:
        </p>
        <div style="background: white; border: 2px dashed #667eea; border-radius: 10px; padding: 30px; text-align: center; margin: 30px 0;">
          <div style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; font-family: monospace;">${escapeHtml(code)}</div>
        </div>
        <p style="color: #666; line-height: 1.6; margin: 20px 0;">
          Bu kod <strong>15 dakika</strong> geçerlidir. Eğer bu işlemi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz.
        </p>
        <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #1976d2; font-size: 14px;">
            <strong>Güvenlik Uyarısı:</strong> Bu kodu kimseyle paylaşmayın. Ekibimiz asla sizden şifrenizi veya doğrulama kodunuzu istemez.
          </p>
        </div>
      </div>
      <div style="background: #f1f3f4; padding: 20px; text-align: center; color: #666; font-size: 12px;">
        <p style="margin: 0;">Bu email otomatik olarak gönderilmiştir, lütfen yanıtlamayın.</p>
      </div>
    </div>`;
}

function resetTemplate(code: string, username: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">PortfoyGo</h1>
        <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Şifre Sıfırlama</p>
      </div>
      <div style="padding: 40px 30px; background: #f8f9fa;">
        <h2 style="color: #333; margin: 0 0 20px 0;">Şifrenizi Sıfırlayın</h2>
        <p style="color: #666; line-height: 1.6; margin: 0 0 20px 0;">
          Merhaba ${escapeHtml(username)}!<br><br>
          Hesabınız için şifre sıfırlama talebinde bulunuldu. Aşağıdaki kodu kullanarak şifrenizi sıfırlayabilirsiniz:
        </p>
        <div style="background: white; border: 2px dashed #ff6b6b; border-radius: 10px; padding: 30px; text-align: center; margin: 30px 0;">
          <div style="font-size: 32px; font-weight: bold; color: #ff6b6b; letter-spacing: 5px; font-family: monospace;">${escapeHtml(code)}</div>
        </div>
        <p style="color: #666; line-height: 1.6; margin: 20px 0;">
          Bu kod <strong>30 dakika</strong> geçerlidir. Eğer bu işlemi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz; şifreniz değişmez.
        </p>
        <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #c62828; font-size: 14px;">
            <strong>Güvenlik Uyarısı:</strong> Bu kodu kimseyle paylaşmayın.
          </p>
        </div>
      </div>
      <div style="background: #f1f3f4; padding: 20px; text-align: center; color: #666; font-size: 12px;">
        <p style="margin: 0;">Bu email otomatik olarak gönderilmiştir, lütfen yanıtlamayın.</p>
      </div>
    </div>`;
}
