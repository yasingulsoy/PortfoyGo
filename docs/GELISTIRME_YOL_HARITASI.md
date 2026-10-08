# PortfoyGo — Geliştirme Yol Haritası

**Son güncelleme:** 8 Ekim 2026  
**Durum işaretleri:** ✅ tamamlandı · 🚧 bu dalgada yapılıyor · 🔜 sıradaki · 💡 fikir / değerlendirilecek

Bu doküman, projenin baştan sona incelenmesinin ardından "demo" seviyesinden **yayına hazır, rekabetçi bir ürüne** geçiş için yapılması gerekenleri öncelik sırasıyla toplar. Her başlıkta *neden önemli* olduğu ve *bitti sayılma kriteri* yazılıdır.

---

## 0. Kuzey yıldızı

> **"Türkiye'nin en güvenilir ve en keyifli yatırım simülatörü."**
> Gerçek veriyle, sıfır riskle yatırım öğrenilen; arkadaşlarla, okullarla ve topluluklarla yarışılan bir platform.

Üç ilke her kararda geçerli:

1. **Adil oyun:** Fiyatı her zaman sunucu belirler, hile yapılamaz. Liderlik tablosu güvenilir değilse ürün yoktur.
2. **Öğretici deneyim:** Her ekran kullanıcıya bir şey öğretmeli: neden kazandı, neden kaybetti.
3. **Hızlı ve sade:** Bir işlem en fazla 3 tıklama sürmeli, sayfalar mobilde 1 saniyede açılmalı.

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

---

## 2. Bu dalgada yapılanlar 🚧

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

---

## 3. Sıradaki: Mimari yeniden yapılanma 🔜

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

- [ ] Kökteki Next.js uygulamasını `frontend/` klasörüne taşı; yollar, CI ve README güncellensin.
- [ ] `admin/` iskeletini gerçek yönetim paneline dönüştür: kullanıcılar, işlemler, emirler, önbellek, sistem sağlığı. Ayrı port ve ayrı alan adı (`admin.portfoygo.com`), yalnızca admin oturumu.
- [ ] `packages/shared`: API tipleri ve zod şemaları tek yerde olsun; frontend ve backend aynı sözleşmeyi kullansın.
- [ ] Kök `npm run dev` üç uygulamayı birlikte başlatsın.

**Bitti kriteri:** `npm install && npm run dev:local` ile üç uygulama ayağa kalkıyor, CI her paketi ayrı ayrı test ediyor.

---

## 4. Ürün ve oyun mekaniği

### 4.1 Rekabet (en yüksek etki) 🔜
- [ ] **Sezonlar:** Aylık sezonlar; sezon başında herkes 100.000 ₺ ile başlar, tüm zamanlar sıralaması ayrıca korunur. Sezon sonunda rozet ve unvan verilir.
- [ ] **Özel ligler:** Kullanıcı bir lig kurar, davet koduyla arkadaşlarını çağırır (okul, şirket, Discord topluluğu). *B2B'ye açılan kapı budur.*
- [ ] **Turnuvalar:** Belirli tarih aralıkları, kısıtlı varlık evreni (ör. "Sadece BIST 30"), giriş koşulları.
- [ ] Liderlik tablosunda risk ayarlı getiri (Sharpe) ve maksimum düşüş gösterimi; yalnızca "en çok kazanan" değil, "en istikrarlı" da ödüllendirilsin.

### 4.2 İşlem deneyimi
- [x] Piyasa emri · 🚧 limit, zarar durdur ve kâr al emirleri
- [ ] Takip eden stop (trailing stop)
- [ ] Kısmi pozisyon kapatma kısayolları (%25/%50/%100) ve "pozisyonu kapat" tek tıkla
- [ ] Döviz için gerçekçi alış/satış makası (şu an iki yönde de satış kuru kullanılıyor)
- [ ] 💡 Açığa satış (short) ve kaldıraç. Oyunu derinleştirir ama risk eğitimiyle birlikte sunulmalı.

### 4.3 Piyasa kapsamı
- [ ] **BIST hisseleri:** Türk kullanıcı için en doğal piyasa. Gecikmeli veri lisansı ve sağlayıcı (ör. Matriks, Foreks veya ücretli API) araştırılmalı.
- [ ] Daha geniş ABD hisse listesi (şu an 10 sabit sembol; `STOCK_SYMBOLS` ile genişletilebilir ama kota planı gerekir).
- [ ] Piyasa saatleri: borsa kapalıyken hisse emirleri sıraya alınsın, açılışta işlensin.
- [ ] Fonlar ve ETF'ler.

### 4.4 Öğrenme
- [ ] İşlem sonrası mini analiz: "Bu işlemde %X kazandın; ortalama maliyetin şuydu…"
- [ ] Haftalık e-posta raporu: performans, en iyi ve en kötü işlem, sıralama değişimi.
- [ ] Varlık sayfalarında kısa, sade açıklamalar ("Bu şirket ne yapar?", "Volatilite nedir?").
- [ ] 💡 Yapay zekâ destekli "portföy koçu": risk dağılımı ve çeşitlendirme önerileri. Yatırım tavsiyesi değil, eğitim amaçlı.

### 4.5 Sosyal
- [ ] Herkese açık profil sayfası (`/u/kullaniciadi`) ve paylaşılabilir performans kartı (OG görseli)
- [ ] Başarılı yatırımcıları takip etme, işlemlerini gecikmeli görme
- [ ] Rozetlerin genişletilmesi: seriler (7 gün üst üste giriş), sezon rozetleri

---

## 5. Tasarım ve kullanıcı deneyimi

- [x] Token tabanlı tasarım sistemi, açık ve koyu tema, mobil alt menü
- [ ] 🔜 **Bileşen kataloğu** (Storybook veya `/dev/ui` sayfası): Button, Card, Modal, Tabs vb. tek yerde dokümante edilsin.
- [ ] 🔜 Varlık tablolarında **sparkline** (mini 7 günlük grafik). Bunun için backend'de fiyat geçmişi tablosu gerekiyor.
- [ ] Gerçek zamanlı his: SSE veya WebSocket ile fiyat akışı (polling yerine)
- [ ] Bildirim merkezi: emir gerçekleşti, rozet kazanıldı, sıralama değişti
- [ ] Boş, hata ve yükleme durumlarının tüm sayfalarda tutarlı olduğu bir UX denetimi
- [ ] Erişilebilirlik denetimi (axe/Lighthouse ≥ 95), ekran okuyucu ile uçtan uca test
- [ ] Mikro etkileşimler: işlem sonrası konfeti yerine sade "başarılı" animasyonu, sayı geçişleri
- [ ] İngilizce dil desteği (i18n altyapısı; metinler tek dosyada toplanır)

---

## 6. Teknik kalite

### 6.1 Test
- [ ] 🚧 Backend entegrasyon testleri (para mantığı)
- [ ] 🔜 Frontend bileşen testleri ve **Playwright uçtan uca testleri** (kayıt → doğrulama → alım → satış → liderlik)
- [ ] Kapsama hedefi: para ile ilgili servislerde %90 ve üzeri

### 6.2 Backend mimarisi
- [ ] Katmanların netleşmesi: route → controller → service → repository. SQL tek katmanda kalsın.
- [ ] Cron işlerinin API'den ayrılması: ayrı bir **worker** süreci (emir işleme, fiyat yenileme, anlık görüntüler). Birden çok API örneği çalıştırıldığında işlerin iki kez yapılmaması için PG advisory lock.
- [ ] Önbellek katmanı: Redis (fiyatlar, liderlik tablosu, rate limit sayaçları). Rate limit şu an bellek içinde, çoklu örnekte çalışmaz.
- [ ] OpenAPI (Swagger) dokümantasyonu: zod şemalarından otomatik üretilsin.
- [ ] Yapılandırılmış loglama (pino) ve istek kimliği (request-id).

### 6.3 Gözlemlenebilirlik
- [ ] Hata takibi: Sentry (frontend ve backend)
- [ ] Sağlık uçları: `/healthz` ve `/readyz` (DB, fiyat tazeliği, cron son çalışma zamanı)
- [ ] Metrikler: istek süresi, emir işleme gecikmesi, harici API hata oranı, kota kullanımı

### 6.4 Performans
- [ ] Sunucu bileşenleri (RSC) ile ilk yüklemede veri: landing, haberler, liderlik
- [ ] Görünmeyen sekmede polling'in durdurulması (`refreshWhenHidden: false`)
- [ ] Bundle analizi; lightweight-charts yalnızca gerektiğinde yüklensin (zaten dinamik)
- [ ] Hedef Core Web Vitals: LCP < 2,0 sn, INP < 200 ms, CLS < 0,05

---

## 7. Güvenlik (kalan işler)

- [ ] 🚧 httpOnly çerez ve CSRF (bu dalga)
- [ ] 🔜 Git geçmişinin temizlenmesi (`git filter-repo`) ve **sızmış Finnhub anahtarının yenilenmesi**
- [ ] İki faktörlü doğrulama (TOTP), özellikle admin hesapları için zorunlu
- [ ] Bot ve çoklu hesap tespiti: kayıtta Cloudflare Turnstile, aynı cihaz veya IP'den çoklu hesap uyarısı (liderlik adaleti için)
- [ ] Admin işlemleri için denetim kaydı (kim, kimi, ne zaman banladı)
- [ ] Content-Security-Policy başlığı (frontend)
- [ ] KVKK: hesap silme ve veri indirme (self-servis), çerez politikası

---

## 8. DevOps ve yayına alma

- [ ] 🔜 Dağıtım hedefi önerisi: Frontend ve admin → Vercel. Backend ve worker → Railway, Render veya Fly.io. Postgres → Neon veya Supabase (yönetilen, yedekli).
- [ ] Ortamlar: `development` (yerel PGlite) → `staging` → `production`; her PR için önizleme ortamı
- [ ] Otomatik migration: deploy adımında `npm run migrate`, öncesinde otomatik yedek
- [ ] Gizli değişkenler yalnızca platformun secret yöneticisinde
- [ ] Docker imajları (backend ve worker) ve `docker compose` ile tam yerel ortam alternatifi
- [ ] Günlük DB yedekleri ve geri yükleme provası

**Yayına hazır kontrol listesi:** migration'lar uygulandı · secret'lar yenilendi · CI yeşil · E2E testleri geçiyor · Sentry bağlı · yedekleme açık · rate limit'ler Redis'te · KVKK metinleri hukukçu onaylı.

---

## 9. Veri sağlayıcıları ve maliyet

| Veri | Şu an | Risk | Öneri |
| --- | --- | --- | --- |
| ABD hisseleri | Finnhub ücretsiz katman (10 sembol) | Dakikada 60 çağrı; geçmiş mum verisi ücretsiz katmanda yok, bu yüzden hisse grafikleri boş | Ücretli plan veya Polygon/Twelve Data; fiyat geçmişini kendi DB'mizde biriktirmek |
| Kripto | CoinGecko ücretsiz | Hız sınırı | Demo anahtarı (ücretsiz) + önbellek; ölçeklenince Pro |
| Döviz ve emtia | NosyAPI (kredi bazlı) | Kredi tükenirse veri durur | Saatlik önbellek (yapıldı); yedek kaynak olarak TCMB kurları |
| Haberler | RSS (bsekonomi) | Tek kaynak | Birden çok RSS kaynağı ve kategori eşleme |

---

## 10. Gelir modeli (değerlendirme)

- 💡 **Kurumsal ve eğitim lisansı:** Okullar, üniversite kulüpleri ve aracı kurumların eğitim programları için özel lig, öğretmen paneli ve raporlama. *En gerçekçi gelir kalemi.*
- 💡 **Sponsorlu turnuvalar:** Aracı kurum ve fintech sponsorluğu, ödüllü yarışmalar (yasal çerçeve kontrol edilmeli).
- 💡 **Premium üyelik:** Gelişmiş analizler, sınırsız izleme listesi, ek emir türleri, reklamsız deneyim.
- ❌ Gerçek para yatırma veya gerçek yatırım yönlendirmesi: SPK düzenlemeleri nedeniyle kapsam dışı.

---

## 11. Başarı metrikleri

| Metrik | Hedef (ilk 6 ay) |
| --- | --- |
| Kayıt → ilk işlem dönüşümü | ≥ %60 |
| D7 / D30 tutundurma | ≥ %25 / ≥ %12 |
| Haftalık aktif kullanıcı başına işlem | ≥ 5 |
| E-posta doğrulama oranı | ≥ %70 |
| p95 API yanıt süresi | < 300 ms |
| Hatasız işlem oranı | ≥ %99,9 |

---

## 12. Önerilen sıra (özet)

1. **Bu dalga** (🚧): yerel DB, testler ve CI · çerez oturumu · limit ve kâr al emirleri · performans grafiği · izleme listesi · landing · komut paleti
2. **Klasör ayrımı:** `frontend/` · `admin/` · `backend/` · `packages/shared`
3. **Yayına hazırlık:** secret yenileme, git geçmişi temizliği, staging, Sentry, yedekleme, E2E testleri
4. **Rekabet:** sezonlar ve özel ligler
5. **Kapsam:** BIST, piyasa saatleri, gerçek zamanlı fiyat akışı
6. **Büyüme:** herkese açık profiller, paylaşılabilir kartlar, haftalık e-posta raporu, kurumsal paket
