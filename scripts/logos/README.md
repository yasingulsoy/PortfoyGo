# Varlık logoları — üretici

`fetch-logos.mjs`, piyasadaki varlıkların (hisse, kripto, döviz, emtia) logolarını sabitlenmiş, lisansı uygun
kaynaklardan **bir kez** üretir ve depoya yazar. Uygulama çalışırken hiçbir dış adrese logo isteği gitmez;
`AssetAvatar` (`packages/shared/src/ui/AssetAvatar.tsx`) manifestte olan logoyu, olmayanlar için sembolün baş
harflerini gösterir (eksik dosyaya istek atılmaz → 404 yok).

## Çalıştırma

```bash
node scripts/logos/fetch-logos.mjs                     # indir (npm registry), temizle, yaz
node scripts/logos/fetch-logos.mjs --cache-dir <klasör> # tarball'ları önbellekle / oradan oku (çevrimdışı yeniden üretim)
node scripts/logos/fetch-logos.mjs --check              # yalnızca doğrula: diskteki çıktı kaynaklarla birebir aynı mı (CI)
```

Bağımlılık yok (Node 20+). Çıktı deterministiktir: aynı sürümlerle iki çalıştırma aynı dosyaları üretir.

## Çıktılar

| Yol | İçerik |
| --- | --- |
| `frontend/public/logos/{stock,crypto,currency,commodity}/<SEMBOL>.svg` | Logolar (sembol BÜYÜK harf, uygulamanın normalize ettiği biçim) |
| `admin/public/logos/…` | Birebir kopya (yönetim paneli ayrı dağıtılır; aynı `/logos/...` yolu) |
| `frontend/public/logos/ATTRIBUTION.md` (+ admin kopyası) | Kaynaklar, sürümler, lisanslar, marka notu, hisse → marka tablosu |
| `packages/shared/src/assetLogos.generated.ts` | Tipli manifest: `ASSET_LOGO_FILES` (`type:SEMBOL` → içerik özeti) ve `ASSET_LOGO_ALIASES` |

Okuma yardımcıları elle yazılmıştır: `packages/shared/src/assetLogos.ts` → `assetLogoSrc(type, symbol)`,
`assetLogoKey`, `hasAssetLogo`, `normalizeLogoSymbol`. Adresler `?v=<özet>` taşır; bu sayede
`next.config.ts` `/logos/<tür>/*` için 1 yıllık `immutable` önbellek verir ve dosyalar `sandbox` CSP ile sunulur.

## Kaynaklar (sürümler `sources.mjs`'de sabit, npm sha512 bütünlüğü doğrulanır)

| Tür | Kaynak | Lisans | Not |
| --- | --- | --- | --- |
| Kripto | `cryptocurrency-icons@0.18.1` — `svg/color` | CC0-1.0 | Pakette olmayan coinler baş harf gösterir (başka siteden çekilmez). Sembolü bugün başka projeye ait olanlar (SKY, BEAM, AMP, HT) dışarıda. |
| Döviz | `flag-icons@7.5.0` — `flags/1x1` | MIT | Para birimi → ülke/bölge bayrağı (`CURRENCY_FLAGS`). 24 KB'yi aşan bayraklar (MXN, RSD, TMT) atlanır. |
| Hisse | `simple-icons@16.33.0` | CC0-1.0 (simge verisi) | Marka rengi dairede beyaz (açık renklerde koyu) glif. `license` alanı taşıyan (CC0 dışı) girdiler otomatik dışlanır (ör. Broadcom). Microsoft, Amazon gibi pakette olmayan markalar monogram gösterir. **Ticari markalar sahiplerinindir.** |
| Emtia | PortfoyGo'nun kendi çizimi — `commodity-icons.mjs` | Proje lisansı | Renkli daire + beyaz glif: külçe (altın/gümüş/platin…), gram altın kartı, bakır bobini, varil, damla, alev, pompa, başak… |

## Güvenlik

- Paketler `npm` kayıt defterinden indirilir, **sha512 bütünlüğü** `sources.mjs`'deki değerle karşılaştırılır,
  tarball **bellekte** açılır (diske çıkarılmaz) ve paketlerden **hiçbir kod çalıştırılmaz** (yalnızca SVG/JSON okunur).
- Her SVG `lib/svg.mjs`'deki **izin listesi** tabanlı temizleyiciden geçer: yalnızca pasif SVG öğeleri/öznitelikleri
  yeniden yazılır; `<script>`, `<style>`, `<foreignObject>`, `<image>`/`<feImage>`, olay işleyicileri (`on*`),
  `#` dışındaki `href` ve `url()` referansları, `javascript:` / `data:` değerleri düşer. Çıktıda her zaman `viewBox`
  vardır; yol verisi (yay bayrakları dahil doğru ayrıştırılarak) ölçeğe göre yuvarlanıp küçültülür.
- Frontend birim testi (`frontend/src/lib/assetLogos.test.tsx`) manifest ↔ dosya eşleşmesini (iki uygulamada), içerik
  özetlerini, temizlik kurallarını ve boyut sınırlarını her test çalıştırmasında yeniden doğrular.

## Yeni varlık / sürüm eklemek

1. `sources.mjs`: `CRYPTO_SYMBOLS`, `CURRENCY_FLAGS`, `STOCK_BRANDS` (ticker → simple-icons slug) veya takma adlar;
   yeni emtia için `commodity-icons.mjs` → `COMMODITY_ICONS` (kanonik kod + takma adlar).
2. Sürüm yükseltme: `PACKAGES` içinde `version`, `tarball` ve `integrity` (`npm view <paket>@<sürüm> dist.integrity`).
3. `node scripts/logos/fetch-logos.mjs` → çıktıdaki "kapsanmayan" listesini kontrol edin → `npm run test -w @portfoygo/frontend`.
