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

## 006_seasons_leagues.sql

Aylık sezonlar ve özel ligler (bakiyeler sıfırlanmaz; getiri katılım anındaki toplam varlığa göre):

- `seasons` (slug `YYYY-MM`, ayın 1'i 00:00 Europe/Istanbul → sonraki ayın 1'i, `active`/`finished`),
  `season_participants` (referans varlık + kapanışta dondurulan değerler/sıra/işlem sayısı),
  `season_awards` (1: Sezon Şampiyonu, 2–3: Sezon Podyumu, 4–10: Sezonun İlk 10'u).
- `leagues` (8 karakterlik benzersiz davet kodu, en fazla 50 üye, isteğe bağlı bitiş) ve
  `league_members` (`owner`/`member`, katılım anındaki referans varlık).

Sezonlar backend cron'u (5 dk'da bir + ayın 1'i 00:00) ile oluşturulur/sonlandırılır; ek veri
taşıma gerekmez. Yeni backend kodunu yayına almadan önce çalıştırın (`npm run migrate`).

## 007_price_history.sql

Varlık fiyat geçmişi (`price_history`): hisse/kripto (USD), döviz (TL) ve emtia (`quoteCurrency`)
için 15 dakikalık (`m15`, 3 gün), saatlik (`hour`, 15 gün) ve günlük (`day`, İstanbul takvim günü,
kalıcı) kovalar. Birincil anahtar `(asset_type, symbol, granularity, bucket_start)`.

Backend cron'u her 15 dakikada bir (xx:14, :29, :44, :59) yalnızca zaten çekilmiş fiyatları
(`market_data_cache`, `currency_rates`, önbellekli emtia listesi) okuyup UPSERT eder; dış API çağrısı
yapmaz. Geçmiş, migration'dan itibaren birikir (geriye dönük veri taşıma yok). Uçlar:
`GET /api/market/history`, `/api/market/performance`, `/api/market/sparklines`.
Yerel PGlite'ta (`npm run dev:local`) sentetik ~400 günlük geçmiş otomatik tohumlanır.

## 008_admin_audit.sql

Yönetici denetim kaydı (`admin_audit_log`): yasaklama, yetki değişikliği, emir iptali, lig silme, önbellek yenileme, iş çalıştırma ve duyurular kim tarafından, ne zaman yapıldı.

## 009_notifications.sql

Bildirim merkezi: `notifications` (kullanıcı başına en fazla 200, okundu bilgisiyle), `announcements` (yönetici duyuruları) ve `users.notification_prefs` (Emirler / Rekabet kategorilerini kapatma tercihi).

## 010_leagues_v2.sql

Zamanlı ve herkese açık ligler: `leagues.visibility`, `starts_at`, `started_at`, `finalized_at`; üyelerde `baseline_set_at` ve dondurulmuş sonuçlar (`final_rank`, `final_equity`, `final_return_pct`). Mevcut ligler "başlamış" sayılır; üyelerin başlangıç değerleri katılım anından korunur.


## 011_arena.sql

Arena (hızlı al-sat oyun modu): `arena_challenges` (yöneticinin planladığı canlı meydan okumalar), `arena_rounds` (bireysel/ortak turlar; oynatılan gerçek geçmiş fiyat penceresi `"window"` sütununda saklanır), `arena_entries` (katılımcı bakiyeleri ve sonuçlar), `arena_positions` (uzun/kısa pozisyonlar, zarar kes/kâr al). Ayrıca "Arena çaylağı" ve "Arena ustası" rozetlerini ekler.

## 012_advisor.sql

Portföy Sihirbazı: `risk_profiles` (anket cevapları, puan ve profil) ve `portfolio_plans` (önerilen dağılım, metrikler, Monte Carlo simülasyonu, uygulama sonucu).

## 013_arena_social.sql

Arena sosyal katmanı: `users.is_bot` ve antrenman botu hesabı (`antrenman_botu`; liderlik, sezon ve sıralamalardan hariç), `arena_duels` (davet linkli veya eşleştirmeyle 1v1 düello), `arena_matchmaking` (eşleştirme biletleri; 15 sn'de rakip çıkmazsa bot), `arena_host_messages` (meydan okuma sunucusunun canlı mesajları), `arena_challenges.broadcast_token` (herkese açık yayın ekranı) ve `arena_rounds.kind` için `duel` / `scenario` türleri.

## 014_game_economy.sql

Oyun ekonomisi: kullanıcıya jeton, XP, Arena reytingi ve kozmetik sütunları; jeton/XP defteri, günlük seri, günlük görevler, ücretsiz günlük çark, mağaza envanteri ve sorumlu oyun ayarları (18+ onayı, günlük tur limiti, oturum hatırlatıcısı, mola). Jeton ve XP yalnızca oyun içidir; gerçek parayla alınamaz ve gerçek paraya çevrilemez.

## 015_scenarios.sql

Senaryo modu ve Arena koçu: `historical_series_meta` / `historical_series` (yöneticinin CSV ile yüklediği lisanslı tarihsel seriler; kaynak ve lisans notu zorunlu), `scenarios` (brifing + "gerçekte ne oldu" debrief'i), `coach_reports` (bitmiş tur için kural tabanlı koç raporu önbelleği). 013'ten sonra çalışırsa `arena_rounds.scenario_id` için yabancı anahtar ekler.

## 016_idle.sql

Yatırım İmparatorluğu (idle oyun): kullanıcı başına tek satırlık `idle_states` (oyun içi para, binalar, yükseltmeler, halka arz payları, ödenen kilometre taşları). Kazanç sunucuda hesaplanır; çevrimdışı süre üst sınırlıdır. Kurallar ve denge: `backend/src/services/idle/{config,math}.ts`.

## 017_weekly_picks.sql

Haftalık Seçim ("Kitlelerin Bilgeliği"): `weekly_pick_weeks` (hafta başına tek satır, `week_id` = yarışma Pazartesisinin ISO haftası, ör. `2026-W43`; Cumartesi 00:00 açılış → Pazar 15:00 açıklama → Pazartesi 00:00 başlangıç → Cumartesi 00:00 bitiş, Europe/Istanbul; iş adımı bayrakları ve kapanışta dondurulan kitle istatistikleri), `weekly_picks` (kullanıcı + hafta başına tek kör seçim: varlık, yön, en fazla 280 karakterlik not; giriş/çıkış fiyatı varlığın kendi kote para biriminde, getiri, sıra, `void`) ve `weekly_pick_comments` (açıklamadan sonra tartışma; yumuşak silme). Sadece yeni tablo ekler. Haftalar istek / `weekly-picks` işi (5 dk) ile kendiliğinden oluşturulur; ek veri taşıma gerekmez. Kurallar: `backend/src/services/picks/{config,timeline,scoring}.ts`.

## 018_account_security.sql

Hesap güvenliği (iki adımlı doğrulama) ve KVKK self-servis hesap silme. Yalnızca kolon/tablo **ekler**; mevcut veriye
dokunmaz, tablo yeniden yazılmaz (sabit varsayılanlı `ADD COLUMN`).

- `users`: `totp_secret_enc` (etkin TOTP anahtarı, **AES-256-GCM ile şifreli**, kullanıcı kimliği ek doğrulama verisi),
  `totp_enabled_at`, `totp_pending_enc` / `totp_pending_at` (kurulumu süren anahtar, 15 dk), `totp_last_step` (aynı kodun
  tekrar kullanılmasını engeller), `totp_failed_attempts` / `totp_locked_until` (art arda 5 hatalı kod → 15 dk kilit),
  `is_deleted` / `deleted_at` (anonimleştirilmiş hesap). Kısıt: `totp_enabled_at` doluysa `totp_secret_enc` dolu olmalı.
- `user_recovery_codes`: tek kullanımlık kurtarma kodları; kodun kendisi değil, sunucu anahtarıyla HMAC-SHA256 özeti saklanır.

**Ortam:** `TOTP_ENC_KEY` (32 bayt; `openssl rand -hex 32`) production'da zorunludur — yoksa 2FA kurulamaz ve 2FA'lı hesaplar
girişi tamamlayamaz. Anahtar değişirse mevcut 2FA kayıtları çözülemez. `ADMIN_REQUIRE_2FA` (production'da varsayılan açık):
2FA'sı kapalı yöneticiler yönetim API'sinden `403 ADMIN_2FA_REQUIRED` alır.

**Hesap silme** (`POST /api/me/delete`) kullanıcı satırını silmez, anonimleştirir: kullanıcı adı `silinmis_<rastgele>`, e-posta
`…@silinmis.invalid`, şifre kullanılamaz, `token_version + 1`; bildirimler, takip listesi, etkinlik kayıtları, Sihirbaz anketleri
gibi kişisel veriler silinir; işlem / sezon / lig / Arena sonuçları anonim kalır. Silinmiş hesaplar giriş yapamaz ve liderlik
tablolarında / herkese açık listelerde görünmez (`COALESCE(u.is_deleted, false) = false`). Yeni kod bu kolonları okuduğu için
**backend'i yayına almadan önce çalıştırın.**

## 019_public_profiles.sql

Herkese açık profiller ve haftalık e-posta özeti:

- `users.profile_public BOOLEAN NOT NULL DEFAULT TRUE` — `/u/<kullanıcı-adı>` profili herkese açık mı (varsayılan açık). Kullanıcı
  Profil → "Profil görünürlüğü" kartından değiştirir (`PATCH /api/me/profile-visibility`). Kapalıyken
  `GET /api/public/users/:username` 404 `PROFILE_PRIVATE` döner ve site "Bu profil gizli" gösterir; oyun profili
  (`/api/game/public-profile/:username`) de gizlenir. Profil yalnızca yüzde ve sıra içerir (tutar yok).
- `email_digests (user_id, week_key)` — haftalık özet gönderim kaydı (`weekly-digest` işi, Pazartesi 09:00 İstanbul).
  Kullanıcı + hafta başına tek satır: aynı hafta ikinci kez gönderilmez. Durumlar: `sending`, `sent`, `preview`
  (geliştirmede yalnızca önizleme; gerçek gönderimi engellemez), `failed` (en fazla 3 deneme), `skipped`.
- `portfolio_snapshots (taken_at, user_id)` kısmi indeksi (`day` / `start` satırları): özetin haftalık sıralama değişimi
  sorgusu için.

Özet tercihi ayrı kolon değildir: `users.notification_prefs.email_digest` (009'daki JSONB; yoksa açık sayılır).
E-postadaki imzalı bağlantı (`GET/POST /api/email/unsubscribe?token=…`, RFC 8058 tek tık) bu alanı `false` yapar.
Sadece kolon/tablo/indeks ekler; tablo yeniden yazılmaz, veri taşıma gerekmez. Yeni backend'i yayına almadan önce çalıştırın.

## 020_trading_depth.sql

İşlem derinliği: takip eden stop, açılışta gerçekleşen hisse emirleri (market-on-open), ABD seans kuralı ve döviz makası.
Yalnızca `orders` tablosuna dokunur; mevcut satırlar değişmez ve eski backend kodu bu şemayla çalışmaya devam eder.

- `orders.type` `VARCHAR(12)` → `VARCHAR(20)` (metadata değişikliği, tablo yeniden yazılmaz) ve yeni tipler:
  `trailing_stop` (yalnızca satış) ve `market_on_open` (yalnızca hisse; alış/satış). `orders_type_check` /
  `orders_side_type_check` yeniden oluşturulur (alışta `limit` veya `market_on_open`).
- Yeni kolonlar: `trail_percent NUMERIC(9,4)`, `trail_amount NUMERIC(24,8)` (biri dolu), `high_water_price NUMERIC(24,8)`,
  `high_water_at`, `execute_after` (MOO: seans açılışı). `orders_trailing_params_check` ve `orders_moo_check` kısıtları.

Davranış (backend `services/orders.ts`, `services/marketHours.ts`, `services/pricing.ts`):

- **Takip eden stop:** emir anındaki fiyat zirvedir; `orders` işi (dakikada bir) yalnızca **taze** fiyatlarla zirveyi yukarı
  taşır (tek ifadeli, monoton `UPDATE … WHERE high_water_price < fiyat`) ve `trigger_price`'ı
  `zirve × (1 − %/100)` ya da `zirve − TL` olarak günceller. Fiyat `trigger_price`'a inince piyasa fiyatından satılır
  (eldeki miktara indirilir). Bayat fiyat ne zirveyi ne tetiklemeyi etkiler. `PATCH /api/orders/:id`
  (`trail_percent` | `trail_amount`) mesafeyi değiştirir; zirve korunur, yeni tetikleme güncel fiyatın altında olmalı.
- **ABD seansı:** NYSE 09:30–16:00 America/New_York (yaz saati Intl ile), hafta sonu + 2026–2027 NYSE tatilleri kapalı,
  erken kapanışlar 13:00 (`NYSE_HOLIDAYS` / `NYSE_EARLY_CLOSES` — **her yıl güncellenmeli**; listede olmayan yıllarda
  yalnızca hafta sonu kuralı). Borsa kapalıyken hisse piyasa alış/satışı `409 MARKET_CLOSED` (`next_open_at`) döner;
  hisse limit / zarar durdur / kâr al / takip eden emirler yalnızca seans içinde ve fiyat **açılıştan sonra** alınmışsa
  tetiklenir (açılıştan önce çekilen fiyat bir önceki kapanıştır). Kripto 7/24; döviz ve emtia değişmedi.
  `GET /api/market/session` seans durumunu verir. `US_MARKET_HOURS=off` kuralı kapatır (backend testleri böyle çalışır).
- **Açılışta (MOO) emir:** yalnızca borsa kapalıyken (açıkken `409 MARKET_OPEN`). `trigger_price` = referans (son) fiyat,
  `execute_after` = bir sonraki açılış, `expires_at` = o seansın kapanışı. Alışta rezerv =
  `computeBuyCost(miktar, referans × 1,05)` (limit alıştaki gibi `users.reserved_cash`'e taşınır). İş, açılıştan sonraki
  ilk taze fiyatta gerçekleştirir. **Gap kararı:** açılış fiyatı %5 tamponu da aşarsa emir iptal edilmez, **yalnızca
  ayrılan tutarın karşıladığı miktar** alınır (serbest bakiyeye asla dokunulmaz), artan rezerv iade edilir ve bildirimde
  kısmi gerçekleşme yazar (`data.partial`, `requested_quantity`); hiç miktar alınamıyorsa emir `failed` olur ve rezervin
  tamamı iade edilir. Gerekçe: kullanıcının niyeti "açılışta al"dır; kısmi gerçekleşme bu niyete iptalden daha yakındır
  ve sanal para hiçbir koşulda rezervin ötesine geçmez. Seans içinde fiyat gelmezse kapanışta süresi dolar (iade).
- **Döviz makası:** alışta satış kuru (önceki gibi), satışta **alış kuru** (`currencyTradePrice`: `min(alış, satış)`; alış
  kuru yoksa satış kuru — ters/bozuk veride al-sat ile para yaratılamaz). Döviz satış emirleri (zarar durdur, kâr al, limit
  satış, takip eden) alış kuruyla değerlendirilir. **Değerleme satış kurunda bırakıldı:** değerlemeyi alış kuruna çevirmek
  döviz tutan herkesin varlığını bir anda makas kadar (USD ~%0,3, EUR ~%0,4, JPY ~%0,45) düşürür; bu, süren sezon/lig
  getirilerini ve sıralamaları gerçek bir işlem olmadan bozar (referans varlıklar satış kuruyla alınmıştı). Yalnızca
  işlem fiyatı değişti; makas maliyeti satışta gerçekleşir. Değerlemeyi alış kuruna (tasfiye değeri) geçirmek
  istenirse bunu bir sezon başında (ayın 1'i) yapın.
- **Bildirimler:** `order.moo_filled` (açılışta gerçekleşti, kısmi bilgisiyle) ve `order.trailing_triggered`
  (zirve bilgisiyle); diğerleri `order.filled` / `order.expired` / `order.failed` olarak kalır.

Veri taşıma yok. Kod, yeni kolonlar olmadan emir oluşturamaz/listeleyemez: **yeni backend'i yayına almadan önce çalıştırın.**
