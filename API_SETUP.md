# API Kurulum Rehberi

Bu proje gerçek finansal verilerle çalışabilmesi için aşağıdaki API'lere ihtiyaç duyar.

## 🔑 Gerekli API Key'ler

### 1. Alpha Vantage (Hisse Senetleri için)
- **Ücretsiz**: 25 request/gün
- **Ücretli**: 75$/ay - 1200 request/dakika
- **Kayıt**: https://www.alphavantage.co/support/#api-key
- **Kullanım**: ABD hisse senetleri, gerçek zamanlı veriler

### 2. CoinGecko (Kripto Paralar için)
- **Ücretsiz**: 10-50 request/dakika
- **Pro**: 19$/ay - 500 request/dakika
- **Kayıt**: https://www.coingecko.com/en/api/pricing
- **Kullanım**: Kripto para verileri, piyasa kapitalizasyonu

### 3. Finnhub (Alternatif Hisse Verileri)
- **Ücretsiz**: 60 request/dakika
- **Kayıt**: https://finnhub.io/register
- **Kullanım**: Hisse senetleri, finansal haberler

### 4. IEX Cloud (ABD Hisse Senetleri)
- **Ücretsiz**: 100,000 request/ay
- **Kayıt**: https://iexcloud.io/pricing
- **Kullanım**: ABD hisse senetleri, yüksek kaliteli veriler

## 📁 Kurulum Adımları

1. **Proje kök dizinine `.env.local` dosyası oluşturun:**
```bash
# API Keys
NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here
NEXT_PUBLIC_COINGECKO_API_KEY=your_coingecko_key_here
NEXT_PUBLIC_FINNHUB_API_KEY=your_finnhub_key_here
NEXT_PUBLIC_IEX_CLOUD_API_KEY=your_iex_cloud_key_here

# Uygulama ayarları
NEXT_PUBLIC_APP_NAME="Sanal Yatırım Platformu"
NEXT_PUBLIC_APP_VERSION="1.0.0"
```

2. **API key'lerinizi ilgili servislere kaydolarak alın**

3. **Projeyi yeniden başlatın:**
```bash
npm run dev
```

## 🌟 Önerilen Başlangıç

**Sadece test etmek için:**
- CoinGecko ücretsiz hesap (API key gerekmez)
- Alpha Vantage ücretsiz hesap

**Canlı kullanım için:**
- Alpha Vantage ücretli plan
- CoinGecko Pro plan
- IEX Cloud ücretli plan

## 🔧 API Entegrasyonu

API key'ler alındıktan sonra şu dosyalar güncellenecek:
- `src/services/api.ts` - Hisse senetleri ✅ (Güncellenmiş)
- `src/services/crypto.ts` - Kripto paralar ✅ (Güncellenmiş)
- `src/app/api/stocks/route.ts` - API endpoint'leri

## 🚀 Hızlı Başlangıç

### Alpha Vantage API Key Alma (En Popüler)

1. **Alpha Vantage'e kaydol:**
   - https://www.alphavantage.co/support/#api-key adresine git
   - "Get your free API key today!" butonuna tıkla
   - Email adresini gir ve formu doldur
   - Email'ini doğrula

2. **API Key'i al:**
   - Dashboard'a giriş yap
   - API key'ini kopyala (örnek: `ABCD1234EFGH5678`)

3. **Projeye ekle:**
   ```bash
   # .env.local dosyasına ekle
   NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY=ABCD1234EFGH5678
   ```

### CoinGecko API Key Alma (Kripto için)

1. **CoinGecko'ya kaydol:**
   - https://www.coingecko.com/en/api/pricing adresine git
   - "Sign Up" butonuna tıkla
   - Hesap oluştur ve email'ini doğrula

2. **API Plan seç:**
   - **Demo (Ücretsiz)**: API key gerektirmez, rate limiting var
   - **Analyst ($19/ay)**: Daha yüksek limit, özel API key

3. **API Key'i al (Ücretli planlar için):**
   - Developer Dashboard'a git
   - API key'ini kopyala

4. **Projeye ekle:**
   ```bash
   # .env.local dosyasına ekle (opsiyonel)
   NEXT_PUBLIC_COINGECKO_API_KEY=your_coingecko_key_here
   ```

### Finnhub API Key Alma (Alternatif)

1. **Finnhub'a kaydol:**
   - https://finnhub.io/register adresine git
   - Ücretsiz hesap oluştur

2. **API Key'i al:**
   - Dashboard'da API key'i bul
   - Kopyala (örnek: `c123456789`)

3. **Projeye ekle:**
   ```bash
   # .env.local dosyasına ekle
   NEXT_PUBLIC_FINNHUB_API_KEY=c123456789
   ```

## ⚡ Test Etme

1. **Projeyi başlat:**
   ```bash
   npm run dev
   ```

2. **API'leri test et:**
   - Ana sayfaya git: http://localhost:3000
   - Hisse senetleri ve kripto verilerini kontrol et
   - Browser Console'da hata mesajlarını kontrol et

3. **API durumunu kontrol et:**
   - Eğer mock data görüyorsan: API key'ler eksik veya hatalı
   - Eğer gerçek data görüyorsan: ✅ Başarılı

## 🐛 Sorun Giderme

### Yaygın Sorunlar:

1. **"API rate limit exceeded"**
   - Çözüm: Ücretli plana geç veya bekleme süresi koy

2. **"Invalid API key"**
   - Çözüm: API key'i kontrol et, doğru kopyaladığından emin ol

3. **"CORS errors"**
   - Çözüm: Server-side API route'ları kullan (mevcut)

4. **Mock data görünüyor**
   - Çözüm: `.env.local` dosyasını kontrol et, doğru API key'leri gir

### Debug Modları:

```bash
# Console'da API durumunu kontrol et
console.log('Alpha Vantage Key:', process.env.NEXT_PUBLIC_ALPHA_VANTAGE_API_KEY)
console.log('CoinGecko Key:', process.env.NEXT_PUBLIC_COINGECKO_API_KEY)
```

## 💡 İpuçları

- **Ücretsiz başla**: Alpha Vantage ücretsiz + CoinGecko demo ile test et
- **Rate limiting**: API çağrılarını cache'le ve optimize et
- **Backup planı**: Birden fazla API provider kullan
- **Monitoring**: API quota'larını takip et
