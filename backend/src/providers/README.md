# Veri sağlayıcıları

Uygulama dış piyasa verisine (hisse, kripto, döviz, emtia, haber) **yalnızca bu klasördeki
arayüzler üzerinden** erişir. Rotalar, fiyatlama (`services/pricing.ts`), önbellek
(`services/marketCache.ts`) ve cron işleri hangi API'nin kullanıldığını bilmez.

```
providers/
  types.ts        Sözleşmeler: StockProvider, CryptoProvider, FxProvider, CommodityProvider, NewsProvider
  index.ts        Kayıt ve ortam değişkeniyle seçim (`providers.stocks`, `providers.crypto` …)
  adapters/       Her sağlayıcı için ince bir adaptör
```

Mevcut adaptörler mevcut servislere yalnızca yönlendirme yapar. Asıl entegrasyon kodu
olduğu gibi `services/finnhub.ts`, `coingecko.ts`, `currency.ts`, `commodity.ts` ve `news.ts`
dosyalarında durur.

## Sağlayıcı seçimi

| Veri | Değişken | Varsayılan | Kayıtlı |
| --- | --- | --- | --- |
| Hisse | `STOCK_PROVIDER` | `finnhub` | finnhub |
| Kripto | `CRYPTO_PROVIDER` | `coingecko` | coingecko |
| Döviz | `FX_PROVIDER` | `nosyapi` | nosyapi |
| Emtia | `COMMODITY_PROVIDER` | `nosyapi` | nosyapi |
| Haber | `NEWS_PROVIDER` | `rss` | rss |

Bilinmeyen bir ad verilirse sunucu açılışta anlaşılır bir hata verir. Aktif sağlayıcılar
açılış logunda yazılır.

## Yeni sağlayıcı eklemek

1. `adapters/<ad>.ts` dosyasında ilgili arayüzü uygulayın. Örneğin yeni bir hisse API'si için:

   ```ts
   import type { StockProvider } from '../types';

   export const ornekStockProvider: StockProvider = {
     id: 'ornek',
     isConfigured: () => Boolean(process.env.ORNEK_API_KEY),
     getTrackedSymbols: () => (process.env.STOCK_SYMBOLS || 'AAPL,MSFT').split(','),
     async getPopularStocks() { /* API çağrısı → StockQuote[] */ return []; },
     async getStockData(symbol) { /* → StockQuote */ throw new Error('todo'); },
   };
   ```

2. `index.ts` içindeki `registry` nesnesine ekleyin: `stocks: { finnhub: …, ornek: ornekStockProvider }`.
3. `.env` dosyasında seçin: `STOCK_PROVIDER=ornek`.

### Sözleşme kuralları

- **Birimler:** Hisse ve kripto fiyatları **USD**, döviz kurları **TL**. Emtiada `quoteCurrency`
  alanı TL mi USD mi olduğunu belirtir; `isTryQuoted()` frontend'in kuralıyla aynı olmalıdır.
- **Hatalar:** Liste dönen metotlar hata durumunda boş dizi dönebilir; önbellek son bilinen
  değeri servis etmeye devam eder. Anahtar yoksa `isConfigured()` `false` dönmelidir.
- **Kota:** Sık çağrılan uçlar önbellekten servis edilir; adaptörün kendisi istek başına API
  çağırmamalıdır. Yalnızca cron yenilemeleri sağlayıcıya gider.
- **İsteğe bağlı yetenekler:** `listSymbols` ve `countSymbols` gibi admin uçları; desteklenmiyorsa
  tanımlamayın, ilgili uç `501` döner.
