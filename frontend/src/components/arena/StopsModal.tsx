'use client';

import { useState } from 'react';
import { cn } from '@portfoygo/shared/format';
import Button from '@portfoygo/shared/ui/Button';
import { Field } from '@portfoygo/shared/ui/Field';
import Modal from '@portfoygo/shared/ui/Modal';
import type { ArenaPosition, ArenaRoundInstrument } from '@/types';
import { SIDE_LABELS, STOP_PRESETS, formatPrice, stopIsValid, stopPrice } from './model';

interface Props {
  position: ArenaPosition;
  instrument: ArenaRoundInstrument;
  onClose: () => void;
  onSave: (body: { stop_loss: number | null; take_profit: number | null }) => Promise<void>;
}

const parse = (s: string) => {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

const toText = (n: number | null, decimals: number) => (n == null ? '' : n.toFixed(decimals));

/** Açık pozisyonun zarar durdur / kâr al seviyelerini düzenler (boş bırakılan seviye kaldırılır). */
export default function StopsModal({ position, instrument, onClose, onSave }: Props) {
  const { decimals } = instrument;
  const [sl, setSl] = useState(() => toText(position.stop_loss, decimals));
  const [tp, setTp] = useState(() => toText(position.take_profit, decimals));
  const [saving, setSaving] = useState(false);
  // Seçili hazır yüzde (elle yazınca temizlenir); fiyat her tick değiştiğinden vurgu buna göre yapılır
  const [picked, setPicked] = useState<{ sl: number | null; tp: number | null }>({ sl: null, tp: null });
  const ref = position.current_price ?? position.entry_price;

  const slVal = parse(sl);
  const tpVal = parse(tp);
  const slErr = slVal != null && !stopIsValid(position.side, 'sl', slVal, ref) ? (position.side === 'long' ? 'Güncel fiyatın altında olmalı.' : 'Güncel fiyatın üstünde olmalı.') : undefined;
  const tpErr = tpVal != null && !stopIsValid(position.side, 'tp', tpVal, ref) ? (position.side === 'long' ? 'Güncel fiyatın üstünde olmalı.' : 'Güncel fiyatın altında olmalı.') : undefined;

  const submit = async () => {
    if (slErr || tpErr) return;
    setSaving(true);
    try {
      await onSave({ stop_loss: slVal ?? null, take_profit: tpVal ?? null });
      onClose();
    } catch {
      // Hata bildirimi çağıran tarafta gösterilir
    } finally {
      setSaving(false);
    }
  };

  const presets = (kind: 'sl' | 'tp', set: (v: string) => void) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {STOP_PRESETS.map((p) => {
        const active = picked[kind] === p;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            onClick={() => {
              set(stopPrice(position.side, kind, ref, p, decimals).toFixed(decimals));
              setPicked((s) => ({ ...s, [kind]: p }));
            }}
            className={cn('num h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors', active ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:text-fg')}
          >
            %{p.toLocaleString('tr-TR')}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => {
          set('');
          setPicked((s) => ({ ...s, [kind]: null }));
        }}
        className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted hover:text-fg">
        Kaldır
      </button>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Zarar durdur / kâr al"
      description={`${instrument.label} · ${SIDE_LABELS[position.side]} · güncel ${formatPrice(ref, decimals)}`}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={() => void submit()} loading={saving} disabled={!!slErr || !!tpErr}>
            Kaydet
          </Button>
        </div>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <Field label="Zarar durdur (SL)" inputMode="decimal" value={sl} onChange={(e) => {
              setSl(e.target.value);
              setPicked((s) => ({ ...s, sl: null }));
            }} placeholder="Yok" error={slErr} data-autofocus className="num" />
          {presets('sl', setSl)}
        </div>
        <div>
          <Field label="Kâr al (TP)" inputMode="decimal" value={tp} onChange={(e) => {
              setTp(e.target.value);
              setPicked((s) => ({ ...s, tp: null }));
            }} placeholder="Yok" error={tpErr} />
          {presets('tp', setTp)}
        </div>
        <button type="submit" className="sr-only">
          Kaydet
        </button>
      </form>
    </Modal>
  );
}
