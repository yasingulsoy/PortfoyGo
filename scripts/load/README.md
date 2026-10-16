# Yük testi — sıcak okuma yolları

`hot-paths.mjs`, oturum açmış kullanıcıların uygulamada gezinirken ürettiği okuma trafiğini
[autocannon](https://github.com/mcollina/autocannon) ile taklit eder ve uç başına gecikmeyi raporlar.
Yalnızca **yerel / staging** ortamında çalıştırın (oturumlar `dev-login` ile alınır; canlıda bu uç kapalıdır).

## Karışım

| Uç | Ağırlık | Neden |
| --- | ---: | --- |
| `GET /api/auth/profile` | 10 | her sayfa yüklemesi |
| `GET /api/stocks` | 12 | piyasa sayfası 15 sn'de bir yoklar |
| `GET /api/cryptos?limit=25` | 12 | piyasa sayfası 15 sn'de bir yoklar |
| `GET /api/portfolio` | 14 | portföy / işlem ekranları |
| `GET /api/leaderboard?board=alltime\|week` | 6 + 4 | liderlik |
| `GET /api/notifications/unread-count` | 10 | rozet |
| `GET /api/arena/rounds/active` | 8 | Arena ana ekranı |
| `GET /api/picks/current` | 8 | Haftalık Seçim + Oyun Merkezi rozeti |
| `GET /api/game/profile` | 10 | Oyun Merkezi |
| `GET /api/market/session` | 6 | seans bilgisi |

Ayrıca test boyunca `LOAD_SSE` adet bildirim akışı (`/api/notifications/stream`) açık tutulur; bağlanma
süresi hem boşta hem yük altında ölçülür. Her istek rastgele bir kullanıcının çerezini ve rastgele bir
`X-Forwarded-For` adresini taşır: API `TRUST_PROXY=1` iken her "istemci" kendi IP sınırına sahip olur
(aksi halde tek makineden gelen trafik genel 300/dk sınırına takılır).

## Çalıştırma

```bash
# 1) Yerel yığın: npm run dev:local  (PGlite 127.0.0.1:54329 + API :5001)
# 2) Yük testi için AYRI bir API örneği (aynı yerel DB'ye; işleri çalıştırmaz, vekil başlığına güvenir):
cd backend
DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres DB_SSL=false DB_HOST=127.0.0.1 \
JWT_SECRET=dev-only-local-jwt-secret-do-not-use-in-production-000000 NODE_ENV=development \
PORT=5101 RUN_JOBS=0 TRUST_PROXY=1 METRICS_TOKEN=load-test-metrics-token LOG_PRETTY=0 \
DISABLE_MARKET_REFRESH=1 FINNHUB_API_KEY= FINNHUB_API_KEYS= COINGECKO_API_KEY= DOVIZ= EMTIA= SMTP_HOST= \
npx ts-node --transpile-only src/index.ts > ../load-api.log 2>&1 &
# 3) Test
cd ..
LOAD_METRICS_TOKEN=load-test-metrics-token node scripts/load/hot-paths.mjs
```

| Değişken | Varsayılan | |
| --- | --- | --- |
| `LOAD_BASE_URL` | `http://127.0.0.1:5101` | hedef API |
| `LOAD_CONNECTIONS` / `LOAD_DURATION` / `LOAD_WARMUP` | 50 / 30 sn / 5 sn | |
| `LOAD_SSE` | 20 | açık tutulan SSE akışı (kullanıcı başına en fazla 5) |
| `LOAD_USERS` | `mert_kripto,aylin_trader,zeynep_uzun,can_hisse,demo` | dev-login kullanıcı adları |
| `LOAD_METRICS_TOKEN` | — | verilirse sunucu tarafı Prometheus histogramı da (uç başına ortalama / p95 kovası) yazdırılır |
| `LOAD_SPOOF_IP` | 1 | 0 → `X-Forwarded-For` gönderme |
| `LOAD_OUT` | — | JSON sonuç dosyası |

## Sonuçlar (15 Ekim 2026, geliştirme dizüstü bilgisayarı, 50 bağlantı × 30 sn, 20 SSE)

### A) Yerel PGlite (`npm run dev:local` veritabanı, 6 kullanıcı)

PGlite tek iş parçacıklı (WASM) olduğu için tüm sorgular sıraya girer; buradaki sınır sorgu SAYISIDIR.

| | Önce | Sonra |
| --- | ---: | ---: |
| İstek/sn | 419 | **545** (+30%) |
| p50 / p90 / p99 (ms) | 90 / 225 / 548 | **47** / 248 / 566 |
| `/api/stocks`, `/api/cryptos` p50 / p95 (ms) | 48 / 140 | **1 / 3** |
| `/api/leaderboard` p50 / p95 (ms) | 47 / 132–145 | **1 / 3** |
| `/api/auth/profile` p50 / p95 (ms) | 136 / 410 | **90** / 304 |
| 2xx dışı / hata | 0 / 0 | 0 / 0 |
| SSE | 20/20 açık | 20/20 açık |

### B) Gerçek PostgreSQL 18 + MVP ölçeğinde veri

1.200 kullanıcı (1.000 doğrulanmış), 8.000 pozisyon, 60.000 işlem, 150.000 bildirim, 66.000 Arena turu,
90.000 görev satırı; aynı derleme, önbellekler kapalı (`LEADERBOARD_CACHE_MS=0 MARKET_LIST_CACHE_MS=0`) ve açık.

| | Önbellek kapalı | Önbellek açık | + `DB_POOL_MAX=25` |
| --- | ---: | ---: | ---: |
| İstek/sn | 921 | **1.429** (+55%) | 1.407 |
| p50 / p90 / p99 (ms) | 39 / 115 / 230 | 33 / **83** / **141** | 34 / 77 / 124 |
| `/api/auth/profile` p50 / p95 | 58 / 171 | **39 / 66** | 39 / 65 |
| `/api/leaderboard` p50 / p95 | 25 / 69 | **3 / 7** | 7 / 14 |
| `/api/stocks` p50 / p95 | 20 / 60 | **3 / 7** | 7 / 15 |
| `/api/game/profile` p50 / p95 | 71 / 221 | 76 / 125 | 70 / 113 |
| `/api/picks/current` p50 / p95 | 85 / 252 | 94 / 163 | 86 / 134 |

Havuzu büyütmek verimi artırmadı: önbellekten sonra sınır tek Node sürecinin CPU'su (JSON, JWT, log).
Sonraki adım yatay ölçekleme (birden çok API örneği + worker; bkz. docs/YAYIN_KONTROL_LISTESI.md).

## Bulunan darboğazlar ve düzeltmeler

1. **Her istekte tam sıralama** — `/api/auth/profile` (her sayfa yüklemesi) `LeaderboardService.getAllTimeRank`
   ile, `/api/leaderboard` her çağrıda `users` + `portfolio_items` tam tarama + HashAggregate + WindowAgg
   çalıştırıyordu. EXPLAIN ANALYZE (1.000 kullanıcı): **7,7 ms** ve **8,1 ms**/sorgu, kullanıcı sayısıyla
   doğrusal büyür (haftalık e-posta özeti de kullanıcı başına bir kez çağırır). Düzeltme: süreç içi TTL +
   single-flight önbellek (`LEADERBOARD_CACHE_MS`, varsayılan 15 sn) — sıralama haritası TTL başına bir kez.
2. **Piyasa listesi yoklaması** — `/api/stocks` ve `/api/cryptos` her açık sekmeden 15 sn'de bir gelir; trafiğin
   ~%24'ü, her biri aynı `market_data_cache` sorgusu + eşleme. Veri 2 dk'da bir değişir. Düzeltme: 5 sn'lik
   liste önbelleği (`MARKET_LIST_CACHE_MS`), `saveToCache` sonrası temizlenir.
3. **Eksik bileşik indeks** — işlem geçmişi `WHERE user_id ORDER BY created_at DESC LIMIT n` yalnızca ayrı
   `(user_id)` / `(created_at)` indekslerini bulabiliyordu (5.000 işlemli kullanıcı: global `created_at`
   indeksini baştan tarama, **1,52 ms**). `migrations/021_perf_indexes.sql` → `(user_id, created_at DESC)`:
   **0,15 ms**.

Kontrol edilip sorun bulunmayanlar (mevcut indeksler yeterli, < 0,5 ms): okunmamış bildirim sayısı (kısmi
indeks), portföy pozisyonları, aktif Arena turu, günün görevleri, bugünkü tur sayısı.

**Sıradaki adaylar** (bu çalışmada değiştirilmedi): `/api/game/profile` istek başına 9 sorgu (biri her GET'te
`INSERT … ON CONFLICT DO NOTHING`; gerçek PG'de ~15 µs, WAL yok), `/api/picks/current` istek başına 5 sorgu
(yorum sayısı iki kez) — sorgu birleştirme / kısa TTL ile azaltılabilir. `ResponsiblePlay.lossStreak`
kullanıcının tüm bitmiş turlarını birleştirip sıralar (250 turda ~1–3 ms; kapsayan indeks denendi, kazanç yok).
