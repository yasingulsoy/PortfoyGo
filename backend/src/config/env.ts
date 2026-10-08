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
