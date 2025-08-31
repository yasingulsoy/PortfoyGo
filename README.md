# Sanal Yatırım Oyunu

Modern Next.js (App Router, TS, Tailwind) ile geliştirilen, gerçek kripto verileri ve mock hisse verileriyle çalışan sanal borsa oyunu.

## Özellikler
- Hisseler (mock) ve kripto (CoinGecko canlı) piyasa listesi
- Portföy yönetimi, kâr/zarar ve nakit bakiye takibi
- Al/Sat modalı, işlem geçmişi ve CSV dışa aktarım
- Liderlik tablosu (statik örnek, genişletilebilir)
- Responsive, modern UI (Navbar, Footer, MarketTabs)

## Kurulum
```bash
npm install
npm run dev
```

## Ortam Değişkenleri
`.env.local` içinde aşağıdakileri tanımlayabilirsiniz (opsiyonel):
```
# Hisse API anahtarları (ileride entegrasyon için)
ALPHA_VANTAGE_API_KEY=your_key
FINNHUB_API_KEY=your_key
```

- Kripto verileri CoinGecko ile sağlanır; ücretsiz kullanım için anahtar gerektirmez.

## Geliştirme Notları
- Kripto görselleri için `next.config.ts` içinde `assets.coingecko.com` domaini izinlidir.
- Hisse verileri şimdilik mock. Gerçek veriye geçişte `src/services/api.ts` içinde ilgili çağrıları açıp API anahtarlarını `.env.local`'dan okuyacak şekilde uyarlayın.

## Komutlar
- `npm run dev`: Geliştirme sunucusu
- `npm run build`: Üretim build'i
- `npm run start`: Build sonrası çalıştırma
- `npm run lint`: Lint
