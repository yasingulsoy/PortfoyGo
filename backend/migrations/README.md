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

## 022_sandbox_portfolios.sql

Sanal (sandbox) portföy motoru — **Model Portföy** (`kind = 'model'`, kullanıcı başına en fazla 5, her biri 100.000 USD) ve
**Portföy Ligi** (`kind = 'league'`, 023) bunun üzerine kurulur. USD bazlıdır; ana uygulamanın TL bakiyesine ve
`portfolio_items` / `transactions` tablolarına dokunmaz. Yalnızca yeni tablo / indeks ekler.

- `sandbox_portfolios`: tür, sahip (`user_id`), `league_id` / `team_id` (yabancı anahtar yok; 023 ekleyebilir), ad, `starting_cash`,
  `cash` (≥ 0, kaldıraç yok), `commission_bps` (varsayılan 25 = %0,25), `target_weights` (JSONB, yüzde), `status`
  (`active` / `frozen` / `archived`), `frozen_at`.
- `sandbox_holdings` (`portfolio_id, asset_type, symbol` birincil anahtar; kesirli miktar `NUMERIC(30,10)`, `quantity > 0` → açığa
  satış yok; `avg_cost_usd` komisyon hariç), `sandbox_trades` (alış/satış defteri; `reason`: `manual` / `rebalance` / `initial`),
  `sandbox_snapshots` (İstanbul günü başına değer) ve `sandbox_snapshots_hourly` (saatlik; 35 günden eskisi budanır).

İş: `sandbox-snapshots` (her saat xx:03 + 23:58 İstanbul; yalnızca etkin portföyler). KVKK: dışa aktarmada yer alır; hesap
silinince model portföyler silinir, lig portföyleri anonim kalır. Kurallar ve API: `backend/src/services/sandbox/README.md`.
Veri taşıma yok; yeni backend'i yayına almadan önce çalıştırın.

## 024_idea_pool.sql

**Ortak Akıl — Öneri Havuzu.** Katılımcıların yatırım fikirlerini yapılandırılmış biçimde kaydettiği ortak alan. Yalnızca yeni
tablo / indeks ekler; mevcut tablolara dokunmaz, veri taşımaz. Kurallar ve sınırlar: `backend/src/services/ideas/config.ts`.

- `ideas`: yazar, varlık (`asset_type`, `symbol`, `name`), duruş (`al` / `sat` / `izle`), vade (`1w` / `1m` / `3m` / `6m` / `1y`),
  gerekçe (80–2000), beklenen senaryo (+ `scenario_bull` / `_base` / `_bear`), riskler, izleme kriterleri (`target_price`,
  `invalidation_price`, `review_date` — CHECK: en az biri), `tags` (≤ 5), kapsam (`public` / `league` + `league_id`, lig silinirse
  `NULL` → yalnızca yazar görür). Yayın anındaki **referans fiyat** (`ref_price`, `quote_currency`, `ref_price_at` = saklanmış
  fiyatın zamanı). Yaşam döngüsü `acik` → `kapandi` (CHECK: kapalıysa `closed_at`, `outcome`
  (`beklendigi_gibi` / `kismen` / `beklenmedik`) ve 40–2000 karakter `evaluation` zorunlu; kapanış fiyatı dondurulur).
  `review_notified_at`, `target_hit_at`, `invalidation_hit_at`: `idea-reviews` işinin "bir kez" bayrakları;
  `activity_*`: yanıt / yorum bildirimlerinin toplanması; `hidden_*`: yönetici gizlemesi (yumuşak).
- `idea_updates`: izleme notları zaman çizelgesi (`note` + sistem olayları `target_hit`, `invalidation_hit`, `review_due`, `closed`).
- `idea_responses`: "Katılıyorum / Katılmıyorum" + 10–280 karakter gerekçe; `(idea_id, user_id)` benzersiz (kullanıcı başına bir).
- `idea_comments` (yumuşak silme), `idea_bookmarks` ("İzlemeye al"), `idea_reports` (şikâyet; kullanıcı + hedef başına bir,
  `acik` / `islendi` / `reddedildi`).

Performans fiyatları yalnızca saklanmış verilerden okunur (`market_data_cache`, `currency_rates`, `price_history`); dış API çağrısı
yoktur. İş: `idea-reviews` (günlük 09:05 İstanbul). KVKK: tüm tablolar dışa aktarmada; hesap silinince kullanıcının önerileri,
yanıtları, izleme listesi ve şikâyetleri silinir, başka önerilere yazdığı yorumların metni temizlenir.
Yeni backend'i yayına almadan önce çalıştırın.

## 023_portfolio_leagues.sql

**Portföy Ligi.** Katılımcıların (bireysel ya da takım) aynı başlangıç sermayesi, ölçüm dönemi ve işlem maliyetiyle açılan
USD sanal portföylerini (022 motoru, `kind = 'league'`) karşılaştırdığı lig modu. Mevcut ligler `mode = 'main'` kalır ve
davranışları değişmez (ana TL portföyünün katılımdan bu yana getirisi). Kod: `backend/src/services/portfolioLeagues/`
(`rules.ts` sabitler, `analytics.ts` saf hesaplar, `core.ts` yaşam döngüsü + sıralama, `service.ts` API), uçlar
`/api/portfolio-leagues/*` ve `/api/admin/portfolio-leagues/:id(/finalize)`.

- `leagues.mode` (`main` | `portfolio`, varsayılan `main`; CHECK) + kısmi indeks.
- `portfolio_league_rules` (lig başına): `starting_capital_usd` ∈ {10.000, 100.000, 1.000.000}, `commission_bps` ∈ {0, 10, 25, 50},
  `participation` (`solo` | `team`), takım liginde `team_size` 2–5 ve `max_teams` 2–10 (CHECK). **Lig başladıktan sonra
  değiştirilemez:** servis 409 `RULES_LOCKED` döner, `trg_portfolio_league_rules_lock` tetikleyicisi de reddeder. Dönem
  (`leagues.starts_at` / `ends_at`) en az 1 gün, en fazla 1 yıl (366 gün); başlangıç ≤ 30 gün sonra.
- `portfolio_league_teams` (takım kodu = 8 karakter, lig içinde ad benzersiz, `captain_id`) ve `portfolio_league_team_members`
  (kullanıcı ligde en fazla bir takımda; lig üyeliği silinince takım üyeliği de düşer — `(league_id, user_id)` → `league_members`).
- `portfolio_league_entries`: yarışan birim (bireysel: `user_id`, takım: `team_id`; CHECK tam biri), `portfolio_id`,
  `measured_from`, `late_join`, `withdrawn_at`, strateji beyanı ve değerlendirme notu (≤ 1000 karakter, son düzenleyen) ve
  kapanışta dondurulan sonuçlar (`final_rank`, `final_equity_usd`, `final_return_pct`, `final_max_drawdown_pct`,
  `final_volatility_ann`, `final_trades`, `final_turnover_pct`, `final_style_tags`, `finalized_at`).
- 022'nin bıraktığı yabancı anahtarlar: `sandbox_portfolios.league_id → leagues` ve `team_id → portfolio_league_teams`
  (ikisi de `ON DELETE CASCADE`; lig silinince lig portföyleri de silinir). Sahipsiz satır varsa önce temizlenir (normalde yoktur).

Yaşam döngüsü mevcut `leagues-start` / `leagues-finalize` işlerinde (ve istek anındaki tembel geçişte) çalışır; yeni iş yoktur:

- **Başlangıç:** portföyü olmayan her entry'ye aynı sermaye + komisyonla portföy açılır (takım portföyünün sahibi kaptan),
  `league.portfolio_started` bildirimi ("Portföyün hazır: 100.000 USD"). Başlamadan işlem yok (`409 LEAGUE_NOT_STARTED`).
- **Geç katılım:** dönemin ilk **%20**'si boyunca katılan üye / kurulan takım AYNI sermayeyle portföy alır, `late_join = true`
  (sıralamada "Geç katıldı"). Sonrasında lige ve takımlara katılım kapanır (`409 LATE_JOIN_CLOSED`). Gerekçe: getiri yüzdesi
  sermayeden bağımsızdır ama süresi kısalan katılımcı dezavantajlıdır; %20 makul bir pencere, bayrak şeffaflık sağlar.
- **Ayrılma:** başlamamış ligde bireysel entry / boşalan takım silinir. Başlamış ligde entry "çekildi" olur (sıralamadan çıkar);
  geri dönen aynı portföyle devam eder (sıfırlayıp yeniden başlama yok). Kaptan ayrılırsa en eski üye kaptan olur. Takım
  değiştirmek lig başladıktan sonra yoktur (`409 TEAM_LOCKED`).
- **İşlem:** yalnızca etkin dönemde (başladı, `ends_at` gelmedi); takım portföyünde takımın her üyesi işlem yapar
  (`sandbox_trades.actor_user_id`). Motor yetki kontrolü yapmaz; kontrol `PortfolioLeagueService.tradeContext`'tedir.
- **Kapanış:** önce portföyler dondurulur (`Sandbox.freeze`, son anlık görüntü), sonra sonuçlar ve sıra (getiri azalan; eşitlikte
  önce ölçülen) yazılır, `league.portfolio_finished` (sıra + getiri) gönderilir. `finalized_at` aynı transaction'da → ikinci
  çalıştırma hiçbir şey yapmaz.
- **Ölçüler:** en büyük düşüş ve yıllık oynaklık ölçüm dönemindeki GERÇEKLEŞEN değer serisinden (≤ 34 gün saatlik, sonra
  günlük); devir hızı = işlem hacmi / 2 / başlangıç sermayesi. Stil etiketleri (`analytics.ts` `styleTags`, birim testli):
  Yoğun işlem (haftada ≥ 10 işlem veya devir ≥ %300), Al-tut (≥ 1 gün ölçüm, kuruluştan sonra 30 günde ≤ 2 işlem, nakit < %50),
  Yoğunlaşmış (en büyük pozisyon ≥ %40 veya etkin pozisyon < 3), Çeşitlendirilmiş (etkin ≥ 5 ve en büyük < %25),
  Nakit ağırlıklı (nakit ≥ %50).
- **Strateji beyanı** lig başlayana kadar düzenlenir ve başlayınca herkese açılır (öncesinde yalnızca sahibi / takımı görür);
  beyana fırsatı olmayanlar (geç katılan, hemen başlayan ligin kurucusu) geç katılım süresi içinde yazabilir. **Değerlendirme
  notu** lig bitince yazılır.

KVKK: takım üyelikleri ve entry'ler (notlar + sonuçlar) dışa aktarmada; hesap silinince kişinin yazdığı strateji / değerlendirme
metinleri temizlenir, üyelik ve sonuçlar anonim kalır. Yönetim: lig listesinde mod + kurallar, detay penceresinde katılımcılar /
takımlar ve devam eden ligi "Şimdi bitir" (denetim: `league.finalize`). Veri taşıma yok; **022'den sonra, yeni backend'i yayına
almadan önce çalıştırın** (yönetim lig listesi ve lig yaşam döngüsü `leagues.mode` ile `portfolio_league_rules`'u okur).

## 026_slot_machine.sql

**Slot Makinesi — "Olasılık dersi"** (`/oyun/slot`). Yalnızca yeni tablolar ekler; mevcut tablolara dokunmaz, veri taşımaz.

- `app_settings (key, value JSONB, updated_at, updated_by)`: küçük, kalıcı uygulama ayarları. İlk anahtar `slot_enabled`
  (yönetim paneli → Arena → "Slot Makinesi" kartı, `PUT /api/admin/game/slot`; denetim `settings.slot_toggle`). **Tohum satırı
  eklenmez:** kayıt yoksa geliştirme/testte açık, production'da kapalıdır (`SLOT_ENABLED_DEFAULT=1/0` varsayılanı ezer) — slot
  hukuk onayından sonra panelden açılır. Kapalıyken `GET /api/game/slot` ve `POST /api/game/slot/spin` `410 SLOT_DISABLED` döner.
- `slot_spins`: her çevirme (bahis, kazanç, makara sonuçları JSONB, uygulanan kural + çarpan, sonraki bakiye, durum özeti onayı).
  `UNIQUE (user_id, request_id)` → istemcinin ürettiği `request_id` ile yeniden deneme aynı sonucu döndürür, jeton iki kez düşmez.
  Jeton hareketleri ayrıca `game_ledger`'a yazılır (`slot_bet` −bahis, `slot_win` +kazanç; ref = (`slot`, `request_id`)).

Kurallar ve olasılıklar `backend/src/services/game/config.ts` (`SLOT_*`; RTP %95 tam sayımla doğrulanır), servis
`services/game/slot.ts`. KVKK: `slot_spins` dışa aktarmada; hesap silinince çevirmeler silinir. Yeni backend'i yayına almadan önce çalıştırın.

## 025_global_lab_subscriptions.sql

Global Portföy Lab ve abonelik altyapısı. Yalnızca yeni tablo / indeks / tohum satırı **ekler**; mevcut tablolara dokunmaz,
veri taşımaz, tekrar çalıştırmak güvenlidir (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

- **Abonelik (ödeme sağlayıcısı yok):** `subscription_plans` (`free` / `premium`; `features` JSONB = yetki anahtarları +
  etiketler, `price_display` "Yakında") ve `user_subscriptions` (`status`: trial / active / canceled / expired, `source`:
  trial / admin / payment, `starts_at`, `ends_at` — NULL = süresiz yönetici tanımı, `granted_by`, `note`, `external_ref`
  ileride ödeme sağlayıcısı kimliği, `ending_notified_at`). Kısmi benzersiz indeksler: kullanıcı başına **tek deneme**
  (`source = 'trial'`, süresi dolsa da) ve aynı anda **tek geçerli abonelik** (`status IN ('trial','active')`).
  Yetki her istekte `ends_at`'e göre çözülür (`backend/src/services/subscriptions/entitlements.ts`); `subscriptions-expire`
  işi (15 dk) durumu `expired` yapar, bildirir ve bitişe ≤ 3 gün kalanlara bir kez hatırlatma gönderir.
- **Araştırma kataloğu (Excel'in yerine):** `global_instruments` (sembol, ad, araç türü, varlık sınıfı, alt sınıf, bölge,
  ISO ülke, para birimi, 1–7 risk, gider oranı, kısa Türkçe açıklama, veri kaynağı, lisans notu, uygulamadaki fiyata bağlantı
  `provider_symbol` = `asset_type:SEMBOL`, aktif) + ~48 araçlık tohum (yalnızca tanımlayıcı bilgi; gider oranları yaklaşık),
  `global_research_notes` (yönetici notları; ücretsiz planda yalnızca başlık), `global_research_list` (kullanıcı listesi).
- **Sermaye piyasası varsayımları (ÖRNEK):** `global_assumptions` — sınıf × bölge hücreleri + `fx|USDTRY` (USD bazında,
  yıllık beklenen getiri % ve volatilite %, kaynak, tarih, not), `global_assumption_correlations` (çift başına bir satır;
  faktör modelinden türetilmiş pozitif tanımlı örnek matris), `global_stress_scenarios` (2008, 2020, 2022, TL şoku; yaklaşık
  USD bazlı şoklar JSONB). Hepsi yönetim panelinden düzenlenir; hesapta matris gerekirse en yakın PSD matrise düzeltilir.
- **Kayıtlı Lab senaryoları:** `global_lab_scenarios` (kullanıcı başına ≤ 20; sonuç saklanmaz, güncel varsayımlarla yeniden hesaplanır).

KVKK: abonelikler, araştırma listesi ve senaryolar "Verilerimi indir"e dahildir; hesap silmede silinir (ödeme kaynaklı
abonelik satırları ileride yasal saklama için anonim kalır). **Yeni backend'i yayına almadan önce çalıştırın.**

## 027_sandbox_frozen_prices.sql

`sandbox_portfolios.frozen_prices`: lig bittiğinde (portföy dondurulurken) pozisyonların o anki USD fiyatları saklanır. Bitmiş ligde "Portföyüm" ekranı portföyü güncel fiyatla değil bitiş fiyatıyla gösterir, sıralamayla tutarlı olur. 027'den önce dondurulan portföylerde sütun boş kalır ve değerleme eskisi gibi güncel fiyata düşer.
