'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PencilSquareIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { Card } from '@portfoygo/shared/ui/Card';
import Button from '@portfoygo/shared/ui/Button';
import { Alert } from '@portfoygo/shared/ui/Feedback';
import { advisorApi } from '@/lib/api';
import type { AdvisorProfileResult, AdvisorQuestionnaire } from '@/types';

interface Props {
  questionnaire: AdvisorQuestionnaire;
  onDone: (result: AdvisorProfileResult) => void;
  onCancel: () => void;
}

/**
 * Risk profili anketi: her adımda tek soru, büyük seçilebilir kutular (yerel radyo düğmeleri).
 * Klavye: 1–9 seçer, → / Enter ileri, ← geri. Son adımda cevapların özeti ve onay.
 */
export default function Questionnaire({ questionnaire, onDone, onCancel }: Props) {
  const { questions } = questionnaire;
  const total = questions.length;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const isSummary = step >= total;
  const question = isSummary ? null : questions[step];
  const answered = question ? !!answers[question.id] : true;
  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const progress = isSummary ? 100 : Math.round((step / total) * 100);

  // Adım değişince odağı yeni sorunun başlığına taşı (ilk açılışta da, anket kartı yeni göründüğünde)
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: firstRender.current });
    firstRender.current = false;
  }, [step]);

  const goNext = () => {
    if (isSummary) return;
    if (!answered) {
      setError('Devam etmek için bir seçenek işaretle.');
      return;
    }
    setError(null);
    setStep((s) => Math.min(total, s + 1));
  };

  const goBack = () => {
    setError(null);
    if (step === 0) onCancel();
    else setStep((s) => s - 1);
  };

  const pick = (optionId: string) => {
    if (!question) return;
    setError(null);
    setAnswers((a) => ({ ...a, [question.id]: optionId }));
  };

  const submit = async () => {
    const missing = questions.findIndex((q) => !answers[q.id]);
    if (missing >= 0) {
      setStep(missing);
      setError('Bu soru cevapsız kaldı.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      onDone(await advisorApi.submitProfile(answers));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil hesaplanamadı. Lütfen tekrar dene.');
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || submitting) return;
    const target = e.target as HTMLElement;
    // Düğmelerde/bağlantılarda Enter kendi işini yapsın
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (step > 0) goBack();
    } else if (question && /^[1-9]$/.test(e.key)) {
      const opt = question.options[Number(e.key) - 1];
      if (opt) {
        e.preventDefault();
        pick(opt.id);
        // Seçilen kutuya odaklan (ekran okuyucu seçimi duyurur)
        requestAnimationFrame(() => document.getElementById(`${question.id}-${opt.id}`)?.focus());
      }
    } else if (e.key === 'Enter' && question && target.tagName !== 'BUTTON' && target.tagName !== 'A') {
      e.preventDefault();
      goNext();
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl overflow-hidden">
      <div onKeyDown={onKeyDown}>
        {/* İlerleme */}
        <div className="px-5 pt-5 sm:px-8 sm:pt-7">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-muted">Risk profili anketi</span>
            <span className="num text-fg" aria-hidden="true">
              {isSummary ? 'Özet' : `${step + 1} / ${total}`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Anket ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={isSummary ? total : step}
            aria-valuetext={isSummary ? `${total} sorunun tamamı cevaplandı` : `Soru ${step + 1} / ${total}`}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"
          >
            <div className="h-full rounded-full bg-brand transition-[width] duration-300 ease-[var(--ease-out-soft)]" style={{ width: `${progress}%` }} />
          </div>
          <p className="sr-only" aria-live="polite">
            {isSummary ? 'Özet: cevaplarını kontrol et.' : `Soru ${step + 1} / ${total}`}
          </p>
        </div>

        <div className="px-5 pb-5 pt-6 sm:px-8 sm:pb-7">
          {question ? (
            <fieldset key={question.id} className="animate-enter">
              <legend className="w-full">
                <h2 ref={headingRef} tabIndex={-1} className="block text-lg font-semibold leading-snug text-fg outline-none sm:text-xl">
                  {question.text}
                </h2>
              </legend>
              {question.help && <p className="mt-1.5 text-sm text-muted">{question.help}</p>}

              <div className="mt-5 grid gap-2.5">
                {question.options.map((o, i) => {
                  const checked = answers[question.id] === o.id;
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                        'has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-brand/20',
                        checked ? 'border-brand bg-brand-soft' : 'border-line hover:border-line-strong hover:bg-surface-2',
                      )}
                    >
                      <input
                        id={`${question.id}-${o.id}`}
                        type="radio"
                        name={question.id}
                        value={o.id}
                        checked={checked}
                        onChange={() => pick(o.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          'num flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold',
                          checked ? 'border-brand bg-brand text-brand-fg' : 'border-line bg-surface text-muted',
                        )}
                      >
                        {checked ? <CheckIcon className="h-4 w-4" /> : i + 1}
                      </span>
                      <span className={cn('min-w-0 flex-1 text-sm leading-snug', checked ? 'font-semibold text-fg' : 'font-medium text-fg')}>{o.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <section className="animate-enter" aria-labelledby="advisor-summary-title">
              <h2 id="advisor-summary-title" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-fg outline-none sm:text-xl">
                Cevaplarını kontrol et
              </h2>
              <p className="mt-1.5 text-sm text-muted">
                {answeredCount} / {total} soru cevaplandı. Değiştirmek istediğin bir cevap varsa düzenleyebilirsin.
              </p>
              <ol className="mt-5 divide-y divide-line rounded-xl border border-line">
                {questions.map((q, i) => {
                  const opt = q.options.find((o) => o.id === answers[q.id]);
                  return (
                    <li key={q.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="num mt-0.5 w-5 shrink-0 text-xs font-semibold text-subtle">{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted">{q.text}</p>
                        <p className={cn('mt-0.5 text-sm font-medium', opt ? 'text-fg' : 'text-down')}>{opt?.label ?? 'Cevaplanmadı'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep(i)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft"
                        aria-label={`${i + 1}. soruyu değiştir`}
                      >
                        <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        Değiştir
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-8">
          <Button variant="ghost" onClick={goBack} disabled={submitting} icon={<ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />}>
            {step === 0 ? 'Vazgeç' : 'Geri'}
          </Button>
          <p className="hidden text-xs text-subtle md:block" aria-hidden="true">
            <kbd className="font-sans">1–{Math.min(9, Math.max(...questions.map((q) => q.options.length)))}</kbd> seç · <kbd className="font-sans">←</kbd>{' '}
            <kbd className="font-sans">→</kbd> gezin
          </p>
          {isSummary ? (
            <Button onClick={() => void submit()} loading={submitting} icon={<CheckIcon className="h-4 w-4" aria-hidden="true" />}>
              Profilimi hesapla
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!answered} aria-keyshortcuts="ArrowRight">
              {step === total - 1 ? 'Özete geç' : 'İleri'}
              <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
