import crypto from 'crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import pool from '../config/database';
import { AuthService } from './auth';
import { NotificationService } from './notifications';

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
      // Yerel geliştirme: SMTP yoksa e-postalar gönderilmez, içerikleri konsola yazılır
      if (process.env.EMAIL_DEV_LOG === '1' && process.env.NODE_ENV !== 'production') {
        this.transporter = nodemailer.createTransport({ jsonTransport: true });
        this.transporter.use('compile', (mail, done) => {
          console.log(`
[email:dev] → ${String(mail.data.to)} | ${String(mail.data.subject)}
${String(mail.data.text ?? String(mail.data.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())}
`);
          done();
        });
        return this.transporter;
      }
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

  /**
   * Genel amaçlı gönderim (ör. haftalık özet). Taşıyıcı yoksa (SMTP tanımsız) false döner; SMTP hatası fırlatılır.
   * DİKKAT: Haftalık özet bunu yalnızca gönderim koruması izin verdiğinde çağırır
   * (services/email/digest.ts → digestSendEnabled: production ya da açıkça EMAIL_DIGEST_SEND=1).
   */
  async sendMail(mail: { to: string; subject: string; html: string; text?: string; headers?: Record<string, string> }): Promise<boolean> {
    const transporter = this.getTransporter();
    if (!transporter) return false;
    await transporter.sendMail({ from: this.fromAddress(), ...mail });
    return true;
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
      // Bildirim (kategori 'account'); notify hata fırlatmaz
      await NotificationService.notify(userId, {
        type: 'account.email_verified',
        category: 'account',
        title: 'E-posta adresin doğrulandı',
        body: 'E-posta adresin başarıyla doğrulandı. Artık sezon sıralamalarına ve ödüllere katılabilirsin.',
        link: '/profile',
      });
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
    const userRes = await pool.query('SELECT id, username, email, is_banned, COALESCE(is_deleted, false) AS is_deleted FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
    const user = userRes.rows[0];
    if (!user || user.is_banned || user.is_deleted) return;

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
      // token_version + 1: şifre değişince mevcut tüm oturumlar (diğer cihazlar dahil) iptal edilir
      await client.query('UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1', [
        user.id,
        hash,
      ]);
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

/** Marka renkleri (frontend tokens: --brand #465FFF) — e-posta istemcileri CSS değişkeni desteklemez */
const MAIL = { brand: '#465FFF', brandSoft: '#ECF3FF', text: '#101828', muted: '#475467', line: '#EAECF0', bg: '#F2F4F7' };

/** Ortak e-posta düzeni: üstte logo (site adresi biliniyorsa görsel) + başlık, beyaz kart, alt bilgi. */
function brandedEmail({ kicker, title, body }: { kicker: string; title: string; body: string }): string {
  const site = (process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  const mark = site
    ? `<img src="${escapeHtml(site)}/brand/icon-192.png" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px;">`
    : '';
  return `
    <div style="background:${MAIL.bg};padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:560px;margin:0 auto;">
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 16px 4px;"><tr>
          ${mark ? `<td style="padding-right:10px;">${mark}</td>` : ''}
          <td style="font-size:20px;font-weight:700;color:${MAIL.text};letter-spacing:-0.3px;">Portfoy<span style="color:${MAIL.brand};">Go</span></td>
        </tr></table>
        <div style="background:#ffffff;border:1px solid ${MAIL.line};border-radius:16px;padding:28px 24px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${MAIL.brand};margin:0 0 6px;">${escapeHtml(kicker)}</div>
          <h1 style="font-size:22px;line-height:28px;color:${MAIL.text};margin:0 0 16px;">${escapeHtml(title)}</h1>
          ${body}
        </div>
        <p style="color:${MAIL.muted};font-size:12px;line-height:18px;text-align:center;margin:16px 0 0;">
          Bu e-posta otomatik olarak gönderilmiştir, lütfen yanıtlamayın. PortfoyGo bir sanal yatırım simülasyonudur.
        </p>
      </div>
    </div>`;
}

function codeBox(code: string): string {
  return `<div style="background:${MAIL.brandSoft};border-radius:12px;padding:22px;text-align:center;margin:22px 0;">
    <div style="font-size:32px;font-weight:700;color:${MAIL.brand};letter-spacing:6px;font-family:'Courier New',monospace;">${escapeHtml(code)}</div>
  </div>`;
}

function verificationTemplate(code: string): string {
  return brandedEmail({
    kicker: 'E-posta doğrulama',
    title: 'Hesabını doğrula',
    body: `
      <p style="color:${MAIL.muted};line-height:1.6;margin:0;">Merhaba! PortfoyGo'ya hoş geldin. Hesabını etkinleştirmek için aşağıdaki doğrulama kodunu kullan:</p>
      ${codeBox(code)}
      <p style="color:${MAIL.muted};line-height:1.6;margin:0 0 16px;">Bu kod <strong style="color:${MAIL.text};">15 dakika</strong> geçerlidir. Bu işlemi sen yapmadıysan bu e-postayı görmezden gelebilirsin.</p>
      <p style="color:${MAIL.muted};font-size:13px;line-height:1.5;margin:0;border-top:1px solid ${MAIL.line};padding-top:14px;"><strong style="color:${MAIL.text};">Güvenlik:</strong> Bu kodu kimseyle paylaşma. Ekibimiz senden asla şifreni veya doğrulama kodunu istemez.</p>`,
  });
}

function resetTemplate(code: string, username: string): string {
  return brandedEmail({
    kicker: 'Şifre sıfırlama',
    title: 'Şifreni sıfırla',
    body: `
      <p style="color:${MAIL.muted};line-height:1.6;margin:0;">Merhaba ${escapeHtml(username)}! Hesabın için şifre sıfırlama talebinde bulunuldu. Aşağıdaki kodla şifreni sıfırlayabilirsin:</p>
      ${codeBox(code)}
      <p style="color:${MAIL.muted};line-height:1.6;margin:0 0 16px;">Bu kod <strong style="color:${MAIL.text};">30 dakika</strong> geçerlidir. Bu işlemi sen yapmadıysan bu e-postayı görmezden gelebilirsin; şifren değişmez.</p>
      <p style="color:${MAIL.muted};font-size:13px;line-height:1.5;margin:0;border-top:1px solid ${MAIL.line};padding-top:14px;"><strong style="color:${MAIL.text};">Güvenlik:</strong> Bu kodu kimseyle paylaşma.</p>`,
  });
}
