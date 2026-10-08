'use client';

import { useId, useState, type FormEvent } from 'react';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { Field } from '@portfoygo/shared/ui/Field';
import Modal from '@portfoygo/shared/ui/Modal';
import { cn } from '@portfoygo/shared/format';
import { leaguesApi } from '@/lib/api';
import { LEAGUE_DURATIONS, leagueEndsAt, type LeagueDuration } from '@/lib/competition';
import type { League } from '@/types';
import { LIMITS, controlClass } from './shared';

const NAME_MIN = 3;
const NAME_MAX = 40;
const DESC_MAX = 200;

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (league: League) => void;
}

export default function CreateLeagueModal({ open, onClose, onCreated }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Lig oluştur" description="Arkadaşlarını davet kodu ile çağırabileceğin özel bir lig kur.">
      <CreateLeagueForm onCancel={onClose} onCreated={onCreated} />
    </Modal>
  );
}

/** Modal kapanınca söküldüğü için form durumu her açılışta sıfırlanır. */
function CreateLeagueForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (league: League) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState<LeagueDuration>('none');
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const descId = useId();
  const durationId = useId();

  const trimmed = name.trim();
  const nameError =
    touched && trimmed.length < NAME_MIN ? `Lig adı en az ${NAME_MIN} karakter olmalı.` : trimmed.length > NAME_MAX ? `Lig adı en fazla ${NAME_MAX} karakter olabilir.` : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX || description.length > DESC_MAX) return;
    setPending(true);
    setError('');
    try {
      const league = await leaguesApi.create({
        name: trimmed,
        description: description.trim() || undefined,
        ends_at: leagueEndsAt(duration),
      });
      onCreated(league);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lig oluşturulamadı. Lütfen tekrar dene.');
      setPending(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      <Field
        label="Lig adı"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setTouched(true)}
        maxLength={NAME_MAX}
        minLength={NAME_MIN}
        required
        autoComplete="off"
        placeholder="Örn. Ofis Borsacıları"
        error={nameError}
        hint={`${NAME_MIN}–${NAME_MAX} karakter`}
        data-autofocus
      />

      <div>
        <label htmlFor={descId} className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
          <span>Açıklama (isteğe bağlı)</span>
          <span className={cn('num', description.length > DESC_MAX - 20 ? 'text-fg' : 'text-subtle')} aria-hidden="true">
            {description.length}/{DESC_MAX}
          </span>
        </label>
        <textarea
          id={descId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={DESC_MAX}
          rows={3}
          placeholder="Ligin kuralları ya da amacı"
          className={cn(controlClass, 'resize-none py-2.5')}
        />
      </div>

      <div>
        <label htmlFor={durationId} className="mb-1.5 block text-xs font-medium text-muted">
          Bitiş
        </label>
        <select id={durationId} value={duration} onChange={(e) => setDuration(e.target.value as LeagueDuration)} className={cn(controlClass, 'h-11')}>
          {LEAGUE_DURATIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-subtle">Süresi dolan lige yeni oyuncu katılamaz; süresiz ligler sen silene kadar sürer.</p>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Her oyuncunun getirisi lige katıldığı andaki toplam varlığına göre ölçülür. En fazla {LIMITS.owned} lig kurabilir, bir lige en fazla{' '}
        {LIMITS.members} oyuncu davet edebilirsin.
      </p>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          Vazgeç
        </Button>
        <Button type="submit" loading={pending}>
          Ligi oluştur
        </Button>
      </div>
    </form>
  );
}
