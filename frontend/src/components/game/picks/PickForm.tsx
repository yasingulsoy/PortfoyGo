'use client';

import { useId, useState } from 'react';
import { CheckIcon, LockClosedIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import GameButton from '@/components/game/ui/GameButton';
import GamePanel from '@/components/game/ui/GamePanel';
import { usePicksAssets } from '@/hooks/usePicks';
import type { AssetType, PickDirection, PickInput, PicksAsset, WeeklyPick } from '@/types';
import { ASSET_TYPE_CHIPS, PICK_NOTE_MAX, formatQuote, validateText } from './model';
import { AssetBadge, ReturnText, assetTypeLabel } from './parts';

/** Oyun derisindeki metin alanı */
export const FIELD_CLASS =
  'w-full rounded-2xl border-[3px] border-(--g-panel-3) bg-(--g-panel-2) px-3.5 py-2.5 text-base font-bold text-(--g-ink) placeholder:font-semibold placeholder:text-(--g-ink-faint) focus:border-(--g-blue) focus:outline-none focus-visible:ring-4 focus-visible:ring-(--g-focus)';

function fromPick(p: WeeklyPick): PicksAsset {
  return { asset_type: p.asset_type, symbol: p.symbol, name: p.name, price: p.current_price ?? p.entry_price, quote_currency: p.quote_currency, change_24h_pct: null };
}

function StepTitle({ n, children, id }: { n: number; children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mb-2 flex items-center gap-2 text-base font-extrabold">
      <span aria-hidden="true" className="g-font flex h-7 w-7 items-center justify-center rounded-full bg-(--g-blue) text-sm text-(--g-on-color) shadow-[0_2px_0_var(--g-blue-edge)]">
        {n}
      </span>
      {children}
    </h3>
  );
}

/**
 * "Seçimini yap" akışı: varlık ara (tür çipleri) → yön (Yükselir / Düşer) → isteğe bağlı not → mühürle.
 * Düzenlemede mevcut seçimle açılır.
 */
export default function PickForm({
  initial,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initial: WeeklyPick | null;
  busy: boolean;
  error: string | null;
  onSubmit: (input: PickInput) => void;
  onCancel?: () => void;
}) {
  const [type, setType] = useState<AssetType | null>(null);
  const [q, setQ] = useState('');
  const [asset, setAsset] = useState<PicksAsset | null>(() => (initial ? fromPick(initial) : null));
  const [browsing, setBrowsing] = useState(!initial);
  const [direction, setDirection] = useState<PickDirection | null>(initial?.direction ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const search = usePicksAssets(q, type, browsing);
  const searchId = useId();
  const noteId = useId();
  const noteCountId = useId();
  const dirId = useId();

  const noteError = validateText(note, PICK_NOTE_MAX, false);
  const ready = !!asset && !!direction && !noteError;

  const submit = () => {
    if (!asset || !direction || noteError || busy) return;
    const text = note.trim();
    onSubmit({ asset_type: asset.asset_type, symbol: asset.symbol, direction, ...(text ? { note: text } : {}) });
  };

  const results = search.data ?? [];

  return (
    <GamePanel title={initial ? 'Seçimini değiştir' : 'Seçimini yap'} accent="gold">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* 1 · Varlık */}
        <section aria-labelledby={`${searchId}-t`}>
          <StepTitle n={1} id={`${searchId}-t`}>
            Varlık
          </StepTitle>
          {!browsing && asset ? (
            <div className="g-panel-inset flex items-center gap-3 p-2.5">
              <AssetBadge type={asset.asset_type} symbol={asset.symbol} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold leading-tight">{asset.name}</p>
                <p className="truncate text-xs font-bold text-(--g-ink-soft)">
                  {asset.symbol} · {assetTypeLabel(asset.asset_type)}
                  {asset.price != null && <> · {formatQuote(asset.price, asset.quote_currency, asset.asset_type)}</>}
                </p>
              </div>
              <GameButton variant="plain" size="sm" onClick={() => setBrowsing(true)} aria-label={`Varlığı değiştir (şu an ${asset.name})`}>
                Değiştir
              </GameButton>
            </div>
          ) : (
            <div className="space-y-2.5">
              <label htmlFor={searchId} className="sr-only">
                Varlık ara
              </label>
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-(--g-ink-faint)" aria-hidden="true" />
                <input
                  id={searchId}
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Ara: THYAO, Bitcoin, dolar, altın…"
                  autoComplete="off"
                  maxLength={40}
                  className={cn(FIELD_CLASS, 'pl-11')}
                />
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Varlık türü">
                {[{ value: null as AssetType | null, label: 'Tümü' }, ...ASSET_TYPE_CHIPS].map((c) => (
                  <button key={c.label} type="button" className="g-chip h-9 px-3 text-sm" aria-pressed={type === c.value} onClick={() => setType(c.value)}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="max-h-[300px] overflow-y-auto overscroll-contain rounded-2xl border-2 border-(--g-panel-3)" aria-busy={search.isValidating}>
                {search.isLoading && !search.data ? (
                  <ul aria-label="Yükleniyor" className="space-y-1 p-1.5">
                    {Array.from({ length: 4 }, (_, i) => (
                      <li key={i} className="h-14 animate-pulse rounded-xl bg-(--g-panel-2) motion-reduce:animate-none" />
                    ))}
                  </ul>
                ) : search.error && !search.data ? (
                  <div role="alert" className="flex flex-col items-center gap-2 p-4 text-center text-sm font-bold">
                    <p>Varlıklar yüklenemedi.</p>
                    <GameButton variant="blue" size="sm" onClick={() => void search.mutate()}>
                      Tekrar dene
                    </GameButton>
                  </div>
                ) : results.length === 0 ? (
                  <p className="p-4 text-center text-sm font-bold text-(--g-ink-soft)" role="status">
                    {type && !q.trim()
                      ? `${assetTypeLabel(type)} şu an seçilemiyor (güncel fiyat verisi yok). Başka bir tür dene.`
                      : 'Sonuç bulunamadı. Başka bir arama dene.'}
                  </p>
                ) : (
                  <ul className="divide-y-2 divide-(--g-panel-2)" aria-label="Arama sonuçları">
                    {results.map((a) => {
                      const selected = asset?.symbol === a.symbol && asset.asset_type === a.asset_type;
                      return (
                        <li key={`${a.asset_type}:${a.symbol}`}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              setAsset(a);
                              setBrowsing(false);
                            }}
                            className={cn(
                              'g-focus flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-(--g-panel-2)',
                              selected && 'bg-(--g-panel-3)',
                            )}
                          >
                            <AssetBadge type={a.asset_type} symbol={a.symbol} size={36} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-extrabold leading-tight">{a.name}</span>
                              <span className="block truncate text-xs font-bold text-(--g-ink-soft)">
                                {a.symbol} · {assetTypeLabel(a.asset_type)}
                              </span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end">
                              <span className="g-num text-sm font-extrabold">{formatQuote(a.price, a.quote_currency, a.asset_type)}</span>
                              {a.change_24h_pct != null && (
                                <span className="text-[11px]">
                                  <span className="sr-only">24 saatlik değişim </span>
                                  <ReturnText value={a.change_24h_pct} />
                                </span>
                              )}
                            </span>
                            {selected && <CheckIcon className="h-5 w-5 shrink-0 text-(--g-blue)" aria-hidden="true" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {asset && (
                <GameButton variant="plain" size="sm" onClick={() => setBrowsing(false)}>
                  {asset.symbol} ile devam et
                </GameButton>
              )}
            </div>
          )}
        </section>

        {/* 2 · Yön */}
        <section aria-labelledby={dirId}>
          <StepTitle n={2} id={dirId}>
            Yön: bir hafta sonra nerede olur?
          </StepTitle>
          <div className="grid grid-cols-2 gap-3" role="group" aria-labelledby={dirId}>
            {(['up', 'down'] as const).map((d) => {
              const on = direction === d;
              return (
                <GameButton
                  key={d}
                  variant={d === 'up' ? 'green' : 'red'}
                  size="lg"
                  block
                  wrap
                  aria-pressed={on}
                  data-pressed={on}
                  onClick={() => setDirection(d)}
                  className={cn('relative !min-h-[84px] flex-col', direction && !on && 'opacity-55')}
                >
                  <span aria-hidden="true" className="block text-[26px] leading-none">
                    {d === 'up' ? '▲' : '▼'}
                  </span>
                  <span className="block">{d === 'up' ? 'YÜKSELİR' : 'DÜŞER'}</span>
                  {on && (
                    <span aria-hidden="true" className="absolute -right-2 -top-2.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-(--g-on-color) bg-(--g-gold) text-(--g-gold-ink)">
                      <CheckIcon className="h-4 w-4" />
                    </span>
                  )}
                </GameButton>
              );
            })}
          </div>
        </section>

        {/* 3 · Not */}
        <section>
          <StepTitle n={3}>
            <label htmlFor={noteId}>
              Not <span className="text-sm font-bold text-(--g-ink-soft)">(isteğe bağlı)</span>
            </label>
          </StepTitle>
          <textarea
            id={noteId}
            rows={3}
            value={note}
            maxLength={PICK_NOTE_MAX + 20}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Neden bu seçim? Kısa gerekçeni yaz — açılıştan sonra herkes görecek."
            aria-describedby={noteCountId}
            aria-invalid={!!noteError}
            className={cn(FIELD_CLASS, 'resize-y text-[15px] font-semibold')}
          />
          <p id={noteCountId} className={cn('mt-1 text-right text-xs font-extrabold', noteError ? 'text-(--g-down)' : 'text-(--g-ink-soft)')}>
            <span className="g-num">
              {note.trim().length}/{PICK_NOTE_MAX}
            </span>
            {noteError && <span> · {noteError}</span>}
          </p>
        </section>

        {error && (
          <p role="alert" className="rounded-2xl bg-(--g-down-soft) px-3 py-2 text-center text-sm font-bold text-(--g-down)">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <GameButton type="submit" variant="gold" size="lg" block loading={busy} disabled={!ready} icon={<LockClosedIcon aria-hidden="true" />} sound="go">
            {initial ? 'DEĞİŞİKLİĞİ MÜHÜRLE' : 'ZARFI MÜHÜRLE'}
          </GameButton>
          {!ready && !busy && <p className="-mt-1 text-center text-xs font-bold text-(--g-ink-soft)">Önce bir varlık ve yön seç.</p>}
          {onCancel && (
            <GameButton variant="plain" size="md" block onClick={onCancel} disabled={busy}>
              Vazgeç
            </GameButton>
          )}
          <p className="text-center text-xs font-semibold text-(--g-ink-soft)">Açılışa kadar seçimini istediğin kadar değiştirebilir ya da geri çekebilirsin.</p>
        </div>
      </form>
    </GamePanel>
  );
}
