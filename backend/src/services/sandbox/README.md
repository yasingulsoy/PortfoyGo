# Sanal portföy motoru (sandbox)

USD bazlı, varsayımsal portföyler. **Model Portföy** (`kind = 'model'`, kullanıcı başına ≤ 5, her biri 100.000 USD) ve
**Portföy Ligi** (`kind = 'league'`, migration 023) bu motorun üzerine kurulur. Ana uygulamanın TL bakiyesine,
`portfolio_items` / `transactions` tablolarına **dokunmaz**.

```ts
import { Sandbox, SandboxPrices } from '../services/sandbox';
```

Şema: `migrations/022_sandbox_portfolios.sql` — `sandbox_portfolios`, `sandbox_holdings`, `sandbox_trades`,
`sandbox_snapshots` (günlük), `sandbox_snapshots_hourly` (saatlik, 35 gün).
`league_id` / `team_id` için yabancı anahtar YOK (lig tabloları 023'te); gerekiyorsa 023 eklesin.

## Birimler ve kurallar

| Konu | Kural |
| --- | --- |
| Para birimi | USD. Nakit = USD (USD ayrıca alınıp satılamaz; TRY bu portföyde işlem görmez) |
| Tutarlar | Kuruşa yuvarlı (`NUMERIC(20,2)`). Miktar kesirli, 1e-8'e **aşağı** yuvarlanır (`NUMERIC(30,10)`) |
| Komisyon | `ceil2(brüt × commission_bps / 10000)` — 25 bps = %0,25 (ana uygulamadaki `COMMISSION_RATE`) |
| Alış | nakit −= brüt + komisyon. `brüt + komisyon > nakit` → 400 `INSUFFICIENT_CASH` (kaldıraç yok, nakit ≥ 0 DB kısıtı) |
| Satış | nakit += brüt − komisyon. Eldekinden fazlası → 400 `INSUFFICIENT_QUANTITY` (açığa satış yok). Kalan < 1e-8 → pozisyon silinir |
| Ortalama maliyet | `avg_cost_usd` = brüt alış / miktar (komisyon hariç; ana uygulamayla aynı). Satış ortalamayı değiştirmez |
| En küçük işlem | 1 USD brüt (`MIN_TRADE_USD`; tam kapanış satışları hariç) → 400 `TRADE_TOO_SMALL` |
| Ağırlıklar | **Yüzde** (0–100). `drift` = güncel − hedef (yüzde puan) |
| Durum | `active` → işlem serbest; `frozen` / `archived` → yazan her çağrı 409 `SANDBOX_FROZEN` |
| Eşzamanlılık | Yazan her çağrı `SELECT … FROM sandbox_portfolios WHERE id = $1 FOR UPDATE` ile başlar |
| Yetki | Motor yetki kontrolü **yapmaz**; `actorUserId` yalnızca `sandbox_trades.actor_user_id`'ye yazılır. Sahiplik / takım üyeliği çağıranın işi |
| Seans | ABD seans kuralı (MARKET_CLOSED) **uygulanmaz**; son taze fiyattan işlenir. İsteyen çağıran `assertMarketOpenFor` ile kontrol eder |

Varlık sınıfları: `hisse` (stock), `kripto` (crypto), `doviz` (currency), `emtia` (commodity), `nakit`.

## Fiyatlar (`SandboxPrices`) — yalnızca saklanmış veri okunur

| Tip | Kaynak | USD'ye çevirme |
| --- | --- | --- |
| stock / crypto | `market_data_cache.price` | zaten USD |
| currency | `currency_rates` (TL/birim) | ÷ USD/TRY. Alış = satış kuru, satış = `min(alış, satış)` kuru (makas) |
| commodity | `providers.commodities.getPrice` (önbellek); yoksa `price_history`'deki en son kayıt | TL kotalılar ÷ USD/TRY |

USD/TRY = `PricingService.getUsdTry()`. Tazelik: **işlem** için `pricing.ts` `MAX_PRICE_AGE_MS` (hisse/kripto 15 dk,
döviz/emtia 24 saat) — bayat/eksik fiyat → 503 `PRICE_UNAVAILABLE` (`symbols: [...]`). **Değerleme** hisse/kripto için
1 saat; daha eski fiyat yine kullanılır ama `stale: true` olur (hiç fiyat yoksa maliyetten değerlenir).

- `getUsdPrices(keys, db?)` → `Map<'type:SYMBOL', UsdQuote>` (`price_usd`, `sell_price_usd`, `fresh`, `valuation_fresh`, `as_of`, `name`, `asset_class`, `change_24h_pct`)
- `requireTradeQuotes(keys)` → taze değilse 503; USD/TRY dövizi → 400 `INVALID_ASSET`
- `searchAssets(q?, type?)` → işlem için taze fiyatı olan ≤ 50 varlık (`price_usd`)
- `dailyUsdSeries(keys, from)` → `price_history` günlük kapanışlarından USD serileri (metrik / simülasyon)

## Servis (`Sandbox`, hepsi `static`)

`client?: PoolClient` verilirse çağıranın transaction'ında çalışır (BEGIN/COMMIT çağıranda), yoksa kendi transaction'ını açar.

| Metot | Dönüş / not |
| --- | --- |
| `create({kind, name, userId, startingCash = 100000, commissionBps = 25, leagueId?, teamId?}, client?)` | `SandboxPortfolio` (nakit = başlangıç sermayesi) |
| `get(id, client?)` / `listByUser(userId, kind)` / `rename(id, name)` | 404 `SANDBOX_NOT_FOUND` |
| `trade(id, actorUserId, {side, asset_type, symbol, amount_usd? \| quantity? \| quantity: 'all', reason?}, client?)` | `{trade, cash_usd, holding \| null}`. `amount_usd` = **brüt** tutar (alışta komisyon üstüne eklenir). Satışta pozisyon değerine (±0,01) eşit tutar = tamamı |
| `setTargetWeights(id, actorUserId, {weights: [{asset_type, symbol, weight}], cash_weight}, {reason?: 'rebalance' \| 'initial', dryRun?}, client?)` | Toplam %100 ± 0,01 (400 `WEIGHTS_INVALID`), ≤ 20 varlık. Önce satışlar, sonra alışlar; alış bütçesi = satış sonrası nakit − hedef nakit, aşarsa alışlar orantılı küçültülür (artan nakitte kalır, nakit asla < 0). Hedefte olmayan pozisyonlar tamamen satılır. `{executed, plan, trades, cash_usd, target_weights}`; `dryRun` hiçbir şey yazmaz |
| `previewTargetWeights(id, input)` | `RebalancePlan` (`trades`, `total_commission`, `cash_after`, `weights_after`, `cash_weight_after`) |
| `valuation(id)` | `{equity_usd, cash_usd, cash_weight, return_pct, pnl_usd, holdings[], by_class[], closed[], closed_contribution_pct, commission_paid_usd, as_of, stale, target_cash_weight}` |
| `equities(ids[])` | `Map<id, {equity_usd, cash_usd, starting_cash, return_pct, stale}>` — **tek fiyat sorgusu**; lig sıralamaları için bunu kullanın |
| `history(id, '1W' \| '1M' \| '3M' \| 'ALL')` | `{points: [{t (Unix sn), v}], first, last, change_pct}`; 1W saatlik (yoksa günlük); başlangıç noktası + canlı nokta eklenir |
| `metrics(id)` | `{volatility_ann, max_drawdown_pct, sharpe, hhi, effective_n, turnover_pct, trades_count, days, basis, realized, simulated, commission_paid_usd, risk_free_rate}` |
| `backtest(id, days = 90)` / `backtestHoldings(cash, holdings, days)` | Güncel pozisyonlar `days` gün sabit tutulsaydı değer serisi (`missing`: geçmişi olmayanlar sabit değerde) |
| `trades(id, {limit, offset})` | `{items, total}` en yeni önce |
| `freeze(id, client?)` | Son anlık görüntüyü yazar, `status = 'frozen'` (idempotent). `archive(id)`, `remove(id)` (CASCADE) |
| `snapshotPortfolios(ids, at, client?)` / `snapshotAll(at)` | Saatlik + günlük (İstanbul günü, gün içindeki son değer) UPSERT |

### Değerleme alanları

- `holdings[]`: `asset_type, symbol, name, asset_class, quantity, avg_cost_usd, price_usd, value_usd, weight, target_weight|null,
  drift|null, pnl_usd, pnl_pct, contribution_usd, contribution_pct, stale`.
- `pnl_*` = gerçekleşmemiş K/Z (komisyon hariç).
- **Katkı:** `contribution_usd = güncel değer + Σ satış neti − Σ alış toplamı (komisyon dahil)` — gerçekleşen K/Z ve
  komisyon dahil. `contribution_pct = contribution_usd / başlangıç sermayesi × 100` (yüzde puan).
  **Σ holdings.contribution_pct + closed_contribution_pct = return_pct** (kapatılmış pozisyonlar `closed[]`'da).
- `target_weight`: hedef kaydedilmişse ve varlık hedefte yoksa `0`; hiç hedef yoksa `null`.

### Metrikler

- `volatility_ann` yıllık oynaklık (%; günlük getirilerin std'si × √365 — seri takvim günüdür).
- `max_drawdown_pct` **pozitif** yüzde (12,3 = tepeden dibe %−12,3). `sharpe` = (yıllık ort. getiri − %4) / oynaklık.
- `basis`: ≥ 20 günlük kapanış varsa `realized` (sandbox_snapshots), yoksa `simulated` (güncel pozisyonların son 90 günlük
  fiyat geçmişiyle simülasyonu). İkisi ayrıca `realized` / `simulated` alanlarında. Yalnızca nakit → oynaklık 0, Sharpe null.
- `hhi` = Σ ağırlık² (**nakit dahil**, 0–1), `effective_n` = 1 / HHI.
- `turnover_pct` = (ilk kurulum hariç işlem hacmi / 2) / başlangıç sermayesi × 100.

## İş

`sandbox-snapshots` (`jobs/definitions.ts`): her saat xx:03 + 23:58 (İstanbul). Yalnızca `active` portföyler.

## KVKK

`account/export.ts`: `sandbox_portfolios`, `sandbox_holdings`, `sandbox_trades` (sahibi olunan portföyler + kişinin yaptığı
işlemler). `account/delete.ts`: `kind = 'model'` portföyler silinir; lig portföyleri anonim kullanıcıya bağlı kalır.

## Testler

`test/sandboxMath.test.ts` (saf hesaplar), `test/sandbox.test.ts` (motor + PGlite), `test/modelPortfolios.test.ts` (API).
