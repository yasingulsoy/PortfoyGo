# PortfoyGo — Platform Durumu ve Geliştirme Önerileri

**Hazırlayan:** Geliştirme Ekibi  
**Son Güncelleme:** 7 Mart 2026  
**Hedef Kitle:** Proje paydaşları, yatırımcılar ve karar vericiler

---

## 1. Platform Nedir?

PortfoyGo, kullanıcıların **gerçek piyasa verileriyle sanal para üzerinden yatırım yapabildiği** bir web platformudur. Herhangi bir gerçek para riski olmadan hisse senedi, kripto para, emtia ve döviz alıp satılabilir. Kullanıcılar birbirleriyle liderlik tablosu üzerinden yarışır.

Kısacası: **Borsa simülasyonu + eğitim aracı + rekabet platformu.**

---

## 2. Şu An Neler Yapılabiliyor?

### Kullanıcı Girişi ve Hesap
- E-posta ve şifre ile kayıt olunabiliyor
- Kayıt sonrası e-posta doğrulaması yapılıyor
- Her kullanıcıya **100.000 ₺ sanal bakiye** veriliyor

### Piyasa Takibi
- **Hisse senetleri** (Apple, Microsoft, Google, Tesla vb.) canlı olarak takip edilebiliyor
- **Kripto paralar** (Bitcoin, Ethereum ve 25+ kripto) gerçek zamanlı fiyatlarla görülebiliyor
- **Emtialar** (altın, gümüş, petrol, doğalgaz vb.) izlenebiliyor
- **Döviz kurları** (USD, EUR, GBP, CHF, JPY, gram altın) canlı olarak yansıyor
- Fiyatlar ortalama **2 dakikada bir** güncelleniyor

### Alım-Satım
- Hisse, kripto, emtia ve döviz alınıp satılabiliyor
- Her işlemde **%0,1 komisyon** uygulanıyor (borsa gerçekliğini yansıtmak için)
- Ortalama maliyet fiyatı otomatik hesaplanıyor
- Anlık kâr/zarar görülebiliyor

### Stop-Loss (Zarar Durdurma)
- Kullanıcı bir varlık için zarar durdurma emri verebiliyor
- Fiyat belirlenen seviyenin altına düşerse **otomatik satış** tetikleniyor
- Emirler dakikada bir kontrol ediliyor

### Liderlik ve Yarışma
- Tüm kullanıcılar kâr/zarar yüzdesine göre sıralanıyor
- Ana sayfada **Top 3** podium şeklinde gösteriliyor
- Rozetler kazanılabiliyor (ilk işlem, kârlı satış sayısı, portföy büyüklüğü vb.)

### Haber Akışı
- BS Ekonomi'den (bsekonomi.com) güncel ekonomi ve finans haberleri otomatik çekiliyor
- Ana sayfada son haberler görünüyor, ayrı bir haber sayfası da mevcut

### Yönetim (Admin)
- Admin panelinden kullanıcı istatistikleri görülebiliyor
- Sorunlu kullanıcılar banlanabiliyor
- Tüm kullanıcı işlemleri (giriş, alım, satım vb.) log olarak kaydediliyor

### Grafikler
- Her varlık için interaktif fiyat grafikleri mevcut
- Fiyat değişimleri anlık animasyonlarla gösteriliyor

---

## 3. Neler Eksik? Neden Önemli?

Aşağıdaki tabloda platformda henüz bulunmayan özellikler, bunların olmamasının yarattığı sorunlar ve eklenmesi halinde sağlayacağı faydalar özetlenmektedir.

### 3.1 Güvenlik ve Doğrulama

| Eksik | Sorun | Eklenirse Ne Olur? |
|-------|-------|---------------------|
| **SMS doğrulaması** | Sahte hesap açılmasını engelleyecek ikinci bir katman yok. Sadece e-posta doğrulaması mevcut. | Sahte hesaplar büyük ölçüde önlenir. Liderlik tablosu daha güvenilir hale gelir. Kullanıcı güveni artar. |
| **Şifre sıfırlama** | Şifresini unutan kullanıcı hesabına erişemiyor. | Kullanıcı kaybı azalır. Destek talepleri düşer. |
| **İki faktörlü doğrulama (2FA)** | Hesap güvenliği tek katmanlı. | Profesyonel düzeyde güvenlik sağlanır. Kurumsal kullanıma uygun hale gelir. |

### 3.2 Piyasa Verileri

| Eksik | Sorun | Eklenirse Ne Olur? |
|-------|-------|---------------------|
| **BIST (Borsa İstanbul) hisseleri** | Türk yatırımcılar için en doğal piyasa olan BIST verileri yok. Sadece ABD hisseleri takip ediliyor. | Türk kullanıcılar kendi piyasalarıyla pratik yapabilir. Kullanıcı tabanı genişler. |
| **Daha fazla emtia ve döviz çifti** | Mevcut emtia ve döviz çeşitliliği sınırlı. | Portföy çeşitlendirmesi daha gerçekçi olur. Eğitim değeri artar. |
| **Gerçek zamanlı veri (WebSocket)** | Fiyatlar 2 dakikada bir güncelleniyor, anlık değil. | Daha gerçekçi bir borsa deneyimi sağlanır. Scalping ve kısa vadeli stratejiler denenebilir. |

### 3.3 İşlem Özellikleri

| Eksik | Sorun | Eklenirse Ne Olur? |
|-------|-------|---------------------|
| **Limit emir** | Kullanıcı sadece mevcut fiyattan işlem yapabiliyor. "Şu fiyata gelince al" diyemiyor. | Gerçek borsa deneyimine çok daha yakın olur. Strateji geliştirme imkânı artar. |
| **Take-Profit (Kâr Al) emri** | Stop-loss var ama kâr hedefine ulaşınca otomatik satış yok. | Kullanıcılar tam bir emir yönetimi yapabilir hale gelir. |
| **Kaldıraçlı işlem (opsiyonel)** | Kaldıraç mekanizması yok. | İleri düzey yatırımcılar için eğitim ortamı oluşur. Riskin ne demek olduğu pratik olarak öğretilir. |
| **Açığa satış** | Sadece sahip olunan varlıklar satılabiliyor. Düşüşten kâr elde etmek mümkün değil. | Piyasa düşüşlerinde de strateji uygulanabilir. |

### 3.4 Analiz ve Raporlama

| Eksik | Sorun | Eklenirse Ne Olur? |
|-------|-------|---------------------|
| **Portföy performans grafiği** | Portföyün zaman içindeki değeri görselleştirilemiyor. Kullanıcı sadece anlık durumu görebiliyor. | Yatırım kararlarının sonuçları uzun vadede izlenebilir. Eğitim açısından çok değerli. |
| **Varlık dağılımı (pie chart)** | Portföyün ne kadarı hisse, ne kadarı kripto gibi bir görsel yok. | Çeşitlendirme analizi yapılabilir. Risk yönetimi öğretilebilir. |
| **İşlem geçmişi analizi** | İşlemler listelenebiliyor ama analiz yapılamıyor (en kârlı varlık, ortalama tutma süresi vb.). | Kullanıcı kendi yatırım alışkanlıklarını anlayabilir. |
| **PDF/Excel rapor çıktısı** | Portföy durumunun dışarıya aktarılması mümkün değil. | Kurumsal kullanım ve eğitim amaçlı raporlama yapılabilir. |

### 3.5 Bildirim ve İletişim

| Eksik | Sorun | Eklenirse Ne Olur? |
|-------|-------|---------------------|
| **Push bildirimleri** | Fiyat alarmı veya stop-loss tetiklenmesi gibi önemli olaylarda kullanıcı bilgilendirilemiyor. | Kullanıcılar kritik anları kaçırmaz. Platform bağlılığı artar. |
| **E-posta bildirimleri** | İşlem onayı, haftalık portföy özeti gibi bilgilendirmeler yapılamıyor. | Profesyonel bir yatırım platformu izlenimi verilir. |
| **Fiyat alarmı** | "Bitcoin 100.000$'ı geçerse beni uyar" gibi bir özellik yok. | Kullanıcılar stratejilerini önceden planlayabilir. |

### 3.6 Sosyal ve Eğitim

| Eksik | Sorun | Eklenirse Ne Olur? |
|-------|-------|---------------------|
| **Kullanıcı profil sayfaları (public)** | Başka kullanıcıların portföy performansı görülemiyor. | Sosyal öğrenme ortamı oluşur. Başarılı yatırımcılar takip edilebilir. |
| **Yatırım eğitim modülleri** | Platform sadece simülasyon sunuyor, eğitim içeriği yok. | Yeni başlayanlar temel kavramları öğrenebilir. Platform bir eğitim aracı haline gelir. |
| **Yarışmalar / Turnuvalar** | Sürekli bir liderlik tablosu var ama dönemsel yarışmalar düzenlenemiyor. | Kullanıcı katılımı ve geri dönüşü artar. Sponsorluk ve ortaklık fırsatları doğar. |

### 3.7 Mobil Deneyim

| Eksik | Sorun | Eklenirse Ne Olur? |
|-------|-------|---------------------|
| **Mobil uygulama (iOS/Android)** | Platform sadece web üzerinden erişilebiliyor. Mobil uygulama yok. | Kullanıcılar her an her yerden erişebilir. Günlük aktif kullanım katlanarak artar. |
| **PWA (Progressive Web App)** | Tarayıcıdan ana ekrana eklenemiyor, çevrimdışı çalışmıyor. | Uygulama mağazası olmadan mobil uygulama deneyimi sağlanır. Geliştirme maliyeti düşer. |

---

## 4. Mevcut Teknik Sınırlamalar (Basitleştirilmiş)

| Konu | Durum | Etkisi |
|------|-------|--------|
| **Piyasa verileri** | Ücretsiz API'ler kullanılıyor. Güncelleme sıklığı ve veri çeşitliliği sınırlı. | Fiyatlar anlık değil, birkaç dakika gecikmeli. Bazı varlıklar takip edilemiyor. |
| **Sunucu kapasitesi** | Tek sunucu üzerinde çalışıyor. | Çok sayıda eşzamanlı kullanıcıda yavaşlama olabilir. |
| **Veri saklama** | Sadece işlem geçmişi kaydediliyor. Fiyat geçmişi saklanmıyor. | Detaylı performans analizi yapılamıyor. |

---

## 5. Önerilen Geliştirme Öncelikleri

Aşağıdaki sıralama, **kullanıcı deneyimine ve platformun büyümesine katkısına** göre yapılmıştır:

### Hemen Yapılması Gereken (1–4 Hafta)
1. **Şifre sıfırlama** — Kullanıcı kaybını önler
2. **Portföy performans grafiği** — Platformun eğitim değerini artırır
3. **Fiyat alarmı** — Kullanıcı bağlılığını artırır
4. **Push/e-posta bildirimleri** — Kritik olaylardan haberdar eder

### Kısa Vadede Yapılması Gereken (1–3 Ay)
5. **Limit emir ve Take-Profit** — Gerçekçi işlem deneyimi sağlar
6. **BIST verileri** — Türk kullanıcı tabanını genişletir
7. **Varlık dağılımı görseli** — Risk yönetimi farkındalığı yaratır
8. **SMS doğrulaması** — Platform güvenilirliğini artırır

### Orta Vadede Yapılması Gereken (3–6 Ay)
9. **Mobil uygulama veya PWA** — Erişilebilirliği katlar
10. **Dönemsel yarışmalar** — Kullanıcı katılımını artırır
11. **Yatırım eğitim modülleri** — Platformu farklılaştırır
12. **PDF/Excel rapor çıktısı** — Kurumsal kullanıma kapı açar

### Uzun Vadede Düşünülebilecek (6+ Ay)
13. **Yapay zekâ destekli öneriler** — Kişiselleştirilmiş yatırım önerileri
14. **Açığa satış ve kaldıraç** — İleri seviye yatırımcılar için
15. **Çoklu dil desteği** — Uluslararası kullanıcı tabanı

---

## 6. Sonuç

PortfoyGo, şu anki haliyle **temel bir sanal yatırım deneyimi sunmaktadır**. Kullanıcılar kayıt olabilir, piyasaları takip edebilir, alım-satım yapabilir ve birbirleriyle yarışabilir. Haber akışı, stop-loss sistemi ve rozet mekanizması gibi özellikler platformu zenginleştirmektedir.

Ancak platformun **profesyonel bir finans eğitim ve simülasyon aracına** dönüşmesi için yukarıda listelenen eksiklerin giderilmesi gerekmektedir. Özellikle:

- **Güvenlik katmanlarının güçlendirilmesi** (SMS, 2FA, şifre sıfırlama) platformun güvenilirliğini artıracaktır
- **Piyasa verisi çeşitliliğinin genişletilmesi** (BIST, daha fazla emtia) Türk kullanıcılara daha yakın bir deneyim sunacaktır
- **Analiz ve raporlama araçlarının eklenmesi** platformu basit bir oyundan gerçek bir eğitim aracına dönüştürecektir
- **Mobil erişim** günlük aktif kullanımı ve kullanıcı bağlılığını önemli ölçüde artıracaktır

Bu geliştirmeler yapıldığında PortfoyGo, üniversiteler, finans eğitim kurumları ve bireysel yatırımcılar için **değerli bir araç** haline gelebilir.

---

*Bu belge, platformun mevcut durumunu ve geliştirme potansiyelini teknik olmayan bir dille özetlemektedir.*
