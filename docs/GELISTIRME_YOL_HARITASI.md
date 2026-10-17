# PortfoyGo — Geliştirme Yol Haritası

**Son güncelleme:** 16 Ekim 2026  
**Bu belge yalnızca açık işleri içerir.** Tamamlananlar: [YAPILANLAR.md](YAPILANLAR.md) · Yayına alma adımları: [YAYIN_KONTROL_LISTESI.md](YAYIN_KONTROL_LISTESI.md)  
**Durum işaretleri:** 🚧 bu dalgada yapılıyor · 🔜 sıradaki · 💡 fikir / değerlendirilecek

---

## 0. Kuzey yıldızı

> **"Türkiye'nin en güvenilir ve en keyifli yatırım simülatörü."**
> Gerçek veriyle, sıfır riskle yatırım öğrenilen; arkadaşlarla, okullarla ve topluluklarla yarışılan bir platform.

Üç ilke her kararda geçerli:

1. **Adil oyun:** Fiyatı her zaman sunucu belirler, hile yapılamaz. Liderlik tablosu güvenilir değilse ürün yoktur.
2. **Öğretici deneyim:** Her ekran kullanıcıya bir şey öğretmeli: neden kazandı, neden kaybetti.
3. **Hızlı ve sade:** Bir işlem en fazla 3 tıklama sürmeli, sayfalar mobilde 1 saniyede açılmalı.

---

## 1. Şu an yapılıyor 🚧

_Şu an yürüyen iş yok; tamamlananlar [YAPILANLAR.md](YAPILANLAR.md) içinde._

---

## 2. Yayına alma (öncelikli)

- [ ] 🔜 Docker imajlarının Docker'lı bir makinede derlenip denenmesi; **staging** ortamı
- [ ] 🔜 Dağıtım hedefi: Frontend ve admin → Vercel. Backend ve worker → Railway, Render veya Fly.io. Postgres → Neon veya Supabase (yönetilen, yedekli). Redis (çok örnekte zorunlu).
- [ ] Ortamlar: `development` (yerel PGlite) → `staging` → `production`; her PR için önizleme ortamı
- [ ] Otomatik migration: deploy adımında `npm run migrate`, öncesinde otomatik yedek
- [ ] Gizli değişkenler yalnızca platformun secret yöneticisinde
- [ ] Günlük DB yedekleri ve geri yükleme provası
- [ ] Ayrı alan adları (`app.` / `api.` / `admin.portfoygo.com`)
- [ ] 🔜 Git geçmişinin temizlenmesi (`git filter-repo`) ve **sızmış Finnhub anahtarının yenilenmesi**
- [ ] Hukuk onayları: KVKK metinleri ve "anonimleştirerek saklama" yaklaşımı, haftalık e-postanın İYS durumu, ödüllü çark ve 18+ kapısı, sponsorlu yarışmalar
- [ ] Bot ve çoklu hesap tespiti: kayıtta Cloudflare Turnstile, aynı cihaz veya IP'den çoklu hesap uyarısı (liderlik adaleti için)

---

## Ekip toplantısı kararları (8 Ekim 2026) 📌

Ürün iki hedefe hizmet edecek:
1. **Oyuncu odaklı hızlı al-sat:** az sayıda enstrüman (EUR/USD, altın, petrol, BTC/gümüş), tek dokunuşla işlem, sürekli haber akışı, kısa periyotlu ligler ve sunuculu canlı "challenge" etkinlikleri. Ekran: sağda kotasyon akışı, ortada büyük al-sat düğmeleri, altta anlık K/Z.
2. **Yatırımcı eğitimi ve portföy:** risk profili anketi → beklenen drawdown/volatilite ile önerilen dağılım (Monte Carlo, modern portföy teorisi). Yapay zekâ algoritmayı arka planda kurar; kullanıcı her karar için YZ'ye sormaz.

Diğer notlar: gerçek zamanlı veri (bid/ask dahil) kritik ama maliyetli; lisanslı sağlayıcı gerekli (kazıma IP engeli riski). Gelir: sponsor ödülleri, veri satışı, premium analiz/portföy, reklam/ortaklık. MVP önerisi: demo lig + ~3 enstrüman + gecikmeli veri, ~1.000 kişilik test. Risk: kumar benzeri yüksek frekans → sorumlu oyun tasarımı ve uyarılar. Ayrıca: Goat Problem tarzı oyunlar, ekspres trader ekranları, zarar kes/kâr al, animasyonlu rekabetçi oyunlar.

Eylemler: Yasin canlı veri gereksinimleri · Art oyun akışı ve lig/etkinlik formatı · Koray veri sağlayıcı ve maliyet · H.Burak risk anketi soruları ve YZ senaryoları · Ekip MVP kapsam toplantısı (15 Ekim 2026'ya kadar).

---

## 3. Ürün ve oyun mekaniği

### 3.1 Rekabet
- [ ] Herkese açık bir lige üye olmadan detay/sıralama görüntüleme; profilde "Lig birincilikleri"
- [ ] Lig sohbeti ve duyuruları, kurumsal (okul/şirket) lig paneli
- [ ] **Turnuvalar:** kısıtlı varlık evreni (ör. "Sadece BIST 30"), giriş koşulları
- [ ] Liderlik tablosunda risk ayarlı getiri (Sharpe) ve maksimum düşüş; yalnızca "en çok kazanan" değil, "en istikrarlı" da ödüllendirilsin
- [ ] 🔜 **Portföy Ligi devamı:** takım sohbeti; kaptanın üye çıkarması ve takım kodunu yenilemesi; lig bitince katılımcıların pozisyon dağılımlarını yan yana gösterme; stil etiketi eşiklerinin gerçek lig verisiyle ayarı; (isteğe bağlı) varlık evreni kısıtı ve kısa ligler için seans dışı hisse işlemlerine kural

### 3.2 Oyun Merkezi
- [ ] Ekonomi dengesinin gerçek kullanıcı verisiyle ayarı (`backend/src/services/game/config.ts`, `backend/src/services/idle/config.ts`); haftalık düello ligi ve sezonluk kademe ödülleri; Art ile oyun akışı ve etkinlik formatı gözden geçirmesi
- [ ] Gerçek zamanlı kotasyon sağlayıcısı geldiğinde Arena'ya "canlı" mod
- [ ] 🔜 **Slot Makinesi devamı:** hukuk onayı sonrası production'da açma (yönetici anahtarı; bkz. `YAYIN_KONTROL_LISTESI.md` §5); sorumlu oyun ekranına kişisel slot sınırları (günlük çevirme / kayıp, yalnızca daraltılabilir); yönetici özetine günlük RTP grafiği
- [ ] 🔜 **Arena tur ekranında kurgusal haber akışı** (`/oyun/tur/[id]`) — toplantı kararı "sürekli haber akışı". *(Yasin sonra yapacak.)*
  - Haberler **gerçek değil, oyunun ürettiği kurgu**: her haberin yönü (olumlu/olumsuz), etkilediği enstrüman(lar), etki büyüklüğü ve sönümlenme süresi var; fiyat bu habere göre yükselir/düşer (ör. "Merkez bankası beklenmedik faiz artışı" → EUR/USD ↓, altın ↓).
  - Sunucu belirler: haber zamanlaması ve fiyat etkisi turun sunucu tarafındaki fiyat üretimine eklenir (gerçek geçmiş tekrarı yerine/üstüne sentetik yol; senaryo modundaki sentetik veri altyapısı kullanılabilir); aynı turdaki herkes haberi aynı anda görür.
  - Her haber ekranda açıkça **"KURGU"** etiketli olmalı; gerçek kişi, şirket veya kurum adıyla yanlış haber üretilmemeli (ekran görüntüsü dolaşırsa yanıltıcı olur) — genel ifadeler ("Bir merkez bankası…", "Büyük bir teknoloji şirketi…") veya hayali isimler.
  - Tur sonu debrief'i: hangi haber fiyatı nasıl etkiledi, oyuncu nasıl tepki verdi (Koç Kemal karnesine "habere tepki" kuralları eklenebilir).

### 3.3 İşlem deneyimi
- [ ] 💡 Açığa satış (short) ve kaldıraç. Oyunu derinleştirir ama risk eğitimiyle birlikte sunulmalı.
- [ ] Döviz değerlemesinin alış kuruna geçirilmesi (yalnızca yeni sezon başında; bkz. migration 020 notu)

### 3.4 Piyasa kapsamı
- [ ] **BIST hisseleri:** gecikmeli veri lisansı ve sağlayıcı (ör. Matriks, Foreks veya ücretli API)
- [ ] Daha geniş ABD hisse listesi (şu an 10 sabit sembol; `STOCK_SYMBOLS` ile genişletilebilir ama kota planı gerekir)
- [ ] Fonlar ve ETF'ler (Global Portföy Lab kataloğundaki ETF / endeks / TL tahvil araçları şu an fiyatsız; sağlayıcı kararından sonra `provider_symbol` ile bağlanabilir)
- [ ] NYSE tatil takviminin her yıl güncellenmesi (şu an 2027 sonuna kadar)

### 3.5 Öğrenme
- [ ] Ana portföy için işlem sonrası mini analiz: "Bu işlemde %X kazandın; ortalama maliyetin şuydu…"
- [ ] Varlık sayfalarında kısa, sade açıklamalar ("Bu şirket ne yapar?", "Volatilite nedir?")
- [ ] Portföy Sihirbazı: H.Burak'ın anket taslağı ve TL nakit getiri varsayımının (`ADVISOR_TRY_CASH_RETURN`) netleşmesi
- [ ] 💡 Yapay zekâ destekli "portföy koçu": risk dağılımı ve çeşitlendirme önerileri. Yatırım tavsiyesi değil, eğitim amaçlı.
- [ ] Model Portföy: bir model portföyü kopyalama / bağlantıyla paylaşma (salt okunur) ve Ortak Akıl fikrinden "bu fikirle model portföy kur" kısayolu
- [ ] 💡 Model Portföy: geçmiş bir tarihte başlatma ("1 Ocak'ta kursaydım") — motor şimdilik yalnızca bugünkü pozisyonların 90 günlük simülasyonunu gösteriyor

### 3.6 Sosyal
- [ ] Başarılı yatırımcıları takip etme, işlemlerini gecikmeli görme
- [ ] Ortak Akıl: oturumsuz (salt okunur) öneri sayfası ve paylaşım kartı; öneri sayfasında aynı varlıktaki diğer öneriler; ayrı "Topluluk" bildirim kategorisi (şimdilik "Rekabet" altında — `notifications.category` CHECK genişletmesi gerekir)
- [ ] 💡 Ortak Akıl: yanıt / yorum almamış öneriyi yayından kısa süre sonra geri çekme (yayın sonrası düzenleme bilinçli olarak yok); seviye aşımı kontrolünün günlükten saatliğe alınması (`idea-reviews` işi)
- [ ] Rozetlerin genişletilmesi: seriler (7 gün üst üste giriş), sezon rozetleri

---

## 4. Tasarım ve kullanıcı deneyimi

- [ ] 🔜 **Bileşen kataloğu** (Storybook veya `/dev/ui` sayfası): Button, Card, Modal, Tabs vb. tek yerde dokümante edilsin.
- [ ] Gerçek zamanlı his: SSE veya WebSocket ile fiyat akışı (polling yerine)
- [ ] Boş, hata ve yükleme durumlarının tüm sayfalarda tutarlı olduğu bir UX denetimi
- [ ] Erişilebilirlik denetimi (axe/Lighthouse ≥ 95), ekran okuyucu ile uçtan uca test
- [ ] Mikro etkileşimler: işlem sonrası sade "başarılı" animasyonu
- [ ] İngilizce dil desteği (i18n altyapısı; metinler tek dosyada toplanır)

---

## 5. Teknik kalite

- [ ] Kayıt → e-posta doğrulama akışının uçtan uca testi (yerelde e-posta kutusu taklidi gerekir)
- [ ] Kapsama hedefi: para ile ilgili servislerde %90 ve üzeri
- [ ] Katmanların netleşmesi: route → controller → service → repository. SQL tek katmanda kalsın.
- [ ] API tipleri ve zod şemalarının `packages/shared`'a alınıp frontend ile backend'in aynı sözleşmeyi kullanması
- [ ] OpenAPI (Swagger) dokümantasyonu: zod şemalarından otomatik üretilsin
- [ ] Sunucu bileşenleri (RSC) ile ilk yüklemede veri: landing, haberler, liderlik
- [ ] Görünmeyen sekmede polling'in durdurulması (`refreshWhenHidden: false`)
- [ ] Bundle analizi; lightweight-charts yalnızca gerektiğinde yüklensin
- [ ] Hedef Core Web Vitals: LCP < 2,0 sn, INP < 200 ms, CLS < 0,05
- [ ] Çok örnekte hâlâ örnek başına kalan sınırlar/önbellekler (idle dokunma, Arena tepkileri, yorum sınırları, sağlayıcı kotası) için Redis'e taşıma

---

## 6. Veri sağlayıcıları ve maliyet

> **Durum:** Dış veri API'leri ve anahtarları **değişecek**. Yeni sağlayıcılar için araştırma ekip tarafından yapılacak; bu süreçte entegrasyon koduna dokunulmuyor. Aşağıdaki tablo mevcut durumu gösterir.
>
> Araştırmada bakılacak ölçütler: lisans (ticari kullanım, gösterim izni), gecikme (gerçek zamanlı / 15 dk), kota ve fiyat, BIST kapsamı, geçmiş (mum) verisi, WebSocket desteği, SLA.

| Veri | Şu an | Ücretsiz seçenek (adaptör hazır) | Risk | Öneri |
| --- | --- | --- | --- | --- |
| ABD hisseleri | Finnhub ücretsiz katman (varsayılan 48 hisselik evren, `STOCK_SYMBOLS` ile ≤50) | `finnhub-cached`: hisse başına 1 çağrı + 24 sa profil önbelleği (~24 çağrı/dk) — **anahtar gerekir**; anahtarsız meşru kaynak yok | Dakikada 60 çağrı; geçmiş mum verisi ücretsiz katmanda yok; ücretsiz katman ticari değil | Ücretli plan veya Polygon/Twelve Data; fiyat geçmişini kendi DB'mizde biriktirmek |
| Kripto | CoinGecko (ilk 50, `CRYPTO_TOP_N`) | `coingecko` anahtarsız genel uçla çalışır (2 dk'da 1 istek) | Hız sınırı; ücretsiz planda ticari kullanım belirsiz, atıf gerekir | Demo anahtarı + önbellek; ticari yayında ücretli plan |
| Döviz | NosyAPI (kredi bazlı) | `tcmb` (TCMB `today.xml`, günlük, anahtarsız) · `frankfurter` (ECB referans, günlük, anahtarsız) | Günlük veri (anlık değil); NosyAPI kredisi tükenirse veri durur | Canlıda TCMB'yi yedek/birincil kaynak olarak değerlendirmek (`FX_PROVIDER=tcmb`) |
| Emtia | NosyAPI (kredi bazlı) | `goldapi` (gold-api.com, değerli metaller anlık, anahtarsız; koşullar ticari kullanıma izin veriyor) · `pricehistory` (son bilinen fiyat, dış API yok) | Petrol / doğal gaz / tarım için anahtarsız meşru kaynak yok | Metaller için goldapi + NosyAPI ya da lisanslı emtia kaynağı (petrol) |
| Haberler | RSS (bsekonomi) | — | Tek kaynak | Birden çok RSS kaynağı ve kategori eşleme |

Yerelde (`npm run dev:local`) anahtarsız kaynaklar varsayılan açık (`LOCAL_LIVE_PRICES=0` ile çevrimdışı); ayrıntı ve lisans notları:
`backend/src/providers/README.md`, `docs/YAYIN_KONTROL_LISTESI.md` §5.

---

## 7. Gelir modeli (değerlendirme)

- 💡 **Kurumsal ve eğitim lisansı:** Okullar, üniversite kulüpleri ve aracı kurumların eğitim programları için özel lig, öğretmen paneli ve raporlama. *En gerçekçi gelir kalemi.*
- 💡 **Sponsorlu turnuvalar:** Aracı kurum ve fintech sponsorluğu, ödüllü yarışmalar (yasal çerçeve kontrol edilmeli).
- 💡 **Premium üyelik:** Gelişmiş analizler, sınırsız izleme listesi, ek emir türleri, reklamsız deneyim. Altyapı hazır (migration 025): planlar, 14 günlük tek seferlik deneme, sunucu tarafı yetki kapısı (`402 SUBSCRIPTION_REQUIRED`), yönetici tanımı; ilk Premium içerik Global Portföy Lab senaryo laboratuvarı.
  - [ ] 🔜 Ödeme sağlayıcısı kararı (iyzico / Stripe / mağaza içi satın alma) ve `source = 'payment'` entegrasyonu (webhook → `user_subscriptions`, `external_ref`); fatura / KDV, mesafeli satış sözleşmesi ve cayma hakkı (bkz. YAYIN_KONTROL_LISTESI §5)
  - [ ] Fiyatlandırma ve Premium kapsamı (hangi analizler; deneme süresi; okul / kurum paketiyle ilişkisi)
  - [ ] Global Portföy Lab varsayımlarının gerçek kaynak ve tarihle güncellenmesi, katalog gider oranlarının doğrulanması (yönetim paneli → Global Portföy Lab)
  - [ ] 💡 Global Portföy Lab: varsayımların fiyat geçmişinden (price_history) kalibrasyonu, senaryoyu Model Portföy olarak kurma kısayolu
- ❌ Gerçek para yatırma veya gerçek yatırım yönlendirmesi: SPK düzenlemeleri nedeniyle kapsam dışı.

---

## 8. Başarı metrikleri

| Metrik | Hedef (ilk 6 ay) |
| --- | --- |
| Kayıt → ilk işlem dönüşümü | ≥ %60 |
| D7 / D30 tutundurma | ≥ %25 / ≥ %12 |
| Haftalık aktif kullanıcı başına işlem | ≥ 5 |
| E-posta doğrulama oranı | ≥ %70 |
| p95 API yanıt süresi | < 300 ms |
| Hatasız işlem oranı | ≥ %99,9 |

---

## 9. Önerilen sıra (özet)

1. **Yayına alma:** staging + ilk Docker derlemesi, secret yenileme ve git geçmişi temizliği, yedekleme, hukuk onayları (KVKK, İYS, çark ve slot makinesi, abonelik/ödeme)
2. **Yeni veri sağlayıcıları** (ekip araştırıyor): kararlaştırılınca `backend/src/providers/adapters/` altına adaptör
3. **Kapsam:** BIST, gerçek zamanlı fiyat akışı, daha geniş hisse listesi, fon/ETF
4. **Oyun:** Arena tur ekranında kurgusal haber akışı (Yasin), ekonomi dengesi
5. **Büyüme:** kurumsal (okul/şirket) paket, takip etme, rozetler, ödeme sağlayıcısı (premium)
6. **Kalite:** kayıt akışı E2E testi, bileşen kataloğu, erişilebilirlik denetimi, OpenAPI
