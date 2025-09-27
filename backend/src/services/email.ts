import nodemailer from 'nodemailer';
import pool from '../config/database';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Doğrulama kodu oluştur
  generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Email doğrulama kodu gönder
  async sendVerificationCode(email: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const verificationCode = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 dakika

      // Eski kodları temizle
      await pool.query(
        'DELETE FROM email_verifications WHERE email = $1 AND used = false',
        [email]
      );

      // Yeni kodu kaydet
      await pool.query(
        'INSERT INTO email_verifications (user_id, email, verification_code, expires_at) VALUES ($1, $2, $3, $4)',
        [userId, email, verificationCode, expiresAt]
      );

      // Email gönder
      const mailOptions = {
        from: `"Sanal Yatırım" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Email Doğrulama Kodu - Sanal Yatırım',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Sanal Yatırım</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Email Doğrulama</p>
            </div>
            
            <div style="padding: 40px 30px; background: #f8f9fa;">
              <h2 style="color: #333; margin: 0 0 20px 0;">Hesabınızı Doğrulayın</h2>
              
              <p style="color: #666; line-height: 1.6; margin: 0 0 20px 0;">
                Merhaba!<br><br>
                Sanal Yatırım platformuna hoş geldiniz. Hesabınızı aktifleştirmek için aşağıdaki doğrulama kodunu kullanın:
              </p>
              
              <div style="background: white; border: 2px dashed #667eea; border-radius: 10px; padding: 30px; text-align: center; margin: 30px 0;">
                <div style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; font-family: monospace;">
                  ${verificationCode}
                </div>
              </div>
              
              <p style="color: #666; line-height: 1.6; margin: 20px 0;">
                Bu kod <strong>15 dakika</strong> geçerlidir. Eğer bu işlemi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz.
              </p>
              
              <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #1976d2; font-size: 14px;">
                  <strong>Güvenlik Uyarısı:</strong> Bu kodu kimseyle paylaşmayın. Sanal Yatırım ekibi asla sizden şifrenizi veya doğrulama kodunuzu istemez.
                </p>
              </div>
            </div>
            
            <div style="background: #f1f3f4; padding: 20px; text-align: center; color: #666; font-size: 12px;">
              <p style="margin: 0;">© 2024 Sanal Yatırım. Tüm hakları saklıdır.</p>
              <p style="margin: 5px 0 0 0;">Bu email otomatik olarak gönderilmiştir, lütfen yanıtlamayın.</p>
            </div>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        message: 'Doğrulama kodu email adresinize gönderildi'
      };
    } catch (error) {
      console.error('Email send error:', error);
      return {
        success: false,
        message: 'Email gönderilemedi. Lütfen tekrar deneyin.'
      };
    }
  }

  // Doğrulama kodunu kontrol et
  async verifyCode(email: string, code: string): Promise<{ success: boolean; message: string; userId?: string }> {
    try {
      const result = await pool.query(
        `SELECT user_id, expires_at, used 
         FROM email_verifications 
         WHERE email = $1 AND verification_code = $2 AND used = false 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [email, code]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          message: 'Geçersiz doğrulama kodu'
        };
      }

      const verification = result.rows[0];

      // Süre kontrolü
      if (new Date() > new Date(verification.expires_at)) {
        return {
          success: false,
          message: 'Doğrulama kodu süresi dolmuş'
        };
      }

      // Kodu kullanılmış olarak işaretle
      await pool.query(
        'UPDATE email_verifications SET used = true WHERE email = $1 AND verification_code = $2',
        [email, code]
      );

      // Kullanıcının email'ini doğrulanmış olarak işaretle
      await pool.query(
        'UPDATE users SET email_verified = true WHERE id = $1',
        [verification.user_id]
      );

      return {
        success: true,
        message: 'Email başarıyla doğrulandı',
        userId: verification.user_id
      };
    } catch (error) {
      console.error('Email verification error:', error);
      return {
        success: false,
        message: 'Doğrulama sırasında bir hata oluştu'
      };
    }
  }

  // Şifre sıfırlama kodu gönder
  async sendPasswordResetCode(email: string): Promise<{ success: boolean; message: string }> {
    try {
      // Kullanıcı var mı kontrol et
      const userResult = await pool.query(
        'SELECT id, username FROM users WHERE email = $1',
        [email]
      );

      if (userResult.rows.length === 0) {
        return {
          success: false,
          message: 'Bu email adresi ile kayıtlı kullanıcı bulunamadı'
        };
      }

      const user = userResult.rows[0];
      const resetCode = this.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 dakika

      // Eski kodları temizle
      await pool.query(
        'DELETE FROM email_verifications WHERE email = $1 AND used = false',
        [email]
      );

      // Yeni kodu kaydet
      await pool.query(
        'INSERT INTO email_verifications (user_id, email, verification_code, expires_at) VALUES ($1, $2, $3, $4)',
        [user.id, email, resetCode, expiresAt]
      );

      // Email gönder
      const mailOptions = {
        from: `"Sanal Yatırım" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Şifre Sıfırlama Kodu - Sanal Yatırım',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Sanal Yatırım</h1>
              <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Şifre Sıfırlama</p>
            </div>
            
            <div style="padding: 40px 30px; background: #f8f9fa;">
              <h2 style="color: #333; margin: 0 0 20px 0;">Şifrenizi Sıfırlayın</h2>
              
              <p style="color: #666; line-height: 1.6; margin: 0 0 20px 0;">
                Merhaba ${user.username}!<br><br>
                Hesabınız için şifre sıfırlama talebinde bulundunuz. Aşağıdaki kodu kullanarak şifrenizi sıfırlayabilirsiniz:
              </p>
              
              <div style="background: white; border: 2px dashed #ff6b6b; border-radius: 10px; padding: 30px; text-align: center; margin: 30px 0;">
                <div style="font-size: 32px; font-weight: bold; color: #ff6b6b; letter-spacing: 5px; font-family: monospace;">
                  ${resetCode}
                </div>
              </div>
              
              <p style="color: #666; line-height: 1.6; margin: 20px 0;">
                Bu kod <strong>30 dakika</strong> geçerlidir. Eğer bu işlemi siz yapmadıysanız, bu emaili görmezden gelebilirsiniz.
              </p>
              
              <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 20px 0;">
                <p style="margin: 0; color: #c62828; font-size: 14px;">
                  <strong>Güvenlik Uyarısı:</strong> Bu kodu kimseyle paylaşmayın. Sanal Yatırım ekibi asla sizden şifrenizi veya doğrulama kodunuzu istemez.
                </p>
              </div>
            </div>
            
            <div style="background: #f1f3f4; padding: 20px; text-align: center; color: #666; font-size: 12px;">
              <p style="margin: 0;">© 2024 Sanal Yatırım. Tüm hakları saklıdır.</p>
              <p style="margin: 5px 0 0 0;">Bu email otomatik olarak gönderilmiştir, lütfen yanıtlamayın.</p>
            </div>
          </div>
        `,
      };

      await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        message: 'Şifre sıfırlama kodu email adresinize gönderildi'
      };
    } catch (error) {
      console.error('Password reset email error:', error);
      return {
        success: false,
        message: 'Email gönderilemedi. Lütfen tekrar deneyin.'
      };
    }
  }
}
