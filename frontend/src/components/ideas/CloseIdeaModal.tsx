'use client';

import { useState } from 'react';
import Button from '@portfoygo/shared/ui/Button';
import Modal from '@portfoygo/shared/ui/Modal';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { IDEA_TEXT, OUTCOMES, OUTCOME_META, formatQuote, ideasApi, performanceLabel, textError } from '@/lib/ideas';
import type { IdeaDetail, IdeaOutcome } from '@/types/ideas';
import { OptionTile, TextAreaField } from './fields';
import { PerfValue } from './parts';

/**
 * Kapanış: zorunlu "Değerlendirme" (beklenen senaryo ile gerçekleşen, çıkarılan dersler) + sonuç etiketi.
 * Kapanışta fiyat dondurulur; öneri bir daha açılamaz.
 */
export default function CloseIdeaModal({ idea, open, onClose, onClosed }: { idea: IdeaDetail; open: boolean; onClose: () => void; onClosed: () => void }) {
  const [outcome, setOutcome] = useState<IdeaOutcome | null>(null);
  const [evaluation, setEvaluation] = useState('');
  const [lessons, setLessons] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const msg = !outcome
      ? 'Sonucu seç: beklendiği gibi, kısmen ya da beklenmedik'
      : textError('Değerlendirme', evaluation, IDEA_TEXT.evaluation.min, IDEA_TEXT.evaluation.max) ??
        textError('Çıkarılan dersler', lessons, 1, IDEA_TEXT.lessons.max, false);
    if (msg || !outcome) {
      setError(msg);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ideasApi.close(idea.id, { outcome, evaluation: evaluation.trim(), lessons: lessons.trim() || null });
      onClosed();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Öneri kapatılamadı.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Öneriyi değerlendir ve kapat"
      description="Beklediğin senaryo ile gerçekleşeni karşılaştır. Kapanışta güncel fiyat dondurulur; öneri yeniden açılamaz."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Değerlendir ve kapat
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          <div>
            <p className="text-xs text-muted">Referans</p>
            <p className="num font-medium text-fg">{formatQuote(idea.ref_price, idea.quote_currency)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">{performanceLabel(idea)} (şu an)</p>
            <PerfValue value={idea.performance_pct} directional={idea.directional} />
          </div>
        </div>
        <div className="rounded-xl border border-line p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Beklenen senaryo</p>
          <p className="mt-1 line-clamp-4 whitespace-pre-line break-words text-fg/90">{idea.scenario}</p>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg/80">Sonuç</legend>
          <div className="grid gap-2">
            {OUTCOMES.map((o) => (
              <OptionTile
                key={o}
                name={`outcome-${idea.id}`}
                checked={outcome === o}
                onChange={() => setOutcome(o)}
                title={OUTCOME_META[o].label}
                description={OUTCOME_META[o].description}
                tone={OUTCOME_META[o].tone}
              />
            ))}
          </div>
        </fieldset>
        <TextAreaField
          label="Değerlendirme"
          value={evaluation}
          onChange={setEvaluation}
          min={IDEA_TEXT.evaluation.min}
          max={IDEA_TEXT.evaluation.max}
          rows={4}
          autoFocus
          placeholder="Ne oldu? Senaryonun hangi kısmı tuttu, hangisi tutmadı ve neden?"
        />
        <TextAreaField
          label="Çıkarılan dersler"
          optional
          value={lessons}
          onChange={setLessons}
          max={IDEA_TEXT.lessons.max}
          rows={2}
          placeholder="Bir dahaki sefere neyi farklı yaparsın?"
        />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
