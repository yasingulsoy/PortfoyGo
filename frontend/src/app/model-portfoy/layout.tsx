import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Model Portföy',
  description:
    '100.000 USD varsayımsal sermayeyle varlık dağılımı kur; nakit ve varlık sınıflarının yerini, değer değişimlerinin toplam portföye etkisini ve alternatif dağılımları karşılaştır (sanal para; yatırım tavsiyesi değildir).',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
