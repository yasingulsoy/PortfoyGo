# Varlık logoları — kaynaklar ve lisanslar

Bu klasördeki SVG dosyaları `scripts/logos/fetch-logos.mjs` ile sabitlenmiş paket sürümlerinden **bir kez** üretilir
ve depoya eklenir; uygulama çalışırken hiçbir dış adrese logo isteği gitmez. Her dosya izin listesi tabanlı bir
temizleyiciden geçirilmiştir (betik, olay işleyicisi, dış bağlantı, `<foreignObject>`, `<style>` yok; her dosyada `viewBox` var).

> **Ticari marka notu:** Şirket logoları ilgili şirketlerin ticari markalarıdır; yalnızca varlığı tanımlamak amacıyla kullanılır.
> Simge dosyalarının lisansı (CC0 / MIT) markalar üzerinde herhangi bir hak devri anlamına gelmez; PortfoyGo bu şirketlerle
> bağlantılı değildir ve onlar tarafından desteklenmez.

| Klasör | Kaynak | Sürüm | Lisans | Dosya |
| --- | --- | --- | --- | --- |
| `crypto/` | [cryptocurrency-icons](https://github.com/spothq/cryptocurrency-icons) — `svg/color` | 0.18.1 | CC0-1.0 | 98 |
| `crypto/` | [simple-icons](https://github.com/simple-icons/simple-icons) — yalnızca cryptocurrency-icons'ta olmayan coinler; marka simgesi + marka rengi daire rozette | 16.33.0 | CC0-1.0 (simge verisi) | 8 |
| `currency/` | [flag-icons](https://github.com/lipis/flag-icons) — `flags/1x1` (para biriminin ülke/bölge bayrağı) | 7.5.0 | MIT | 68 |
| `stock/` | [simple-icons](https://github.com/simple-icons/simple-icons) — marka simgesi + marka rengi, PortfoyGo tarafından daire rozete yerleştirildi | 16.33.0 | CC0-1.0 (simge verisi) | 114 |
| `stock/` | PortfoyGo'nun çizdiği işaretler (`scripts/logos/stock-marks.mjs`) — simple-icons'ta olmayan çok görünür hisseler | — | Proje lisansı (marka hakları sahiplerinde) | 2 |
| `commodity/` | PortfoyGo'nun kendi çizimi (`scripts/logos/commodity-icons.mjs`) | — | Proje lisansı | 19 |

Kapsanmayan varlıklar (ör. CC0 dışı lisanslı simgeler, iki pakette de bulunmayan yeni coinler) uygulamada sembolün
baş harfleriyle (monogram) gösterilir; başka kaynaktan logo çekilmez.

## Hisse logoları (simple-icons) ve marka kılavuzları

simple-icons, marka sahiplerinin kılavuzlarını `guidelines` alanında belirtir; logolar yeniden renklendirilmeden,
orijinal marka rengi ve biçimiyle, yalnızca tanımlayıcı amaçla küçük rozet olarak kullanılır.

| Sembol | Marka | Renk | Kılavuz |
| --- | --- | --- | --- |
| AAPL | Apple | `#000000` | — |
| GOOGL | Google | `#4285F4` | [bağlantı](https://about.google/brand-resource-center/brand-elements/) |
| META | Meta | `#0467DF` | [bağlantı](https://www.facebook.com/brand/resources/meta/company-brand) |
| TSLA | Tesla | `#CC0000` | — |
| NVDA | NVIDIA | `#76B900` | — |
| NFLX | Netflix | `#E50914` | [bağlantı](https://brand.netflix.com/en/assets/logos) |
| AMD | AMD | `#ED1C24` | — |
| INTC | Intel | `#0071C5` | — |
| JPM | Chase | `#117ACA` | — |
| V | Visa | `#1A1F71` | — |
| MA | MasterCard | `#EB001B` | [bağlantı](https://www.mastercard.com/brandcenter/us/en/brand-requirements/mastercard.html) |
| KO | Coca-Cola | `#D00013` | — |
| NKE | Nike | `#111111` | — |
| MCD | McDonald's | `#FBC817` | — |
| SBUX | Starbucks | `#006241` | [bağlantı](https://creative.starbucks.com) |
| CSCO | Cisco | `#1BA0D7` | — |
| QCOM | Qualcomm | `#3253DC` | — |
| UBER | Uber | `#000000` | [bağlantı](https://assets.uber.com/d/k4nuxdZ8MC7E/user-guide#/user-guide/terms-of-use) |
| ABNB | Airbnb | `#FF5A5F` | — |
| SHOP | Shopify | `#7AB55C` | [bağlantı](https://www.shopify.com/brand-assets) |
| SPOT | Spotify | `#1ED760` | [bağlantı](https://developer.spotify.com/documentation/general/design-and-branding/#using-our-logo) |
| BA | Boeing | `#1D439C` | — |
| PYPL | PayPal | `#002991` | [bağlantı](https://newsroom.paypal-corp.com/media-resources) |
| COIN | Coinbase | `#0052FF` | — |
| HOOD | Robinhood | `#CCFF00` | — |
| PLTR | Palantir | `#101113` | — |
| SNOW | Snowflake | `#29B5E8` | [bağlantı](https://www.snowflake.com/brand-guidelines/) |
| ARM | Arm | `#0091BD` | [bağlantı](https://www.arm.com/company/policies/trademarks/guidelines-corporate-logo) |
| SONY | Sony | `#FFFFFF` | — |
| TM | Toyota | `#EB0A1E` | [bağlantı](https://www.toyota.com/brandguidelines/) |
| SAP | SAP | `#0FAAFF` | — |
| ZM | Zoom | `#0B5CFF` | [bağlantı](https://brand.zoom.us/usage-legal/) |
| LYFT | Lyft | `#FF00BF` | — |
| SNAP | Snapchat | `#FFFC00` | [bağlantı](https://www.snapchat.com/brand-guidelines) |
| PINS | Pinterest | `#BD081C` | [bağlantı](https://business.pinterest.com/en/brand-guidelines) |
| RBLX | Roblox | `#000000` | [bağlantı](https://en.help.roblox.com/hc/en-us/articles/115001708126-Roblox-Name-and-Logo-Community-Usage-Guidelines) |
| EA | EA | `#000000` | — |
| DELL | Dell | `#007DB8` | [bağlantı](https://brand.delltechnologies.com/logos/) |
| HPQ | HP | `#0096D6` | [bağlantı](https://brandcentral.hp.com/us/en/elements/hp-logo.html) |
| GS | Goldman Sachs | `#7399C6` | [bağlantı](https://design.gs.com/brand/goldman-sachs-logo) |
| BAC | Bank of America | `#012169` | — |
| WFC | Wells Fargo | `#D71E28` | — |
| T | AT&T | `#009FDB` | — |
| VZ | Verizon | `#CD040B` | — |
| MRK | Merck | `#007A73` | — |
| ABBV | Abbvie | `#071D49` | — |
| SHEL | Shell | `#FFD500` | — |
| F | Ford | `#00274E` | — |
| GM | General Motors | `#0170CE` | — |
| TGT | Target | `#CC0000` | — |
| AXP | American Express | `#2E77BC` | — |
| BKNG | Booking.com | `#003A9A` | [bağlantı](https://www.bookingholdings.com/media-room) |
| EBAY | eBay | `#E53238` | — |
| ETSY | Etsy | `#F16521` | — |
| DASH | DoorDash | `#FF3008` | — |
| RDDT | Reddit | `#FF4500` | [bağlantı](https://www.redditinc.com/brand) |
| U | Unity | `#FFFFFF` | [bağlantı](https://unity.com/legal/branding-trademarks) |
| DBX | Dropbox | `#0061FF` | — |
| TEAM | Atlassian | `#0052CC` | [bağlantı](https://atlassian.design/foundations/logos) |
| DDOG | Datadog | `#632CA6` | [bağlantı](https://www.datadoghq.com/about/resources/) |
| NET | Cloudflare | `#F38020` | [bağlantı](https://www.cloudflare.com/trademark/) |
| MDB | MongoDB | `#47A248` | — |
| OKTA | Okta | `#007DC1` | [bağlantı](https://www.okta.com/terms-of-use-for-okta-content/) |
| INTU | Intuit | `#236CFF` | [bağlantı](https://www.intuit.com/company/press-room/logos) |
| ADSK | Autodesk | `#000000` | [bağlantı](https://brand.autodesk.com/brand-system/logo) |
| BIDU | Baidu | `#2932E1` | — |
| HMC | Honda | `#E40521` | — |
| CAT | Caterpillar | `#FFCD11` | — |
| MMM | 3M | `#FF0000` | — |
| GE | General Electric | `#0870D8` | — |
| LCID | Lucid | `#282C33` | [bağlantı](https://lucid.co/brand) |
| DUOL | Duolingo | `#58CC02` | [bağlantı](https://design.duolingo.com) |
| SMCI | Supermicro | `#151F6D` | — |
| STX | Seagate | `#6EBE49` | — |
| GRMN | Garmin | `#000000` | [bağlantı](https://creative.garmin.com/styleguide/brand/) |
| PTON | Peloton | `#181A1D` | — |
| EXPE | Expedia | `#191E3B` | [bağlantı](https://brandfolder.com/portals/brand-expedia) |
| Z | Zillow | `#006AFF` | — |
| GRAB | Grab | `#00B14F` | — |
| NU | Nubank | `#820AD1` | — |
| KLAR | Klarna | `#FFB3C7` | — |
| ACN | Accenture | `#A100FF` | — |
| INFY | Infosys | `#007CC3` | — |
| WIT | Wipro | `#341C53` | — |
| HSBC | HSBC | `#DB0011` | [bağlantı](https://www.hsbc.com/terms-and-conditions) |
| BCS | Barclays | `#00AEEF` | — |
| DB | Deutsche Bank | `#0018A8` | — |
| FDX | FedEx | `#4D148C` | — |
| UPS | UPS | `#150400` | — |
| UAL | United Airlines | `#002244` | — |
| AAL | American Airlines | `#0078D2` | — |
| LUV | Southwest Airlines | `#304CB2` | — |
| RYAAY | Ryanair | `#073590` | — |
| MAR | Marriott | `#A70023` | — |
| HLT | Hilton | `#231F20` | [bağlantı](https://stories.hilton.com/media-kit-hilton-corporate) |
| TRIP | Tripadvisor | `#34E0A1` | [bağlantı](https://tripadvisor.mediaroom.com/logo-guidelines) |
| YELP | Yelp | `#FF1A1A` | [bağlantı](https://www.yelp.com/brand) |
| CART | Instacart | `#43B02A` | — |
| GTLB | GitLab | `#FC6D26` | [bağlantı](https://about.gitlab.com/handbook/marketing/corporate-marketing/brand-activation/trademark-guidelines/) |
| ESTC | Elastic | `#005571` | — |
| FSLY | Fastly | `#FF282D` | — |
| FFIV | F5 | `#E4002B` | — |
| PANW | Palo Alto Networks | `#F04E23` | [bağlantı](https://www.paloaltonetworks.com/company/brand) |
| FTNT | Fortinet | `#EE3124` | — |
| PD | PagerDuty | `#06AC38` | [bağlantı](https://www.pagerduty.com/brand/) |
| DT | Dynatrace | `#1496FF` | — |
| ASAN | Asana | `#F06A6A` | [bağlantı](https://asana.com/brand) |
| FIG | Figma | `#F24E1E` | [bağlantı](https://www.figma.com/using-the-figma-brand/) |
| WIX | Wix | `#0C6EFC` | [bağlantı](https://www.wix.com/about/design-assets) |
| GDDY | GoDaddy | `#1BDBDB` | [bağlantı](https://aboutus.godaddy.net/newsroom/media-resources/) |
| DOCN | DigitalOcean | `#0080FF` | [bağlantı](https://www.digitalocean.com/press/) |
| AKAM | Akamai | `#0096D6` | — |
| HUBS | HubSpot | `#FF7A59` | [bağlantı](https://www.hubspot.com/style-guide) |
| BILI | Bilibili | `#00A1D6` | — |

## PortfoyGo'nun çizdiği hisse işaretleri

simple-icons'ta bulunmayan ama piyasa listesinde çok görünen şirketler için basit geometrik işaretler. Marka notu bunları da
kapsar: işaretler yalnızca varlığı tanımlamak içindir ve ilgili şirketlerin ticari markalarına dayanır.

| Sembol | İşaret | Not |
| --- | --- | --- |
| MSFT | Microsoft — açık daire üzerinde dört renkli kare ızgarası | Microsoft'un dört renkli kare logosuna dayanır (simple-icons'tan Microsoft'un talebiyle kaldırıldı); hukuk incelemesinde ayrıca bakılmalı. |
| AMZN | Amazon — koyu daire üzerinde turuncu küçük harf "a" monogramı | PortfoyGo monogramı; Amazon logosunun (gülümseme oku) kopyası değildir, yalnızca marka turuncusu kullanılır. |

## Kripto logoları (simple-icons yedeği)

cryptocurrency-icons'ta bulunmayan coinler için, simgenin o projeye ait olduğu doğrulanan simple-icons girdileri.

| Sembol | Proje | Renk | Kılavuz |
| --- | --- | --- | --- |
| SUI | Sui | `#4DA2FF` | [bağlantı](https://sui.io/media-kit) |
| HBAR | Hedera | `#222222` | [bağlantı](https://brand.hedera.com) |
| TON | TON | `#0098EA` | [bağlantı](https://ton.org/en/brand-assets) |
| PI | Pi Network | `#F4AF47` | — |
| NEAR | NEAR | `#000000` | — |
| OP | Optimism | `#FF0420` | — |
| HNT | Helium | `#0ACF83` | — |
| ENS | ENS | `#0080BC` | [bağlantı](https://ens.domains/brand) |

## Emtia simgeleri

| Kod | Simge | Takma adlar |
| --- | --- | --- |
| GOLD | Altın (ons) — külçe yığını | XAU, XAUUSD, GOLDTRY, XAUTRY, ALTIN |
| GAU | Gram altın — darphane kartı | GRAM_ALTIN, GRAMALTIN |
| SILVER | Gümüş — külçe yığını | SILVER_FUT, XAG, XAGUSD, XAGTRY |
| PLATINUM | Platin — külçe | XPT, XPTUSD |
| PALLADIUM | Paladyum — külçe | XPD, XPDUSD |
| ALUMINUM | Alüminyum — külçe | ALUMINIUM |
| COPPER | Bakır — tel bobini | — |
| BRENT_OIL | Brent petrol — varil | BRENT, UKOIL |
| CRUDEOIL | Ham petrol (WTI) — damla | CRUDE_OIL, WTI, USOIL |
| NATURAL_GAS | Doğal gaz — alev | NATURALGAS |
| HEATING_OIL | Isıtma yağı — damla ve alev | — |
| GASOLINE | Benzin — akaryakıt pompası | — |
| WHEAT | Buğday — başak | — |
| CORN | Mısır — koçan | — |
| COTTON2 | Pamuk — koza | COTTON |
| SUGAR | Şeker — küp | — |
| SOYBEAN | Soya — fasulye kabuğu | SOYBEANS |
| COFFEE | Kahve — çekirdek | — |
| COCOA | Kakao — meyve | — |

## flag-icons lisansı (MIT)

```
The MIT License (MIT)

Copyright (c) 2013 Panayiotis Lipiridis

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## cryptocurrency-icons ve simple-icons

Her iki paketteki simge verisi CC0 1.0 Universal (kamu malı) ile yayımlanır; atıf zorunlu değildir, yine de kaynak
olarak burada belirtilmiştir. CC0 dışı lisans taşıyan simple-icons girdileri betik tarafından otomatik olarak dışlanır.
