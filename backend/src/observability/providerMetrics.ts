import { providerCalls } from './metrics';

/**
 * Dış veri sağlayıcı adaptörünü (providers/adapters/*) davranışını değiştirmeden sarar: Promise döndüren her
 * metot çağrısı portfoygo_provider_calls_total{kind,provider,method,outcome} sayacına yazılır (ok | error).
 * Senkron metotlar (isConfigured, getTrackedSymbols …) sayılmaz. Not: hatayı kendi içinde yutup boş sonuç
 * dönen sağlayıcı metotları "ok" sayılır (servis iç yapısı değiştirilmez).
 */
export function instrumentProvider<T extends { readonly id: string }>(kind: string, provider: T): T {
  // Sarmalayıcılar metot başına önbelleklenir; metot değişirse (ör. testte vi.spyOn) yeniden sarılır
  const cache = new Map<string, { fn: unknown; wrapped: unknown }>();
  return new Proxy(provider, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      const hit = cache.get(prop);
      if (hit && hit.fn === value) return hit.wrapped;
      const fn = value as (...args: unknown[]) => unknown;
      const labels = (outcome: 'ok' | 'error') => ({ kind, provider: target.id, method: prop, outcome });
      const wrapped = (...args: unknown[]) => {
        let result: unknown;
        try {
          result = fn.apply(target, args);
        } catch (err) {
          providerCalls.inc(labels('error'));
          throw err;
        }
        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
          return Promise.resolve(result).then(
            (v) => {
              providerCalls.inc(labels('ok'));
              return v;
            },
            (err: unknown) => {
              providerCalls.inc(labels('error'));
              throw err;
            }
          );
        }
        return result;
      };
      cache.set(prop, { fn: value, wrapped });
      return wrapped;
    },
  });
}
