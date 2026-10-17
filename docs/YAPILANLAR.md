# PortfoyGo — Tamamlanan İşler

Yol haritasından ([GELISTIRME_YOL_HARITASI.md](GELISTIRME_YOL_HARITASI.md)) çıkarılan, tamamlanmış işlerin arşivi. Yeni tamamlanan işler buraya eklenir; yol haritasında yalnızca açık işler tutulur.

**Son güncelleme:** 17 Ekim 2026

---

## 1. Şu ana kadar yapılanlar

### Güvenlik ve doğruluk ✅
- [x] Koda gömülü API anahtarları, yedek JWT sırrı ve varsayılan admin şifresi kaldırıldı. Kullanıcı verisi içeren DB dökümleri repodan çıkarıldı.
- [x] **İşlem fiyatını sunucu belirliyor**, istemcinin gönderdiği fiyat yok sayılıyor. Böylece sanal para basma açığı kapandı.
- [x] Alım ve satım satır kilitli (`FOR UPDATE`) tek bir transaction içinde çalışıyor. Aynı anda gelen çift satış veya bakiyenin eksiye düşmesi artık mümkün değil.
- [x] zod ile girdi doğrulama yapılıyor; `NaN`, negatif ve aşırı büyük değerler reddediliyor.
- [x] Giriş, kayıt ve e-posta uçlarında rate limit var, helmet ekli, hata mesajları genelleştirildi (iç detay sızmıyor).
- [x] E-posta doğrulamasını atlatma açığı kapatıldı; kodlar `crypto.randomInt` ile üretiliyor ve deneme sayısı sınırlı. Şifre sıfırlama çalışır hâlde.
- [x] Kota harcatan uçlar yalnızca admin'e açık. Sıralama hesabı her istekte değil, cron ile yapılıyor.
- [x] Tek bir canlı USD/TRY kuru kullanılıyor (sabit 32,5 kaldırıldı). Fiyat hassasiyeti `NUMERIC(24,8)`.
- [x] Next.js 16.4, nodemailer 10, node-cron 4. `npm audit` her iki tarafta da 0.

### Tasarım ✅
- [x] Logodaki mor-lacivert kimliğe dayanan, açık ve koyu temalı token tabanlı tasarım sistemi.
- [x] 17 sayfanın tamamı yeniden yazıldı. Mobilde alt menü var; erişilebilir modal, sekme ve formlar kullanılıyor.
- [x] Ortak al-sat penceresi (tutar veya adet ile) ve sahte veri yerine dürüst "veri yok" ekranları.

## 2. İkinci dalgada yapılanlar ✅

| Alan | İş | Neden |
| --- | --- | --- |
| Altyapı | Gömülü yerel Postgres (PGlite) ile `npm run dev:local`: uzak DB olmadan, örnek verili tam sistem | Her geliştirici 1 komutla çalıştırabilsin; canlı DB'ye yanlışlıkla dokunulmasın |
| Altyapı | Sıralı migration sistemi (`schema_migrations` tablosu) ve sıfırdan şema (`000_base.sql`) | Ortamlar arasında şema farkı kalmasın |
| Kalite | Backend entegrasyon testleri (vitest): fiyat, bakiye, eşzamanlılık, stop-loss | Para mantığı testsiz geliştirilemez |
| Kalite | GitHub Actions CI: typecheck, lint, test, build | Bozuk kod ana dala giremesin |
| Güvenlik | httpOnly çerez oturumu, CSRF koruması, "tüm cihazlardan çıkış", şifre sıfırlamada oturumların kapatılması | Token'ın XSS ile çalınması imkânsız hâle gelsin |
| Ürün | **Limit emirleri** (limit alış/satış), **kâr al** ve zarar durdur emirlerinin tek bir "Bekleyen emirler" sisteminde toplanması; limit alışta nakit bloke ediliyor | Gerçek borsa deneyimi, strateji kurma |
| Ürün | **Portföy performans grafiği**: saatlik ve günlük anlık görüntüler; 1H/1A/3A/1Y/Tümü aralıkları | Kullanıcı ilerlemesini görmezse geri gelmez |
| Ürün | **İzleme listesi** (favoriler) | En çok kullanılan borsa özelliği |
| Tasarım | Ziyaretçiler için **tanıtım (landing) sayfası** | Şu an ilk izlenim bir giriş formu |
| Tasarım | **Komut paleti** (Ctrl+K ile varlık ve sayfa arama), klavye kısayolları, bildirim (toast) sistemi | Hız ve "pro" his |
| Tasarım | Yeni kullanıcı için başlangıç rehberi | İlk 5 dakikada kullanıcıyı kaybetmemek |
| SEO | `sitemap`, `robots`, OG görseli, PWA manifest, sayfa başlıkları, hata ve yükleme sınırları | Bulunabilirlik ve paylaşılabilirlik |

## 3. Mimari yeniden yapılanma ✅

**Hedef klasör yapısı** (npm workspaces ile monorepo):

```
PortfoyGo/
├─ frontend/        Next.js kullanıcı uygulaması (bugünkü src/)
├─ admin/           Ayrı Next.js yönetim paneli (bugünkü /admin sayfası buraya taşınır)
├─ backend/         Express API
├─ packages/
│  └─ shared/       Ortak tipler, zod şemaları, biçimlendirme ve sabitler (komisyon oranı vb.)
├─ docs/
└─ package.json     workspaces: ["frontend", "admin", "backend", "packages/*"]
```

- [x] Kullanıcı uygulaması `frontend/` klasörüne taşındı; CI ve README güncellendi.
- [x] `admin/` gerçek, ayrı bir yönetim paneli oldu (port 3001, yalnızca yönetici oturumu): kullanıcılar, istatistikler, ban, önbellek.
- [x] `packages/shared` (`@portfoygo/shared`): tasarım token'ları, UI bileşenleri, biçimlendirme ve API istemci çekirdeği.
- [x] Kök `npm run dev` ve `npm run dev:local` üç uygulamayı birlikte başlatıyor.
- [x] Dış veri sağlayıcıları ortak arayüz (`backend/src/providers`) arkasına alındı. Entegrasyonların içi değişmedi; yeni API için tek adaptör dosyası yeterli.

**Bitti kriteri:** `npm install && npm run dev:local` ile üç uygulama ayağa kalkıyor, CI her paketi ayrı ayrı test ediyor.

## 3.5 TailAdmin tasarımı ve fiyat geçmişi ✅

- [x] Arayüzün tamamı TailAdmin (Stocks dashboard) tasarım diline taşındı: Outfit yazı tipi, #465FFF marka rengi, açık/koyu tema, daraltılabilir sol menü + ⌘K arama, TailAdmin kart/tablo/rozet/sayfalama düzeni. Kod kopyalanmadı; tasarım kendi bileşenlerimizle yeniden kuruldu (Stocks ekranı TailAdmin Pro'ya aittir).
- [x] Panel: varlık kartları, portföy performansı, varlık dağılımı, izleme listesi, trend varlıklar, liderler, son işlemler.
- [x] Yeni Piyasalar sayfası (7 günlük mini grafikli tablo) ve TradingView tarzı varlık sayfası (aralık seçimli grafik, piyasa açık/kapalı, performans kutucukları).
- [x] Fiyat geçmişi: 15 dakikalık / saatlik / günlük kayıt, `GET /api/market/history | performance | sparklines`.
- [x] Yönetim paneli de aynı kabukta: Genel bakış, Kullanıcılar, Piyasa önbelleği, Sezonlar.

## 3.6 Yönetim paneli v2 ve yayına hazırlık ✅

- [x] Yönetim paneli: metrik grafikleri, kullanıcı detayı ve eylemleri (admin yetkisi, e-posta doğrulama, oturum kapatma, yasaklama), işlemler, emirler (iptal + iade), lig moderasyonu, sistem durumu (DB, migration, cron işleri, veri tazeliği, sağlayıcılar; işleri elle çalıştırma), denetim kaydı.
- [x] Backend: `admin_audit_log` (migration 008), cron iş kayıt defteri, `/healthz` ve `/readyz`, pino ile yapılandırılmış log ve `X-Request-Id`.
- [x] Güvenlik başlıkları (CSP, HSTS (prod), frame/nosniff/referrer/permissions) her iki Next uygulamasında.
- [x] Docker: backend/frontend/admin imajları ve `docker compose` (postgres + migrate + api + web + admin). *İmajlar henüz derlenip denenmedi (geliştirme makinesinde Docker yok).*
- [x] Playwright uçtan uca testleri (giriş, piyasalar, al-sat, liderlik, admin) ve CI'da E2E işi.

## 3.6.1 Ligler v2 ve bildirim merkezi ✅

- [x] Zamanlı ligler: başlangıç saati + süre (1 gün … 3 ay), adil başlangıç (başlamadan katılan herkes başlangıç anındaki varlığından ölçülür), bitişte sıralamanın dondurulması ve şampiyonluk ekranı.
- [x] Herkese açık ligler ve "Keşfet" (kodsuz katılım), lig akışı (üyelerin son işlemleri, tutarsız), canlı geri sayım ve animasyonlu sıra değişimleri.
- [x] Bildirim merkezi: zil + açılır panel, bildirimler sayfası, SSE ile anlık iletim ve toast; emir, rozet, sezon, lig ve hesap olayları; kategori tercihleri; yönetim panelinden duyuru.

## 3.6.2 Arena ve Portföy Sihirbazı ✅ (toplantı kararlarının ilk uygulaması)

- [x] **Arena (hızlı al-sat):** 4 enstrüman (EUR/USD, altın, Brent, BTC), tek dokunuşla uzun/kısa, zarar kes/kâr al, alış/satış makası, canlı K/Z; 1–10 dakikalık bireysel turlar ve yöneticinin planladığı sponsorlu canlı meydan okumalar. Fiyatlar sunucuda üretilir: gerçek geçmiş hareketin hızlandırılmış tekrarı (tur sonunda gerçek tarih açıklanır). Saatlik tur sınırı ve "sanal para" uyarıları.
- [x] **Portföy Sihirbazı:** 8 soruluk risk anketi → 5 profil; kısıtlı ortalama-varyans optimizasyonu, Monte Carlo (beklenen getiri aralığı, zarar olasılığı, VaR, maksimum düşüş); mevcut portföyle sapma; tek tıkla sanal portföye uygulama. Algoritma deterministik, arka planda; YZ sohbeti yok.
- [x] Yayına alma adımları: [YAYIN_KONTROL_LISTESI.md](YAYIN_KONTROL_LISTESI.md)

## 3.6.3 Oyun Merkezi (`/oyun`) ✅ (mobil oyun hissi + toplantı kararlarının ikinci uygulaması)

Oyun alanı TailAdmin panelinden ayrıldı: kendi "oyun derisi" (gökyüzü / gece paleti, Baloo 2 yazı tipi, basılınca çöken kalın düğmeler, çizgi avatarlar, jeton sayacı, ödül pencereleri ve konfeti). Eski `/arena` adresleri `/oyun`'a yönlenir. Jeton ve XP yalnızca oyun içidir; gerçek parayla alınamaz, paraya çevrilemez.

- [x] **1v1 Düello:** "HIZLI MAÇ" eşleştirmesi (15 sn'de rakip çıkmazsa açıkça etiketli "Antrenman Botu 🤖"), VS ekranı, 3-2-1 sayımı, halat çekme çubuğu, emoji tepkileri; davet linkiyle arkadaş düellosu ve rövanş. İnsan düellolarında ELO puanı ve kademeler (Bronz → Elmas).
- [x] **İlerleme:** jeton, XP / seviye, günlük seri (7. gün bonusu), günlük görevler, **ücretsiz Günlük Çark** (sonuç sunucuda, olasılıklar her zaman görünür, ücretli çevirme yok), mağaza (avatar / çerçeve / unvan), puan ve seviye sıralamaları. Tur sonu ödülleri sunucunun defterinden (`GET /api/game/rewards/round/:id`).
- [x] **Yatırım İmparatorluğu (idle):** 6 bina (Kumbara → Holding), gelirler gerçek piyasa hareketine bağlı çarpanlarla değişir ("Bugün altın %1,2 düştü → ×0,93"), çevrimdışı kazanç (8–12 sa sınır), yükseltmeler, kilometre taşı ödülleri, "Halka Arz" (prestij), bileşik getiri / çeşitlendirme ipuçları.
- [x] **Koç ve senaryolar:** her bitmiş tura kural tabanlı "Koç Kemal" karnesi (A–E not, risk / disiplin / kalite / sonuç dağılımı, "Neden önemli?"); senaryo kütüphanesi (brifing → tur → "Ne oldu?"). Yönetim panelinde lisanslı tarihsel seri CSV içe aktarma (kaynak + lisans notu zorunlu) ve senaryo editörü. Örnek: "Ani Çöküş Tatbikatı (sentetik veri)".
- [x] **Yayın modu:** meydan okumalar için OBS'ye uygun herkese açık `/yayin/<jeton>` ekranı (süre, ilk 10, son işlemler — tutar yok —, tepkiler, sunucu mesajı); yönetim panelinden bağlantı üretme ve canlı mesaj.
- [x] **Sorumlu oyun:** 18+ ve "sanal para" onayı, kişisel günlük tur limiti, oturum hatırlatıcısı, kısaltılamayan mola (24 sa / 1 hafta), art arda zarar uyarısı, YEDAM 115 bilgisi. Kurallar sunucuda uygulanır.
- [x] **Haftalık Seçim — Kitlelerin Bilgeliği** (Dr. Alexander Elder'ın anlattığı SpikeTrade yarışması): herkes Cumartesi 00:00 – Pazar 15:00 arasında tek başına bir seçim yapar (varlık + yükselir/düşer + not); seçimler sunucuda gizlidir, Pazar 15:00'te hepsi açılır ve tartışma başlar; yarış Pazartesi–Cuma, getiri varlığın kendi para biriminde; eşit ağırlıklı "kitle portföyü" katılımcılarla kıyaslanır; ilk 3'e jeton/XP. Yönetim panelinde yorum silme ve not gizleme.

## Sonraki dalgalarda tamamlananlar ✅

### Ürün ve oyun mekaniği
- [x] **Sezonlar:** Aylık ve getiri bazlı. Bakiyeler sıfırlanmıyor; herkes sezona girdiği andaki varlığına göre yüzde getiriyle sıralanıyor. Ay sonunda sıralama donduruluyor; sezonda en az bir işlem yapmış ilk 10'a unvan veriliyor (Sezon Şampiyonu, Sezon Podyumu, Sezonun İlk 10'u).
- [x] **Özel ligler:** Davet koduyla katılım ve paylaşılabilir bağlantı. Katılımdan itibaren getiri sıralaması. Kurucu üye çıkarabilir, kodu yenileyebilir ve ligi silebilir (lig başına en fazla 50 üye, kullanıcı başına 10 lig).
- [x] Piyasa emri, limit alış/satış, zarar durdur ve kâr al emirleri (limit alışta nakit bloke edilir)
- [x] Takip eden stop (trailing stop): % veya TL mesafe, zirve yalnızca taze fiyatlarla (hisselerde seans içinde) yukarı taşınır; emirler listesinde güncel tetikleme, düzenleme ve iptal (020).
- [x] Kısmi pozisyon kapatma kısayolları (%25/%50/%100) — pozisyonlar tablosu ve Al/Sat penceresi; %100 eldeki miktarın tamamını (kalıntısız) satar. Satır menüsünde "Pozisyonu kapat".
- [x] Döviz için gerçekçi alış/satış makası: alırken satış, satarken alış kuru; Al/Sat penceresinde iki kur. Değerleme sezon ortasında sıçrama olmasın diye satış kurunda bırakıldı (bkz. `backend/migrations/README.md`, 020).
- [x] Piyasa saatleri: NYSE seansı (yaz saati, 2026–2027 tatilleri ve erken kapanışlar); borsa kapalıyken hisse piyasa emri `409 MARKET_CLOSED`, "Açılışta gerçekleştir" ile sıraya alınır (alışta %5 tamponlu rezerv) ve açılıştan sonraki ilk taze fiyatla işlenir; "Piyasa kapalı · açılışa 3 sa 12 dk" rozeti (020). Takvim her yıl güncellenmeli.
- [x] Arena turları için işlem sonrası analiz (Koç Kemal karnesi) ve tarihsel olay senaryoları — ana portföy işlemleri için mini analiz hâlâ açık.
- [x] Haftalık e-posta raporu: her Pazartesi 09:00 (İstanbul) geçen haftanın portföy değişimi (%), genel sıralama değişimi, en iyi ve en zorlu satış (ortalama maliyete göre %), Arena turları, Haftalık Seçim sonucu ve kısa bir eğitim notu. TL tutarı yok; tek tıkla abonelikten çıkma (imzalı bağlantı + `List-Unsubscribe`), profilde "Haftalık e-posta özeti" tercihi, kullanıcı + hafta başına tek gönderim (`email_digests`, 019). Geliştirmede gerçek e-posta gitmez (yalnızca önizleme; `EMAIL_DIGEST_SEND=1` ile açılır); önizleme: `GET /api/dev/email/digest-preview?username=demo`.
- [x] Herkese açık profil sayfası (`/u/kullaniciadi`; oturumsuz açılır, sunucuda render) ve paylaşılabilir performans kartı (sayfaya özel OG görseli). Yalnızca yüzde ve sıralar: başlangıçtan beri getiri, genel sıra, Arena kademe/reyting/düello kaydı/seviye, Haftalık Seçim özeti, İmparatorluk sırası, sezon unvanları, rozetler ve son başarılar. Profil → "Profil görünürlüğü" ile gizlenebilir (`users.profile_public`, 019). Liderlik, lig, Haftalık Seçim ve Arena sıralamalarındaki kullanıcı adları profile bağlanır; Arena sonucu, Haftalık Seçim sonucu ve İmparatorluk sırası "Paylaş" düğmesiyle (Web Share → panoya kopyalama) profil bağlantısıyla paylaşılır.
- [x] Oyun içi günlük seri (7. gün bonusu) ve kozmetik ödüller; herkese açık oyun profili uç noktası (`/api/game/public-profile/:username`)

### Tasarım ve kullanıcı deneyimi
- [x] Token tabanlı tasarım sistemi, açık ve koyu tema, mobil alt menü
- [x] Varlık tablolarında **sparkline** (mini 7 günlük grafik; `price_history` tablosundan)
- [x] Bildirim merkezi: emir gerçekleşti, rozet kazanıldı, sıralama değişti (SSE ile canlı; bkz. 3.6.1)

### Teknik kalite ve gözlemlenebilirlik
- [x] Backend entegrasyon testleri (para mantığı, emirler, geçmiş, izleme listesi, sağlayıcılar: 75 test)
- [x] **Playwright uçtan uca testleri** (14 test, CI'da her push'ta) ve frontend birim testleri (vitest, 300+ test)
- [x] Cron işlerinin API'den ayrılması: ayrı **worker** süreci (`src/worker.ts`, `RUN_JOBS`) ve her iş için PG advisory lock (iki örnek aynı işi aynı anda çalıştırmaz)
- [x] İsteğe bağlı Redis (`REDIS_URL`): canlı akış olaylarının örnekler arası dağıtımı, rate limit sayaçları, iş durumu. Liderlik ve piyasa listesi kısa süreli bellek önbelleğinde (örnek başına).
- [x] Yapılandırılmış loglama (pino) ve istek kimliği (request-id).
- [x] Hata takibi: Sentry (backend, `SENTRY_DSN`) + tarayıcı hata raporlayıcı (site ve yönetim paneli → `/api/client-errors`)
- [x] Sağlık uçları: `/healthz` ve `/readyz` (DB, fiyat tazeliği, cron son çalışma zamanı)
- [x] Metrikler: Prometheus `/metrics` (`METRICS_TOKEN`): istek süresi, iş süreleri/atlamaları, açık canlı akış bağlantıları, sağlayıcı hataları
- [x] Yük testi (`scripts/load/`): 1.000 kullanıcılık veriyle gerçek Postgres'te ~1.400 istek/sn, p99 141 ms; liderlik ve piyasa listesi önbelleği + işlem geçmişi indeksi (migration 021)

### Güvenlik ve KVKK
- [x] httpOnly çerez oturumu, CSRF koruması, tüm cihazlardan çıkış
- [x] İki faktörlü doğrulama (TOTP): Profil → Güvenlik (QR, tek kullanımlık kurtarma kodları, şifreli anahtar — `TOTP_ENC_KEY`), girişte "Doğrulama kodu" adımı; yöneticiler için `ADMIN_REQUIRE_2FA` (production'da varsayılan açık) — migration 018
- [x] Admin işlemleri için denetim kaydı (kim, kimi, ne zaman banladı) — migration 008
- [x] Content-Security-Policy başlığı (site + yönetim paneli): istek başına nonce + `strict-dynamic` (`proxy.ts`), `frame-ancestors 'none'` (OBS katmanı `/yayin/**` hariç), Referrer-Policy, nosniff, Permissions-Policy
- [x] KVKK: hesap silme (anonimleştirme) ve veri indirme (JSON) self-servis — Profil → Hesap ve veriler; çerez politikası (`/cerez-politikasi`, yalnızca zorunlu çerezler)

### DevOps
- [x] Docker imajları (backend, worker, site, yönetim) ve `docker compose` (Postgres + Redis) — ⚠️ henüz Docker'lı bir makinede derlenmedi

## Portföy modülleri dalgası ✅

- [x] **100.000 USD Model Portföy** (`/model-portfoy`, `/model-portfoy/yeni`, `/model-portfoy/[id]`): kullanıcı başına en fazla 5 varsayımsal portföy, her biri 100.000 USD ve %0,25 komisyonla başlar. Ağırlıklarla kurulum (varlık arama + tür çipleri, kaydırıcılar, nakit payı, canlı %100 göstergesi) ve şablonlar (eşit ağırlık, dengeli hisse/altın/nakit, tamamı nakit, Portföy Sihirbazı önerisi — TL nakit/USD ve fiyatı olmayanlar nakde), onaydan önce komisyon önizlemesi. Detay: varlık/sınıf halkası, hedef–güncel ağırlık ve sapma + yeniden dengeleme (önce satış, sonra alış), "Nakit ve varlık sınıflarının yeri", her varlığın toplam getiriye katkısı (yüzde puan; kapanan pozisyonlar dahil, toplamı = getiri), "Ne olursa?" şok simülatörü (ağırlık × değişim), gerçekleşen ve 90 günlük simüle değer grafiği, sade dille risk metrikleri (oynaklık, en büyük düşüş, Sharpe, etkin varlık sayısı/HHI, devir hızı), al/sat (USD tutarı ya da miktar) ve işlem geçmişi. Karşılaştırma (≤ 3): 100'e normalleştirilmiş eğriler, getiri/risk/nakit/çeşitlendirme ve sınıf karışımı. Altyapı: USD bazlı **sanal portföy motoru** (`backend/src/services/sandbox/`, migration 022; Portföy Ligi de bunu kullanır), `sandbox-snapshots` işi (saatlik + gün sonu), KVKK dışa aktarma/silme, ortak bileşenler (`frontend/src/components/sandbox/`).
- [x] **Ortak Akıl — Öneri Havuzu** (`/ortak-akil`, `/ortak-akil/yeni`, `/ortak-akil/[id]`, `/ortak-akil/karsilastir?ids=…`, "İzlediklerim" = `/ortak-akil?gorunum=izlediklerim`): yatırım fikirlerinin yapılandırılmış kaydı — varlık (Haftalık Seçim'in güncel fiyatlı varlık araması), duruş (al / sat / izle), vade, gerekçe (80–2000), beklenen senaryo (+ isteğe bağlı iyimser / temel / kötümser), riskler, izleme kriterleri (hedef, geçersizlik seviyesi, değerlendirme tarihi — en az biri; seviyeler duruşa göre doğrulanır), etiketler, kapsam (herkese açık ya da yalnızca seçilen ligin üyeleri). Yayında saklanmış fiyat referans alınır (fiyat + kote para birimi + fiyat zamanı); yayından beri performans canlı ('sat' için yön ayarlı, 'izle' düz değişim), kapanışta fiyat dondurulur. Yaşam döngüsü: açık → izleme notları (zaman çizelgesi; seviye aşımı / değerlendirme tarihi olayları otomatik) → zorunlu "Değerlendirme" + sonuç etiketi (beklendiği gibi / kısmen / beklenmedik) ile kapanış. Topluluk: beğeni yerine gerekçeli "Katılıyorum / Katılmıyorum" (kullanıcı başına bir, düzenlenebilir; iki sütunda gerekçeler), yorumlar (15 sn / günde 30), "İzlemeye al"; popülerlik sıralaması yok (en yeni · değerlendirme bekleyenler · kapananlar). 2–3 öneriyi yan yana karşılaştırma, yazarın sakin başarı kaydı (yayınlanan / kapanan, "beklendiği gibi" payı, ortalama kapanma süresi; herkese açık profilde de). Sorumlu kullanım: günde 5 öneri, düz metin (bağlantılar tıklanamaz), e-posta doğrulaması, şikâyet → yönetim paneli `/ideas` kuyruğu (gizle / göster / yorum kaldır; denetim kaydı `ideas.hide`, `ideas.unhide`, `ideas.comment_delete`, `ideas.report_resolve`). Bildirimler (toplu / öneri başına saatte bir): yanıt / yorum, değerlendirme tarihi, seviye aşımı (her biri bir kez; günlük `idea-reviews` işi), izlenen önerinin kapanması. Her ekranda "Önerilerin kayıt altına alınması, tek başına yatırım tavsiyesi veya işlem onayı anlamına gelmez." notu. Migration 024, KVKK dışa aktarma/silme, birim + API + E2E duman testleri.
- [x] **Portföy Ligi** (Ligler içinde yeni tür, `/leagues` → "Lig oluştur" → "Portföy ligi"): herkes aynı başlangıç sermayesi (10.000 / 100.000 / 1.000.000 USD), ölçüm dönemi (1 gün – 1 yıl) ve işlem maliyetiyle (%0 / %0,10 / %0,25 / %0,50) yarışır; kurallar lig başlayınca kilitlenir (servis + veritabanı tetikleyicisi) ve lig sayfasındaki "Adil yarış kuralları" kutusunda gerçek sayılarla gösterilir. Bireysel ya da takım (2–5 kişi, en fazla 10 takım; takım kodu, kaptan; takımın her üyesi aynı portföyde işlem yapar, işlemi yapan kaydedilir). Başlangıçta her katılımcıya / takıma sanal portföy açılır ("Portföyün hazır: 100.000 USD" bildirimi); dönemin ilk %20'sinde geç katılan aynı sermayeyle "Geç katıldı" işaretli girer, sonra katılım kapanır; başlamadan / bittikten sonra işlem yok; bitişte portföyler dondurulur ve sıra, getiri, değer, en büyük düşüş, oynaklık, işlem sayısı, devir hızı ve stil etiketleri saklanır (sıra bildirimi). Sekmeler: Portföyüm / Takım portföyü (al-sat, hedef ağırlıkla dengeleme, pozisyonlar, dağılım, işlem geçmişi + yapan kişi), Sıralama (benim satırım vurgulu; takım satırı üyelere açılır), Performans (ilk 5 + ben, 100'e normalize; haftalık / aylık dönem getirileri), Stratejiler (başlamadan beyan — başlayınca herkese açılır — ve bitince değerlendirme; sonuç ve davranıştan türetilen etiketler: Yoğun işlem, Al-tut, Yoğunlaşmış, Çeşitlendirilmiş, Nakit ağırlıklı). Lig listesi / keşfet / davet önizlemesinde "Portföy ligi" rozeti; mevcut ligler (`mode = 'main'`) değişmedi. Yönetim panelinde mod ve kurallar, lig detayı (katılımcılar / takımlar, sonuçlar) ve devam eden ligi "Şimdi bitir" (denetim: `league.finalize`). Migration 023, KVKK dışa aktarma/silme, birim + API + E2E duman testleri.
- [x] **Global Portföy Lab** (`/global-lab`, `/global-lab/[sembol]`) ve **abonelik altyapısı** (`/abonelik`). *Araştır* (ücretsiz): Excel'in yerini alan küresel araç kataloğu (~48 araç: ülke / bölge hisse ETF'leri ve endeksler, ABD / Avrupa / GO / TL tahvilleri, altın ve emtia, GYO'lar, BTC / ETH, TL nakit) — bölge, varlık sınıfı, araç türü, para birimi, risk (1–7, SRI benzeri) ve arama filtreleri; araç detayı (sınıflandırma, kısa açıklama, gider oranı, uygulamada fiyatı varsa canlı fiyat + 24 sa değişim, araştırma notları — ücretsizde yalnızca başlık), araştırma listesi. *Sınıflandır* (ücretsiz): 4 araca kadar yan yana karşılaştırma ve bölge × varlık sınıfı matrisi (boş hücreler = alternatifi olmayan alanlar). *Senaryo* (Premium; ücretsizde sakin yükseltme kartı + salt okunur örnek): sınıf × bölge hücreleri ya da katalog araçlarıyla %100 dağılım, USD / TL bazı, vade ve tutar → örnek uzun vadeli varsayımlardan beklenen getiri / oynaklık / Sharpe, Monte Carlo yelpazesi (Portföy Sihirbazı motoru, sabit tohum), zarar olasılığı, 1 yıllık VaR %95, maksimum düşüş, risk katkıları, çeşitlendirme (etkin bahis sayısı — Meucci, etkin varlık sayısı, bölge / para birimi yoğunlaşması, Türkiye yerel ağırlığı), stres testleri (2008, 2020, 2022, TL şoku; TL bazında kur şokuyla), senaryo kaydetme ve 3 senaryoya kadar karşılaştırma. Her ekranda "Eğitim amaçlı analiz · varsayımlar örnektir · yatırım tavsiyesi değildir". **Abonelik:** `free` / `premium` planları, kullanıcı başına bir kez 14 günlük deneme (`POST /api/subscriptions/trial`), sunucu tarafı yetki çözümlemesi (`GET /api/me/entitlements`, `requireEntitlement()` → `402 SUBSCRIPTION_REQUIRED` + plan bilgisi), `subscriptions-expire` işi (süre dolumu + bitişe 3 gün kala hatırlatma), `<PremiumGate>` bileşeni ve `useEntitlements` kancası; ödeme sağlayıcısı yok ("Ödeme altyapısı yakında"; `source = 'payment'` dikişi hazır). **Yönetim paneli:** `/global-lab` (katalog CRUD + CSV içe/dışa aktarma ve önizleme, araştırma notları CRUD + CSV, varsayım tablosu ve korelasyon matrisi düzenleyici — PSD kontrolü, stres senaryoları) ve `/subscriptions` (liste / filtre / arama, Premium tanımla / uzat / sonlandır — not zorunlu; denetim `subscription.grant` / `subscription.revoke`, `global_lab.*`), kullanıcı detayında Premium rozeti. Migration 025, KVKK dışa aktarma / silme, birim + API + E2E duman testleri.

## Oyun Merkezi: Slot Makinesi — "Olasılık dersi" ✅

- [x] **Slot Makinesi** (`/oyun/slot`; hub'da "Haftalık Seçim"ten önce "Slot Makinesi · Olasılık dersi" kutusu): yalnızca oyun içi jetonla oynanan, **sorumlu ve eğitsel** bir olasılık oyunu ("Kasa her zaman kazanır"). 3 makara, tek ödeme çizgisi; finans temalı semboller (Ayı, Dolar, Petrol varili, Boğa, Altın külçe, Bitcoin, Roket, Yıldız). Sembol ağırlıkları ve ödeme tablosu `backend/src/services/game/config.ts`'te (`SLOT_*`); her kombinasyonun **tam olasılığı** (ör. 3× Yıldız 1 / 8.000), RTP **%95** ve kasa avantajı **%5** aynı tablodan 8³ sonucun tam sayımıyla hesaplanıp gösterilir (test: hesaplanan RTP = gösterilen). Sunucu belirler: her makara `crypto.randomInt` ile bağımsız seçilir; bahis düşümü ve kazanç tek transaction'da jeton defterine (`slot_bet` / `slot_win`, ref = istemcinin `request_id`'si → idempotent) yazılır; yetersiz jetonda `400 INSUFFICIENT_COINS`. Manipülasyon yok: makaralar soldan sağa, sonuçtan bağımsız sabit sürelerle gerçek sonuçta durur (tasarlanmış yakın kaçış yok, pencerede yalnızca ödeme çizgisi görünür), otomatik çevirme / hızlandırma yok, "kazanç gibi görünen kayıp" yok (kazanç bahisten azsa "Kayıp: −X jeton"; konfeti yalnızca net ≥ 5× bahis), ses varsayılan kapalı (oyun ses anahtarı). Sınırlar sunucuda: bahis 5 / 10 / 25, çevirmeler arası ≥ 1,5 sn (`429 SLOT_COOLDOWN`), günde 100 çevirme, günlük 250 jeton net kayıp (aşacak bahis reddedilir; İstanbul gece yarısına kadar `429 SLOT_DAILY_LOSS_LIMIT`), oturumda her 25 çevirmede durum özeti ("25 çevirmede net −40 jeton. Teorik beklenti −31. Devam mı, mola mı?"; onaysız sonraki çevirme `409 SLOT_REALITY_CHECK`); 18+ onayı ve kendi molası zorunlu (Arena günlük tur sınırı uygulanmaz). Her zaman görünen ders paneli: beklenen değer, kendi kümülatif getirin ile teorik −%5 çizgisi ve daralan %95 aralığı (büyük sayılar yasası), "Pozitif beklenen getiri nerede?" (Portföy Sihirbazı, Model Portföy). Yönetim paneli → Arena → "Slot Makinesi" kartı: aç/kapat (`app_settings.slot_enabled`, denetim `settings.slot_toggle`; kapalıyken kutu gizli, API `410 SLOT_DISABLED`; production'da varsayılan kapalı) ve toplu istatistikler (çevirme, oyuncu, bahis, gerçekleşen RTP, kayıp sınırındaki oyuncular). Migration 026, KVKK dışa aktarma/silme (`slot_spins`), birim + API + E2E duman testleri. Canlıya almadan önce hukuk incelemesi: `docs/YAYIN_KONTROL_LISTESI.md` §5.
- [x] Bitmiş Portföy Ligi'nde "Portföyüm" ekranı portföyü bitiş anındaki fiyatlarla gösterir (sıralamayla tutarlı; `sandbox_portfolios.frozen_prices`, 027). Menü: Analiz (Portföy Sihirbazı, Model Portföy, Global Portföy Lab), Rekabet ve topluluk (Ortak Akıl), Abonelik; komut paleti girişleri.

## Marka ve geliştirici deneyimi ✅

- [x] **Yeni logo:** dolu, köşeleri yumuşatılmış "P"; iç boşluğu yukarı-sağa yükselen ok ("Go"). Uygulama içi bileşen `packages/shared/src/ui/Logo.tsx` (varyantlar: marka, ters, tek renk); statik dosyalar `frontend/public/brand/` (favicon 16/32/48 `.ico`, SVG ikon, Apple 180, PWA 192/512 + maskable, yatay logo açık/koyu) — üretici: `node scripts/brand/build-brand-assets.mjs`. Paylaşım (OG) görselleri ve e-posta şablonları (doğrulama, şifre sıfırlama, haftalık özet, abonelikten çıkma) yeni marka rengine (#465FFF) taşındı; eski mor tonlar kaldırıldı.
- [x] **Yerelde otomatik giriş:** `next dev` + yerel veritabanında oturum yoksa site ve yönetim paneli demo hesabıyla kendiliğinden giriş yapar (`packages/shared/src/devAutoLogin.ts`). Çıkış yapınca o sekmede durur; `?manuel` ile ya da `NEXT_PUBLIC_DEV_AUTO_LOGIN=0` ile kapatılır; E2E / otomasyon tarayıcılarında ve production derlemesinde çalışmaz (backend hızlı giriş ucu zaten yalnızca yerel DB'de açık).
- [x] **Sunum rehberi:** `docs/SUNUM.md` (ekran ekran konuşma metni, demo hazırlığı, olası sorular).

## Varlık logoları ✅

- [x] **Piyasadaki varlıkların logoları** (hisse, kripto, döviz, emtia) depoda: `frontend/public/logos/{stock,crypto,currency,commodity}/<SEMBOL>.svg` (+ yönetim paneli için birebir kopya `admin/public/logos/`). Çalışma anında dış adrese logo isteği yok. `AssetAvatar` (sitede ~26 yer + yönetim panelinde işlem / emir tabloları ve kullanıcı pozisyonları) önce yerel logoyu, yoksa sağlayıcı görselini, o da yoksa baş harfleri gösterir; tipli manifest (`packages/shared/src/assetLogos.generated.ts`, yardımcılar `assetLogos.ts` → `assetLogoSrc`) sayesinde olmayan dosyaya istek atılmaz (404 yok). Yuvarlak çerçeve + ince `fg/10` iç halka: açık ve koyu temada okunur.
  - Kaynaklar (sabit sürüm + npm sha512 doğrulaması): kripto `cryptocurrency-icons@0.18.1` (CC0, 98 coin) + bu pakette olmayan coinler için `simple-icons` yedeği (TON, SUI, NEAR, HBAR, OP, PI, HNT, ENS; hisse rozetiyle aynı stil), döviz bayrakları `flag-icons@7.5.0` (MIT, 68 para birimi), hisse markaları `simple-icons@16.33.0` (CC0 simge verisi; marka rengi dairede glif, 114 hisse) + simple-icons'ta olmayan MSFT (dört renkli kare ızgarası) ve AMZN (turuncu "a" monogramı) için kendi çizdiğimiz işaretler (`scripts/logos/stock-marks.mjs`). Emtialar için **kendi çizimimiz** 19 simge (ons altın / gümüş külçe yığını, gram altın kartı, platin / paladyum / alüminyum külçe, bakır bobini, Brent varili, WTI damlası, doğal gaz alevi, ısıtma yağı, benzin pompası, buğday, mısır, pamuk, şeker, soya, kahve, kakao) + Arena / Global Lab kodları için takma adlar (XAUUSD, XAGUSD, BRENT, GOLDTRY …).
  - Üretici: `node scripts/logos/fetch-logos.mjs` (`--check` ile CI doğrulaması; bkz. `scripts/logos/README.md`). İzin listesi tabanlı SVG temizleyici (betik, olay işleyici, dış bağlantı, `foreignObject` yok; her dosyada `viewBox`), `/logos/*` için `sandbox` CSP ve içerik özetli (`?v=`) 1 yıllık önbellek. Toplam 309 dosya, ~378 KB (uygulama başına). Arena tur ekranındaki enstrüman çipleri (EUR/USD, altın, gümüş, Brent, Bitcoin) ve Global Lab katalog satırları (site + yönetim; `provider_symbol` ile uygulamadaki bir varlığa bağlı araçlar) da aynı logoları gösterir.
  - Kapsanmayanlar baş harf gösterir: Broadcom (CC0 dışı lisans), iki pakette de olmayan yeni coinler (HYPE, SHIB, PEPE, APT, ARB …), boyutu büyük bayraklar (MXN, RSD, TMT). Atıf ve marka notu: `frontend/public/logos/ATTRIBUTION.md`; hukuk incelemesi kontrol listesinde.
