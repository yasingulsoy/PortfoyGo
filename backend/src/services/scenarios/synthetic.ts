import { deriveSeed, gaussian, mulberry32 } from '../arena/paths';

/**
 * SENTETİK eğitim serileri (gerçek piyasa verisi DEĞİLDİR). Yerel örnek veri (src/dev/seed.ts → seedScenarios)
 * ve testler kullanır. Tamamen deterministiktir (sabit tohum).
 *
 * "Ani Çöküş Tatbikatı": sakin başlangıç → ani ve sert düşüş → kısmi toparlanma.
 *  - Bitcoin: ~%28 düşüş, sonunda başlangıca göre ~%12 aşağıda
 *  - Brent:   ~%18 düşüş, sonunda ~%9 aşağıda
 *  - Altın:   kısa süreli ~%3 düşüş (nakit ihtiyacı), sonra güvenli liman talebiyle ~%3 yukarıda
 */

export const CRASH_DRILL_SLUG = 'ani-cokus-tatbikati';
export const CRASH_DRILL_TITLE = 'Ani Çöküş Tatbikatı (sentetik veri)';
/** Açıkça yapay bir tarih aralığı (gerçek bir olayla karışmasın) */
export const CRASH_DRILL_FROM = new Date('2000-01-03T00:00:00.000Z');
export const CRASH_DRILL_HOURS = 120;
export const CRASH_DRILL_TO = new Date(CRASH_DRILL_FROM.getTime() + CRASH_DRILL_HOURS * 3_600_000);

export interface SyntheticSeriesSpec {
  series_code: string;
  code: 'BTCUSD' | 'XAUUSD' | 'BRENT';
  label: string;
  series_label: string;
  base: number;
  /** Faz sonlarındaki hedef seviye (başlangıca oran): [sakin sonu, dip, son] */
  shape: [number, number, number];
  /** Altın: dipten önce kısa düşüş, sonra yükseliş */
  safeHaven?: boolean;
  /** saatlik gürültü (log) */
  noise: number;
}

export const CRASH_DRILL_SERIES: SyntheticSeriesSpec[] = [
  { series_code: 'SYN_CRASH_BTC', code: 'BTCUSD', label: 'Bitcoin', series_label: 'Sentetik Bitcoin (çöküş tatbikatı)', base: 60_000, shape: [1.02, 0.72, 0.88], noise: 0.006 },
  { series_code: 'SYN_CRASH_BRENT', code: 'BRENT', label: 'Brent Petrol', series_label: 'Sentetik Brent (çöküş tatbikatı)', base: 80, shape: [1.01, 0.82, 0.91], noise: 0.004 },
  { series_code: 'SYN_CRASH_XAU', code: 'XAUUSD', label: 'Altın', series_label: 'Sentetik Altın (çöküş tatbikatı)', base: 2_000, shape: [1.0, 0.97, 1.03], safeHaven: true, noise: 0.0015 },
];

const CALM_END = 0.4;
const DROP_END = 0.52;

/** Fazlara göre hedef log-seviye (0..1 ilerleme → oran) */
function target(spec: SyntheticSeriesSpec, x: number): number {
  const [calm, bottom, end] = spec.shape;
  const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
  const ease = (f: number) => 1 - (1 - f) * (1 - f);
  if (x <= CALM_END) return lerp(1, calm, x / CALM_END);
  if (spec.safeHaven) {
    // Kısa düşüş (nakit ihtiyacı), sonra güvenli liman yükselişi
    if (x <= DROP_END) return lerp(calm, bottom, ease((x - CALM_END) / (DROP_END - CALM_END)));
    return lerp(bottom, end, Math.min(1, (x - DROP_END) / (1 - DROP_END) * 1.4));
  }
  if (x <= DROP_END) return lerp(calm, bottom, ease((x - CALM_END) / (DROP_END - CALM_END)));
  // Kısmi toparlanma (hızlı başlar, yavaşlar)
  return lerp(bottom, end, ease((x - DROP_END) / (1 - DROP_END)));
}

/** Saatlik noktalar: { ts (ms), price }. Uzunluk CRASH_DRILL_HOURS + 1. */
export function generateCrashDrillSeries(spec: SyntheticSeriesSpec, seed: string | number = 'crash-drill-v1'): { ts: number; price: number }[] {
  const rand = mulberry32(deriveSeed(seed, spec.series_code));
  const out: { ts: number; price: number }[] = [];
  let drift = 0;
  for (let h = 0; h <= CRASH_DRILL_HOURS; h++) {
    const x = h / CRASH_DRILL_HOURS;
    // Ortalamaya dönen gürültü: hedef eğrinin etrafında dalgalanır, uçlarda sıfırlanır
    drift = drift * 0.7 + spec.noise * gaussian(rand);
    const edge = h === 0 || h === CRASH_DRILL_HOURS ? 0 : drift;
    const price = spec.base * target(spec, x) * Math.exp(edge);
    out.push({ ts: CRASH_DRILL_FROM.getTime() + h * 3_600_000, price: Number(price.toPrecision(8)) });
  }
  return out;
}

export const CRASH_DRILL_DESCRIPTION =
  'Eğitim amaçlı, tamamen yapay fiyatlarla hazırlanmış bir çöküş tatbikatı: sakin başlangıç, ani ve sert düşüş, ardından kısmi toparlanma. Stop kullanımını ve panik anında soğukkanlılığını dene.';

export const CRASH_DRILL_BRIEFING = [
  'Bu bir TATBİKAT: fiyatlar gerçek piyasa verisi değildir, eğitim için üretilmiş sentetik verilerdir.',
  '',
  'Piyasalar sakin görünüyor; Bitcoin, Brent petrol ve altın dar bir bantta hareket ediyor. Ama ufukta bir şok var.',
  'Görevin riskini yönetmek: her işlemde zarar durdur (stop) kullan, tek bir enstrümana yüklenme ve ani hareketlerde panikle büyük işlem açma.',
  '',
  'İpucu: Kriz anlarında "güvenli liman" olarak görülen varlıklar diğerlerinden farklı davranabilir.',
].join('\n');

export const CRASH_DRILL_DEBRIEF = [
  'Neler oldu? (sentetik veri)',
  '',
  'Sakin bir dönemin ardından ani bir satış dalgası geldi: Bitcoin yaklaşık %28, Brent petrol yaklaşık %18 değer kaybetti. ' +
    'Altın önce kısa bir süre düştü (yatırımcılar nakit ihtiyacı için her şeyi satıyordu), ardından güvenli liman talebiyle yükseldi. ' +
    'Sonrasında piyasalar kayıplarının bir kısmını geri aldı ama başlangıç seviyesine dönmedi.',
  '',
  "Gerçek krizlerde de benzer kalıplar görülür (ör. Mart 2020'deki COVID-19 çöküşü): önce neredeyse her şey birlikte düşer, sonra varlıklar ayrışır. " +
    'Öğrenilecekler: stop büyük kayıpları sınırlar, panikle büyütülen işlemler kayıpları katlar, çeşitlendirme tek bir varlığın çöküşünden korur.',
  '',
  'Not: Bu senaryodaki fiyatlar PortfoyGo tarafından eğitim amacıyla üretilmiş sentetik verilerdir; gerçek bir tarihi olayı birebir yansıtmaz.',
].join('\n');

export const SYNTHETIC_SOURCE = 'PortfoyGo sentetik veri üreticisi (gerçek piyasa verisi değildir)';
export const SYNTHETIC_LICENSE_NOTE = 'Sentetik eğitim verisi; PortfoyGo tarafından üretildi, üçüncü taraf lisansı gerektirmez.';
