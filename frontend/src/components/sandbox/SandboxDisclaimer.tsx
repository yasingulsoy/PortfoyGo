import { ShieldExclamationIcon } from '@heroicons/react/20/solid';
import { cn } from '@portfoygo/shared/format';
import { SANDBOX_DISCLAIMER } from './model';

/** "Varsayımsal model portföy · sanal para · yatırım tavsiyesi değildir" notu (metin değiştirilebilir). */
export default function SandboxDisclaimer({ text = SANDBOX_DISCLAIMER, className }: { text?: string; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs leading-relaxed text-subtle', className)}>
      <ShieldExclamationIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
