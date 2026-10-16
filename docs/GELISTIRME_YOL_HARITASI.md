# PortfoyGo — Geliştirme Yol Haritası

**Son güncelleme:** 8 Ekim 2026 (ikinci dalga ve klasör ayrımı tamamlandı)  
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

---

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
- [ ] 🔜 Panele işlemler, emirler, sistem sağlığı ve denetim kaydı ekranları; ayrı alan adı (`admin.portfoygo.com`).
- [x] `packages/shared` (`@portfoygo/shared`): tasarım token'ları, UI bileşenleri, biçimlendirme ve API istemci çekirdeği.
- [ ] 🔜 API tipleri ve zod şemalarının da `packages/shared`'a alınıp frontend ile backend'in aynı sözleşmeyi kullanması.
- [x] Kök `npm run dev` ve `npm run dev:local` üç uygulamayı birlikte başlatıyor.
- [x] Dış veri sağlayıcıları ortak arayüz (`backend/src/providers`) arkasına alındı. Entegrasyonların içi değişmedi; yeni API için tek adaptör dosyası yeterli.

**Bitti kriteri:** `npm install && npm run dev:local` ile üç uygulama ayağa kalkıyor, CI her paketi ayrı ayrı test ediyor.

---

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
- [ ] 🔜 Docker imajlarının gerçek ortamda derlenip denenmesi; staging ortamı; Sentry.

## 3.6.1 Ligler v2 ve bildirim merkezi ✅

- [x] Zamanlı ligler: başlangıç saati + süre (1 gün … 3 ay), adil başlangıç (başlamadan katılan herkes başlangıç anındaki varlığından ölçülür), bitişte sıralamanın dondurulması ve şampiyonluk ekranı.
- [x] Herkese açık ligler ve "Keşfet" (kodsuz katılım), lig akışı (üyelerin son işlemleri, tutarsız), canlı geri sayım ve animasyonlu sıra değişimleri.
- [x] Bildirim merkezi: zil + açılır panel, bildirimler sayfası, SSE ile anlık iletim ve toast; emir, rozet, sezon, lig ve hesap olayları; kategori tercihleri; yönetim panelinden duyuru.
- [ ] 🔜 Herkese açık bir lige üye olmadan detay/sıralama görüntüleme (şu an yalnızca üyeler görebiliyor), profilde "Lig birincilikleri", çoklu sunucu için Redis pub/sub.

## 3.6.2 Arena ve Portföy Sihirbazı ✅ (toplantı kararlarının ilk uygulaması)

- [x] **Arena (hızlı al-sat):** 4 enstrüman (EUR/USD, altın, Brent, BTC), tek dokunuşla uzun/kısa, zarar kes/kâr al, alış/satış makası, canlı K/Z; 1–10 dakikalık bireysel turlar ve yöneticinin planladığı sponsorlu canlı meydan okumalar. Fiyatlar sunucuda üretilir: gerçek geçmiş hareketin hızlandırılmış tekrarı (tur sonunda gerçek tarih açıklanır). Saatlik tur sınırı ve "sanal para" uyarıları.
- [x] **Portföy Sihirbazı:** 8 soruluk risk anketi → 5 profil; kısıtlı ortalama-varyans optimizasyonu, Monte Carlo (beklenen getiri aralığı, zarar olasılığı, VaR, maksimum düşüş); mevcut portföyle sapma; tek tıkla sanal portföye uygulama. Algoritma deterministik, arka planda; YZ sohbeti yok.
- [ ] 🔜 Gerçek zamanlı kotasyon sağlayıcısı geldiğinde Arena'ya "canlı" mod; H.Burak'ın anket taslağı ve TL nakit getiri varsayımının netleşmesi.
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
- [ ] 🔜 Ekonomi dengesinin gerçek kullanıcı verisiyle ayarı (`backend/src/services/game/config.ts`, `backend/src/services/idle/config.ts`); haftalık düello ligi ve sezonluk kademe ödülleri; Art ile oyun akışı ve etkinlik formatı gözden geçirmesi.

## 3.7 Ekip toplantısı kararları (8 Ekim 2026) 📌

Ürün iki hedefe hizmet edecek:
1. **Oyuncu odaklı hızlı al-sat:** az sayıda enstrüman (EUR/USD, altın, petrol, BTC/gümüş), tek dokunuşla işlem, sürekli haber akışı, kısa periyotlu ligler ve sunuculu canlı "challenge" etkinlikleri. Ekran: sağda kotasyon akışı, ortada büyük al-sat düğmeleri, altta anlık K/Z.
2. **Yatırımcı eğitimi ve portföy:** risk profili anketi → beklenen drawdown/volatilite ile önerilen dağılım (Monte Carlo, modern portföy teorisi). Yapay zekâ algoritmayı arka planda kurar; kullanıcı her karar için YZ'ye sormaz.

Diğer notlar: gerçek zamanlı veri (bid/ask dahil) kritik ama maliyetli; lisanslı sağlayıcı gerekli (kazıma IP engeli riski). Gelir: sponsor ödülleri, veri satışı, premium analiz/portföy, reklam/ortaklık. MVP önerisi: demo lig + ~3 enstrüman + gecikmeli veri, ~1.000 kişilik test. Risk: kumar benzeri yüksek frekans → sorumlu oyun tasarımı ve uyarılar. Ayrıca: Goat Problem tarzı oyunlar, ekspres trader ekranları, zarar kes/kâr al, animasyonlu rekabetçi oyunlar.

Eylemler: Yasin canlı veri gereksinimleri · Art oyun akışı ve lig/etkinlik formatı · Koray veri sağlayıcı ve maliyet · H.Burak risk anketi soruları ve YZ senaryoları · Ekip MVP kapsam toplantısı (15 Ekim 2026'ya kadar).

## 4. Ürün ve oyun mekaniği

### 4.1 Rekabet (en yüksek etki)
- [x] **Sezonlar:** Aylık ve getiri bazlı. Bakiyeler sıfırlanmıyor; herkes sezona girdiği andaki varlığına göre yüzde getiriyle sıralanıyor. Ay sonunda sıralama donduruluyor; sezonda en az bir işlem yapmış ilk 10'a unvan veriliyor (Sezon Şampiyonu, Sezon Podyumu, Sezonun İlk 10'u).
- [x] **Özel ligler:** Davet koduyla katılım ve paylaşılabilir bağlantı. Katılımdan itibaren getiri sıralaması. Kurucu üye çıkarabilir, kodu yenileyebilir ve ligi silebilir (lig başına en fazla 50 üye, kullanıcı başına 10 lig).
- [ ] 🔜 Lig bitiş tarihinde sıralamanın dondurulması, lig sohbeti ve duyuruları, kurumsal (okul/şirket) lig paneli.
- [ ] **Turnuvalar:** Belirli tarih aralıkları, kısıtlı varlık evreni (ör. "Sadece BIST 30"), giriş koşulları.
- [ ] Liderlik tablosunda risk ayarlı getiri (Sharpe) ve maksimum düşüş gösterimi; yalnızca "en çok kazanan" değil, "en istikrarlı" da ödüllendirilsin.

### 4.2 İşlem deneyimi
- [x] Piyasa emri, limit alış/satış, zarar durdur ve kâr al emirleri (limit alışta nakit bloke edilir)
- [x] Takip eden stop (trailing stop): % veya TL mesafe, zirve yalnızca taze fiyatlarla (hisselerde seans içinde) yukarı taşınır; emirler listesinde güncel tetikleme, düzenleme ve iptal (020).
- [x] Kısmi pozisyon kapatma kısayolları (%25/%50/%100) — pozisyonlar tablosu ve Al/Sat penceresi; %100 eldeki miktarın tamamını (kalıntısız) satar. Satır menüsünde "Pozisyonu kapat".
- [x] Döviz için gerçekçi alış/satış makası: alırken satış, satarken alış kuru; Al/Sat penceresinde iki kur. Değerleme sezon ortasında sıçrama olmasın diye satış kurunda bırakıldı (bkz. `backend/migrations/README.md`, 020).
- [ ] 💡 Açığa satış (short) ve kaldıraç. Oyunu derinleştirir ama risk eğitimiyle birlikte sunulmalı.

### 4.3 Piyasa kapsamı
- [ ] **BIST hisseleri:** Türk kullanıcı için en doğal piyasa. Gecikmeli veri lisansı ve sağlayıcı (ör. Matriks, Foreks veya ücretli API) araştırılmalı.
- [ ] Daha geniş ABD hisse listesi (şu an 10 sabit sembol; `STOCK_SYMBOLS` ile genişletilebilir ama kota planı gerekir).
- [x] Piyasa saatleri: NYSE seansı (yaz saati, 2026–2027 tatilleri ve erken kapanışlar); borsa kapalıyken hisse piyasa emri `409 MARKET_CLOSED`, "Açılışta gerçekleştir" ile sıraya alınır (alışta %5 tamponlu rezerv) ve açılıştan sonraki ilk taze fiyatla işlenir; "Piyasa kapalı · açılışa 3 sa 12 dk" rozeti (020). Takvim her yıl güncellenmeli.
- [ ] Fonlar ve ETF'ler.

### 4.4 Öğrenme
- [x] Arena turları için işlem sonrası analiz (Koç Kemal karnesi) ve tarihsel olay senaryoları — ana portföy işlemleri için mini analiz hâlâ açık.
- [ ] İşlem sonrası mini analiz: "Bu işlemde %X kazandın; ortalama maliyetin şuydu…"
- [x] Haftalık e-posta raporu: her Pazartesi 09:00 (İstanbul) geçen haftanın portföy değişimi (%), genel sıralama değişimi, en iyi ve en zorlu satış (ortalama maliyete göre %), Arena turları, Haftalık Seçim sonucu ve kısa bir eğitim notu. TL tutarı yok; tek tıkla abonelikten çıkma (imzalı bağlantı + `List-Unsubscribe`), profilde "Haftalık e-posta özeti" tercihi, kullanıcı + hafta başına tek gönderim (`email_digests`, 019). Geliştirmede gerçek e-posta gitmez (yalnızca önizleme; `EMAIL_DIGEST_SEND=1` ile açılır); önizleme: `GET /api/dev/email/digest-preview?username=demo`.
- [ ] Varlık sayfalarında kısa, sade açıklamalar ("Bu şirket ne yapar?", "Volatilite nedir?").
- [ ] 💡 Yapay zekâ destekli "portföy koçu": risk dağılımı ve çeşitlendirme önerileri. Yatırım tavsiyesi değil, eğitim amaçlı.

### 4.5 Sosyal
- [x] Herkese açık profil sayfası (`/u/kullaniciadi`; oturumsuz açılır, sunucuda render) ve paylaşılabilir performans kartı (sayfaya özel OG görseli). Yalnızca yüzde ve sıralar: başlangıçtan beri getiri, genel sıra, Arena kademe/reyting/düello kaydı/seviye, Haftalık Seçim özeti, İmparatorluk sırası, sezon unvanları, rozetler ve son başarılar. Profil → "Profil görünürlüğü" ile gizlenebilir (`users.profile_public`, 019). Liderlik, lig, Haftalık Seçim ve Arena sıralamalarındaki kullanıcı adları profile bağlanır; Arena sonucu, Haftalık Seçim sonucu ve İmparatorluk sırası "Paylaş" düğmesiyle (Web Share → panoya kopyalama) profil bağlantısıyla paylaşılır.
- [ ] Başarılı yatırımcıları takip etme, işlemlerini gecikmeli görme
- [x] Oyun içi günlük seri (7. gün bonusu) ve kozmetik ödüller; herkese açık oyun profili uç noktası (`/api/game/public-profile/:username`)
- [ ] Rozetlerin genişletilmesi: seriler (7 gün üst üste giriş), sezon rozetleri

---

## 5. Tasarım ve kullanıcı deneyimi

- [x] Token tabanlı tasarım sistemi, açık ve koyu tema, mobil alt menü
- [ ] 🔜 **Bileşen kataloğu** (Storybook veya `/dev/ui` sayfası): Button, Card, Modal, Tabs vb. tek yerde dokümante edilsin.
- [x] Varlık tablolarında **sparkline** (mini 7 günlük grafik; `price_history` tablosundan)
- [ ] Gerçek zamanlı his: SSE veya WebSocket ile fiyat akışı (polling yerine)
- [x] Bildirim merkezi: emir gerçekleşti, rozet kazanıldı, sıralama değişti (SSE ile canlı; bkz. 3.6.1)
- [ ] Boş, hata ve yükleme durumlarının tüm sayfalarda tutarlı olduğu bir UX denetimi
- [ ] Erişilebilirlik denetimi (axe/Lighthouse ≥ 95), ekran okuyucu ile uçtan uca test
- [ ] Mikro etkileşimler: işlem sonrası konfeti yerine sade "başarılı" animasyonu, sayı geçişleri
- [ ] İngilizce dil desteği (i18n altyapısı; metinler tek dosyada toplanır)

---

## 6. Teknik kalite

### 6.1 Test
- [x] Backend entegrasyon testleri (para mantığı, emirler, geçmiş, izleme listesi, sağlayıcılar: 75 test)
- [x] **Playwright uçtan uca testleri** (14 test, CI'da her push'ta) ve frontend birim testleri (vitest, 300+ test)
- [ ] Kayıt → e-posta doğrulama akışının uçtan uca testi (yerelde e-posta kutusu taklidi gerekir)
- [ ] Kapsama hedefi: para ile ilgili servislerde %90 ve üzeri

### 6.2 Backend mimarisi
- [ ] Katmanların netleşmesi: route → controller → service → repository. SQL tek katmanda kalsın.
- [x] Cron işlerinin API'den ayrılması: ayrı **worker** süreci (`src/worker.ts`, `RUN_JOBS`) ve her iş için PG advisory lock (iki örnek aynı işi aynı anda çalıştırmaz)
- [x] İsteğe bağlı Redis (`REDIS_URL`): canlı akış olaylarının örnekler arası dağıtımı, rate limit sayaçları, iş durumu. Liderlik ve piyasa listesi kısa süreli bellek önbelleğinde (örnek başına).
- [ ] OpenAPI (Swagger) dokümantasyonu: zod şemalarından otomatik üretilsin.
- [x] Yapılandırılmış loglama (pino) ve istek kimliği (request-id).

### 6.3 Gözlemlenebilirlik
- [x] Hata takibi: Sentry (backend, `SENTRY_DSN`) + tarayıcı hata raporlayıcı (site ve yönetim paneli → `/api/client-errors`)
- [x] Sağlık uçları: `/healthz` ve `/readyz` (DB, fiyat tazeliği, cron son çalışma zamanı)
- [x] Metrikler: Prometheus `/metrics` (`METRICS_TOKEN`): istek süresi, iş süreleri/atlamaları, açık canlı akış bağlantıları, sağlayıcı hataları
- [x] Yük testi (`scripts/load/`): 1.000 kullanıcılık veriyle gerçek Postgres'te ~1.400 istek/sn, p99 141 ms; liderlik ve piyasa listesi önbelleği + işlem geçmişi indeksi (migration 021)

### 6.4 Performans
- [ ] Sunucu bileşenleri (RSC) ile ilk yüklemede veri: landing, haberler, liderlik
- [ ] Görünmeyen sekmede polling'in durdurulması (`refreshWhenHidden: false`)
- [ ] Bundle analizi; lightweight-charts yalnızca gerektiğinde yüklensin (zaten dinamik)
- [ ] Hedef Core Web Vitals: LCP < 2,0 sn, INP < 200 ms, CLS < 0,05

---

## 7. Güvenlik (kalan işler)

- [x] httpOnly çerez oturumu, CSRF koruması, tüm cihazlardan çıkış
- [ ] 🔜 Git geçmişinin temizlenmesi (`git filter-repo`) ve **sızmış Finnhub anahtarının yenilenmesi**
- [x] İki faktörlü doğrulama (TOTP): Profil → Güvenlik (QR, tek kullanımlık kurtarma kodları, şifreli anahtar — `TOTP_ENC_KEY`), girişte "Doğrulama kodu" adımı; yöneticiler için `ADMIN_REQUIRE_2FA` (production'da varsayılan açık) — migration 018
- [ ] Bot ve çoklu hesap tespiti: kayıtta Cloudflare Turnstile, aynı cihaz veya IP'den çoklu hesap uyarısı (liderlik adaleti için)
- [x] Admin işlemleri için denetim kaydı (kim, kimi, ne zaman banladı) — migration 008
- [x] Content-Security-Policy başlığı (site + yönetim paneli): istek başına nonce + `strict-dynamic` (`proxy.ts`), `frame-ancestors 'none'` (OBS katmanı `/yayin/**` hariç), Referrer-Policy, nosniff, Permissions-Policy
- [x] KVKK: hesap silme (anonimleştirme) ve veri indirme (JSON) self-servis — Profil → Hesap ve veriler; çerez politikası (`/cerez-politikasi`, yalnızca zorunlu çerezler)
- [ ] KVKK metinleri ve "anonimleştirerek saklama" yaklaşımının hukuk onayı (bkz. YAYIN_KONTROL_LISTESI.md §5)

---

## 8. DevOps ve yayına alma

- [ ] 🔜 Dağıtım hedefi önerisi: Frontend ve admin → Vercel. Backend ve worker → Railway, Render veya Fly.io. Postgres → Neon veya Supabase (yönetilen, yedekli).
- [ ] Ortamlar: `development` (yerel PGlite) → `staging` → `production`; her PR için önizleme ortamı
- [ ] Otomatik migration: deploy adımında `npm run migrate`, öncesinde otomatik yedek
- [ ] Gizli değişkenler yalnızca platformun secret yöneticisinde
- [x] Docker imajları (backend, worker, site, yönetim) ve `docker compose` (Postgres + Redis) — ⚠️ henüz Docker'lı bir makinede derlenmedi
- [ ] Günlük DB yedekleri ve geri yükleme provası

**Yayına hazır kontrol listesi:** migration'lar uygulandı · secret'lar yenilendi · CI yeşil · E2E testleri geçiyor · Sentry bağlı · yedekleme açık · rate limit'ler Redis'te · KVKK metinleri hukukçu onaylı.

---

## 9. Veri sağlayıcıları ve maliyet

> **Durum:** Dış veri API'leri ve anahtarları **değişecek**. Yeni sağlayıcılar için araştırma ekip tarafından yapılacak; bu süreçte entegrasyon koduna dokunulmuyor. Aşağıdaki tablo mevcut durumu gösterir.
>
> Araştırmada bakılacak ölçütler: lisans (ticari kullanım, gösterim izni), gecikme (gerçek zamanlı / 15 dk), kota ve fiyat, BIST kapsamı, geçmiş (mum) verisi, WebSocket desteği, SLA.

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

1. ✅ Güvenlik, doğruluk ve yeni tasarım
2. ✅ Yerel DB, testler, CI · çerez oturumu · emirler · performans grafiği · izleme listesi · landing · komut paleti
3. ✅ Klasör ayrımı (`frontend/` · `admin/` · `backend/` · `packages/shared`) ve veri sağlayıcı arayüzü
4. **Yeni veri sağlayıcıları** (ekip araştırıyor): kararlaştırılınca `backend/src/providers/adapters/` altına adaptör yazılacak.
5. **Yayına hazırlık:** migration'ların uygulanması, secret yenileme, git geçmişi temizliği, staging, Sentry, yedekleme, E2E testleri (Playwright).
6. ✅ **Rekabet:** aylık sezonlar ve özel ligler · ✅ tasarım modernizasyonu · ✅ yerelde hızlı giriş
7. **Admin paneli 2:** işlemler, emirler, sistem sağlığı, denetim kaydı.
8. **Kapsam:** BIST, piyasa saatleri, gerçek zamanlı fiyat akışı.
9. **Büyüme:** herkese açık profiller, paylaşılabilir kartlar, haftalık e-posta raporu, kurumsal paket.
10. ✅ **Oyun Merkezi:** düello, ilerleme ve çark, idle oyun, koç ve senaryolar, yayın modu, sorumlu oyun (bkz. 3.6.3).
11. ✅ **Yayına hazırlık dalgası:** worker + iş kilitleri, isteğe bağlı Redis, Sentry ve metrikler, yük testi · KVKK self-servis, 2FA, CSP · herkese açık profiller ve haftalık e-posta · takip eden stop, kısmi kapatma, ABD piyasa saatleri, döviz alış/satış farkı.
12. **Sıradaki:** staging ortamı ve ilk Docker derlemesi, hukuk onayları (KVKK, İYS, çark), veri sağlayıcı kararı, kayıt akışının E2E testi, bileşen kataloğu, erişilebilirlik denetimi.
