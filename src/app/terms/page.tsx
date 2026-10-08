import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument, { List, Note, P, Strong, type LegalSection } from '@/components/legal/LegalDocument';
import { STARTING_BALANCE } from '@/lib/constants';
import { formatNumber } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Kullanım Şartları',
  description: 'PortfoyGo sanal yatırım simülasyonunun kullanım şartları.',
};

const CONTACT = 'iletisim@portfoygo.com';

const sections: LegalSection[] = [
  {
    id: 'hizmet',
    title: 'Hizmetin tanımı',
    content: (
      <>
        <P>
          PortfoyGo; hisse senedi, kripto para, döviz ve emtia piyasalarını gerçek fiyat verileriyle taklit eden, <Strong>tamamen sanal para</Strong> ile
          oynanan bir yatırım simülasyonudur. Amacı, kullanıcıların piyasa işleyişini ve portföy yönetimini risk almadan deneyimleyerek öğrenmesidir.
        </P>
        <P>
          Platforma kaydolarak veya platformu kullanarak bu Kullanım Şartları&apos;nı ve <Link href="/privacy" className="font-medium text-brand hover:underline">Gizlilik Politikası</Link>&apos;nı
          kabul etmiş sayılırsın. Şartları kabul etmiyorsan lütfen platformu kullanma.
        </P>
      </>
    ),
  },
  {
    id: 'hesap',
    title: 'Hesap oluşturma ve güvenlik',
    content: (
      <List
        items={[
          'Kayıt sırasında verdiğin bilgilerin doğru ve sana ait olması gerekir. Her kişi yalnızca bir hesap açabilir.',
          'Kullanıcı adın liderlik tablosunda herkese açık görünür; kişisel bilgi içermeyen, saygılı bir kullanıcı adı seçmelisin.',
          'Şifrenin gizliliğinden sen sorumlusun. Hesabında yetkisiz bir işlem fark edersen şifreni hemen değiştir ve bize bildir.',
          'Liderlik tablosunda yer almak için e-posta adresini doğrulaman gerekir.',
          '18 yaşından küçüksen platformu yalnızca veli veya vasinin bilgisi ve onayıyla kullanabilirsin.',
        ]}
      />
    ),
  },
  {
    id: 'sanal-para',
    title: 'Sanal para ve sanal varlıklar',
    content: (
      <>
        <P>
          Her yeni hesaba {formatNumber(STARTING_BALANCE, 0)} ₺ tutarında sanal bakiye tanımlanır. Platformdaki bakiye, varlık, kâr, zarar, rozet ve sıralamalar
          yalnızca oyun içi değerlerdir.
        </P>
        <List
          items={[
            <>Sanal bakiyenin ve sanal varlıkların <Strong>hiçbir gerçek parasal karşılığı yoktur</Strong>; nakde çevrilemez, başka bir hesaba devredilemez, satılamaz veya ödüle dönüştürülemez.</>,
            'Platformda gerçek para yatırılmaz, çekilmez ve hiçbir ödeme alınmaz. Senden kart, banka veya ödeme bilgisi isteyen bir mesaj PortfoyGo’ya ait değildir.',
            'İşlemlere uygulanan komisyon ve diğer kesintiler de sanaldır; gerçek piyasa koşullarını yansıtmak amacıyla simüle edilir.',
            'Oyun dengesini korumak için başlangıç bakiyesini, komisyon oranlarını veya oyun kurallarını önceden duyurarak değiştirebiliriz.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'tavsiye',
    title: 'Yatırım tavsiyesi değildir',
    content: (
      <>
        <Note>
          <Strong>Önemli:</Strong> PortfoyGo&apos;da yer alan fiyatlar, grafikler, haberler, sıralamalar ve diğer içerikler yalnızca bilgilendirme ve eğitim
          amaçlıdır. Bu içerikler, 6362 sayılı Sermaye Piyasası Kanunu kapsamında <Strong>yatırım danışmanlığı veya yatırım tavsiyesi niteliği taşımaz</Strong>.
        </Note>
        <P>
          Simülasyonda elde edilen sonuçlar gerçek piyasalarda aynı sonucun alınacağını göstermez; gerçek işlemlerde likidite, emir gerçekleşme süresi, vergi ve
          psikolojik etkenler sonuçları önemli ölçüde değiştirebilir. Gerçek yatırım kararlarını kendi araştırmana dayanarak ve gerekirse yetkili bir uzmana
          danışarak vermelisin.
        </P>
      </>
    ),
  },
  {
    id: 'veriler',
    title: 'Piyasa verileri',
    content: (
      <>
        <P>Fiyat ve haber verileri üçüncü taraf sağlayıcılardan alınır:</P>
        <List
          items={[
            <><Strong>CoinGecko</Strong> — kripto para fiyatları ve piyasa verileri</>,
            <><Strong>Finnhub</Strong> — hisse senedi fiyatları ve finans haberleri</>,
            <><Strong>NosyAPI</Strong> — döviz kurları ve emtia fiyatları</>,
          ]}
        />
        <P>
          Veriler gecikmeli olabilir, geçici olarak kesilebilir veya hata içerebilir. Verilerin doğruluğu, eksiksizliği ya da güncelliği garanti edilmez. Hatalı bir
          fiyat nedeniyle gerçekleşen sanal işlemleri düzeltme veya geri alma hakkımız saklıdır.
        </P>
      </>
    ),
  },
  {
    id: 'adil-kullanim',
    title: 'Adil kullanım ve yasaklı davranışlar',
    content: (
      <>
        <P>Simülasyonun herkes için adil kalması amacıyla aşağıdakiler yasaktır:</P>
        <List
          items={[
            'Sıralamada avantaj sağlamak için birden fazla hesap açmak veya hesaplar arasında değer aktarmaya çalışmak',
            'Yazılım hatalarını, fiyat gecikmelerini veya sistem açıklarını kasıtlı olarak istismar etmek',
            'Otomatik araç, bot veya betiklerle platforma aşırı yük bindirmek ya da hız sınırlarını aşmaya çalışmak',
            'Başka kullanıcıların hesaplarına erişmeye çalışmak, kimliğe bürünmek veya güvenlik önlemlerini atlatmak',
            'Hakaret, nefret söylemi veya yanıltıcı içerik barındıran kullanıcı adları kullanmak',
          ]}
        />
        <P>Bir açık fark edersen istismar etmek yerine bize bildirmeni rica ederiz.</P>
      </>
    ),
  },
  {
    id: 'askiya-alma',
    title: 'Hesabın askıya alınması ve kapatılması',
    content: (
      <P>
        Bu şartları ihlal eden hesapları önceden bildirimde bulunmaksızın askıya alabilir, liderlik tablosundan çıkarabilir, sanal bakiyesini sıfırlayabilir veya
        tamamen kapatabiliriz. Hesabını dilediğin zaman kapatmak için <Strong>{CONTACT}</Strong> adresine yazabilirsin.
      </P>
    ),
  },
  {
    id: 'sorumluluk',
    title: 'Sorumluluğun sınırlandırılması',
    content: (
      <P>
        Platform &quot;olduğu gibi&quot; ve &quot;mevcut olduğu sürece&quot; sunulur. Kesintisiz veya hatasız çalışacağı garanti edilmez. Yürürlükteki mevzuatın izin verdiği
        ölçüde; simülasyondaki sonuçlara, içeriklere veya veri hatalarına dayanarak alınan gerçek yatırım kararlarından doğan zararlardan PortfoyGo sorumlu
        tutulamaz.
      </P>
    ),
  },
  {
    id: 'degisiklikler',
    title: 'Şartlarda değişiklik',
    content: (
      <P>
        Bu şartları zaman zaman güncelleyebiliriz. Önemli değişiklikleri platform üzerinden veya e-posta ile duyururuz. Güncellemeden sonra platformu kullanmaya
        devam etmen, yeni şartları kabul ettiğin anlamına gelir. Sayfanın başındaki tarih, son güncellemeyi gösterir.
      </P>
    ),
  },
  {
    id: 'iletisim',
    title: 'İletişim',
    content: (
      <P>
        Bu şartlarla ilgili soruların için <a href={`mailto:${CONTACT}`} className="font-medium text-brand hover:underline">{CONTACT}</a> adresinden bize
        ulaşabilirsin.
      </P>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      title="Kullanım Şartları"
      description="PortfoyGo'yu kullanırken geçerli olan kurallar. Kısaca: her şey sanal paradır ve hiçbir içerik yatırım tavsiyesi değildir."
      updated="8 Ekim 2026"
      sections={sections}
      related={{ href: '/privacy', label: 'Gizlilik Politikası' }}
    />
  );
}
