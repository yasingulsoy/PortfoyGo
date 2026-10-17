// Logo kaynakları ve varlık evreni. fetch-logos.mjs bu dosyadaki listelere göre çalışır.
//
// Sürümler SABİTTİR (tam sürüm + npm sha512 bütünlüğü). Güncellemek için: sürümü ve integrity'yi
// `npm view <paket>@<sürüm> dist.integrity` çıktısıyla birlikte değiştirip betiği yeniden çalıştırın.

export const PACKAGES = {
  crypto: {
    name: 'cryptocurrency-icons',
    version: '0.18.1',
    license: 'CC0-1.0',
    homepage: 'https://github.com/spothq/cryptocurrency-icons',
    tarball: 'https://registry.npmjs.org/cryptocurrency-icons/-/cryptocurrency-icons-0.18.1.tgz',
    integrity: 'sha512-dvR5O8JOmav3559Yb0Igpkia+3vpt/aeNvMu5ZIVUG2Bzpq9wNcOJRIQas49XJrPjtZ98GAEn3aDQO+w7uhS2w==',
  },
  flags: {
    name: 'flag-icons',
    version: '7.5.0',
    license: 'MIT',
    homepage: 'https://github.com/lipis/flag-icons',
    tarball: 'https://registry.npmjs.org/flag-icons/-/flag-icons-7.5.0.tgz',
    integrity: 'sha512-kd+MNXviFIg5hijH766tt+3x76ele1AXlo4zDdCxIvqWZhKt4T83bOtxUOOMlTx/EcFdUMH5yvQgYlFh1EqqFg==',
  },
  brands: {
    name: 'simple-icons',
    version: '16.33.0',
    license: 'CC0-1.0',
    homepage: 'https://github.com/simple-icons/simple-icons',
    tarball: 'https://registry.npmjs.org/simple-icons/-/simple-icons-16.33.0.tgz',
    integrity: 'sha512-z14u6A8ngAg9mgERRsNO8YkjIMefehIpBk7A8Dz3Gd91945qFP19MLPSHgV4z8P5u/MRYd5e07OTzaDoB4d6qA==',
  },
};

/** Tek bir SVG dosyası için üst sınır (bayt, temizlenmiş hali). Aşan logolar atlanır (baş harf gösterilir). */
export const MAX_FILE_BYTES = 24 * 1024;

/**
 * Kripto: piyasa değerine göre ilk ~100 coin'in üst kümesi (2026 sonbaharı) + uygulamanın kullandıkları.
 * cryptocurrency-icons'ta OLMAYANLAR baş harf gösterir (başka kaynaktan çekilmez) — rapor bunları listeler.
 * Paketteki sembolü bugün başka bir projeye ait olanlar (SKY=Skycoin≠Sky, BEAM, AMP, HT) bilinçli olarak dışarıda.
 */
export const CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'USDT', 'XRP', 'BNB', 'SOL', 'USDC', 'DOGE', 'TRX', 'ADA', 'HYPE', 'LINK', 'SUI', 'XLM',
  'AVAX', 'BCH', 'HBAR', 'LEO', 'SHIB', 'TON', 'LTC', 'DOT', 'XMR', 'USDE', 'WBTC', 'STETH', 'BGB', 'PI',
  'DAI', 'UNI', 'PEPE', 'AAVE', 'OKB', 'TAO', 'APT', 'NEAR', 'ICP', 'ETC', 'ONDO', 'KAS', 'MNT', 'CRO',
  'MATIC', 'VET', 'ATOM', 'TRUMP', 'ENA', 'RENDER', 'FIL', 'ALGO', 'ARB', 'FET', 'WLD', 'JUP', 'OP',
  'KCS', 'QNT', 'INJ', 'STX', 'TIA', 'SEI', 'IMX', 'XDC', 'GRT', 'BONK', 'FLR', 'FDUSD', 'PYUSD', 'FLOKI',
  'THETA', 'SAND', 'MANA', 'AXS', 'GALA', 'LDO', 'CRV', 'MKR', 'XTZ', 'EOS', 'MIOTA', 'NEO', 'CAKE',
  'RUNE', 'JASMY', 'CHZ', 'BTT', 'HNT', 'PENDLE', 'ZEC', 'DASH', 'XEC', 'BSV', 'EGLD', 'MINA', 'FLOW',
  'AR', 'SNX', 'COMP', '1INCH', 'ENJ', 'BAT', 'ZIL', 'KSM', 'QTUM', 'ICX', 'ZRX', 'OMG', 'WAVES', 'NEXO',
  'GNO', 'TWT', 'BTG', 'TUSD', 'PAXG', 'XAUT', 'CELO', 'ROSE', 'ANKR', 'RVN', 'SC', 'DCR', 'DGB', 'ONE',
  'IOTX', 'ZEN', 'LRC', 'SUSHI', 'YFI', 'BAL', 'UMA', 'BAND', 'STORJ', 'SKL', 'CVC', 'ELF', 'NMR', 'REN',
  'KNC', 'BNT', 'LPT', 'RLC', 'POWR', 'XEM', 'GUSD', 'HOT', 'ARDR', 'STEEM', 'LSK', 'SYS', 'NANO', 'ONT',
];

/** Kripto takma adları: aynı projenin yeni sembolü → paketteki dosya. */
export const CRYPTO_ALIASES = {
  POL: 'MATIC', // Polygon (MATIC → POL geçişi, aynı marka)
  IOTA: 'MIOTA',
};

/**
 * Döviz → bayrak (flag-icons, 1x1). Uygulamanın kodları (USD, EUR, GBP, CHF, JPY …) + TCMB / sağlayıcı
 * listesinde görülebilecek yaygın kodlar. Boyutu MAX_FILE_BYTES'ı aşan bayraklar atlanır.
 */
export const CURRENCY_FLAGS = {
  USD: 'us', EUR: 'eu', GBP: 'gb', CHF: 'ch', JPY: 'jp', SAR: 'sa', CAD: 'ca', AUD: 'au', DKK: 'dk',
  SEK: 'se', NOK: 'no', KWD: 'kw', RUB: 'ru', CNY: 'cn', AZN: 'az', BGN: 'bg', RON: 'ro', IRR: 'ir',
  PKR: 'pk', QAR: 'qa', KRW: 'kr', AED: 'ae', NZD: 'nz', HKD: 'hk', SGD: 'sg', INR: 'in', BRL: 'br',
  MXN: 'mx', ZAR: 'za', PLN: 'pl', CZK: 'cz', HUF: 'hu', ILS: 'il', THB: 'th', MYR: 'my', IDR: 'id',
  PHP: 'ph', TWD: 'tw', UAH: 'ua', GEL: 'ge', KZT: 'kz', EGP: 'eg', JOD: 'jo', BHD: 'bh', OMR: 'om',
  LYD: 'ly', TND: 'tn', MAD: 'ma', DZD: 'dz', IQD: 'iq', ISK: 'is', CLP: 'cl', COP: 'co', ARS: 'ar',
  PEN: 'pe', VND: 'vn', NGN: 'ng', KES: 'ke', UZS: 'uz', TMT: 'tm', KGS: 'kg', TJS: 'tj', AMD: 'am',
  BYN: 'by', MDL: 'md', RSD: 'rs', ALL: 'al', MKD: 'mk', BAM: 'ba', LBP: 'lb', TRY: 'tr',
};

/**
 * Hisse (ABD borsaları; ADR'ler dahil) → simple-icons slug'ı. Varsayılan STOCK_SYMBOLS listesi + yerel
 * tohum + makul bir büyük şirket üst kümesi. simple-icons'ta olmayan markalar (ör. Microsoft, Amazon)
 * listede YOKTUR: AssetAvatar onlar için baş harf (monogram) gösterir.
 * `license` alanı taşıyan (CC0 dışı) simgeler betik tarafından otomatik dışlanır.
 */
export const STOCK_BRANDS = {
  AAPL: 'apple', GOOGL: 'google', META: 'meta', TSLA: 'tesla', NVDA: 'nvidia', NFLX: 'netflix',
  AMD: 'amd', INTC: 'intel', JPM: 'chase', V: 'visa', MA: 'mastercard', KO: 'cocacola', NKE: 'nike',
  MCD: 'mcdonalds', SBUX: 'starbucks', CSCO: 'cisco', QCOM: 'qualcomm', AVGO: 'broadcom', UBER: 'uber',
  ABNB: 'airbnb', SHOP: 'shopify', SPOT: 'spotify', BA: 'boeing', PYPL: 'paypal', COIN: 'coinbase',
  HOOD: 'robinhood', PLTR: 'palantir', SNOW: 'snowflake', ARM: 'arm', SONY: 'sony', TM: 'toyota',
  SAP: 'sap', ZM: 'zoom', LYFT: 'lyft', SNAP: 'snapchat', PINS: 'pinterest', RBLX: 'roblox', EA: 'ea',
  DELL: 'dell', HPQ: 'hp', GS: 'goldmansachs', BAC: 'bankofamerica', WFC: 'wellsfargo', T: 'atandt',
  VZ: 'verizon', MRK: 'merck', ABBV: 'abbvie', SHEL: 'shell', F: 'ford', GM: 'generalmotors',
  TGT: 'target', AXP: 'americanexpress', BKNG: 'bookingdotcom', EBAY: 'ebay', ETSY: 'etsy',
  DASH: 'doordash', RDDT: 'reddit', U: 'unity', DBX: 'dropbox', TEAM: 'atlassian', DDOG: 'datadog',
  NET: 'cloudflare', MDB: 'mongodb', OKTA: 'okta', INTU: 'intuit', ADSK: 'autodesk', BIDU: 'baidu',
  HMC: 'honda', CAT: 'caterpillar', MMM: '3m', GE: 'generalelectric', LCID: 'lucid', DUOL: 'duolingo',
  SMCI: 'supermicro', STX: 'seagate', GRMN: 'garmin', PTON: 'peloton', EXPE: 'expedia', Z: 'zillow',
  GRAB: 'grab', NU: 'nubank', KLAR: 'klarna', ACN: 'accenture', INFY: 'infosys', WIT: 'wipro',
  HSBC: 'hsbc', BCS: 'barclays', DB: 'deutschebank', FDX: 'fedex', UPS: 'ups', UAL: 'unitedairlines',
  AAL: 'americanairlines', LUV: 'southwestairlines', RYAAY: 'ryanair', MAR: 'marriott', HLT: 'hilton',
  TRIP: 'tripadvisor', YELP: 'yelp', CART: 'instacart', GTLB: 'gitlab', ESTC: 'elastic', FSLY: 'fastly',
  FFIV: 'f5', PANW: 'paloaltonetworks', FTNT: 'fortinet', PD: 'pagerduty', DT: 'dynatrace',
  ASAN: 'asana', FIG: 'figma', WIX: 'wix', GDDY: 'godaddy', DOCN: 'digitalocean', AKAM: 'akamai',
  HUBS: 'hubspot', BILI: 'bilibili',
};

/** Hisse takma adları (aynı şirketin diğer hisse sınıfı). */
export const STOCK_ALIASES = {
  GOOG: 'GOOGL',
  ZG: 'Z',
};

/** Uygulamada izlenen ama simple-icons'ta bulunmayan (bilinçli olarak monogram) hisseler — raporda gösterilir. */
export const STOCKS_WITHOUT_BRAND = ['MSFT', 'AMZN'];
