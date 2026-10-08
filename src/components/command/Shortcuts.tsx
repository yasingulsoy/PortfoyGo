'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import { SHORTCUTS_HELP_EVENT, anotherDialogOpen, isTypingTarget } from './events';

/** "g" ardından basılan tuşa göre gidilecek sayfa. */
const GO_TO: Record<string, { href: string; label: string }> = {
  m: { href: '/', label: 'Piyasalar' },
  p: { href: '/portfolio', label: 'Portföy' },
  i: { href: '/transactions', label: 'İşlemler' },
  l: { href: '/leaderboard', label: 'Liderlik' },
  h: { href: '/news', label: 'Haberler' },
  o: { href: '/profile', label: 'Profil' },
};

const SEQUENCE_TIMEOUT = 1200;

const GENERAL: { keys: string[][]; label: string }[] = [
  { keys: [['Ctrl/⌘', 'K'], ['/']], label: 'Arama ve komut paleti' },
  { keys: [['?']], label: 'Bu pencereyi aç' },
  { keys: [['Esc']], label: 'Açık pencereyi kapat' },
];

/**
 * Klavye kısayolları: "?" yardım penceresini açar, "g" + harf ile sayfalar arasında gezinilir.
 * Yazı alanlarında ve başka bir modal açıkken devre dışıdır.
 */
export default function Shortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pendingG = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTypingTarget(e.target) || anotherDialogOpen()) return;

      if (e.key === '?') {
        e.preventDefault();
        pendingG.current = 0;
        setOpen(true);
        return;
      }

      const key = e.key.toLocaleLowerCase('tr') === 'ı' ? 'i' : e.key.toLowerCase();
      if (pendingG.current && Date.now() - pendingG.current < SEQUENCE_TIMEOUT) {
        pendingG.current = 0;
        const target = GO_TO[key];
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (key === 'g' && !e.shiftKey) pendingG.current = Date.now();
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SHORTCUTS_HELP_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SHORTCUTS_HELP_EVENT, onOpen);
    };
  }, [router]);

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Klavye kısayolları" description="Fareye uzanmadan gezin." size="sm">
      <section aria-labelledby="sc-general">
        <h3 id="sc-general" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Genel</h3>
        <dl className="mt-2 divide-y divide-line">
          {GENERAL.map((row) => (
            <ShortcutRow key={row.label} label={row.label} combos={row.keys} />
          ))}
        </dl>
      </section>
      <section aria-labelledby="sc-nav" className="mt-5">
        <h3 id="sc-nav" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Gezinme</h3>
        <dl className="mt-2 divide-y divide-line">
          {Object.entries(GO_TO).map(([k, { label }]) => (
            <ShortcutRow key={k} label={label} combos={[['G', k.toUpperCase()]]} sequence />
          ))}
        </dl>
      </section>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Komut paletinde bir varlık seçiliyken <Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> ile doğrudan alım penceresini açabilirsin.
      </p>
    </Modal>
  );
}

function ShortcutRow({ label, combos, sequence }: { label: string; combos: string[][]; sequence?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-sm text-fg">{label}</dt>
      <dd className="flex shrink-0 items-center gap-1.5 text-[11px] text-subtle">
        {combos.map((combo, i) => (
          <span key={combo.join('+')} className="inline-flex items-center gap-1">
            {i > 0 && <span className="px-0.5">veya</span>}
            {combo.map((k, j) => (
              <span key={k} className="inline-flex items-center gap-1">
                {j > 0 && <span aria-hidden="true">{sequence ? 'sonra' : '+'}</span>}
                <Kbd>{k}</Kbd>
              </span>
            ))}
          </span>
        ))}
      </dd>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-line border-b-2 bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-fg">
      {children}
    </kbd>
  );
}
