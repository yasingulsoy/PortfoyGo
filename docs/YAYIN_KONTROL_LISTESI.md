# Yayına Alma Kontrol Listesi

Bu liste, `feature/platform-v0.4` dalındaki çalışmanın canlıya alınmadan önce yapılması gereken adımlarını sırayla toplar. Her adımın yanına tarih ve yapan kişiyi yazın.

## 1. Kod ve dal

- [ ] `feature/platform-v0.4` dalını gözden geçirip `main`'e birleştir (4 ana commit: backend, frontend, admin, altyapı).
- [ ] GitHub'a push et ve CI'ın (web, backend, e2e işleri) yeşil olduğunu doğrula. E2E işi CI'da henüz hiç çalışmadı.

## 2. Gizli bilgiler

- [ ] Daha önce git geçmişine girmiş Finnhub anahtarını sağlayıcı panelinden **iptal et ve yenile**.
- [ ] İsteğe bağlı: `git filter-repo` ile eski anahtar ve DB dökümlerini geçmişten temizle (force-push gerektirir, ekiple koordine et).
- [ ] Canlı ortam değişkenlerini platformun secret yöneticisine gir: `JWT_SECRET` (en az 48 bayt rastgele), `DATABASE_URL`, SMTP, veri sağlayıcı anahtarları, `ALLOWED_ORIGINS`, `COOKIE_DOMAIN`, `COOKIE_SECURE=1`.
- [ ] `DEV_LOGIN=0` ayarla (hızlı giriş zaten yalnızca yerel veritabanında açılır; bu ek güvence).
- [ ] Ölçekleme / gözlemlenebilirlik sırları (API **ve** worker): `REDIS_URL` (parolalı, mümkünse `rediss://` TLS), `SENTRY_DSN`, `METRICS_TOKEN` (en az 32 karakter rastgele; Prometheus kazıyıcısına `Authorization: Bearer …` olarak verilir). Ayrıntılar §4 "Ölçekleme ve gözlemlenebilirlik".
- [ ] **`TOTP_ENC_KEY`** (backend): iki adımlı doğrulama gizli anahtarlarını AES-256-GCM ile şifreleyen 32 baytlık anahtar — `openssl rand -hex 32` (64 hex) ya da base64. **Production'da zorunlu:** yoksa 2FA kurulamaz, 2FA'lı hesaplar girişi tamamlayamaz (503) ve `ADMIN_REQUIRE_2FA` açıkken yönetim paneli kullanılamaz. Anahtarı secret yöneticisinde **kalıcı** saklayın ve yedekleyin; değişirse/kaybolursa mevcut 2FA kayıtları çözülemez (kullanıcılar 2FA'yı yeniden kurmalı). Yerel geliştirmede tanımsızsa `JWT_SECRET`'tan geliştirme anahtarı türetilir.
- [ ] **`ADMIN_REQUIRE_2FA`** (backend): production'da varsayılan **açık** — 2FA'sı kapalı yöneticiler yönetim API'sinden `403 ADMIN_2FA_REQUIRED` alır, panel "İki adımlı doğrulama gerekli" ekranını gösterir. Canlıya almadan önce her yönetici sitede **Profil → Güvenlik** bölümünden 2FA'yı açmalı (önce `TOTP_ENC_KEY` tanımlı olmalı). Geçici olarak kapatmak için `ADMIN_REQUIRE_2FA=0` (önerilmez).
- [ ] Haftalık e-posta özeti (backend/worker): `PUBLIC_SITE_URL` (ör. `https://portfoygo.com`), `PUBLIC_API_URL` (ör. `https://api.portfoygo.com/api`; abonelikten çıkma bağlantısı buraya gider), `EMAIL_UNSUBSCRIBE_SECRET` (rastgele, kalıcı; boşsa `JWT_SECRET`'tan türetilir ve `JWT_SECRET` değişince eski bağlantılar bozulur). Gönderim production'da varsayılan açıktır; `EMAIL_DIGEST_SEND=0` kapatır. **docker-compose.yml'de varsayılan `0`** (yerel compose yığını da production modunda çalıştığı için) → canlıda `EMAIL_DIGEST_SEND=1` verin. İsteğe bağlı `EMAIL_DIGEST_DELAY_MS` (gönderimler arası bekleme, varsayılan 200).
- [ ] Site (web) sunucusu: `API_INTERNAL_URL` — sunucu tarafı render'ın (herkese açık profil `/u/…` ve OG görseli) API'ye ulaşacağı iç adres (compose'da `http://api:5001/api`). Boşsa `API_PROXY_TARGET` ya da mutlak `NEXT_PUBLIC_API_URL` kullanılır.

## 3. Veritabanı

- [ ] Uzak veritabanının yedeğini al: `pg_dump "$DATABASE_URL" -Fc -f yedek_<tarih>.dump`.
- [ ] Bekleyen migration'ları önizle: `npm run migrate -- --dry-run` (000–021).
- [ ] Uygula: `npm run migrate`.
  - 002 sonrası tüm kullanıcılar bir kez yeniden giriş yapar (çerez oturumu).
  - 009 sonrası bekleyen e-posta doğrulama kodları geçersiz olur.
  - 018 (hesap güvenliği + KVKK): `users` tablosuna 2FA kolonları (`totp_*`, şifreli anahtar) ve `is_deleted` / `deleted_at`, yeni `user_recovery_codes` tablosu ekler; veri taşımaz, tablo yeniden yazılmaz. **Yeni backend'i yayına almadan önce çalıştırın** — giriş, oturum doğrulama ve yönetici kontrolü bu kolonları okur.
  - 019 (herkese açık profiller + haftalık e-posta özeti): `users.profile_public` (varsayılan **açık**) ve `email_digests` (kullanıcı + hafta başına tek gönderim) ekler; veri taşımaz, tablo yeniden yazılmaz. Yeni backend'i yayına almadan önce çalıştırın (profil ve özet uçları bu kolon/tabloyu kullanır).
  - 020 (işlem derinliği): `orders.type` 20 karaktere genişler (metadata; tablo yeniden yazılmaz), takip eden stop (`trail_percent` / `trail_amount` / `high_water_price`) ve açılışta emir (`execute_after`) kolonları + kısıtlar eklenir; mevcut emirler değişmez, veri taşımaz. **Yeni backend'i yayına almadan önce çalıştırın** — emir oluşturma ve listeleme bu kolonları kullanır.
  - 021 (performans indeksleri): yalnızca `transactions (user_id, created_at DESC)` indeksi; veri değişmez. Tek transaction'da kurulur (MVP boyutunda < 1 sn, bu sürede yalnızca `transactions` yazmaları bekler). Tablo çok büyüdüyse önce aynı indeksi elle `CREATE INDEX CONCURRENTLY` ile oluşturun.
- [ ] Yönetici hesabı: `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` ile `npm run create-admin -w @portfoygo/backend`.

## 4. Altyapı

- [ ] Docker'lı bir makinede imajları derle ve `docker compose --env-file .env.docker up --build` ile ayağa kaldır. İmajlar geliştirme makinesinde **hiç derlenmedi**.
- [ ] Alan adları: site, API ve yönetim paneli **aynı sitede** olmalı (ör. `app.` / `api.` / `admin.portfoygo.com`, `COOKIE_DOMAIN=.portfoygo.com`). Farklı sitelerde (ör. `vercel.app` + `onrender.com`) oturum çalışmaz.
- [ ] Ters vekil (reverse proxy) arkasında `TRUST_PROXY=1` (rate limit gerçek IP'yi görsün).
- [ ] API'yi **HTTP/2** ile sun. Her sekme bildirim + Arena/yayın için canlı akış (SSE) bağlantısı açar; HTTP/1.1'de tarayıcının alan adı başına 6 bağlantı sınırı birkaç sekmede dolar ve istekler askıda kalır (yerelde görüldü).
- [ ] `/healthz` ve `/readyz` uçlarını yük dengeleyici sağlık kontrolüne bağla.
- [ ] **Ölçekleme ve gözlemlenebilirlik** (yapıldı; canlıda ayarlanacaklar):
  - **Worker:** zamanlanmış işler (emirler, fiyat yenileme, Arena, Haftalık Seçim, e-posta özeti …) ayrı süreçte: `npm run start:worker -w @portfoygo/backend` (`node dist/worker.js`, aynı imaj; compose'da `worker` servisi). Sağlık: `WORKER_PORT` (5002) `/healthz`, `/readyz`; `/metrics` ve `/jobs` (iş durumları JSON) `METRICS_TOKEN` ile. `SIGTERM`'de süren işler en fazla `WORKER_SHUTDOWN_GRACE_MS` (25 sn) beklenir. Yerelde: `npm run dev:worker:local -w @portfoygo/backend` (çalışan `dev:local` veritabanına bağlanır).
  - **`RUN_JOBS`:** API sürecinde cron çalışsın mı? Tanımsız → **açık** (tek süreç, bugünkü davranış). Worker kullanılan dağıtımda **API örneklerinde `RUN_JOBS=0`**. Worker bu bayrağı yok sayar.
  - **İş kilitleri:** her iş çalıştırması PostgreSQL advisory lock ile sarılır (iş başına sabit anahtar, havuz dışı tek bağlantı); iki örnek aynı işi aynı anda çalıştırmaz, kilitli tur hata değil "atlandı (kilitli)" olarak sayılır (Sistem durumu → Çalışma sütunu). ⚠️ `DATABASE_URL` işlem modunda havuzlayan bir adresse (PgBouncer/Supabase "transaction", Neon `-pooler`) oturum kilitleri çalışmaz → **`JOB_LOCK_DATABASE_URL`** ile doğrudan (session) bağlantı adresi verin. Kilit eşzamanlılığı engeller; işler idempotent olduğu için iki örneğin art arda aynı turu çalıştırması zararsızdır.
  - **`REDIS_URL` (çoklu örnek / ayrı worker için gerekli):** (a) bildirim ve Arena olayları (`portfoygo:bus:*` pub/sub) tüm örneklerdeki SSE istemcilerine ulaşır — worker'daki emir dolumu / tur sonu olayları dahil; (b) HTTP rate limit sayaçları (`express-rate-limit` + `rate-limit-redis`, `portfoygo:rl:*`) ortak; (c) admin "Sistem durumu" worker'ın iş durumlarını görür. Redis kesintisinde API durmaz: sınırlayıcılar açık geçer, olaylar yalnızca yerel istemcilere gider. `REDIS_PREFIX` aynı Redis'i paylaşan ortamları ayırır. Kalıcılık gerekmez (compose: `redis:7-alpine`, `--save ""`).
  - **Hâlâ örnek başına (bellekte) kalanlar:** Finnhub çağrı bütçesi (`services/rateLimiter.ts`; piyasa yenilemesi worker'da tek yerde), idle dokunuş sınırlayıcısı (`services/idle/tapLimiter.ts`), Arena tepki bekleme süresi (2 sn), Haftalık Seçim yorum hız sınırı (servis içi), SSE eşzamanlı bağlantı sınırları (kullanıcı başına 5 bildirim / 5 Arena akışı, yayın akışı IP / jeton / toplam sınırları — örnek başına sayılır), emtia / döviz / fiyat geçmişi / yayın durumu bellek önbellekleri (her örnek kendi dış API çağrısını yapabilir; emtia kredisi örnek sayısıyla artar) ve sıralama / piyasa listesi önbellekleri (`LEADERBOARD_CACHE_MS` 15 sn, `MARKET_LIST_CACHE_MS` 5 sn).
  - **Hata takibi:** backend `SENTRY_DSN` (+ isteğe bağlı `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`) tanımlıysa @sentry/node: 5xx hatalar, başarısız işler (iş başına 5 dk'da bir), yakalanmamış istisnalar. Çerez, `Authorization`, şifre/token/OTP alanları, sorgu dizeleri ve e-postalar gönderilmeden temizlenir; tracing kapalı. Site ve panel `@sentry/nextjs` kullanmaz: `window.onerror` / `unhandledrejection` / hata sınırları → `POST /api/client-errors` (oturumsuz, 8 KB, IP başına 20/dk; pino'ya istek kimliğiyle yazılır, `SENTRY_DSN` varsa Sentry'ye iletilir; kullanıcı kimliği yok, adres yalnızca yol). Kapatmak için derlemede `NEXT_PUBLIC_CLIENT_ERRORS=0`.
  - **Metrikler:** `GET /metrics` (API ve worker ayrı ayrı kazınır) yalnızca `METRICS_TOKEN` tanımlıysa ve `Authorization: Bearer <METRICS_TOKEN>` ile; aksi halde 404. İstek süresi (rota şablonu + durum kodu), iş süresi / ok-error / atlama sayaçları ve son başarı zamanı, açık SSE bağlantıları, dış sağlayıcı çağrıları (ok/error), Redis olay mesajları, istemci hataları, süreç metrikleri. Önerilen alarmlar: `portfoygo_job_last_success_timestamp_seconds` bayat (ör. `orders` > 5 dk), `portfoygo_job_runs_total{status="error"}` artışı, 5xx oranı, p95 > 500 ms.
  - **DB havuzu:** örnek başına `DB_POOL_MAX` (varsayılan 10) + iş kilidi bağlantısı (1). Toplam bağlantı ≈ (API örneği + worker) × (`DB_POOL_MAX` + 1); sağlayıcının `max_connections` sınırının altında tutun. Yük testinde havuzu 25'e çıkarmak verimi artırmadı (sınır Node CPU'su) → önce yatay ölçekleyin.
- [ ] **Yük testi** (`scripts/load/README.md`): 50 bağlantı × 30 sn, gerçek PostgreSQL + 1.000 kullanıcılık veriyle tek API süreci **~1.430 istek/sn**, p99 141 ms, hatasız (önbelleklerden önce 921 istek/sn, p99 230 ms); yerel PGlite'ta 419 → 545 istek/sn. Canlıya yakın ortamda (staging, aynı makine tipi) bir kez tekrarlayın: `LOAD_BASE_URL=… node scripts/load/hot-paths.mjs`.
- [ ] Günlük otomatik DB yedeği ve bir geri yükleme provası.
- [ ] Log toplama: API ve worker stdout'a satır başına JSON yazar (`service`: `portfoygo-api` / `portfoygo-worker`, `reqId`); platformun log toplayıcısına bağlayın. Sentry projesi açıp `SENTRY_DSN`'i API + worker'a verin.
- [ ] **E-posta gönderen alan adı (haftalık özet):** `SMTP_FROM` alan adı için SPF (SMTP sağlayıcısının `include:` kaydı), DKIM (sağlayıcının verdiği anahtar, DNS'e TXT) ve DMARC (`v=DMARC1; p=quarantine; rua=…` ile başlayın) kayıtlarını ekleyin; Gmail/Yahoo toplu gönderici kuralları bunları ve tek tıkla abonelikten çıkmayı (`List-Unsubscribe` + `List-Unsubscribe-Post`, özet zaten gönderir) ister. Kişisel Gmail hesabı yerine işlemsel e-posta sağlayıcısı (ör. SES, Postmark, Mailgun) kullanın ve günlük gönderim kotasını alıcı sayısıyla karşılaştırın.
- [ ] Herkese açık profil sayfaları sunucu tarafında API'yi web sunucusunun IP'sinden çağırır (sonuç 30 sn önbellekli). Yoğun trafikte API rate limit'i (IP başına `/api` 300/dk, profil ucu 120/dk) web sunucusunu sınırlayabilir; gerekirse iç ağ isteklerini sınırdan muaf tutun.

## 5. Ürün ve veri kararları (ekip)

- [ ] **Veri sağlayıcıları:** Koray'ın araştırması sonucuna göre `backend/src/providers/adapters/` altına adaptör yazılacak. Canlı Arena turları için gerçek zamanlı kotasyon gerekir; şu an turlar gerçek geçmiş fiyatın hızlandırılmış tekrarıdır.
- [ ] **Emtia kotası:** Emtia anahtarı tanımlıyken fiyat geçmişi kaydı, popüler emtia listesini saatte bir yeniler.
- [ ] **Portföy Sihirbazı:**
  - TL nakit getiri varsayımı (`ADVISOR_TRY_CASH_RETURN`, varsayılan %40) önerileri doğrudan etkiler; H.Burak ile netleştirilmeli.
  - Anket soruları `backend/src/services/advisor/questionnaire.ts` dosyasında.
- [ ] **Arena:**
  - Saatlik tur sınırı (12).
  - Meydan okuma ödül metinleri ve sponsorlukların yasal çerçevesi (sorumlu oyun).
- [ ] **Oyun Merkezi (`/oyun`):**
  - Çark, görev, mağaza ve idle oyun ödülleri yalnızca oyun içi jeton/XP'dir; gerçek parayla satın alma veya paraya çevirme **eklenmemeli**. Ödüllü çark ve 18+ kapısı hukuk tarafından gözden geçirilmeli.
  - Ekonomi dengesi tek dosyada: `backend/src/services/game/config.ts` ve `backend/src/services/idle/config.ts`.
  - Senaryo modu için yüklenecek tarihsel veriler lisanslı olmalı (kaynak ve lisans notu zorunlu alan).
  - Eşleştirme kuyruğu ve bot işleri (`arena-matchmaking`, `arena-bots`, `arena-duels`, `weekly-picks`) worker'da çalışır; birden çok örnek açılsa da advisory lock aynı işi aynı anda çalıştırmaz (bkz. §4).
  - Haftalık Seçim tartışması kullanıcı içeriğidir: moderasyon sorumlusu belirlenmeli (yönetim paneli → Haftalık Seçim).
  - Haftalık Seçim emtia seçimleri fiyat geçmişine dayanır; emtia verisi düzenli güncellenmiyorsa emtialar seçim listesinde görünmez.
- [ ] **İşlem derinliği (020):**
  - ABD seans takvimi (`backend/src/services/marketHours.ts`: `NYSE_HOLIDAYS`, `NYSE_EARLY_CLOSES`) yalnızca 2026–2027'yi içerir; 2028 listesi NYSE yayımlayınca eklenmeli (listede olmayan yılda yalnızca hafta sonu kuralı uygulanır). Canlıda `US_MARKET_HOURS` tanımlanmamalı (`off` seans kuralını kapatır; yalnızca testler için).
  - Açılışta alış tamponu %5 (`MOO_BUY_BUFFER`, backend + `frontend/src/components/trade/orderInput.ts`); açılış fiyatı tamponu aşarsa ayrılan tutarın karşıladığı kadar alınır (kısmi), artan iade edilir. Ürün olarak onaylanmalı.
  - Döviz: satışta alış kuru uygulanıyor, **değerleme satış kurunda bırakıldı** (sezon ortasında döviz tutanların varlığı makas kadar düşmesin). Değerlemenin alış kuruna (tasfiye değeri) geçirilmesi istenirse bir sezon başında yapılmalı.
- [ ] KVKK ve kullanım şartları metinlerinin hukuk onayı.
- [ ] **KVKK self-servis (hukuk + ürün):**
  - "Verilerimi indir" (Profil → Hesap ve veriler, `GET /api/me/export`, kullanıcı başına saatte 3) tüm kullanıcı tablolarını JSON olarak verir; şifre özeti, oturum sürümü, 2FA anahtarı ve kurtarma kodu özetleri hariç. Yeni bir kullanıcı tablosu eklenirse `backend/src/services/account/export.ts` listesine eklenmeli.
  - "Hesabımı sil" (`POST /api/me/delete`: şifre + 2FA açıksa kod + kullanıcı adı onayı) hesabı **anonimleştirir**: kişisel veriler silinir, işlem / sezon / lig / Arena sonuçları sıralamalar tutarlı kalsın diye kimliksiz kalır ve silinmiş hesaplar listelerden çıkar. Bu "anonimleştirerek saklama" yaklaşımı ve etkinlik kayıtlarının hemen silinmesi (yasal saklama yükümlülüğü var mı?) hukukla teyit edilmeli. Yönetici denetim kaydındaki (`admin_audit_log`) eski kullanıcı adı etiketleri değiştirilmez.
  - Çerez politikası (`/cerez-politikasi`): yalnızca zorunlu çerezler (`pg_session`, `pg_auth`) + yerel depolamada tema/arayüz tercihleri; bu yüzden çerez onay bandı yok. İleride analiz/izleme aracı eklenirse önce onay bandı ve politika güncellemesi gerekir.
- [ ] **Content-Security-Policy:** site ve panelde istek başına nonce'lu CSP (`src/proxy.ts`, ortak kurallar `packages/shared/src/csp.ts`). Bu nedenle tüm sayfalar dinamik render edilir (statik önbellek yok). Yeni bir üçüncü taraf betik / API / yazı tipi eklenirse CSP'ye eklenmeli; `/yayin/**` (OBS katmanı) her sitede çerçevelenebilir, diğer sayfalar çerçevelenemez.
- [ ] **Haftalık e-posta özeti ve herkese açık profil (hukuk):** özet varsayılan açık (opt-out) ve yalnızca kullanıcının kendi hesap etkinliğini içerir; 6563 sayılı Kanun / İYS kapsamında "ticari elektronik ileti" sayılırsa varsayılan kapalıya çevrilmeli (`email_digest !== false` kontrolü, `backend/src/services/notifications.ts` + `services/email/digest.ts`). Herkese açık profil de varsayılan açık; aydınlatma metnine eklenmeli (profilde yalnızca yüzde/sıra, tutar yok; kullanıcı "Profil görünürlüğü"nden kapatabilir).

## 6. Canlı sonrası ilk gün

- [ ] Yönetim paneli → **Sistem durumu**: tüm cron işleri "ok", veri tazeliği uyarısı yok. Ayrı worker kullanılıyorsa başlıkta "İşler ayrı worker sürecinde çalışıyor (durumlar Redis üzerinden)" yazmalı; "Redis yok" uyarısı görünüyorsa API'ye `REDIS_URL` verilmemiştir.
- [ ] Worker: `curl http://<worker>:5002/healthz` → `{"status":"ok"}`; `curl -H "Authorization: Bearer $METRICS_TOKEN" http://<worker>:5002/jobs` iş listesini döner; API'de `/metrics` belirteçsiz 401 (belirteç tanımsızsa 404).
- [ ] İki API örneğiyle: bir örneğe bağlı sekmede bildirim akışı açıkken diğer örnekten (veya worker'dan) üretilen bildirim anında geliyor mu? (ör. limit emrinin dolması)
- [ ] İstemci hata raporu: sitede tarayıcı konsolundan zamanlayıcı içinde bir hata fırlatın → API logunda `[client-error] web/error …` ve (DSN varsa) Sentry'de olay; çerez / e-posta / sorgu dizesi içermediğini kontrol edin.
- [ ] Bir test hesabıyla uçtan uca: kayıt → e-posta doğrulama → alım/satım → limit emri → lig → Arena turu → Portföy Sihirbazı.
- [ ] Test hesabıyla: Profil → Güvenlik → 2FA'yı aç (QR + kurtarma kodları) → çıkış → girişte "Doğrulama kodu" adımı → bir kurtarma koduyla giriş → 2FA'yı kapat. Ardından "Verilerimi indir" ve "Hesabımı sil" (silinen hesabın tekrar giriş yapamadığını ve liderlikte görünmediğini doğrula).
- [ ] Tarayıcı konsolunda CSP ihlali (`Content Security Policy`) yok: ana sayfa, giriş, piyasalar, varlık grafiği, portföy, Arena turu, oyun sayfaları, `/yayin/<token>` ve yönetim paneli.
- [ ] Bildirimler ve canlı akış (SSE) vekil arkasında kesilmeden çalışıyor mu (`X-Accel-Buffering`, zaman aşımları)?
- [ ] Bir profil bağlantısını (`/u/<kullanıcı>`) WhatsApp / X / LinkedIn'de paylaşıp önizleme görselinin geldiğini doğrula; profil gizlenince 30 sn içinde "Bu profil gizli" göründüğünü kontrol et.
- [ ] İlk Pazartesi 09:00 sonrası: Sistem durumu → `weekly-digest` "ok"; `SELECT status, COUNT(*) FROM email_digests WHERE week_key = '<hafta>' GROUP BY 1;` ile gönderilen/hatalı sayısı; test hesabında e-postadaki "Abonelikten çık" bağlantısı çalışıyor mu?
