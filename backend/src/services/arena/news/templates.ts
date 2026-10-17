import type { ArenaInstrumentCode } from '../instruments';

/**
 * Haber Turu — KURGUSAL haber şablon kitaplığı (SAF veri; birim testli).
 *
 * KURALLAR (yayın kontrol listesi, docs/YAYIN_KONTROL_LISTESI.md):
 *  - Haberlerin TAMAMI kurgudur ve arayüzde her başlık "KURGU" rozetiyle gösterilir.
 *  - Gerçek şirket ya da kişi adı YOKTUR; gerçek kişilere söz atfedilmez. Kurumlar yalnızca genel / varsayımsal
 *    biçimde anılır ("ABD Merkez Bankası (Fed)", "Avrupa Merkez Bankası (ECB)", "Petrol üreticisi ülkeler",
 *    "Büyük bir kripto borsası" …).
 *  - Her haberin "Neden?" açıklaması eğiticidir: haberin fiyatı NEDEN ve HANGİ YÖNDE etkilediğini anlatır.
 *
 * Yapı:
 *  - kind 'news'   : gerçek etkisi olan haber (effects: enstrüman, yön, büyüklük)
 *  - kind 'noise'  : etkisiz "gürültü" haber (effects boş; related: ilgili görünen enstrümanlar — koç kuralı için)
 *  - kind 'rumour' : söylenti; programda ardından YALANLAMA (denial) gelir ve etki tersine döner
 *
 * Büyüklükler (s / m / l) enstrümana göre log-getiriye çevrilir (bkz. engine.ts IMPACT_SIZES).
 */

export type NewsCategory = 'central_bank' | 'macro' | 'energy' | 'geopolitics' | 'crypto' | 'fx' | 'commodities' | 'disaster' | 'markets';

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  central_bank: 'Merkez bankası',
  macro: 'Ekonomik veri',
  energy: 'Enerji',
  geopolitics: 'Jeopolitik',
  crypto: 'Kripto',
  fx: 'Döviz',
  commodities: 'Emtia',
  disaster: 'Doğal afet',
  markets: 'Piyasalar',
};

export type ImpactProfile = 'jump' | 'drift' | 'delayed';
export type ImpactSize = 's' | 'm' | 'l';

export interface NewsVariant {
  headline: string;
  body?: string;
}

export interface NewsEffect {
  i: ArenaInstrumentCode;
  /** +1 yükseliş, −1 düşüş */
  d: 1 | -1;
  s: ImpactSize;
}

export interface NewsTemplate {
  key: string;
  category: NewsCategory;
  kind: 'news' | 'noise' | 'rumour';
  variants: NewsVariant[];
  effects: NewsEffect[];
  /** Gürültü haberlerde ilgili görünen enstrümanlar (etkisi yoktur) */
  related?: ArenaInstrumentCode[];
  profile: ImpactProfile | ImpactProfile[];
  /** "Neden?" — tur sonu değerlendirmesinde gösterilir */
  explain: string;
  /** Söylenti: ardından gelen yalanlama */
  denial?: { variants: NewsVariant[]; explain: string };
}

const EUR: ArenaInstrumentCode = 'EURUSD';
const XAU: ArenaInstrumentCode = 'XAUUSD';
const OIL: ArenaInstrumentCode = 'BRENT';
const BTC: ArenaInstrumentCode = 'BTCUSD';

/** Haber Turu enstrümanları (sabit sıra) */
export const NEWS_INSTRUMENTS: readonly ArenaInstrumentCode[] = [EUR, XAU, OIL, BTC];

const up = (i: ArenaInstrumentCode, s: ImpactSize): NewsEffect => ({ i, d: 1, s });
const down = (i: ArenaInstrumentCode, s: ImpactSize): NewsEffect => ({ i, d: -1, s });

export const NEWS_TEMPLATES: readonly NewsTemplate[] = [
  // ---------------------------------------------------------------------------
  // Merkez bankaları
  // ---------------------------------------------------------------------------
  {
    key: 'fed_hike',
    category: 'central_bank',
    kind: 'news',
    variants: [
      { headline: 'ABD Merkez Bankası (Fed) faizi beklenmedik şekilde 0,25 puan artırdı', body: 'Piyasa beklentisi faizin sabit kalmasıydı.' },
      { headline: 'Fed sürpriz yaptı: Politika faizi yükseltildi', body: 'Karar metninde enflasyonla mücadeleye vurgu yapıldı.' },
    ],
    effects: [down(EUR, 'm'), down(XAU, 'm'), down(BTC, 'm'), down(OIL, 's')],
    profile: 'jump',
    explain:
      'Beklenmeyen faiz artışı doları getirisi yüksek bir para hâline getirir: dolar güçlenir, EUR/USD düşer. Faiz getirmeyen altın ve riskli görülen Bitcoin cazibe kaybeder. Fiyatlar beklenen kararlara değil SÜRPRİZLERE tepki verir.',
  },
  {
    key: 'fed_cut',
    category: 'central_bank',
    kind: 'news',
    variants: [
      { headline: 'Fed faizi beklenenden erken indirdi', body: 'Piyasalar indirimi birkaç ay sonra bekliyordu.' },
      { headline: 'ABD Merkez Bankası (Fed) sürpriz faiz indirimine gitti', body: 'Karar metninde büyümedeki yavaşlamaya dikkat çekildi.' },
    ],
    effects: [up(EUR, 'm'), up(XAU, 'm'), up(BTC, 'm'), up(OIL, 's')],
    profile: 'jump',
    explain:
      'Faiz indirimi dolar mevduatının getirisini düşürür; dolar zayıflar, EUR/USD yükselir. Düşük faiz, faiz getirmeyen altını ve riskli varlıkları (Bitcoin) daha cazip kılar.',
  },
  {
    key: 'fed_hawkish',
    category: 'central_bank',
    kind: 'news',
    variants: [
      { headline: 'Fed toplantı tutanakları: Üyelerin çoğu "faiz daha uzun süre yüksek kalmalı" görüşünde' },
      { headline: 'ABD Merkez Bankası (Fed) enflasyon uyarısı yaptı: "Gerekirse yeniden artırırız"' },
    ],
    effects: [down(EUR, 's'), down(XAU, 's'), down(BTC, 's')],
    profile: 'drift',
    explain:
      '"Şahin" (faiz artırmaya yatkın) mesajlar, gelecekteki faiz beklentisini yükseltir. Etki genellikle anlık sıçrama değil, piyasa yorumladıkça yavaş yavaş fiyatlanan bir harekettir.',
  },
  {
    key: 'fed_dovish',
    category: 'central_bank',
    kind: 'news',
    variants: [
      { headline: 'Fed: "Faiz artışlarında sona yaklaşıyoruz"', body: 'Açıklama, faiz indirimi beklentilerini öne çekti.' },
      { headline: 'ABD Merkez Bankası (Fed) tutanakları: Üyeler indirim seçeneğini konuştu' },
    ],
    effects: [up(EUR, 's'), up(XAU, 's'), up(BTC, 's')],
    profile: 'drift',
    explain:
      '"Güvercin" (gevşemeye yatkın) mesajlar dolar faizinin düşeceği beklentisini güçlendirir. Dolar zayıflar; altın ve kripto gibi faiz getirmeyen varlıklar destek bulur.',
  },
  {
    key: 'ecb_hike',
    category: 'central_bank',
    kind: 'news',
    variants: [
      { headline: 'Avrupa Merkez Bankası (ECB) faizi 0,25 puan artırdı', body: 'Ekonomistlerin çoğu sabit bırakılmasını bekliyordu.' },
      { headline: 'ECB sürpriz faiz artışıyla piyasaları şaşırttı' },
    ],
    effects: [up(EUR, 'm')],
    profile: 'jump',
    explain:
      'Euro bölgesinde faizin artması euroyu daha getirili hâle getirir. Yatırımcılar euroya yönelir ve EUR/USD paritesi yükselir. Diğer enstrümanlar bu haberden doğrudan etkilenmez.',
  },
  {
    key: 'ecb_cut',
    category: 'central_bank',
    kind: 'news',
    variants: [
      { headline: 'ECB faiz indirdi: "Büyüme beklentileri zayıfladı"' },
      { headline: 'Avrupa Merkez Bankası (ECB) beklenmedik faiz indirimi yaptı' },
    ],
    effects: [down(EUR, 'm')],
    profile: 'jump',
    explain: 'Euro bölgesinde faizin düşmesi euronun getirisini azaltır; para euro varlıklarından çıkar ve EUR/USD düşer.',
  },
  {
    key: 'cb_gold_buying',
    category: 'central_bank',
    kind: 'news',
    variants: [
      { headline: 'Birkaç ülkenin merkez bankası altın rezervlerini rekor hızla artırdı', body: 'Uluslararası bir kuruluşun çeyreklik raporu yayımlandı.' },
      { headline: 'Merkez bankalarının altın alımları çeyrek bazda iki katına çıktı' },
    ],
    effects: [up(XAU, 'm')],
    profile: 'drift',
    explain:
      'Merkez bankaları büyük ve kalıcı alıcılardır. Talebin artması altın fiyatını destekler; bu tür yapısal haberler fiyata genellikle yavaş yavaş yansır.',
  },

  // ---------------------------------------------------------------------------
  // Ekonomik veriler
  // ---------------------------------------------------------------------------
  {
    key: 'us_cpi_hot',
    category: 'macro',
    kind: 'news',
    variants: [
      { headline: 'ABD\'de enflasyon beklentinin üzerinde: Yıllık %3,9', body: 'Beklenti %3,4 idi.' },
      { headline: 'ABD tüketici fiyatları sert yükseldi; çekirdek enflasyon da beklentiyi aştı' },
    ],
    effects: [down(EUR, 'm'), down(XAU, 's'), down(BTC, 'm')],
    profile: 'jump',
    explain:
      'Yüksek enflasyon, merkez bankasının faizi artıracağı (veya yüksek tutacağı) beklentisini güçlendirir. Bu da doları güçlendirir; EUR/USD düşer, altın ve Bitcoin baskı görür.',
  },
  {
    key: 'us_cpi_cool',
    category: 'macro',
    kind: 'news',
    variants: [
      { headline: 'ABD\'de enflasyon beklentinin altında kaldı: Yıllık %2,6', body: 'Beklenti %3,0 idi.' },
      { headline: 'ABD\'de fiyat artışları yavaşladı; faiz indirimi beklentisi güçlendi' },
    ],
    effects: [up(EUR, 'm'), up(XAU, 's'), up(BTC, 'm')],
    profile: 'jump',
    explain:
      'Düşük enflasyon verisi faiz indiriminin yaklaştığı anlamına gelir. Dolar zayıflar, EUR/USD yükselir; altın ve Bitcoin gibi varlıklar destek bulur.',
  },
  {
    key: 'us_jobs_strong',
    category: 'macro',
    kind: 'news',
    variants: [
      { headline: 'ABD ekonomisi beklenenin iki katı istihdam yarattı', body: 'Tarım dışı istihdam 310 bin arttı; beklenti 150 bindi.' },
      { headline: 'ABD\'de işsizlik oranı beklenmedik şekilde düştü' },
    ],
    effects: [down(EUR, 'm'), down(XAU, 's'), down(BTC, 's')],
    profile: 'jump',
    explain:
      'Güçlü iş piyasası, ekonominin faiz indirimi gerektirmediğini gösterir. Faiz beklentisi yükselir, dolar güçlenir; EUR/USD ve altın geriler.',
  },
  {
    key: 'us_jobs_weak',
    category: 'macro',
    kind: 'news',
    variants: [
      { headline: 'ABD istihdam verisi hayal kırıklığı yarattı', body: 'Yeni istihdam 40 binde kaldı; beklenti 160 bindi.' },
      { headline: 'ABD\'de işsizlik oranı beklenmedik şekilde yükseldi' },
    ],
    effects: [up(EUR, 'm'), up(XAU, 'm'), up(BTC, 's')],
    profile: 'jump',
    explain:
      'Zayıf istihdam, merkez bankasının faizi indirmek zorunda kalabileceğini düşündürür. Dolar zayıflar; altın hem düşük faizden hem de "güvenli liman" talebinden destek alır.',
  },
  {
    key: 'eu_cpi_hot',
    category: 'macro',
    kind: 'news',
    variants: [
      { headline: 'Euro bölgesinde enflasyon beklentiyi aştı', body: 'Öncü veriler ECB\'nin faizi artırabileceğini düşündürüyor.' },
      { headline: 'Euro bölgesi fiyatları sert yükseldi; ECB üzerinde baskı artıyor' },
    ],
    effects: [up(EUR, 's')],
    profile: 'drift',
    explain:
      'Euro bölgesinde yüksek enflasyon, ECB\'nin faiz artırma ihtimalini yükseltir. Daha yüksek faiz beklentisi euroyu güçlendirir; EUR/USD yükselir.',
  },
  {
    key: 'eu_pmi_weak',
    category: 'macro',
    kind: 'news',
    variants: [
      { headline: 'Euro bölgesinde sanayi üretimi daralmaya devam ediyor', body: 'Satın alma yöneticileri endeksi beklentinin altında geldi.' },
      { headline: 'Avrupa\'nın büyük ekonomilerinde fabrika siparişleri düştü' },
    ],
    effects: [down(EUR, 's'), down(OIL, 's')],
    profile: 'drift',
    explain:
      'Zayıf büyüme verisi, ECB\'nin faiz indirmesi gerekebileceğini düşündürür; euro zayıflar. Daha az sanayi üretimi daha az enerji talebi demektir, petrol de hafif baskı görür.',
  },
  {
    key: 'global_growth_strong',
    category: 'macro',
    kind: 'news',
    variants: [
      { headline: 'Büyük bir Asya ekonomisinde sanayi üretimi beklentileri aştı', body: 'Fabrikalar kapasitelerini artırıyor.' },
      { headline: 'Küresel imalat endeksi iki yılın zirvesine çıktı' },
    ],
    effects: [up(OIL, 'm'), up(BTC, 's')],
    profile: 'drift',
    explain:
      'Fabrikalar ve taşımacılık daha fazla enerji tüketir; güçlü büyüme petrol talebini artırır. İyimserlik riskli varlıklara (Bitcoin) da yansıyabilir.',
  },
  {
    key: 'global_recession_fears',
    category: 'macro',
    kind: 'news',
    variants: [
      { headline: 'Uluslararası bir kuruluş küresel büyüme tahminini sert düşürdü', body: 'Raporda "durgunluk riski arttı" uyarısı yapıldı.' },
      { headline: 'Küresel durgunluk endişeleri piyasalara yayılıyor' },
    ],
    effects: [down(OIL, 'm'), up(XAU, 's'), down(BTC, 'm'), down(EUR, 's')],
    profile: 'drift',
    explain:
      'Durgunluk korkusu enerji talebinin azalacağı anlamına gelir; petrol düşer. Yatırımcılar riskten kaçar: Bitcoin satılır, altın ve dolar gibi "güvenli limanlar" talep görür (EUR/USD düşer).',
  },

  // ---------------------------------------------------------------------------
  // Enerji
  // ---------------------------------------------------------------------------
  {
    key: 'producers_cut',
    category: 'energy',
    kind: 'news',
    variants: [
      { headline: 'Petrol üreticisi ülkeler günlük üretimi 1 milyon varil kısma kararı aldı', body: 'Karar piyasa beklentisinin üzerinde.' },
      { headline: 'Büyük petrol üreticileri sürpriz üretim kesintisinde anlaştı' },
    ],
    effects: [up(OIL, 'l')],
    profile: 'jump',
    explain: 'Arz azalırken talep aynı kalırsa fiyat yükselir. Beklenmeyen üretim kesintisi petrol fiyatını hızla yukarı iter.',
  },
  {
    key: 'producers_raise',
    category: 'energy',
    kind: 'news',
    variants: [
      { headline: 'Petrol üreticisi ülkeler üretimi artırma kararı aldı', body: 'Günlük üretim kademeli olarak 800 bin varil artacak.' },
      { headline: 'Üretici ülkeler arasında anlaşmazlık: Bazı ülkeler üretimi artırıyor' },
    ],
    effects: [down(OIL, 'l')],
    profile: 'jump',
    explain: 'Piyasaya daha fazla petrol gelmesi (arz artışı) fiyatı aşağı çeker. Üretici ülkelerin kararları petrol için en güçlü haber türlerindendir.',
  },
  {
    key: 'us_inventory_draw',
    category: 'energy',
    kind: 'news',
    variants: [
      { headline: 'ABD ham petrol stokları beklenenden fazla düştü', body: 'Stoklar haftalık 5,2 milyon varil azaldı; beklenti 1,5 milyondu.' },
    ],
    effects: [up(OIL, 'm')],
    profile: 'jump',
    explain: 'Stokların hızla erimesi, tüketimin üretimi aştığını gösterir. Bu güçlü talep işareti petrol fiyatını yükseltir.',
  },
  {
    key: 'us_inventory_build',
    category: 'energy',
    kind: 'news',
    variants: [
      { headline: 'ABD ham petrol stoklarında beklenmedik artış', body: 'Stoklar haftalık 6 milyon varil arttı; düşüş bekleniyordu.' },
    ],
    effects: [down(OIL, 'm')],
    profile: 'jump',
    explain: 'Stokların artması petrolün kullanılmadan biriktiğini, yani talebin zayıf olduğunu gösterir. Fiyat düşer.',
  },
  {
    key: 'pipeline_outage',
    category: 'energy',
    kind: 'news',
    variants: [
      { headline: 'Büyük bir petrol boru hattında arıza: Sevkiyat durdu', body: 'Onarımın birkaç gün sürmesi bekleniyor.' },
      { headline: 'Önemli bir petrol limanında yükleme geçici olarak askıya alındı' },
    ],
    effects: [up(OIL, 'm')],
    profile: 'jump',
    explain: 'Sevkiyatın durması piyasaya ulaşan petrolü azaltır. Geçici bile olsa arz kesintisi fiyatı yukarı iter.',
  },
  {
    key: 'oil_demand_cut',
    category: 'energy',
    kind: 'news',
    variants: [
      { headline: 'Enerji ajansı küresel petrol talebi tahminini düşürdü', body: 'Elektrikli araç kullanımındaki artış gerekçe gösterildi.' },
    ],
    effects: [down(OIL, 'm')],
    profile: 'drift',
    explain: 'Gelecekte daha az petrol tüketileceği beklentisi fiyatı aşağı çeker. Tahmin raporları fiyata genellikle kademeli yansır.',
  },
  {
    key: 'shipping_route_risk',
    category: 'energy',
    kind: 'news',
    variants: [
      { headline: 'Önemli bir deniz ticaret yolunda tanker trafiği yavaşladı', body: 'Sigorta şirketleri bölge için primleri artırdı.' },
    ],
    effects: [up(OIL, 's')],
    profile: 'drift',
    explain: 'Taşıma zorlaşır ve pahalılaşırsa petrolün alıcıya ulaşması gecikir; bu da fiyatı yukarı iter.',
  },

  // ---------------------------------------------------------------------------
  // Jeopolitik
  // ---------------------------------------------------------------------------
  {
    key: 'tension_oil_region',
    category: 'geopolitics',
    kind: 'news',
    variants: [
      { headline: 'Petrol üreten bir bölgede gerginlik tırmandı', body: 'Bölgedeki üretim tesislerinin güvenliği tartışılıyor.' },
      { headline: 'Enerji koridorunda askerî hareketlilik endişe yarattı' },
    ],
    effects: [up(OIL, 'm'), up(XAU, 'm'), down(BTC, 's'), down(EUR, 's')],
    profile: 'drift',
    explain:
      'Çatışma riski petrol arzının kesilebileceği korkusunu doğurur; petrol yükselir. Belirsizlikte yatırımcılar "güvenli liman" arar: altın ve dolar güçlenir, riskli varlıklar satılır.',
  },
  {
    key: 'ceasefire',
    category: 'geopolitics',
    kind: 'news',
    variants: [
      { headline: 'Taraflar ateşkeste anlaştı; bölgede gerginlik azalıyor' },
      { headline: 'Diplomatik görüşmelerde uzlaşma: Enerji sevkiyatı normale dönüyor' },
    ],
    effects: [down(OIL, 'm'), down(XAU, 's'), up(BTC, 's')],
    profile: 'jump',
    explain: 'Risk azalınca arz kesintisi korkusu kalkar ve petroldeki "risk primi" silinir. Güvenli liman talebi azalır; altın geriler, riskli varlıklar toparlanır.',
  },
  {
    key: 'trade_war_escalation',
    category: 'geopolitics',
    kind: 'news',
    variants: [
      { headline: 'İki büyük ekonomi arasında gümrük vergisi gerginliği yükseldi', body: 'Karşılıklı ek vergiler gündemde.' },
    ],
    effects: [up(XAU, 's'), down(OIL, 's'), down(BTC, 's')],
    profile: 'drift',
    explain: 'Ticaret savaşı küresel büyümeyi yavaşlatabilir: petrol talebi beklentisi düşer, riskten kaçış altına yarar.',
  },
  {
    key: 'eu_us_trade_deal',
    category: 'geopolitics',
    kind: 'news',
    variants: [
      { headline: 'Avrupa Birliği ile ABD arasında kapsamlı ticaret anlaşması imzalandı' },
    ],
    effects: [up(EUR, 's'), up(OIL, 's')],
    profile: 'drift',
    explain: 'Ticaret anlaşması Avrupa ihracatçıları için olumlu kabul edilir; euroya talep artar. Daha canlı ticaret enerji talebini de destekler.',
  },
  {
    key: 'eu_political_crisis',
    category: 'geopolitics',
    kind: 'news',
    variants: [
      { headline: 'Avro bölgesindeki büyük bir ülkede hükümet krizi', body: 'Erken seçim ihtimali konuşuluyor.' },
    ],
    effects: [down(EUR, 'm')],
    profile: 'drift',
    explain: 'Siyasi belirsizlik yatırımcıyı tedirgin eder; para o bölgenin varlıklarından çıkar. Euro zayıflar, EUR/USD düşer.',
  },
  {
    key: 'us_shutdown_risk',
    category: 'geopolitics',
    kind: 'news',
    variants: [
      { headline: 'ABD\'de bütçe uzlaşmazlığı: Hükümetin kapanma riski arttı' },
    ],
    effects: [up(EUR, 's'), up(XAU, 's')],
    profile: 'drift',
    explain: 'ABD\'deki siyasi belirsizlik dolara güveni geçici olarak zayıflatabilir; EUR/USD yükselir, altın güvenli liman olarak talep görür.',
  },

  // ---------------------------------------------------------------------------
  // Kripto
  // ---------------------------------------------------------------------------
  {
    key: 'exchange_hack',
    category: 'crypto',
    kind: 'news',
    variants: [
      { headline: 'Büyük bir kripto borsası siber saldırıya uğradı; para çekimleri durduruldu', body: 'Çalınan varlıkların değeri henüz netleşmedi.' },
      { headline: 'Bir kripto borsasından yüklü miktarda Bitcoin çalındı' },
    ],
    effects: [down(BTC, 'l')],
    profile: 'jump',
    explain: 'Güvenlik açıkları yatırımcı güvenini sarsar ve panik satışlarına yol açar. Çalınan coinlerin piyasada satılabileceği korkusu da fiyatı aşağı çeker.',
  },
  {
    key: 'etf_approval',
    category: 'crypto',
    kind: 'news',
    variants: [
      { headline: 'Bir piyasa düzenleyicisi, Bitcoin\'e dayalı yeni bir borsa yatırım fonunu (ETF) onayladı', body: 'Kurumsal yatırımcılar için yeni bir kapı açılıyor.' },
    ],
    effects: [up(BTC, 'l')],
    profile: 'jump',
    explain: 'Fon onayı, büyük kurumların Bitcoin\'e daha kolay yatırım yapabilmesini sağlar. Yeni talep beklentisi fiyatı hızla yükseltir.',
  },
  {
    key: 'crypto_crackdown',
    category: 'crypto',
    kind: 'news',
    variants: [
      { headline: 'Büyük bir ekonomi kripto para işlemlerine sıkı kısıtlamalar getirdi' },
      { headline: 'Düzenleyiciler kripto borsalarına yönelik denetimleri sertleştiriyor' },
    ],
    effects: [down(BTC, 'm')],
    profile: 'jump',
    explain: 'Yasal kısıtlamalar alım-satımı zorlaştırır ve talebi azaltır. Düzenleme haberleri kripto fiyatlarını sert etkileyebilir.',
  },
  {
    key: 'crypto_clarity',
    category: 'crypto',
    kind: 'news',
    variants: [
      { headline: 'Meclis, kripto varlıklara yasal çerçeve getiren düzenlemeyi kabul etti', body: 'Büyük bir ekonomide belirsizlik sona eriyor.' },
    ],
    effects: [up(BTC, 'm')],
    profile: 'drift',
    explain: 'Net kurallar, çekingen kalan büyük yatırımcıların piyasaya girmesini kolaylaştırır. Belirsizliğin azalması fiyatı destekler.',
  },
  {
    key: 'corporate_btc_buy',
    category: 'crypto',
    kind: 'news',
    variants: [
      { headline: 'Büyük bir teknoloji şirketi nakit rezervinin bir kısmını Bitcoin\'e çevirdiğini açıkladı' },
    ],
    effects: [up(BTC, 'm')],
    profile: 'jump',
    explain: 'Büyük bir alıcının piyasaya girmesi talebi artırır; diğer şirketlerin de benzer adım atabileceği beklentisi fiyatı yukarı iter.',
  },
  {
    key: 'stablecoin_depeg',
    category: 'crypto',
    kind: 'news',
    variants: [
      { headline: 'Popüler bir sabit kripto parası doların altına düştü', body: '1 dolar olması gereken değer 0,93 dolara geriledi.' },
    ],
    effects: [down(BTC, 'm')],
    profile: 'drift',
    explain: 'Sabit coinler kripto piyasasının "nakdi" gibidir; birinin değer kaybetmesi tüm piyasada güven kaybına ve satışa yol açar.',
  },
  {
    key: 'miner_selloff',
    category: 'crypto',
    kind: 'news',
    variants: [
      { headline: 'Bitcoin madencileri elindeki coinleri satmaya başladı', body: 'Artan elektrik maliyetleri gerekçe gösterildi.' },
    ],
    effects: [down(BTC, 's')],
    profile: 'drift',
    explain: 'Madencilerin satışı piyasaya ek arz demektir; alıcılar bu arzı karşılayana kadar fiyat baskı altında kalır.',
  },

  // ---------------------------------------------------------------------------
  // Döviz
  // ---------------------------------------------------------------------------
  {
    key: 'dollar_strength',
    category: 'fx',
    kind: 'news',
    variants: [
      { headline: 'Dolar endeksi yükselişte; yatırımcılar ABD tahvillerine yöneliyor' },
      { headline: 'ABD tahvil faizleri yükseldi, dolar güç kazanıyor' },
    ],
    effects: [down(EUR, 'm'), down(XAU, 's')],
    profile: 'drift',
    explain: 'Dolar güçlenince EUR/USD paritesi düşer (bir euro daha az dolar eder). Altın dolarla fiyatlandığı için güçlü dolar altını da genellikle aşağı çeker.',
  },
  {
    key: 'dollar_weakness',
    category: 'fx',
    kind: 'news',
    variants: [
      { headline: 'Dolar geniş çaplı değer kaybediyor', body: 'Yatırımcılar ABD dışındaki varlıklara yöneliyor.' },
    ],
    effects: [up(EUR, 'm'), up(XAU, 's')],
    profile: 'drift',
    explain: 'Zayıf dolar, euro karşısında değer kaybı demektir: EUR/USD yükselir. Dolar cinsinden altın, diğer para birimlerine sahip alıcılar için ucuzlar ve talep görür.',
  },
  {
    key: 'safe_haven_flows',
    category: 'markets',
    kind: 'news',
    variants: [
      { headline: 'Hisse senedi piyasalarında sert satış; yatırımcılar güvenli limanlara yöneliyor' },
      { headline: 'Küresel borsalarda panik: Risk iştahı azaldı' },
    ],
    effects: [up(XAU, 'm'), down(BTC, 'm'), down(EUR, 's'), down(OIL, 's')],
    profile: 'drift',
    explain: 'Korku anında yatırımcılar riskli varlıkları (Bitcoin gibi) satıp altın ve dolar gibi güvenli limanlara geçer. Bu yüzden altın yükselirken EUR/USD ve Bitcoin düşer.',
  },
  {
    key: 'risk_on_rally',
    category: 'markets',
    kind: 'news',
    variants: [
      { headline: 'Küresel borsalar rekor tazeledi; risk iştahı güçlü' },
    ],
    effects: [up(BTC, 'm'), down(XAU, 's'), up(OIL, 's')],
    profile: 'drift',
    explain: 'Yatırımcılar iyimserken riskli varlıklara yönelir: Bitcoin yükselir, güvenli liman olan altına talep azalır. Güçlü ekonomi beklentisi petrolü de destekler.',
  },

  // ---------------------------------------------------------------------------
  // Emtia / doğal afet
  // ---------------------------------------------------------------------------
  {
    key: 'gold_fund_selling',
    category: 'commodities',
    kind: 'news',
    variants: [
      { headline: 'Büyük bir yatırım fonu altın pozisyonunu yarıya indirdi' },
    ],
    effects: [down(XAU, 's')],
    profile: 'jump',
    explain: 'Büyük bir oyuncunun satışı piyasaya ani arz getirir; fiyat kısa vadede düşer.',
  },
  {
    key: 'mine_strike',
    category: 'commodities',
    kind: 'news',
    variants: [
      { headline: 'Dünyanın en büyük altın madenlerinden birinde grev', body: 'Üretimin haftalarca durabileceği belirtildi.' },
    ],
    effects: [up(XAU, 's')],
    profile: 'delayed',
    explain: 'Madenden daha az altın çıkması arzı azaltır. Piyasa haberin önemini tartarken etki biraz gecikmeyle fiyata yansıyabilir.',
  },
  {
    key: 'hurricane_platforms',
    category: 'disaster',
    kind: 'news',
    variants: [
      { headline: 'Güçlü bir kasırga açık deniz petrol platformlarında üretimi durdurdu', body: 'Platformlardaki personel tahliye edildi.' },
      { headline: 'Kasırga uyarısı: Kıyıdaki rafineriler üretimi azaltıyor' },
    ],
    effects: [up(OIL, 'm')],
    profile: 'delayed',
    explain: 'Doğal afetler üretimi ve taşımayı aksatarak arzı azaltır. Hasarın boyutu anlaşıldıkça fiyat tepki verir; ilk dakikalarda hareket gecikebilir.',
  },
  {
    key: 'earthquake_mining',
    category: 'disaster',
    kind: 'news',
    variants: [
      { headline: 'Maden bölgesinde deprem: Birçok altın madeninde çalışma durdu' },
    ],
    effects: [up(XAU, 's')],
    profile: 'delayed',
    explain: 'Madenlerdeki üretim aksaması altın arzını azaltır. Piyasa hasarın büyüklüğünü değerlendirirken etki gecikmeli gelir.',
  },
  {
    key: 'power_outage_mining',
    category: 'disaster',
    kind: 'news',
    variants: [
      { headline: 'Kripto madenciliğinin yoğun olduğu bölgede büyük elektrik kesintisi' },
    ],
    effects: [up(BTC, 's')],
    profile: 'delayed',
    explain: 'Madencilerin bir kısmı devre dışı kalınca yeni Bitcoin arzı ve madencilerin satışları geçici olarak azalır; bu da fiyatı hafifçe destekleyebilir.',
  },

  // ---------------------------------------------------------------------------
  // Söylentiler (ardından yalanlama)
  // ---------------------------------------------------------------------------
  {
    key: 'rumour_exchange_insolvent',
    category: 'crypto',
    kind: 'rumour',
    variants: [
      { headline: 'Söylenti: Büyük bir kripto borsasının iflasın eşiğinde olduğu konuşuluyor', body: 'Sosyal medyada doğrulanmamış iddialar yayılıyor.' },
    ],
    effects: [down(BTC, 'm')],
    profile: 'drift',
    explain: 'Doğrulanmamış iddialar bile panik satışını tetikleyebilir. Ancak söylentiye dayanan hareketler kırılgandır.',
    denial: {
      variants: [{ headline: 'Borsa yönetimi iddiaları yalanladı: "Müşteri varlıkları tamamen güvende"', body: 'Bağımsız denetim raporu yayımlandı.' }],
      explain: 'Yalanlama gelince söylentiyle oluşan düşüş hızla geri alındı. Söylentiyle işlem açan ve pozisyonunu taşıyan oyuncu yalanlamada zarar etti.',
    },
  },
  {
    key: 'rumour_fed_emergency_cut',
    category: 'central_bank',
    kind: 'rumour',
    variants: [
      { headline: 'Söylenti: Fed\'in olağanüstü toplantıyla faiz indireceği iddia ediliyor' },
    ],
    effects: [up(EUR, 's'), up(XAU, 's')],
    profile: 'drift',
    explain: 'İndirim beklentisi doları zayıflattı. Ancak kaynağı belirsiz bir iddiaydı.',
    denial: {
      variants: [{ headline: 'Fed sözcüsü: "Olağanüstü toplantı planı yok"' }],
      explain: 'Resmî yalanlama, söylentiyle oluşan hareketi tersine çevirdi. Kaynağı belirsiz haberlerde küçük pozisyon ve stop kullanmak önemlidir.',
    },
  },
  {
    key: 'rumour_emergency_output_cut',
    category: 'energy',
    kind: 'rumour',
    variants: [
      { headline: 'İddia: Petrol üreticisi ülkeler acil toplantıda üretim kesintisine gidecek' },
    ],
    effects: [up(OIL, 'm')],
    profile: 'drift',
    explain: 'Arz kesintisi beklentisi petrolü yukarı itti; ancak bilgi resmî değildi.',
    denial: {
      variants: [{ headline: 'Üretici ülkeler: "Olağanüstü bir toplantı veya karar söz konusu değil"' }],
      explain: 'Yalanlamayla birlikte söylenti primi silindi ve petrol geri düştü.',
    },
  },
  {
    key: 'rumour_etf_approval',
    category: 'crypto',
    kind: 'rumour',
    variants: [
      { headline: 'Söylenti: Bir piyasa düzenleyicisinin Bitcoin fonunu bugün onaylayacağı konuşuluyor' },
    ],
    effects: [up(BTC, 'm')],
    profile: 'drift',
    explain: 'Onay beklentisi alımları tetikledi; ancak karar henüz açıklanmamıştı.',
    denial: {
      variants: [{ headline: 'Düzenleyici kurum: "Başvuru hâlâ inceleniyor, bugün karar yok"' }],
      explain: 'Beklenti boşa çıkınca söylentiyle alanlar satış yaptı ve fiyat geri düştü. "Söylentiyle al, haberle sat" sözü bu yüzden vardır.',
    },
  },
  {
    key: 'rumour_cb_gold_sale',
    category: 'central_bank',
    kind: 'rumour',
    variants: [
      { headline: 'İddia: Bir merkez bankası altın rezervlerinin bir kısmını satacak' },
    ],
    effects: [down(XAU, 's')],
    profile: 'drift',
    explain: 'Büyük bir satıcı beklentisi altını baskıladı; iddia doğrulanmamıştı.',
    denial: {
      variants: [{ headline: 'Merkez bankası satış iddialarını yalanladı: "Rezerv politikamız değişmedi"' }],
      explain: 'Yalanlamayla altın kayıplarını geri aldı. Söylentiyle açılan kısa (satış) pozisyonlar zarara döndü.',
    },
  },
  {
    key: 'rumour_ecb_hike',
    category: 'central_bank',
    kind: 'rumour',
    variants: [
      { headline: 'Söylenti: ECB\'nin gelecek hafta faiz artıracağı konuşuluyor' },
    ],
    effects: [up(EUR, 's')],
    profile: 'drift',
    explain: 'Faiz artışı beklentisi euroyu destekledi; ancak kaynak belirsizdi.',
    denial: {
      variants: [{ headline: 'ECB kaynakları: "Faiz artışı gündemimizde değil"' }],
      explain: 'Yalanlama gelince euro söylentiyle kazandığı değeri geri verdi.',
    },
  },
  {
    key: 'rumour_refinery_fire',
    category: 'energy',
    kind: 'rumour',
    variants: [
      { headline: 'İddia: Büyük bir rafineride yangın çıktı', body: 'Sosyal medyada paylaşılan görüntüler doğrulanmadı.' },
    ],
    effects: [up(OIL, 's')],
    profile: 'drift',
    explain: 'Arz kesintisi korkusu petrolü kısa süreliğine yükseltti.',
    denial: {
      variants: [{ headline: 'Yetkililer: "Yangın haberleri asılsız, üretim normal seyrinde"' }],
      explain: 'Görüntülerin eski olduğu anlaşılınca petrol geri düştü. Bir haberi kaynağı doğrulanmadan işleme dönüştürmek risklidir.',
    },
  },

  // ---------------------------------------------------------------------------
  // Gürültü (etkisiz haberler)
  // ---------------------------------------------------------------------------
  {
    key: 'noise_cb_watching',
    category: 'central_bank',
    kind: 'noise',
    variants: [{ headline: 'Bir merkez bankası yetkilisi: "Verileri yakından izlemeye devam ediyoruz"' }],
    effects: [],
    related: [EUR, XAU],
    profile: 'jump',
    explain: 'Bu açıklama yeni bir bilgi içermiyordu; merkez bankaları bunu sık sık söyler. Fiyatı hareket ettiren SÜRPRİZ ve yeni bilgidir.',
  },
  {
    key: 'noise_analysts_wait',
    category: 'markets',
    kind: 'noise',
    variants: [{ headline: 'Analistler: Piyasalar yönünü gelecek haftaki verilere göre belirleyecek' }],
    effects: [],
    related: [EUR, XAU, OIL, BTC],
    profile: 'jump',
    explain: 'Genel bir yorum; somut bir karar veya veri yok. Bu tür başlıklara işlemle tepki vermek gereksiz maliyet (makas) demektir.',
  },
  {
    key: 'noise_producers_meeting_date',
    category: 'energy',
    kind: 'noise',
    variants: [{ headline: 'Petrol üreticisi ülkelerin bir sonraki toplantısının tarihi belli oldu' }],
    effects: [],
    related: [OIL],
    profile: 'jump',
    explain: 'Toplantının yalnızca tarihi açıklandı, bir karar alınmadı. Önemli olan toplantının sonucudur, takvimi değil.',
  },
  {
    key: 'noise_crypto_conference',
    category: 'crypto',
    kind: 'noise',
    variants: [{ headline: 'Dünyanın dört bir yanından katılımcıların olduğu kripto konferansı başladı' }],
    effects: [],
    related: [BTC],
    profile: 'jump',
    explain: 'Konferanslar ilgi çekici başlıklar üretir ama arz ya da talebi değiştiren somut bir gelişme içermez.',
  },
  {
    key: 'noise_gold_report_flat',
    category: 'commodities',
    kind: 'noise',
    variants: [{ headline: 'Altın talebi raporu yayımlandı: Talep geçen yılla aynı seviyede' }],
    effects: [],
    related: [XAU],
    profile: 'jump',
    explain: '"Değişiklik yok" haberi fiyatlara zaten yansımış bir durumu doğrular. Beklentiyle aynı gelen veri genellikle fiyatı oynatmaz.',
  },
  {
    key: 'noise_btc_upgrade',
    category: 'crypto',
    kind: 'noise',
    variants: [{ headline: 'Bitcoin ağında rutin yazılım güncellemesi sorunsuz tamamlandı' }],
    effects: [],
    related: [BTC],
    profile: 'jump',
    explain: 'Önceden duyurulmuş rutin bir güncellemeydi; piyasa için sürpriz değildi.',
  },
  {
    key: 'noise_holiday_volume',
    category: 'fx',
    kind: 'noise',
    variants: [{ headline: 'Avrupa\'da resmî tatil nedeniyle döviz piyasalarında işlem hacmi düşük' }],
    effects: [],
    related: [EUR],
    profile: 'jump',
    explain: 'Düşük hacim bir yön bilgisi vermez. Bu tür bilgiler işlem nedeni değildir.',
  },
  {
    key: 'noise_bank_keeps_forecast',
    category: 'commodities',
    kind: 'noise',
    variants: [{ headline: 'Bir yatırım bankası yıl sonu altın tahminini değiştirmedi' }],
    effects: [],
    related: [XAU],
    profile: 'jump',
    explain: 'Tahminin aynı kalması yeni bilgi değildir; fiyat hareketsiz kaldı.',
  },
  {
    key: 'noise_tankers_routine',
    category: 'energy',
    kind: 'noise',
    variants: [{ headline: 'Petrol tankerleri rutin rotalarında seyrediyor' }],
    effects: [],
    related: [OIL],
    profile: 'jump',
    explain: 'Olağan durumun devam ettiğini söyleyen haber, fiyatı değiştirecek bir şey içermez.',
  },
  {
    key: 'noise_viral_post',
    category: 'crypto',
    kind: 'noise',
    variants: [{ headline: 'Sosyal medyada "Bitcoin uçacak" paylaşımı viral oldu' }],
    effects: [],
    related: [BTC],
    profile: 'jump',
    explain: 'Viral paylaşımlar haber değildir. Kaynağı ve somut içeriği olmayan heyecana kapılmak yatırımcının en sık düştüğü tuzaklardandır.',
  },
  {
    key: 'noise_markets_calm',
    category: 'markets',
    kind: 'noise',
    variants: [{ headline: 'Piyasalar haftayı sakin kapatmaya hazırlanıyor' }],
    effects: [],
    related: [EUR, XAU, OIL, BTC],
    profile: 'jump',
    explain: 'Durum tespiti yapan bir başlık; fiyatları etkileyecek bir gelişme yok.',
  },
  {
    key: 'noise_cb_reiterate',
    category: 'central_bank',
    kind: 'noise',
    variants: [{ headline: 'ECB yetkilisi daha önce açıklanan para politikası çizgisini yineledi' }],
    effects: [],
    related: [EUR],
    profile: 'jump',
    explain: 'Bilinen politikanın tekrarı yeni bilgi değildir; euro tepki vermedi.',
  },
];

export function templateByKey(key: string): NewsTemplate | undefined {
  return NEWS_TEMPLATES.find((t) => t.key === key);
}
