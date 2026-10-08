'use client';

import { useEffect } from 'react';
import { ArrowPathIcon, HomeIcon } from '@heroicons/react/20/solid';
import Button, { LinkButton } from '@portfoygo/shared/ui/Button';
import { Card } from '@portfoygo/shared/ui/Card';
import { Alert } from '@portfoygo/shared/ui/Feedback';

/** Rota düzeyinde beklenmeyen hatalar için yakalayıcı. */
export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-10">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-fg">Bir şeyler ters gitti</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Bu sayfa yüklenirken beklenmeyen bir hata oluştu. Portföyün ve bakiyen güvende; tekrar denemek çoğu zaman sorunu çözer.
        </p>
        <Alert tone="error" className="mt-5">
          <span className="break-words">{error.message || 'Bilinmeyen hata'}</span>
          {error.digest && <span className="mt-1 block font-mono text-[11px] opacity-80">Kod: {error.digest}</span>}
        </Alert>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => retry()} icon={<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />} className="sm:flex-1">
            Tekrar dene
          </Button>
          <LinkButton href="/" variant="secondary" icon={<HomeIcon className="h-4 w-4" aria-hidden="true" />} className="sm:flex-1">
            Ana sayfa
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}
