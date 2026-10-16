import express, { type Request, type RequestHandler, type Response } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrikleri (prom-client). Her süreç (API örneği, worker) kendi metriklerini tutar; Prometheus her
 * örneği ayrı kazır (`GET /metrics`, METRICS_TOKEN ile; bkz. routes/metrics.ts).
 *
 *   portfoygo_http_request_duration_seconds{method,route,status_code}  istek süresi (route = Express şablonu,
 *                                                                        ör. /api/arena/rounds/:id; eşleşmeyen → "unmatched").
 *                                                                        SSE akışları hariç (bkz. sse gauge).
 *   portfoygo_job_duration_seconds{job,status}       iş süresi (ok | error)
 *   portfoygo_job_runs_total{job,status}             iş çalışmaları (ok | error)
 *   portfoygo_job_skips_total{job,reason}            atlanan turlar (locked: başka örnek çalıştırıyor, running: önceki tur sürüyor)
 *   portfoygo_job_last_success_timestamp_seconds{job}
 *   portfoygo_sse_connections{stream}                açık SSE bağlantıları (notifications | arena | broadcast)
 *   portfoygo_provider_calls_total{kind,provider,method,outcome}  dış veri sağlayıcı çağrıları (ok | error)
 *   portfoygo_bus_messages_total{bus,direction}      Redis olay dağıtımı (out | in | dropped)
 *   portfoygo_client_errors_total{app}               tarayıcıdan bildirilen hatalar
 *   + süreç metrikleri (portfoygo_process_*, portfoygo_nodejs_*: CPU, bellek, event loop gecikmesi)
 */

export const metricsRegistry = new Registry();

export const httpDuration = new Histogram({
  name: 'portfoygo_http_request_duration_seconds',
  help: 'HTTP istek süresi (saniye), Express rota şablonu ve durum koduna göre',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const jobDuration = new Histogram({
  name: 'portfoygo_job_duration_seconds',
  help: 'Zamanlanmış iş süresi (saniye)',
  labelNames: ['job', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry],
});

export const jobRuns = new Counter({
  name: 'portfoygo_job_runs_total',
  help: 'Zamanlanmış iş çalışmaları (status: ok | error)',
  labelNames: ['job', 'status'] as const,
  registers: [metricsRegistry],
});

export const jobSkips = new Counter({
  name: 'portfoygo_job_skips_total',
  help: 'Atlanan iş turları (reason: locked = başka örnekte çalışıyor, running = önceki tur sürüyor)',
  labelNames: ['job', 'reason'] as const,
  registers: [metricsRegistry],
});

export const jobLastSuccess = new Gauge({
  name: 'portfoygo_job_last_success_timestamp_seconds',
  help: 'İşin bu süreçte son başarılı bitiş zamanı (unix saniye)',
  labelNames: ['job'] as const,
  registers: [metricsRegistry],
});

export const sseConnections = new Gauge({
  name: 'portfoygo_sse_connections',
  help: 'Açık Server-Sent Events bağlantıları',
  labelNames: ['stream'] as const,
  registers: [metricsRegistry],
});

export const providerCalls = new Counter({
  name: 'portfoygo_provider_calls_total',
  help: 'Dış veri sağlayıcı çağrıları (outcome: ok | error)',
  labelNames: ['kind', 'provider', 'method', 'outcome'] as const,
  registers: [metricsRegistry],
});

export const busMessages = new Counter({
  name: 'portfoygo_bus_messages_total',
  help: 'Örnekler arası olay mesajları (direction: out | in | dropped)',
  labelNames: ['bus', 'direction'] as const,
  registers: [metricsRegistry],
});

export const clientErrors = new Counter({
  name: 'portfoygo_client_errors_total',
  help: 'Tarayıcıdan bildirilen istemci hataları',
  labelNames: ['app'] as const,
  registers: [metricsRegistry],
});

/** METRICS_TOKEN tanımlı mı? (değilse /metrics 404 döner ve HTTP ölçümü takılmaz) */
export function metricsToken(): string | null {
  const t = process.env.METRICS_TOKEN?.trim();
  return t ? t : null;
}

let defaultsStarted = false;

/** Süreç metriklerini (CPU, bellek, event loop) bir kez başlatır. */
export function startDefaultMetrics(): void {
  if (defaultsStarted) return;
  defaultsStarted = true;
  collectDefaultMetrics({ register: metricsRegistry, prefix: 'portfoygo_' });
}

/** SSE bağlantısını sayar; dönen fonksiyon bağlantı kapanınca BİR KEZ çağrılmalı. */
export function trackSseConnection(stream: 'notifications' | 'arena' | 'broadcast'): () => void {
  sseConnections.inc({ stream });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    sseConnections.dec({ stream });
  };
}

// ---------------------------------------------------------------------------
// HTTP süre histogramı
// ---------------------------------------------------------------------------

const ROUTE_LABEL = Symbol.for('portfoygo.routeLabel');
type LabeledRequest = Request & { [ROUTE_LABEL]?: string };

let routeHookInstalled = false;

type LayerHandle = (this: { route?: { path?: unknown } }, req: LabeledRequest, res: Response, next: unknown) => unknown;

/**
 * Rota şablonunu (baseUrl + route.path) eşleşme ANINDA yakalar. Hata yolunda (next(err)) Express, uygulama
 * düzeyine dönerken req.baseUrl'i sıfırladığı için 'finish' anında hesaplamak yanlış önek verir.
 * Express 4 iç `Layer.prototype.handle_request`'i bir kez sarar (davranış değişmez; yalnızca req'e etiket yazar).
 * Prototip metodu çağrı anında arandığı için, rotalar bu çağrıdan önce tanımlanmış olsa da çalışır.
 * (Route.prototype.dispatch kullanılamaz: Express onu rota oluşturulurken bind eder.)
 */
export function installRouteLabelHook(): void {
  if (routeHookInstalled) return;
  routeHookInstalled = true;
  const probe = express.Router();
  probe.get('/', (_req, _res) => undefined);
  const Layer = (probe.stack[0] as unknown as { constructor?: { prototype?: { handle_request?: LayerHandle } } } | undefined)
    ?.constructor;
  const proto = Layer?.prototype;
  const original = proto?.handle_request;
  if (!proto || typeof original !== 'function') return;
  proto.handle_request = function handle_request(this: { route?: { path?: unknown } }, req: LabeledRequest, res: Response, next: unknown) {
    const route = this.route;
    if (route && route.path !== undefined) {
      const p = typeof route.path === 'string' ? route.path : String(route.path);
      req[ROUTE_LABEL] = `${req.baseUrl || ''}${p}` || '/';
    }
    return original.call(this, req, res, next);
  };
}

export function routeLabelOf(req: Request): string {
  const labeled = (req as LabeledRequest)[ROUTE_LABEL];
  if (labeled) return labeled;
  const route = (req as Request & { route?: { path?: unknown } }).route;
  if (route?.path !== undefined) return `${req.baseUrl || ''}${String(route.path)}` || '/';
  return 'unmatched';
}

function isEventStream(res: Response): boolean {
  const ct = res.getHeader('content-type');
  return typeof ct === 'string' && ct.startsWith('text/event-stream');
}

/** İstek süresi histogramı (app.ts, METRICS_TOKEN tanımlıyken en başta takılır). */
export function httpMetricsMiddleware(): RequestHandler {
  installRouteLabelHook();
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.once('finish', () => {
      if (isEventStream(res)) return;
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      httpDuration.observe({ method: req.method, route: routeLabelOf(req), status_code: String(res.statusCode) }, seconds);
    });
    next();
  };
}
