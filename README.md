# Sanal Yatırım - Finansal Oyun

Gerçek piyasa verileriyle sanal yatırım yapın, portföyünüzü büyütün ve liderlik tablosunda yarışın!

## 🚀 Özellikler

- **Gerçek Piyasa Verileri**: CoinGecko (kripto) ve Finnhub (hisse) API'leri
- **Sanal Portföy Yönetimi**: Alım-satım, komisyon hesaplamaları
- **Canlı Grafikler**: Lightweight Charts ile fiyat grafikleri
- **Responsive Tasarım**: Mobil ve desktop uyumlu
- **Dark/Light Mode**: Tema desteği
- **İşlem Geçmişi**: Detaylı alım-satım kayıtları

## 🛠️ Kurulum

1. **Projeyi klonlayın**
```bash
git clone <repo-url>
cd sanal-yatirim
```

2. **Bağımlılıkları yükleyin**
```bash
npm install
```

3. **API Key'leri ayarlayın**
`.env.local` dosyası oluşturun:

```env
# Finnhub API Key (Hisse verileri için)
FINNHUB_API_KEY=your_finnhub_api_key_here

# Alpha Vantage API Key (Alternatif hisse verisi)
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here
```

### 📊 API Key Alma

#### **CoinGecko (Kripto - Ücretsiz)**
- https://www.coingecko.com/en/api/documentation
- API key gerekmez, ücretsiz kullanım

#### **Finnhub (Hisse - Ücretsiz)**
- https://finnhub.io/docs/api
- Ücretsiz tier: 60 çağrı/dakika
- Kayıt olup API key alın

#### **Alpha Vantage (Hisse - Alternatif)**
- https://www.alphavantage.co/support/#api-key
- Ücretsiz tier: 5 çağrı/dakika, 500 çağrı/gün

4. **Geliştirme sunucusunu başlatın**
```bash
npm run dev
```

5. **Tarayıcıda açın**
```
http://localhost:3000
```

## 🎮 Nasıl Oynanır

1. **Başlangıç**: 1,000 ₺ sanal bakiye ile başlayın
2. **Piyasa Analizi**: Hisse ve kripto fiyatlarını inceleyin
3. **Alım-Satım**: Grafik butonuna tıklayarak fiyat grafiklerini görün
4. **Portföy Yönetimi**: Yatırımlarınızı takip edin
5. **Liderlik**: Diğer oyuncularla yarışın

## 🔧 Teknik Detaylar

- **Frontend**: Next.js 15, React, TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Lightweight Charts
- **State Management**: React Context + useReducer
- **Data Fetching**: SWR
- **APIs**: CoinGecko, Finnhub

## 📱 Responsive Özellikler

- Mobil cihazlarda kart görünümü
- Tablet ve desktop'ta tablo görünümü
- Touch-friendly butonlar
- Esnek grid sistemi

## 🌙 Tema Desteği

- Light/Dark/System tema seçenekleri
- Otomatik tema değişimi
- Tüm bileşenlerde tema uyumu

## 🚀 Production Build

```bash
npm run build
npm start
```

## 📝 Notlar

- CoinGecko API ücretsiz ve key gerektirmez
- Hisse verileri için Finnhub önerilir (ücretsiz tier mevcut)
- Grafik özelliği için her varlığa tıklayabilirsiniz
- Komisyon oranı: %0.1 (gerçekçi)

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📄 Lisans

MIT License - detaylar için `LICENSE` dosyasına bakın.
