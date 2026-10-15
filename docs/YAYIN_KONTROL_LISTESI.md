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

## 3. Veritabanı

- [ ] Uzak veritabanının yedeğini al: `pg_dump "$DATABASE_URL" -Fc -f yedek_<tarih>.dump`.
- [ ] Bekleyen migration'ları önizle: `npm run migrate -- --dry-run` (000–017).
- [ ] Uygula: `npm run migrate`.
  - 002 sonrası tüm kullanıcılar bir kez yeniden giriş yapar (çerez oturumu).
  - 009 sonrası bekleyen e-posta doğrulama kodları geçersiz olur.
- [ ] Yönetici hesabı: `ADMIN_EMAIL`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` ile `npm run create-admin -w @portfoygo/backend`.

## 4. Altyapı

- [ ] Docker'lı bir makinede imajları derle ve `docker compose --env-file .env.docker up --build` ile ayağa kaldır. İmajlar geliştirme makinesinde **hiç derlenmedi**.
- [ ] Alan adları: site, API ve yönetim paneli **aynı sitede** olmalı (ör. `app.` / `api.` / `admin.portfoygo.com`, `COOKIE_DOMAIN=.portfoygo.com`). Farklı sitelerde (ör. `vercel.app` + `onrender.com`) oturum çalışmaz.
- [ ] Ters vekil (reverse proxy) arkasında `TRUST_PROXY=1` (rate limit gerçek IP'yi görsün).
- [ ] API'yi **HTTP/2** ile sun. Her sekme bildirim + Arena/yayın için canlı akış (SSE) bağlantısı açar; HTTP/1.1'de tarayıcının alan adı başına 6 bağlantı sınırı birkaç sekmede dolar ve istekler askıda kalır (yerelde görüldü).
- [ ] `/healthz` ve `/readyz` uçlarını yük dengeleyici sağlık kontrolüne bağla.
- [ ] Birden fazla API örneği çalıştırılacaksa:
  - Bildirim ve Arena canlı akışları için Redis pub/sub gerekir (şu an tek süreç içi).
  - Cron işleri her örnekte çalışır; tek bir "worker" örneğine taşı ya da PG advisory lock ekle.
  - Rate limit sayaçları bellekte; Redis'e taşı.
- [ ] Günlük otomatik DB yedeği ve bir geri yükleme provası.
- [ ] Hata takibi (Sentry) ve log toplama.

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
  - Eşleştirme kuyruğu ve bot işleri (`arena-matchmaking`, `arena-bots`, `arena-duels`, `weekly-picks`) tek süreçte çalışır; çok örnekte tek worker'a taşınmalı.
  - Haftalık Seçim tartışması kullanıcı içeriğidir: moderasyon sorumlusu belirlenmeli (yönetim paneli → Haftalık Seçim).
  - Haftalık Seçim emtia seçimleri fiyat geçmişine dayanır; emtia verisi düzenli güncellenmiyorsa emtialar seçim listesinde görünmez.
- [ ] KVKK ve kullanım şartları metinlerinin hukuk onayı.

## 6. Canlı sonrası ilk gün

- [ ] Yönetim paneli → **Sistem durumu**: tüm cron işleri "ok", veri tazeliği uyarısı yok.
- [ ] Bir test hesabıyla uçtan uca: kayıt → e-posta doğrulama → alım/satım → limit emri → lig → Arena turu → Portföy Sihirbazı.
- [ ] Bildirimler ve canlı akış (SSE) vekil arkasında kesilmeden çalışıyor mu (`X-Accel-Buffering`, zaman aşımları)?
