import { CheckIcon } from '@heroicons/react/16/solid';
import { cn } from '@/lib/format';
import { passwordChecks } from './authUtils';

const LEVELS = [
  { label: 'Çok zayıf', text: 'text-down', bar: 'bg-down' },
  { label: 'Zayıf', text: 'text-down', bar: 'bg-down' },
  { label: 'Orta', text: 'text-gold', bar: 'bg-gold' },
  { label: 'İyi', text: 'text-gold', bar: 'bg-gold' },
  { label: 'Güçlü', text: 'text-up', bar: 'bg-up' },
];

/** Şifre gücü göstergesi: uzunluk, harf, rakam ve sembol kontrolleri. */
export default function PasswordStrength({ value, id }: { value: string; id?: string }) {
  const checks = passwordChecks(value);
  const passed = checks.filter((c) => c.ok).length;
  // Uzunluk şartı karşılanmadan şifre "zayıf"ın üstüne çıkamaz
  const score = checks[0].ok ? passed : Math.min(passed, 1);
  const level = LEVELS[score];

  return (
    <div id={id} className="mt-2.5">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
          {checks.map((c, i) => (
            <span key={c.key} className={cn('h-1 rounded-full transition-colors', value && i < score ? level.bar : 'bg-surface-3')} />
          ))}
        </div>
        <span className={cn('w-16 text-right text-[11px] font-medium', value ? level.text : 'text-subtle')}>
          {value ? level.label : 'Şifre gücü'}
        </span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {checks.map((c) => (
          <li key={c.key} className={cn('flex items-center gap-1 transition-colors', c.ok ? 'text-up' : 'text-subtle')}>
            <CheckIcon className={cn('h-3 w-3', !c.ok && 'opacity-40')} aria-hidden="true" />
            {c.label}
            <span className="sr-only">{c.ok ? ' (karşılandı)' : ' (karşılanmadı)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
