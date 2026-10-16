'use client';

import { useState } from 'react';
import { ArrowDownTrayIcon, CheckIcon, ClipboardDocumentIcon } from '@heroicons/react/20/solid';
import Button from '@portfoygo/shared/ui/Button';

/** Kurtarma kodlarını .txt olarak indirir (yalnızca tarayıcıda; sunucuya gönderilmez). */
export function downloadRecoveryCodes(codes: string[], username: string) {
  const text = [
    'PortfoyGo — iki adımlı doğrulama kurtarma kodları',
    `Hesap: ${username}`,
    `Oluşturulma: ${new Date().toLocaleString('tr-TR')}`,
    '',
    'Telefonuna erişemezsen girişte bu kodlardan birini kullan. Her kod yalnızca bir kez geçerlidir.',
    'Bu dosyayı güvenli bir yerde sakla (ör. parola yöneticisi); kimseyle paylaşma.',
    '',
    ...codes,
    '',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `portfoygo-kurtarma-kodlari-${username}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bir kez gösterilen kurtarma kodları: ızgara + indir / kopyala. */
export default function RecoveryCodes({ codes, username }: { codes: string[]; username: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface-2 p-3" aria-label="Kurtarma kodları">
        {codes.map((c) => (
          <li key={c} className="num rounded-lg bg-surface px-2 py-1.5 text-center text-sm font-medium tracking-wider text-fg">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto sm:flex-1"
          icon={<ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />}
          onClick={() => downloadRecoveryCodes(codes, username)}
        >
          İndir (.txt)
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto sm:flex-1"
          icon={copied ? <CheckIcon className="h-4 w-4 text-up" aria-hidden="true" /> : <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />}
          onClick={() => void copy()}
        >
          {copied ? 'Kopyalandı' : 'Kopyala'}
        </Button>
      </div>
    </div>
  );
}
