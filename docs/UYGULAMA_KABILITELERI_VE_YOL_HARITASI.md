# PortfoyGo — Uygulama Kabiliyetleri ve Yol Haritası

**Belge Versiyonu:** 1.0  
**Son Güncelleme:** 7 Mart 2025  
**Proje:** PortfoyGo — Sanal Yatırım ve Portföy Yönetim Platformu

---

## 1. Yönetici Özeti

PortfoyGo, gerçek piyasa verileriyle sanal yatırım yapılmasına olanak tanıyan, kullanıcıların portföylerini yönetebildiği ve liderlik tablosunda yarışabildiği bir web uygulamasıdır. Uygulama, hisse senetleri, kripto paralar ve emtialar üzerinden işlem yapılmasına imkân sağlamaktadır.

---

## 2. Mevcut Uygulama Kabiliyetleri

### 2.1 Kimlik Doğrulama ve Kullanıcı Yönetimi

| Özellik | Açıklama | Durum |
|---------|----------|-------|
| Kayıt | Kullanıcı adı, e-posta ve şifre ile kayıt | ✅ Aktif |
| Giriş | E-posta ve şifre ile oturum açma | ✅ Aktif |
| E-posta Doğrulama | Kayıt sonrası e-posta doğrulama akışı | ✅ Aktif |
| JWT Kimlik Doğrulama | Token tabanlı oturum yönetimi | ✅ Aktif |
| Şifre Güvenliği | bcrypt ile hash’lenmiş şifre saklama | ✅ Aktif |

### 2.2 Piyasa Verileri

| Özellik | Veri Kaynağı | Açıklama | Durum |
|---------|--------------|----------|-------|
| Hisse Senetleri | Finnhub API | Popüler hisse senetleri (ör. AAPL, GOOGL, MSFT) | ✅ Aktif |
| Kripto Paralar | CoinGecko API | Gerçek zamanlı kripto fiyatları | ✅ Aktif |
| Emtialar | NosyAPI (EMTIA) | Altın, gümüş, petrol, doğalgaz vb. | ✅ Aktif |
| Market Cache | Dahili cache servisi | 2 dakikada bir güncelleme, API limitlerini azaltma | ✅ Aktif |

### 2.3 Portföy ve İşlem Yönetimi

| Özellik | Açıklama | Durum |
|---------|----------|-------|
| Sanal Bakiye | Başlangıç: 1.000 ₺ sanal bakiye | ✅ Aktif |
| Alım İşlemi | Hisse, kripto ve emtia alımı | ✅ Aktif |
| Satış İşlemi | Portföydeki varlıkların satışı | ✅ Aktif |
| Komisyon Hesaplama | %0,1 komisyon oranı | ✅ Aktif |
| Ortalama Maliyet | Ortalama alış fiyatı takibi | ✅ Aktif |
| Kar/Zarar Takibi | Anlık kar/zarar hesaplaması | ✅ Aktif |

### 2.4 Stop-Loss Sistemi

| Özellik | Açıklama | Durum |
|---------|----------|-------|
| Stop-Loss Emri Oluşturma | Portföy öğesi için tetikleme fiyatı belirleme | ✅ Aktif |
| Otomatik Tetikleme | Cron job ile dakikada bir kontrol | ✅ Aktif |
| Stop-Loss İptali | Aktif emirlerin iptal edilmesi | ✅ Aktif |

### 2.5 Liderlik ve Sosyal Özellikler

| Özellik | Açıklama | Durum |
|---------|----------|-------|
| Liderlik Tablosu | Kar/zarar yüzdesine göre sıralama | ✅ Aktif |
| Kullanıcı Sıralaması | E-posta doğrulanmış kullanıcılar dahil | ✅ Aktif |
| Rozet Sistemi | İşlem sayısı, kâr, portföy değeri vb. kriterlere göre rozetler | ✅ Aktif |

### 2.6 Grafik ve Görselleştirme

| Özellik | Açıklama | Durum |
|---------|----------|-------|
| Fiyat Grafikleri | Lightweight Charts ile interaktif grafikler | ✅ Aktif |
| Varlık Detay Sayfası | Her varlık için ayrı sayfa ve grafik | ✅ Aktif |
| Fiyat Animasyonları | Fiyat değişimlerinde görsel geri bildirim | ✅ Aktif |

### 2.7 Yönetim ve Güvenlik

| Özellik | Açıklama | Durum |
|---------|----------|-------|
| Admin Paneli | İstatistikler, kullanıcı listesi | ✅ Aktif |
| Kullanıcı Banlama | Admin tarafından kullanıcı engelleme | ✅ Aktif |
| Aktivite Logları | Giriş, işlem vb. olayların kaydı | ✅ Aktif |
| Rate Limiting | API çağrı limitleri (örn. Finnhub: 60/dk) | ✅ Aktif |

### 2.8 Kullanıcı Arayüzü

| Özellik | Açıklama | Durum |
|---------|----------|-------|
| Responsive Tasarım | Mobil, tablet ve masaüstü uyumlu | ✅ Aktif |
| Dark/Light Mode | Tema seçenekleri (Light, Dark, System) | ✅ Aktif |
| Sayfa Geçişleri | GSAP ile animasyonlu geçişler | ✅ Aktif |
| Piyasa Sekmeleri | Hisse, kripto ve emtia sekmeleri | ✅ Aktif |

### 2.9 Yasal ve Bilgilendirme

| Özellik | Açıklama | Durum |
|---------|----------|-------|
| Gizlilik Politikası | KVKK uyumlu gizlilik metni | ✅ Aktif |
| Kullanım Koşulları | Kullanım şartları sayfası | ✅ Aktif |

---

## 3. Teknik Altyapı

### 3.1 Frontend

- **Framework:** Next.js 15, React 19
- **Dil:** TypeScript
- **Stil:** Tailwind CSS 4
- **State:** React Context + useReducer
- **Veri Çekme:** SWR
- **Grafik:** Lightweight Charts, Recharts

### 3.2 Backend

- **Runtime:** Node.js
- **Framework:** Express.js
- **Veritabanı:** PostgreSQL
- **Zamanlanmış Görevler:** node-cron

### 3.3 Harici API’ler

> **Not:** Mevcut API’ler veri kalitesi, güncellik ve limitler açısından yetersiz kalmaktadır. Bu durumun iyileştirilmesi yol haritasında öncelikli olarak planlanmaktadır.

| API | Kullanım | Limit |
|-----|----------|-------|
| CoinGecko | Kripto fiyatları | Ücretsiz, key gerektirmez |
| Finnhub | Hisse fiyatları | 60 çağrı/dakika (ücretsiz) |
| NosyAPI (EMTIA) | Emtia fiyatları | API key gerekli |

---

## 4. Planlanan Geliştirmeler ve Yol Haritası

### 4.1 Kısa Vadeli (1–3 Ay)

| Öncelik | Geliştirme | Açıklama |
|---------|------------|----------|
| Yüksek | API Altyapısı İyileştirmesi | Mevcut API’lerin yetersizliği; daha güvenilir, güncel ve kapsamlı veri kaynaklarına geçiş |
| Yüksek | Hisse Verisi İyileştirmesi | Hisse verilerinin mock’tan canlı Finnhub verisine tam geçişi |
| Yüksek | Rozet Hesaplama İyileştirmesi | Kârlı işlem sayısının portföy öğelerinden doğru hesaplanması |
| Orta | USD/TRY Döviz Kuru | Sabit 32.5 yerine gerçek zamanlı döviz kuru entegrasyonu |
| Orta | Bildirim Sistemi | Stop-loss tetikleme, portföy uyarıları için e-posta/push bildirimleri |
| Orta | Portföy Performans Grafiği | Zaman içinde portföy değeri grafiği |

### 4.2 Orta Vadeli (3–6 Ay)

| Öncelik | Geliştirme | Açıklama |
|---------|------------|----------|
| Yüksek | Limit Emirler | Belirli fiyattan alım/satım emirleri |
| Orta | Take-Profit Emirleri | Hedef fiyata ulaşınca otomatik satış |
| Orta | Portföy Çeşitlendirme Analizi | Varlık dağılımı ve risk analizi |
| Orta | Mobil Uygulama | PWA veya native mobil uygulama |
| Düşük | Sosyal Özellikler | Kullanıcı profilleri, takip sistemi |

### 4.3 Uzun Vadeli (6+ Ay)

| Öncelik | Geliştirme | Açıklama |
|---------|------------|----------|
| Orta | Yapay Zeka Önerileri | Portföy ve işlem önerileri |
| Orta | Eğitim Modülleri | Yatırım eğitimi, simülasyon senaryoları |
| Düşük | Çoklu Dil Desteği | İngilizce ve diğer diller |
| Düşük | API Erişimi | Geliştiriciler için public API |

---

## 5. Bilinen Sınırlamalar

1. **API Yetersizliği:** Şu an kullanılan harici API’ler (Finnhub, CoinGecko, NosyAPI) veri çeşitliliği, güncellik ve limitler açısından yetersiz kalmaktadır. Bu durum kullanıcı deneyimini ve veri kalitesini olumsuz etkilemektedir. **API altyapısının iyileştirilmesi planlanmaktadır.**
2. **Hisse Verileri:** Hisse fiyatları şu an cache/mock veri kullanıyor; tam canlı veri geçişi planlanıyor.
3. **Döviz Kuru:** USD/TRY oranı sabit (32.5); gerçek zamanlı kur entegrasyonu yapılacak.
4. **Emtia API:** NosyAPI (EMTIA) key gerektirir; key yoksa mock veri kullanılıyor.
5. **Rozet Sistemi:** Kârlı işlem sayısı hesaplaması basitleştirilmiş; portföy bazlı iyileştirme planlanıyor.

---

## 6. Doküman Geçmişi

| Versiyon | Tarih | Değişiklik |
|----------|-------|------------|
| 1.0 | 7 Mart 2025 | İlk sürüm — mevcut kabiliyetler ve yol haritası |

---

*Bu belge, PortfoyGo projesinin mevcut durumunu ve planlanan geliştirmelerini özetlemektedir. Güncellemeler proje ilerlemesine göre yapılacaktır.*
