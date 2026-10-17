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

İlk adaptörler (finnhub, coingecko, nosyapi, rss) mevcut servislere yalnızca yönlendirme yapar; asıl entegrasyon
kodu olduğu gibi `services/finnhub.ts`, `coingecko.ts`, `currency.ts`, `commodity.ts` ve `news.ts` dosyalarında durur
(bu dosyaların içi DEĞİŞTİRİLMEZ). Ücretsiz kaynaklar ayrı adaptör dosyalarıdır (aşağıda).

## Sağlayıcı seçimi

| Veri | Değişken | Varsayılan | Kayıtlı |
| --- | --- | --- | --- |
| Hisse | `STOCK_PROVIDER` | `finnhub` | finnhub, finnhub-cached |
| Kripto | `CRYPTO_PROVIDER` | `coingecko` | coingecko |
| Döviz | `FX_PROVIDER` | `nosyapi` | nosyapi, tcmb, frankfurter |
| Emtia | `COMMODITY_PROVIDER` | `nosyapi` | nosyapi, pricehistory, goldapi |
| Haber | `NEWS_PROVIDER` | `rss` | rss |

## Ücretsiz kaynaklar (anahtarsız / ücretsiz katman)

| Adaptör | Dosya | Kaynak | Anahtar | Gecikme | Kota / nezaket |
| --- | --- | --- | --- | --- | --- |
| `coingecko` | `adapters/coingecko.ts` | CoinGecko `/coins/markets` (genel uç) | yok (varsa Demo/Pro) | ~1–2 dk | Anahtarsız genel uç dakikada ~5–15 istek; iş 2 dk'da bir TEK istek (ilk `CRYPTO_TOP_N`, varsayılan 50) |
| `tcmb` | `adapters/tcmbCurrency.ts` | TCMB `kurlar/today.xml` + arşiv (önceki iş günü, değişim % için) | yok | **günlük** (iş günü ~15:30) | 12 sa'te bir + açılış; önceki bülten günde bir kez (hafta sonu 404'leri atlanır, en fazla 7) |
| `frankfurter` | `adapters/frankfurterCurrency.ts` | api.frankfurter.dev `/v1/{başlangıç}..{bitiş}?base=USD` (ECB vb. referans kurları) | yok | **günlük** | Tek istek; kota yok ("fair use") |
| `goldapi` | `adapters/goldApiCommodity.ts` | api.gold-api.com `/price/{XAU,XAG,XPT,XPD,HG}` | yok | anlık | Liste en fazla 2 dk'da bir (`GOLD_API_REFRESH_MS`), istekler arası 1,1 sn (koşullar: saniyede birden fazla istek yasak) |
| `pricehistory` | `adapters/priceHistoryCommodity.ts` | `price_history` tablosundaki son fiyat (dış API yok) | — | tabloyu besleyene bağlı | — |
| `finnhub-cached` | `adapters/finnhubCached.ts` | Finnhub `/quote` + `/stock/profile2` (FinnhubService üzerinden) | **gerekli** | anlık (ücretsiz katman) | Hisse başına 1 çağrı/tur, profil 24 sa önbellek ve tur başına en fazla `FINNHUB_PROFILE_BATCH` (8); 48 hisse ≈ 24 çağrı/dk |

- **Hisse evreni:** `providers/stockUniverse.ts` (48 büyük ABD şirketi, sektörlere yayılmış; `STOCK_SYMBOLS` ile değiştirilir,
  en fazla 50). Anahtarsız, meşru bir ABD hisse fiyat kaynağı yok: anahtar yoksa önbellekteki (yerelde tohum) fiyatlar kalır.
- **Emtia:** Değerli metaller için gold-api.com; **petrol, doğal gaz, tarım ürünleri için anahtarsız resmî/ücretsiz kaynak
  bulunamadı** (FRED ticari kullanıma ve önbelleklemeye izin vermiyor; EIA ücretsiz ama anahtar ister). Bunlar son bilinen
  fiyatta kalır. Gram altın (GAU, TL) ons altından türetilir: `GOLD × USD/TRY ÷ 31,1034768`.
- **Binance** genel piyasa verisi bu makineden erişilemedi (bağlantı zaman aşımı), bu yüzden eklenmedi.
- **Tazelik:** Hiçbir adaptör işlem tazelik pencerelerini (`services/pricing.ts` → `MAX_PRICE_AGE_MS`) gevşetmez: kaynak
  kesilirse fiyat yaşlanır ve işlem 503 `PRICE_UNAVAILABLE` ile reddedilir. `pricehistory`/`goldapi` tablodan okudukları
  fiyatları `fromHistory: true` ile işaretler; fiyat geçmişi işi bunları tabloya geri yazmaz (bayat fiyat "taze" damgalanmaz).
- **Lisans:** Her kaynağın ticari gösterim koşulları canlıya çıkmadan kontrol edilmeli (bkz. `docs/YAYIN_KONTROL_LISTESI.md`).

## Yerelde canlı fiyat (`npm run dev:local`)

`src/dev/localEnv.ts` yerelde **yalnızca anahtarsız** kaynakları seçer ve varsayılan olarak açıktır:
kripto `coingecko` (genel uç), döviz `tcmb`, emtia `goldapi`; piyasa cache işi açılır (`DISABLE_MARKET_REFRESH=0`).
`backend/.env`'deki gerçek anahtarlar hiçbir durumda kullanılmaz (boş değerlerle ezilir).

| Kabuk değişkeni | Etki |
| --- | --- |
| `LOCAL_LIVE_PRICES=0` | Tamamen çevrimdışı: dış istek yok, `DISABLE_MARKET_REFRESH=1`, emtia `pricehistory`, fiyatlar tohum + simülasyon |
| `LOCAL_FX_PROVIDER=frankfurter` | Döviz için TCMB yerine Frankfurter (ECB) |
| `LOCAL_FINNHUB_API_KEY=…` | Hisseler de canlı (`finnhub-cached`); yalnızca bu değişkendeki (test) anahtar kullanılır |

Yerel fiyat simülasyonu (`dev/seed.ts` → `tickMarket`, veritabanı sürecinde dakikada bir) canlı beslenen satırlara
(kripto, döviz, gold-api metalleri; anahtar varsa hisseler) dokunmaz. Değişkenler `dev:local` açılışında okunur:
değiştirdikten sonra süreci yeniden başlatın. Testler (`vitest`) bu dosyayı kullanmaz, ağa çıkmaz (sahte HTTP).

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
