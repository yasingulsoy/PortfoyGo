# PortfoyGo — Sunum Rehberi

Bu dosya, projeyi tanıtırken **ne söyleyeceğini** ve **hangi ekranda söyleyeceğini** sırasıyla verir. Her bölümde:

- 🖥️ **Ekran:** o anda açık olması gereken sayfa
- 🗣️ **Söyle:** okunabilecek konuşma metni (kendi cümlelerinle değiştirebilirsin)
- 👉 **Göster:** tıklanacak / gösterilecek şeyler

**Toplam süre:** yaklaşık 15–18 dakika sunum + 5–10 dakika soru-cevap. Zaman kısıtlıysa ⏩ işaretli bölümleri atla.

---

## 0. Sunumdan önce (10 dakika önce)

1. Bilgisayarda proje klasöründe tüm sistemi başlat:
   ```bash
   npm run dev:local
   ```
   Bu komut yerel veritabanını, API'yi (:5001), siteyi (:3000) ve yönetim panelini (:3001) birlikte açar. Gerçek veritabanına ve dış servislere dokunmaz.
2. Tarayıcıda şu sekmeleri **sırayla** aç (sunumda sekmeler arasında geçeceksin):
   1. `http://localhost:3000/` — Panel
   2. `http://localhost:3000/markets` — Piyasalar
   3. `http://localhost:3000/portfolio` — Portföy
   4. `http://localhost:3000/advisor` — Portföy Sihirbazı
   5. `http://localhost:3000/model-portfoy` — Model Portföy
   6. `http://localhost:3000/oyun` — Oyun Merkezi
   7. `http://localhost:3000/leagues` — Ligler
   8. `http://localhost:3000/ortak-akil` — Ortak Akıl
   9. `http://localhost:3000/global-lab` — Global Portföy Lab
   10. `http://localhost:3000/u/demo` — Herkese açık profil
   11. `http://localhost:3001/` — Yönetim paneli
3. Yerelde giriş ekranı atlanır, site otomatik olarak **demo** hesabıyla açılır. Açılmazsa giriş sayfasındaki **"Hızlı giriş" → demo**.
4. Tarayıcı yakınlaştırmasını %110–125 yap (salondan okunabilsin). Bildirimleri sessize al.
5. **Yedek plan:** İnternet olmasa da demo çalışır (yerel veritabanı ve önceden kaydedilmiş fiyatlar). Bir sayfa yüklenmezse yenile (F5); API birkaç saniyede kendini yeniden başlatır.

---

## 1. Açılış — problem (1 dk)

🖥️ **Ekran:** `http://localhost:3000/` (Panel) — ya da sunum slaytı

🗣️ **Söyle:**
> "Türkiye'de borsaya, kriptoya, dövize ilgi hiç olmadığı kadar yüksek. Ama insanlar ilk deneyimlerini genellikle gerçek paralarını kaybederek yaşıyor. Yatırım öğrenmenin güvenli, eğlenceli ve ölçülebilir bir yolu yok.
> **PortfoyGo**, gerçek piyasa verisiyle ama **sanal parayla** yatırım yapmayı, rekabet etmeyi ve öğrenmeyi bir arada sunan bir platform. Sloganımız: *Gerçek piyasa. Sanal para. Gerçek rekabet.*"

---

## 2. Ürünün iki hedefi (1 dk)

🗣️ **Söyle:**
> "Ekip toplantımızda ürünü iki hedefe oturttuk:
> 1. **Oyuncu odaklı hızlı al-sat:** az enstrüman, tek dokunuşla işlem, kısa süreli yarışmalar.
> 2. **Yatırımcı eğitimi ve portföy:** risk profiline göre portföy önerisi, senaryo ve risk analizi.
> Şimdi bu ikisini canlı göstereceğim."

---

## 3. Temel deneyim: piyasa → işlem → portföy (3 dk)

### 3.1 Panel
🖥️ **Ekran:** `/` (Panel)

👉 **Göster:** varlık kartları, portföy performans grafiği, varlık dağılımı (halka grafik), izleme listesi.

🗣️ **Söyle:**
> "Her kullanıcı **100.000 TL sanal bakiyeyle** başlıyor. Panelde toplam varlık, performans grafiği ve varlık dağılımı tek ekranda."

### 3.2 Piyasalar
🖥️ **Ekran:** `/markets`

👉 **Göster:** Hisse / Kripto / Döviz / Emtia sekmeleri, 7 günlük mini grafikler, (varsa) **TL / USD** fiyat seçimi, bir hisseye tıklayıp varlık sayfası (grafik, aralık seçimi, "Piyasa açık/kapalı" rozeti).

🗣️ **Söyle:**
> "ABD hisseleri, kripto paralar, döviz ve emtia burada. Fiyatlar sunucu tarafında belirleniyor; kullanıcı fiyatı değiştirip hile yapamıyor. ABD borsası kapalıyken hisse emri 'açılışta gerçekleştir' olarak sıraya alınıyor — gerçek borsa gibi."

### 3.3 İşlem ve portföy
🖥️ **Ekran:** `/portfolio`

👉 **Göster:** bir pozisyonda **%25 / %50 / %100** kısmi kapatma kısayolları; satır menüsünde **zarar durdur / kâr al / takip eden stop**; işlem penceresinde komisyonun (%0,25) gösterilmesi.

🗣️ **Söyle:**
> "Piyasa emri, limit emri, zarar durdur, kâr al ve **takip eden stop** var. Her işlemde %0,25 komisyon alıyoruz ki kullanıcı maliyet farkındalığı kazansın. Dövizde alış ve satış kuru ayrı — yani gerçek hayattaki makas da var."

---

## 4. Eğitim ve portföy (3 dk)

### 4.1 Portföy Sihirbazı
🖥️ **Ekran:** `/advisor`

👉 **Göster:** risk anketi → önerilen dağılım, beklenen getiri aralığı (Monte Carlo yelpaze grafiği), maksimum düşüş, "tek tıkla sanal portföye uygula".

🗣️ **Söyle:**
> "8 soruluk risk anketiyle kullanıcının profili çıkıyor. Arkada **modern portföy teorisi** ve **Monte Carlo** simülasyonu çalışıyor: önerilen dağılım, beklenen getiri aralığı, zarar olasılığı ve en kötü senaryodaki düşüş. Yapay zekâ algoritmayı arka planda kuruyor; kullanıcı her karar için yapay zekâya sormak zorunda değil. Bu bir yatırım tavsiyesi değil, eğitim aracı."

### 4.2 100.000 USD Model Portföy
🖥️ **Ekran:** `/model-portfoy` → bir modelin detayı

👉 **Göster:** dağılım ve ağırlıklar, nakdin yeri, **"Toplam portföye etkisi"** katkı çubukları, **"Ya … olursa?"** simülatörü (ör. kripto −%30 → portföy etkisi), **karşılaştırma** sayfasında 2–3 modelin eğrileri.

🗣️ **Söyle:**
> "Burada 100.000 dolarlık varsayımsal bir sermayeyi farklı varlıklara dağıtıyoruz. Her varlığın toplam getiriye katkısını, bir varlık %30 düşerse portföyün ne kadar etkileneceğini ve alternatif dağılımların karşılaştırmasını görüyoruz. Amaç: getiri beklentisi ile risk ve çeşitlendirme arasındaki ilişkiyi uygulamalı göstermek."

### 4.3 ⏩ Global Portföy Lab
🖥️ **Ekran:** `/global-lab`

👉 **Göster:** katalog filtreleri (bölge, varlık sınıfı, risk seviyesi), Sınıflandır sekmesi; Senaryo sekmesinde premium kapısı.

🗣️ **Söyle:**
> "Küresel varlık sınıflarını araştırma ve senaryo modülü. Senaryo ve stres testi bölümü premium — gelir modelimizin bir parçası."

---

## 5. Oyun Merkezi (3 dk)

🖥️ **Ekran:** `/oyun`

👉 **Göster:** mobil oyun görünümü, **HIZLI MAÇ** (rakip bulunamazsa açıkça etiketli antrenman botu), bir **Solo Tur** (1 dk) aç: büyük AL/SAT düğmeleri, canlı K/Z; tur sonunda **Koç Kemal karnesi**.

🗣️ **Söyle:**
> "Toplantıdaki 'hızlı al-sat' hedefinin karşılığı Oyun Merkezi. Euro/dolar, altın, petrol ve Bitcoin ile 1–10 dakikalık turlar oynanıyor. Fiyatlar gerçek bir geçmiş dönemin hızlandırılmış tekrarı; tur sonunda o tarihin hangisi olduğu açıklanıyor. 1'e 1 düello, davet linki, canlı meydan okumalar ve OBS'ye bağlanabilen yayın ekranı var. Her turdan sonra **Koç Kemal** oyuncuya A'dan E'ye not veriyor ve neyi neden yanlış yaptığını anlatıyor."

👉 **Ek göster (⏩):** `/oyun/haftalik-secim` — Haftalık Seçim.

🗣️ **Söyle:**
> "Dr. Alexander Elder'ın kitabındaki 'kitlelerin bilgeliği' yarışmasını uyguladık: herkes seçimini gizlice yapıyor, Pazar günü hepsi açılıyor, hafta sonunda kitlenin ortak seçimi bireylerle kıyaslanıyor."

🗣️ **Sorumlu oyun (mutlaka söyle):**
> "Kumar benzeri mekaniklerin riskinin farkındayız. 18 yaş onayı, günlük limitler, mola verme, art arda zarar uyarısı var; çark ve slot makinesinde **olasılıklar her zaman görünüyor** ve jetonlar gerçek parayla alınamıyor, paraya çevrilemiyor."

---

## 6. Rekabet ve topluluk (2 dk)

### 6.1 Ligler ve Portföy Ligi
🖥️ **Ekran:** `/leagues`

👉 **Göster:** lig oluştururken **"Portföy ligi"** türü; kurallar kutusu (aynı sermaye, dönem, komisyon), takım modu, Sıralama ve Stratejiler sekmeleri.

🗣️ **Söyle:**
> "Sınıflar, kulüpler ya da şirketler kendi liglerini kurabiliyor. Portföy liginde herkes **aynı başlangıç sermayesi, aynı ölçüm dönemi ve aynı işlem maliyetiyle** yarışıyor — sıralama adil. Sonunda herkes stratejisini ve ne öğrendiğini yazıyor."

### 6.2 Ortak Akıl
🖥️ **Ekran:** `/ortak-akil` → bir öneri

👉 **Göster:** gerekçe, beklenen senaryo, riskler, izleme kriterleri; yayından beri performans; "Katılıyorum / Katılmıyorum" gerekçeleri.

🗣️ **Söyle:**
> "Ortak Akıl'da yatırım fikirleri kişisel görüş olmaktan çıkıp gerekçe, risk ve izleme kriterleriyle kayda geçiyor. Fikir kapanırken yazarın 'ne oldu, ne öğrendim' değerlendirmesi zorunlu. Burada önemli bir not: önerilerin kaydı yatırım tavsiyesi değildir."

### 6.3 ⏩ Herkese açık profil
🖥️ **Ekran:** `/u/demo`

🗣️ **Söyle:**
> "Her oyuncunun paylaşılabilir bir profili var; tutar göstermiyoruz, yalnızca yüzde ve sıralar. Kullanıcı isterse profilini gizleyebiliyor."

---

## 7. Yönetim paneli (1 dk)

🖥️ **Ekran:** `http://localhost:3001/`

👉 **Göster:** genel bakış grafikleri, Kullanıcılar, Sistem durumu (cron işleri, veri tazeliği), Arena (meydan okuma planlama, slot makinesi kapatma düğmesi), denetim kaydı.

🗣️ **Söyle:**
> "Operasyon için ayrı bir yönetim panelimiz var: kullanıcılar, işlemler, ligler, meydan okumalar, moderasyon ve sistem sağlığı. Yönetici işlemlerinin hepsi denetim kaydına düşüyor; yöneticiler için iki adımlı doğrulama zorunlu."

---

## 8. ⏩ Teknik altyapı (1–2 dk)

🗣️ **Söyle:**
> "Next.js ile site ve yönetim paneli, Node.js/Express ile API ve PostgreSQL veritabanı. Fiyatları her zaman sunucu belirliyor. Güvenlik tarafında httpOnly çerez oturumu, CSRF koruması, iki adımlı doğrulama, içerik güvenlik politikası ve KVKK için kendi verini indirme ve hesabını silme var.
> Otomatik testlerimiz var: 700'ü aşkın sunucu testi, yaklaşık 370 arayüz testi ve uçtan uca tarayıcı testleri; her kod gönderiminde otomatik çalışıyor.
> 1.000 kullanıcılık yük testinde gerçek Postgres üzerinde saniyede ~1.400 isteği hatasız karşıladık. Birden fazla sunucuya ölçeklenebilecek şekilde tasarlandı."

---

## 9. İş modeli ve yol haritası (1–2 dk)

🗣️ **Söyle:**
> "Gelir tarafında dört kalem düşünüyoruz:
> 1. **Sponsorlu yarışmalar** — aracı kurum ve fintech sponsorları,
> 2. **Premium** — Global Portföy Lab senaryoları ve gelişmiş analizler (abonelik altyapısı hazır),
> 3. **Kurumsal ve eğitim lisansı** — okullar, üniversite kulüpleri, şirket içi ligler,
> 4. ileride veri ve analiz ürünleri.
> Gerçek para yatırma ya da gerçek yatırım yönlendirmesi yok; SPK düzenlemeleri nedeniyle kapsam dışı.
> MVP planımız: ~1.000 kişilik bir test grubu, demo lig ve gecikmeli veri. Sıradaki adımlar: lisanslı veri sağlayıcısı, BIST hisseleri, staging ortamı ve hukuk onayları."

---

## 10. Kapanış (30 sn)

🖥️ **Ekran:** `/` (Panel) ya da `/oyun`

🗣️ **Söyle:**
> "PortfoyGo; gerçek veriyle, sıfır riskle yatırım öğrenilen, arkadaşlarla, okullarla ve topluluklarla yarışılan bir platform. Teşekkürler — sorularınızı alabilirim."

---

## Olası sorular ve kısa cevaplar

| Soru | Cevap |
| --- | --- |
| Fiyatlar gerçek mi, ne kadar gecikmeli? | Gerçek piyasa verisi; şu an ücretsiz kaynaklar kullanılıyor. Kripto anlık, döviz günlük resmi kur (TCMB) gibi; lisanslı gerçek zamanlı sağlayıcı araştırılıyor. Arena turları gerçek geçmiş fiyatların hızlandırılmış tekrarı. |
| Bu bir kumar uygulaması mı? | Hayır. Para yatırılamaz ve çekilemez; jetonlar yalnızca oyun içi. 18+ onayı, limitler, mola ve olasılık şeffaflığı var; slot makinesi yönetim panelinden tek tıkla kapatılabiliyor ve hukuk onayı olmadan yayına alınmayacak. |
| Yatırım tavsiyesi veriyor musunuz? | Hayır. Sihirbaz ve öneriler eğitim amaçlı; her ekranda belirtiliyor. |
| Kullanıcı verisi / KVKK? | Kullanıcı verisini kendisi indirebiliyor ve hesabını silebiliyor (anonimleştirme). Yalnızca zorunlu çerezler kullanılıyor. Metinler hukuk onayına gidecek. |
| Hile yapılabilir mi? | Fiyatı ve tur sonucunu sunucu belirliyor; alım-satım satır kilitli tek işlem içinde. Gizli seçimler açılana kadar sunucuda gizli. |
| Ölçeklenir mi? | Evet; iş kuyruğu ayrı bir süreçte, Redis ile birden çok sunucu. 1.000 kullanıcılık yük testi geçti. |
| Nasıl para kazanacaksınız? | Sponsorlu yarışmalar, premium analiz, kurumsal/eğitim lisansı. |
| Neden BIST yok? | Lisanslı veri gerekiyor; sağlayıcı ve maliyet araştırması sürüyor (Koray). |

---

## Kim neyi anlatabilir (ekip)

| Kişi | Bölüm |
| --- | --- |
| Yasin | Açılış, temel deneyim, teknik altyapı, demo |
| Art | Oyun Merkezi ve lig / etkinlik formatı |
| H.Burak | Portföy Sihirbazı, Model Portföy, risk |
| Koray | Veri sağlayıcıları, maliyet, yol haritası |

*Not: ekranlar ve özellikler güncellendikçe bu dosyayı da güncelleyin.*
