import { LightBulbIcon } from '@heroicons/react/24/outline';
import { Card, CardHeader } from '@portfoygo/shared/ui/Card';
import type { PublicIdeasRecord } from '@/types/ideas';
import TrackRecord from './TrackRecord';

/** Herkese açık profilde Ortak Akıl başarı kaydı (yalnızca sayılar; öneri içeriği gösterilmez). */
export default function PublicIdeasCard({ record }: { record: PublicIdeasRecord }) {
  return (
    <Card>
      <CardHeader icon={<LightBulbIcon />} title="Ortak Akıl" description="Yapılandırılmış yatırım fikirleri ve değerlendirmeleri" />
      <div className="border-t border-line px-5 pb-5 pt-4 sm:px-6">
        <TrackRecord record={record} className="sm:grid-cols-4" />
        <p className="mt-3 text-xs text-subtle">
          “Beklendiği gibi” payı, kapanan önerilerde yazarın kendi sonuç değerlendirmesine dayanır. Öneriler yatırım tavsiyesi değildir.
        </p>
      </div>
    </Card>
  );
}
