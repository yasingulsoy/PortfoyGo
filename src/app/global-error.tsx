'use client';

import './globals.css';

/** Tema sağlayıcısı burada çalışmaz: kayıtlı tercih, yoksa işletim sistemi şeması kullanılır. */
function detectTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Kök düzen dahil her şey çöktüğünde gösterilir; kendi <html>/<body> etiketlerini çizer. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="tr" data-theme={detectTheme()} suppressHydrationWarning>
      <body className="flex min-h-dvh items-center justify-center bg-canvas p-6 font-sans text-fg antialiased">
        <title>Hata · PortfoyGo</title>
        <main className="w-full max-w-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">PortfoyGo</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Uygulama yüklenemedi</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Beklenmeyen bir hata oluştu. Sayfayı yeniden denemek çoğu zaman sorunu çözer.
          </p>
          {error.digest && <p className="mt-3 font-mono text-[11px] text-subtle">Kod: {error.digest}</p>}
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand-hover"
            >
              Tekrar dene
            </button>
            {/* Kök düzen çöktüğünde istemci yönlendiricisine güvenilmez; tam sayfa yükleme yapılır */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="inline-flex h-10 items-center rounded-lg border border-line bg-surface-2 px-4 text-sm font-medium hover:bg-surface-3">
              Ana sayfa
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
