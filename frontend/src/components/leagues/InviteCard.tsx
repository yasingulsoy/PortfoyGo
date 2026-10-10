'use client';

import { useState } from 'react';
import { ArrowPathIcon, ClipboardDocumentIcon, LinkIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';
import { Card, CardBody, CardHeader } from '@portfoygo/shared/ui/Card';
import { useToast } from '@portfoygo/shared/ui/Toast';
import { leaguesApi } from '@/lib/api';
import { ToolbarButton } from '@/components/common/controls';
import ConfirmModal from './ConfirmModal';
import { inviteLink, useCopy } from './shared';

interface Props {
  leagueId: string;
  code: string;
  isOwner: boolean;
  full: boolean;
  ended: boolean;
  /** Lig başlamadan önce davet kartı öne çıkarılır */
  prominent?: boolean;
  onCodeChanged: (code: string) => void;
}

/** Davet kodu, kopyalama / paylaşım bağlantısı ve (kurucu için) kodu yenileme. */
export default function InviteCard({ leagueId, code, isOwner, full, ended, prominent, onCodeChanged }: Props) {
  const copy = useCopy();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const link = inviteLink(code);

  return (
    <Card featured={prominent}>
      <CardHeader
        title={prominent ? 'Rakiplerini çağır' : 'Davet'}
        description={prominent ? 'Başlamadan katılan herkes eşit başlar' : 'Kodu ya da bağlantıyı arkadaşlarınla paylaş'}
      />
      <CardBody className="space-y-4 border-t border-line">
        <div className="rounded-xl border border-dashed border-line-strong bg-surface-2 px-4 py-5 text-center">
          <p className="text-sm text-muted">Davet kodu</p>
          <p className="mt-1 select-all break-all font-mono text-2xl font-semibold tracking-[0.2em] text-fg sm:text-3xl">
            {code || '—'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <ToolbarButton
            disabled={!code}
            onClick={() => void copy(code, 'Davet kodu kopyalandı')}
            icon={<ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />}
          >
            Kodu kopyala
          </ToolbarButton>
          <ToolbarButton
            disabled={!code}
            onClick={() => void copy(link, 'Davet bağlantısı kopyalandı')}
            icon={<LinkIcon className="h-4 w-4" aria-hidden="true" />}
          >
            Bağlantıyı kopyala
          </ToolbarButton>
        </div>
        <p className="break-all font-mono text-[11px] leading-relaxed text-subtle">{link}</p>

        {full && <p className="text-xs text-down">Lig dolu; yeni oyuncu katılamaz.</p>}
        {!full && ended && <p className="text-xs text-down">Ligin süresi doldu; yeni oyuncu katılamaz.</p>}

        {isOwner && (
          <div className="border-t border-line pt-4">
            <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)} icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />}>
              Kodu yenile
            </Button>
            <p className="mt-1 text-xs text-muted">Kod istenmeyen kişilere ulaştıysa yenile; eski kod ve bağlantı çalışmaz hale gelir.</p>
          </div>
        )}
      </CardBody>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Davet kodu yenilensin mi?"
        confirmLabel="Kodu yenile"
        tone="primary"
        onConfirm={async () => {
          const next = await leaguesApi.regenerateCode(leagueId);
          onCodeChanged(next);
          setConfirmOpen(false);
          toast.success('Davet kodu yenilendi', { description: next ? `Yeni kod: ${next}` : undefined });
        }}
      >
        <p>Mevcut kod ve paylaştığın bağlantılar geçersiz olur. Ligdeki oyuncular etkilenmez.</p>
      </ConfirmModal>
    </Card>
  );
}
