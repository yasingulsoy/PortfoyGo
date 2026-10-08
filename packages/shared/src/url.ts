/** Yönlendirme parametresini yalnızca site içi göreli yollarla sınırlar (open-redirect / javascript: XSS önlemi). */
export function safeRedirect(target: string | null | undefined, fallback = '/') {
  if (!target) return fallback;
  if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback;
  return target;
}
