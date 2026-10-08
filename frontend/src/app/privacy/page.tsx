import type { Metadata } from 'next';
import LegalDocument, { List, Note, P, Strong, type LegalSection } from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Gizlilik Politikası',
  description: 'PortfoyGo hangi verileri toplar, nasıl kullanır ve nasıl korur?',
};

const CONTACT = 'iletisim@portfoygo.com';

function DataTable({ rows }: { rows: { group: string; items: string; purpose: string }[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Veri grubu</th>
            <th scope="col" className="px-4 py-2.5 font-medium">İçerik</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Amaç</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.group} className="align-top">
              <th scope="row" className="px-4 py-3 font-semibold text-fg">{r.group}</th>
              <td className="px-4 py-3 leading-relaxed text-muted">{r.items}</td>
              <td className="px-4 py-3 leading-relaxed text-muted">{r.purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const sections: LegalSection[] = [
  {
    id: 'kapsam',
    title: 'Kapsam',
    content: (
      <>
        <P>
          Bu politika, PortfoyGo sanal yatırım simülasyonunu kullanırken hangi kişisel verilerinin işlendiğini, bunların hangi amaçlarla kullanıldığını ve
          haklarını açıklar. Kişisel verilerin 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve ilgili mevzuata uygun şekilde işlenir.
        </P>
        <Note>
          PortfoyGo tamamen sanal parayla çalışır. <Strong>Kart, banka hesabı, T.C. kimlik numarası veya herhangi bir ödeme bilgisi istemez ve saklamaz.</Strong>
        </Note>
      </>
    ),
  },
  {
    id: 'toplanan-veriler',
    title: 'Topladığımız veriler',
    content: (
      <>
        <P>Yalnızca hizmeti sunmak için gereken en az veriyi toplarız:</P>
        <DataTable
          rows={[
            {
              group: 'Hesap',
              items: 'Kullanıcı adı, e-posta adresi, şifrenin geri döndürülemez özeti (hash), e-posta doğrulama durumu, kayıt tarihi',
              purpose: 'Hesap oluşturma, giriş, hesap güvenliği ve iletişim',
            },
            {
              group: 'Oyun',
              items: 'Sanal bakiye, portföy, alım-satım geçmişi, zarar durdur emirleri, rozetler ve sıralama',
              purpose: 'Simülasyonun çalışması, portföy hesaplamaları ve liderlik tablosu',
            },
            {
              group: 'Etkinlik kayıtları',
              items: 'Giriş ve işlem kayıtları; bu kayıtlarla birlikte IP adresi ve tarayıcı bilgisi (user-agent)',
              purpose: 'Güvenlik, kötüye kullanımın önlenmesi ve hesap etkinliği geçmişi',
            },
            {
              group: 'Doğrulama kodları',
              items: 'E-posta doğrulama ve şifre sıfırlama için üretilen 6 haneli kodlar',
              purpose: 'Kimlik doğrulama; kodlar 15–30 dakika içinde geçersiz olur',
            },
          ]}
        />
        <P>
          Şifren hiçbir zaman açık metin olarak saklanmaz; yalnızca güçlü bir tek yönlü algoritmayla (bcrypt) üretilmiş özeti tutulur. Bu nedenle biz dahil kimse
          şifreni göremez.
        </P>
      </>
    ),
  },
  {
    id: 'kullanim',
    title: 'Verileri nasıl kullanıyoruz',
    content: (
      <List
        items={[
          'Hesabını oluşturmak, oturumunu yönetmek ve sanal işlemlerini gerçekleştirmek',
          'Portföy değerini, kâr/zarar durumunu ve sıralamanı hesaplamak',
          'Doğrulama ve şifre sıfırlama kodlarını e-posta ile göndermek',
          'Şüpheli girişleri ve kötüye kullanımı tespit etmek, hız sınırlarını uygulamak',
          'Hizmetin performansını ve güvenilirliğini iyileştirmek',
        ]}
      />
    ),
  },
  {
    id: 'herkese-acik',
    title: 'Herkese açık bilgiler',
    content: (
      <P>
        E-postası doğrulanmış kullanıcıların <Strong>kullanıcı adı, sıralaması, portföy değeri ve getirisi</Strong> liderlik tablosunda diğer kullanıcılara
        gösterilir. E-posta adresin, IP adresin ve işlem ayrıntıların hiçbir zaman herkese açık değildir.
      </P>
    ),
  },
  {
    id: 'paylasim',
    title: 'Üçüncü taraflar ve paylaşım',
    content: (
      <>
        <P>Kişisel verilerini satmayız, kiralamayız ve reklam amacıyla paylaşmayız. Hizmeti sunabilmek için şu taraflarla sınırlı ölçüde çalışırız:</P>
        <List
          items={[
            <><Strong>Piyasa veri sağlayıcıları</Strong> (CoinGecko, Finnhub, NosyAPI): Fiyat ve haber verileri sunucularımız tarafından çekilir; bu sağlayıcılara senin kişisel verin iletilmez.</>,
            <><Strong>E-posta gönderim hizmeti:</Strong> Doğrulama ve sıfırlama kodlarını iletmek için yalnızca e-posta adresin kullanılır.</>,
            <><Strong>Barındırma ve altyapı sağlayıcıları:</Strong> Veriler, güvenlik önlemleri alınmış sunucularda saklanır.</>,
            <><Strong>Yasal yükümlülükler:</Strong> Yetkili kurumların hukuka uygun talepleri olması halinde, mevzuatın gerektirdiği ölçüde.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'tarayici',
    title: 'Tarayıcıda saklanan veriler',
    content: (
      <>
        <P>Reklam veya izleme çerezi kullanmayız. Tarayıcında yalnızca platformun çalışması için gerekenler saklanır:</P>
        <List
          items={[
            'Oturum anahtarı (token): Giriş yaptığında yerel depolamada ve aynı adlı birinci taraf bir çerezde tutulur; çıkış yaptığında silinir.',
            'Hesap özeti: Sayfaların hızlı açılması için kullanıcı adı ve bakiye gibi bilgilerin geçici bir kopyası',
            'Tema tercihi: Açık veya koyu tema seçimin',
          ]}
        />
      </>
    ),
  },
  {
    id: 'saklama',
    title: 'Saklama süresi ve güvenlik',
    content: (
      <>
        <P>
          Hesap ve oyun verilerin hesabın açık kaldığı sürece saklanır. Hesabını kapattığında, yasal saklama yükümlülükleri saklı kalmak kaydıyla verilerin silinir
          veya anonim hale getirilir. Etkinlik kayıtları güvenlik amacıyla makul bir süre tutulduktan sonra silinir.
        </P>
        <P>
          Bağlantılar şifreli (HTTPS) yapılır, oturumlar süreli imzalı anahtarlarla yönetilir ve giriş, kayıt ve kod doğrulama uç noktalarında deneme sınırları
          uygulanır. Hiçbir sistem tamamen risksiz değildir; bir güvenlik ihlali olması halinde etkilenen kullanıcıları ve ilgili kurumları mevzuata uygun
          şekilde bilgilendiririz.
        </P>
      </>
    ),
  },
  {
    id: 'haklar',
    title: 'Hakların',
    content: (
      <>
        <P>KVKK&apos;nın 11. maddesi kapsamında şu haklara sahipsin:</P>
        <List
          items={[
            'Kişisel verilerinin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme',
            'İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme',
            'Eksik veya yanlış işlenmiş verilerin düzeltilmesini isteme',
            'Verilerinin silinmesini veya yok edilmesini isteme',
            'Verilerin aktarıldığı üçüncü kişileri öğrenme',
            'Hukuka aykırı işleme nedeniyle zarara uğraman halinde zararın giderilmesini talep etme',
          ]}
        />
        <P>
          Taleplerini <Strong>{CONTACT}</Strong> adresine iletebilirsin; en geç 30 gün içinde yanıt veririz.
        </P>
      </>
    ),
  },
  {
    id: 'iletisim',
    title: 'İletişim ve değişiklikler',
    content: (
      <P>
        Bu politikayı zaman zaman güncelleyebiliriz; önemli değişiklikleri platform üzerinden duyururuz. Sorularını{' '}
        <a href={`mailto:${CONTACT}`} className="font-medium text-brand hover:underline">{CONTACT}</a> adresine gönderebilirsin.
      </P>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Gizlilik Politikası"
      description="Hangi verileri neden topladığımızı ve onları nasıl koruduğumuzu açık bir dille anlatıyoruz."
      updated="8 Ekim 2026"
      sections={sections}
      related={{ href: '/terms', label: 'Kullanım Şartları' }}
    />
  );
}
