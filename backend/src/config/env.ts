import dotenv from 'dotenv';

// .env dosyasını mümkün olan en erken noktada yükle
dotenv.config();

const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Sunucu başlarken zorunlu ortam değişkenlerini doğrular.
 * Eksik bir değer varsa açıklayıcı bir mesajla süreci sonlandırır.
 * (Script'ler bu fonksiyonu çağırmaz; sadece API sunucusu çağırır.)
 */
export function validateServerEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.trim() === '') {
    errors.push('JWT_SECRET tanımlı değil. Güçlü, rastgele bir değer atayın (örn. `openssl rand -hex 48`).');
  } else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
    warnings.push(`JWT_SECRET ${MIN_JWT_SECRET_LENGTH} karakterden kısa; daha uzun bir değer önerilir.`);
  }

  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    warnings.push('DATABASE_URL veya DB_HOST tanımlı değil; varsayılan localhost kullanılacak.');
  }

  if (!process.env.FINNHUB_API_KEYS && !process.env.FINNHUB_API_KEY) {
    warnings.push('FINNHUB_API_KEY(S) tanımlı değil; hisse verileri sadece mevcut cache\'ten sunulacak.');
  }

  // İki adımlı doğrulama (TOTP) anahtarı: production'da yoksa 2FA kurulamaz ve 2FA'lı hesaplar giriş yapamaz
  const totpRaw = process.env.TOTP_ENC_KEY;
  if (totpRaw && totpRaw.trim() !== '' && !parseTotpEncKey(totpRaw)) {
    warnings.push('TOTP_ENC_KEY geçersiz: 32 baytlık anahtar bekleniyor (64 hex karakter veya base64; örn. `openssl rand -hex 32`).');
  } else if (isProduction() && !parseTotpEncKey(totpRaw)) {
    warnings.push(
      'TOTP_ENC_KEY tanımlı değil: iki adımlı doğrulama etkinleştirilemez' +
        (isAdmin2faRequired() ? ' ve ADMIN_REQUIRE_2FA açık olduğu için yönetim API\'si kullanılamaz.' : '.')
    );
  }

  for (const w of warnings) {
    console.warn(`[env] UYARI: ${w}`);
  }

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`[env] HATA: ${e}`);
    }
    console.error('[env] Zorunlu ortam değişkenleri eksik; sunucu başlatılmıyor. backend/.env.example dosyasına bakın.');
    process.exit(1);
  }
}

/** JWT imzalama/doğrulama anahtarı. Tanımlı değilse hata fırlatır (fallback yok). */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';

/** Virgülle ayrılmış env listesini temizleyerek döndürür. */
export function envList(name: string): string[] {
  return (process.env[name] || '')
    .split(/[,\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * TOTP_ENC_KEY: 32 baytlık AES-256 anahtarı — 64 hex karakter veya base64 (44 karakter).
 * Geçersiz / boşsa null.
 */
export function parseTotpEncKey(raw: string | undefined): Buffer | null {
  const v = (raw || '').trim();
  if (!v) return null;
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(v)) {
    const buf = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    return buf.length === 32 ? buf : null;
  }
  return null;
}

/**
 * ADMIN_REQUIRE_2FA: yönetim API'si yalnızca iki adımlı doğrulaması açık yöneticilere açık mı?
 * 1/true/on → açık, 0/false/off → kapalı; tanımsızsa production'da AÇIK, diğer ortamlarda kapalı.
 * (Her çağrıda okunur; testler ortam değişkeniyle açıp kapatabilir.)
 */
export function isAdmin2faRequired(): boolean {
  const v = (process.env.ADMIN_REQUIRE_2FA || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return isProduction();
}
