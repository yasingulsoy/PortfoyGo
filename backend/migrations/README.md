# Veritabanı Migration'ları

Bu klasördeki `NNN_ad.sql` dosyaları veritabanı şemasını kurar ve günceller. Dosyalar **idempotent**
yazılmıştır (birden fazla kez çalıştırmak güvenlidir) ve içlerinde `BEGIN/COMMIT` yoktur; her biri tek
bir transaction içinde çalıştırılır.

> ⚠️ **Önce yedek alın.** Kolon tipi değişiklikleri tabloları yeniden yazar ve çalıştığı süre boyunca
> ilgili tabloları kilitler. Mümkünse trafiğin az olduğu bir zamanda çalıştırın.
>
> ```bash
> pg_dump "$DATABASE_URL" -Fc -f yedek_$(date +%Y%m%d_%H%M).dump
> ```

## Migration çalıştırıcı (`npm run migrate`)

```bash
cd backend
npm run migrate -- --dry-run           # sadece bekleyenleri listeler, hiçbir şey yazmaz
npm run migrate                        # bekleyen tüm migration'ları uygular
npm run migrate -- 001_hardening.sql   # sadece bu dosya (uygulanmış olsa bile yeniden)
```

- Dosyalar **isim sırasıyla** (000, 001, 002 …) uygulanır; klasöre eklenen yeni `NNN_*.sql`
  dosyaları otomatik olarak bulunur.
- Her dosya **kendi transaction'ında** çalışır. Hata olursa o dosya tamamen geri alınır ve
  çalıştırıcı durur (sonraki dosyalar uygulanmaz).
- Uygulananlar `schema_migrations (filename, applied_at, checksum)` tablosuna yazılır ve sonraki
  çalıştırmalarda atlanır. Uygulanmış bir dosya sonradan değiştirilirse (checksum farklı) uyarı
  verilir; dosya yeniden çalıştırılmaz — değişiklik için yeni bir `NNN_*.sql` dosyası ekleyin.
- Eski çalıştırıcının `schema_migrations (name, applied_at)` tablosu otomatik olarak yeni yapıya
  yükseltilir (kayıtlar korunur).
- Hedef: ortamdaki `DATABASE_URL` / `DB_*` değişkenleri; ortamda yoksa `backend/.env`. Komut ilk satırda
  hangi sunucuya bağlandığını yazar — **çalıştırmadan önce kontrol edin.**

### Mevcut (canlı) veritabanı

1. Yedek alın (yukarıdaki `pg_dump`).
2. `npm run migrate -- --dry-run` ile hangi dosyaların bekleyeceğini görün.
3. `npm run migrate` çalıştırın.

`000_base.sql` canlı veritabanında **hiçbir şey değiştirmez** (tüm tablolar/indeksler/trigger'lar
zaten var; sadece `schema_migrations`'a kaydedilir). Bu, canlı şemanın `pg_dump` çıktısına
uygulanarak doğrulanmıştır.

### Yeni geliştirici / boş veritabanı

Boş bir PostgreSQL 13+ veritabanında `npm run migrate` tüm şemayı sıfırdan kurar (000 → son dosya).
Hiç PostgreSQL kurmadan çalışmak için gömülü yerel veritabanını kullanın:

```bash
cd backend
npm run db:local     # PGlite (WASM PostgreSQL) → 127.0.0.1:54329, migration + örnek veri
npm run dev:local    # yerel veritabanı + backend (dış API'ler kapalı)
```

### Yeni migration yazarken

- Dosya adı: bir sonraki numara + açıklama, örn. `005_ozellik.sql`.
- İdempotent yazın (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DO $$ … IF NOT EXISTS …`).
- `BEGIN/COMMIT` koymayın; `CREATE INDEX CONCURRENTLY` gibi transaction dışında çalışması gereken
  komutlar kullanmayın.
- `cd backend && npm test` boş bir veritabanına tüm migration'ları uygular; testlerin geçtiğini görün.

## 000_base.sql

Temel şema: `users`, `email_verifications`, `portfolio_items`, `transactions`, `activity_logs`,
`market_data_cache`, `badges` (+ 12 başlangıç rozeti), `user_badges`, indeksler ve `updated_at`
trigger'ları — yani 001 öncesindeki canlı şemanın birebir aynısı. Kullanılmayan `competitions` /
`competition_participants` tabloları dahil değildir. `gen_random_uuid()` PostgreSQL 13+ çekirdeğinde
vardır; daha eski sürümlerde `pgcrypto` kurulur. Eski `src/scripts/createTables.sql`,
`setupDatabase.sql`, `createActivityLogsTable.sql` ve `createMarketCacheTable.sql` yerine bunu kullanın.

## 001_hardening.sql

Ne yapar:

- `users`: `is_admin`, `is_banned`, `last_login`, `week_baseline_equity`, `week_baseline_iso_key`
  kolonlarını (yoksa) ekler ve doldurur (`scripts/addAdminColumns.ts` ve
  `scripts/addLeaderboardWeekColumns.ts` artık gerekmez).
- Fiyat kolonlarını `NUMERIC(24,8)`, tutar/bakiye kolonlarını `NUMERIC(20,2)` yapar
  (küçük fiyatlı varlıklar artık `0.00`'a yuvarlanmaz).
- `currency_rates` ve `stop_loss_orders` tablolarını (yoksa) oluşturur.
  `stop_loss_orders` → `users` ve `portfolio_items` için `ON DELETE CASCADE`.
- `asset_type` CHECK kısıtlarını `crypto, stock, commodity, currency` olacak şekilde günceller.
- `balance >= 0` ve `quantity >= 0` kısıtlarını `NOT VALID` olarak ekler (mevcut satırlar taranmaz,
  yeni yazımlar kontrol edilir).
- `email_verifications` tablosuna `purpose` (`verify` / `reset`) ve `attempts` kolonlarını ekler.
  **İlk çalıştırmada bekleyen tüm eski kodlar geçersiz kılınır** (kullanıcılar yeni kod ister).
- Büyük/küçük harf duyarsız arama indekslerini ve (çakışma yoksa) benzersiz email/kullanıcı adı
  indekslerini ekler.

### Çalıştırma — psql ile

```bash
cd backend
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f migrations/001_hardening.sql
```

`DATABASE_URL` yerine ayrı parametreler:

```bash
psql -h <host> -p 5432 -U <kullanici> -d <veritabani> \
     -v ON_ERROR_STOP=1 --single-transaction -f migrations/001_hardening.sql
```

Hata olursa transaction tamamen geri alınır; hiçbir değişiklik uygulanmaz.

### Çalıştırma — npm script ile

```bash
cd backend
npm run migrate                       # bekleyen tüm migration'lar
npm run migrate -- 001_hardening.sql  # sadece bu dosya (tekrar uygular)
```

Ayrıntılar için yukarıdaki "Migration çalıştırıcı" bölümüne bakın.

### Sonrasında (isteğe bağlı)

Mevcut verinin kısıtlara uyduğunu doğruladıktan sonra:

```sql
ALTER TABLE users VALIDATE CONSTRAINT users_balance_nonnegative;
ALTER TABLE portfolio_items VALIDATE CONSTRAINT portfolio_items_quantity_nonnegative;
ALTER TABLE transactions VALIDATE CONSTRAINT transactions_quantity_nonnegative;
```

### Önemli

Yeni backend kodu `email_verifications.purpose` / `attempts` kolonlarını kullanır. **Yeni kodu
yayına almadan önce bu migration'ı çalıştırın**; aksi halde email doğrulama ve şifre sıfırlama
uçları hata verir.

## 002_sessions.sql

`users` tablosuna `token_version INTEGER NOT NULL DEFAULT 0` kolonunu ekler. Oturum JWT'leri bu
değeri (`tv`) taşır; "Tüm cihazlardan çıkış" ve şifre sıfırlama değeri artırarak kullanıcının
mevcut tüm oturumlarını iptal eder.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f migrations/002_sessions.sql
# veya
npm run migrate
```

**Yeni backend kodunu yayına almadan önce çalıştırın**; aksi halde kimlik doğrulama gerektiren tüm
uçlar hata verir. Not: geçişten sonra eski (localStorage'daki) token'lar `tv` içermediği için
geçersizdir; kullanıcıların bir kez yeniden giriş yapması gerekir.
