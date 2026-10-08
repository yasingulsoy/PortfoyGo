import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { COMMISSION_RATE, STARTING_BALANCE } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import SectionHeading from './SectionHeading';

const commission = `%${(COMMISSION_RATE * 100).toLocaleString('tr-TR')}`;

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Gerçek para yatırmam gerekiyor mu?',
    a: `Hayır. PortfoyGo tamamen ücretsizdir ve her hesap ${formatNumber(STARTING_BALANCE, 0)} ₺ sanal bakiyeyle başlar. Gerçek para yatırılamaz, çekilemez; kazanç ve kayıplar da sanaldır.`,
  },
  {
    q: 'Fiyatlar gerçek mi?',
    a: 'Evet. Hisse, kripto, döviz ve emtia fiyatları üçüncü taraf piyasa veri sağlayıcılarından alınır ve düzenli olarak yenilenir. Sağlayıcıya bağlı olarak birkaç dakikalık gecikme olabilir.',
  },
  {
    q: 'İşlemlerde komisyon var mı?',
    a: `Gerçekçi bir deneyim için her alım ve satımda ${commission} komisyon uygulanır. İşlem fiyatı her zaman sunucu tarafında, o anki piyasa fiyatından belirlenir.`,
  },
  {
    q: 'Stop-loss ve limit emri nedir?',
    a: 'Stop-loss, fiyat belirlediğin seviyenin altına düştüğünde pozisyonunu otomatik satarak zararını sınırlar. Limit emri ise hedeflediğin fiyata gelindiğinde alım ya da satımı kendiliğinden gerçekleştirir.',
  },
  {
    q: 'Haftalık yarışma nasıl işliyor?',
    a: 'Her Pazartesi herkesin o anki toplam varlığı başlangıç kabul edilir. Hafta boyunca en yüksek yüzde getiriyi elde eden oyuncu haftalık tabloda zirveye çıkar; tüm zamanlar tablosu ise hesabını başlangıçtan bu yana ne kadar büyüttüğünü ölçer.',
  },
  {
    q: 'Liderlik tablosunda görünmek için ne yapmalıyım?',
    a: 'E-posta adresini doğrulaman yeterli. Doğrulanmış hesaplar sıralamaya otomatik olarak dahil edilir.',
  },
];

export default function Faq() {
  return (
    <section aria-labelledby="landing-faq-title" className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
      <SectionHeading
        id="landing-faq-title"
        eyebrow="Sık sorulanlar"
        title="Aklına takılanlar"
        description="Başka bir sorun mu var? Hesabını açıp ürünü kurcalamak en hızlı yanıt."
      />
      <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[15px] font-medium text-fg transition-colors hover:bg-surface-2/60 [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDownIcon className="h-5 w-5 shrink-0 text-subtle transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
