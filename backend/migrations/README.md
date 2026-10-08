# Veritabanı Migration'ları

Bu klasördeki `.sql` dosyaları veritabanı şemasını günceller. Dosyalar **idempotent** yazılmıştır
(birden fazla kez çalıştırmak güvenlidir) ve içlerinde `BEGIN/COMMIT` yoktur; tek bir transaction
içinde çalıştırılmaları gerekir.

> ⚠️ **Önce yedek alın.** Kolon tipi değişiklikleri tabloları yeniden yazar ve çalıştığı süre boyunca
> ilgili tabloları kilitler. Mümkünse trafiğin az olduğu bir zamanda çalıştırın.
>
> ```bash
> pg_dump "$DATABASE_URL" -Fc -f yedek_$(date +%Y%m%d_%H%M).dump
> ```

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

Script `.env` içindeki `DATABASE_URL` / `DB_*` ayarlarını kullanır, her dosyayı tek transaction'da
çalıştırır ve uygulananları `schema_migrations` tablosuna kaydeder.

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
