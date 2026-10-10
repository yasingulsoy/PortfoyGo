import { useSyncExternalStore } from 'react';

// lightweight-charts tuval (canvas) üzerine çizer; CSS değişkenlerini kendisi çözemez.
// Renkler çalışma anında tasarım token'larından okunur (ham hex yazılmaz).

/** :root üzerindeki bir CSS değişkeninin güncel (temaya göre) değeri. */
export function cssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** #rgb / #rrggbb / rgb(...) → rgba(r, g, b, a). Tanınmayan biçimler olduğu gibi döner. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(color);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  return color;
}

export function chartFont(): string {
  if (typeof document === 'undefined') return 'ui-sans-serif, system-ui, sans-serif';
  return getComputedStyle(document.body).fontFamily || 'ui-sans-serif, system-ui, sans-serif';
}

function subscribeTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  return () => obs.disconnect();
}

/** <html data-theme> değeri; değiştiğinde CSS değişkenleri zaten günceldir. */
export function useDocumentTheme(): string {
  return useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.getAttribute('data-theme') ?? 'light',
    () => 'light',
  );
}
