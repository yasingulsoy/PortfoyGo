import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument, { List, Note, P, Strong, type LegalSection } from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Çerez Politikası',
  description: 'PortfoyGo yalnızca zorunlu çerezler kullanır: oturum çerezi ve oturum ipucu çerezi. Reklam veya izleme çerezi yoktur.',
};

const CONTACT = 'iletisim@portfoygo.com';

interface Row {
  name: string;
  kind: string;
  purpose: string;
  duration: string;
}

function StorageTable({ rows, caption }: { rows: Row[]; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Ad</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Tür</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Amaç</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Süre</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.name} className="align-top">
              <th scope="row" className="num px-4 py-3 font-semibold text-fg">{r.name}</th>
              <td className="px-4 py-3 leading-relaxed text-muted">{r.kind}</td>
              <td className="px-4 py-3 leading-relaxed text-muted">{r.purpose}</td>
              <td className="px-4 py-3 leading-relaxed text-muted">{r.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const sections: LegalSection[] = [
  {
    id: 'ozet',
    title: 'Kısaca',
    content: (
      <>
        <P>
          PortfoyGo <Strong>yalnızca hizmetin çalışması için zorunlu olan çerezleri</Strong> kullanır. Reklam, analiz, izleme veya sosyal medya
          çerezi kullanmayız; üçüncü taraf çerezi yerleştirmeyiz ve ziyaretlerini başka sitelerle ilişkilendirmeyiz.
        </P>
        <Note>
          Zorunlu çerezler için açık rıza gerekmediğinden (6698 sayılı KVKK md. 5/2-c ve ePrivacy yaklaşımı) sitede çerez onay bandı
          gösterilmez. İleride zorunlu olmayan bir çerez eklenirse önce bu politika güncellenir ve kullanmadan önce iznin istenir.
        </Note>
      </>
    ),
  },
  {
    id: 'cerezler',
    title: 'Kullandığımız çerezler',
    content: (
      <>
        <P>Çerezler yalnızca giriş yaptığında, PortfoyGo API&apos;si tarafından birinci taraf çerez olarak yazılır:</P>
        <StorageTable
          caption="Kullanılan çerezler"
          rows={[
            {
              name: 'pg_session',
              kind: 'Zorunlu · birinci taraf · httpOnly',
              purpose:
                'Oturum anahtarı (imzalı, süreli). Giriş yaptığını doğrular. JavaScript tarafından okunamaz (httpOnly), yalnızca HTTPS üzerinden gönderilir (Secure) ve başka sitelerden gelen isteklerle gönderilmez (SameSite=Lax).',
              duration: '7 gün veya çıkış yapana kadar',
            },
            {
              name: 'pg_auth',
              kind: 'Zorunlu · birinci taraf',
              purpose:
                'Değeri yalnızca "1" olan ipucu çerezi; kişisel veri içermez. Sayfaların, oturum gerektiren bölümlere giriş yapmadan gidildiğinde giriş sayfasına yönlendirebilmesi içindir.',
              duration: '7 gün veya çıkış yapana kadar',
            },
          ]}
        />
        <P>
          Çıkış yaptığında, &quot;Tüm cihazlardan çıkış&quot; kullandığında veya hesabını sildiğinde bu çerezler silinir ve geçersiz olur.
        </P>
      </>
    ),
  },
  {
    id: 'yerel-depolama',
    title: 'Tarayıcıda saklanan tercihler',
    content: (
      <>
        <P>
          Bazı arayüz tercihleri çerez olarak değil, yalnızca senin tarayıcında (localStorage / sessionStorage) tutulur. Bunlar sunucumuza
          gönderilmez ve seni tanımlamak için kullanılmaz:
        </P>
        <List
          items={[
            <><Strong>theme</Strong> — açık / koyu tema tercihin (sayfa açılırken doğru temanın gösterilmesi için)</>,
            'Grafik aralığı ve görünümü, ses ayarı, komut paletindeki son aramalar, kapatılan tanıtım ipuçları gibi arayüz tercihleri',
            'Oyun alanında sorumlu oyun için oturum süresi hatırlatıcısı (sekme kapanınca silinir)',
          ]}
        />
        <P>Tarayıcı ayarlarından site verilerini silerek bunları istediğin zaman temizleyebilirsin; yalnızca tercihlerin varsayılana döner.</P>
      </>
    ),
  },
  {
    id: 'ucuncu-taraflar',
    title: 'Üçüncü taraflar',
    content: (
      <P>
        Sayfalarımız üçüncü taraf betik, reklam ağı, analiz aracı veya yazı tipi sunucusu yüklemez (yazı tipleri kendi sunucumuzdan gelir).
        Piyasa verileri sunucularımız tarafından çekilir; tarayıcın bu sağlayıcılara bağlanmaz. Haber kartlarındaki görseller ilgili haber
        sitesinden yüklenebilir; bu isteklerle çerez gönderilmez ve PortfoyGo bu sitelere kişisel veri iletmez.
      </P>
    ),
  },
  {
    id: 'yonetim',
    title: 'Çerezleri yönetme',
    content: (
      <>
        <P>
          Zorunlu çerezleri tarayıcı ayarlarından engelleyebilirsin; ancak bu durumda giriş yapamaz ve oturum gerektiren bölümleri
          kullanamazsın. Çerezleri silmek seni yalnızca oturumdan çıkarır.
        </P>
        <P>
          Kişisel verilerinin kopyasını indirmek veya hesabını silmek için giriş yaptıktan sonra{' '}
          <Link href="/profile#hesap-ve-veriler" className="font-medium text-brand hover:underline">
            Profil → Hesap ve veriler
          </Link>{' '}
          bölümünü kullanabilirsin.
        </P>
      </>
    ),
  },
  {
    id: 'iletisim',
    title: 'İletişim ve değişiklikler',
    content: (
      <P>
        Bu politikayı güncellediğimizde &quot;Son güncelleme&quot; tarihini değiştiririz. Sorularını{' '}
        <a href={`mailto:${CONTACT}`} className="font-medium text-brand hover:underline">{CONTACT}</a> adresine gönderebilirsin.
        Kişisel verilerin nasıl işlendiğinin tamamı için{' '}
        <Link href="/privacy" className="font-medium text-brand hover:underline">Gizlilik Politikası</Link>&apos;na bakabilirsin.
      </P>
    ),
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalDocument
      title="Çerez Politikası"
      description="Yalnızca zorunlu çerezler kullanıyoruz: oturum çerezi ve oturum ipucu çerezi. Reklam veya izleme çerezi yok."
      updated="15 Ekim 2026"
      sections={sections}
      related={{ href: '/privacy', label: 'Gizlilik Politikası' }}
    />
  );
}
