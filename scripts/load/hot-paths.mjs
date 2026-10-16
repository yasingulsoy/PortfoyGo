#!/usr/bin/env node
// PortfoyGo — sıcak okuma yolları yük testi (autocannon). Ayrıntılar: scripts/load/README.md
//
//   node scripts/load/hot-paths.mjs                 # varsayılan: 50 bağlantı × 30 sn, http://127.0.0.1:5101
//   LOAD_BASE_URL=http://127.0.0.1:5001 LOAD_CONNECTIONS=20 LOAD_DURATION=15 node scripts/load/hot-paths.mjs
//
// Akış: (1) dev-login ile yerel kullanıcıların oturum çerezleri alınır (yalnızca yerel DB'de açık uç),
// (2) LOAD_SSE adet bildirim akışı (SSE) açılıp test boyunca açık tutulur (bağlanma süresi ölçülür),
// (3) ağırlıklı karışımla autocannon koşulur (her istek rastgele kullanıcı + rastgele X-Forwarded-For —
//     API TRUST_PROXY=1 iken her "istemci" kendi IP sınırına sahip olur), (4) uç başına istemci tarafı gecikme
//     ve (METRICS_TOKEN verilirse) sunucu tarafı Prometheus histogramı farkı yazdırılır.
//
// UYARI: Yalnızca yerel / hazırlık (staging) ortamında çalıştırın. Canlı ortamda dev-login kapalıdır.

import autocannon from 'autocannon';
import http from 'node:http';
import https from 'node:https';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const BASE = (process.env.LOAD_BASE_URL || 'http://127.0.0.1:5101').replace(/\/$/, '');
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS || 50);
const DURATION = Number(process.env.LOAD_DURATION || 30);
const WARMUP = Number(process.env.LOAD_WARMUP || 5);
const SSE = Number(process.env.LOAD_SSE || 20);
const USERS = (process.env.LOAD_USERS || 'mert_kripto,aylin_trader,zeynep_uzun,can_hisse,demo').split(',').map((s) => s.trim()).filter(Boolean);
const ORIGIN = process.env.LOAD_ORIGIN || 'http://localhost:3000';
const METRICS_TOKEN = process.env.LOAD_METRICS_TOKEN || '';
const OUT = process.env.LOAD_OUT || '';
const SPOOF_IP = process.env.LOAD_SPOOF_IP !== '0';

/**
 * Oturum açmış bir kullanıcının uygulamada gezinirken ürettiği okuma karışımı (ağırlık = yüzde).
 * Kaynak: frontend SWR anahtarları ve yoklama aralıkları (piyasa listesi 15 sn, oyun profili, rozetler …).
 */
const MIX = [
  { name: 'auth profile', path: '/api/auth/profile', weight: 10 },
  { name: 'markets: stocks', path: '/api/stocks', weight: 12 },
  { name: 'markets: cryptos', path: '/api/cryptos?limit=25', weight: 12 },
  { name: 'portfolio', path: '/api/portfolio', weight: 14 },
  { name: 'leaderboard alltime', path: '/api/leaderboard?limit=10&board=alltime', weight: 6 },
  { name: 'leaderboard week', path: '/api/leaderboard?limit=10&board=week', weight: 4 },
  { name: 'notifications unread', path: '/api/notifications/unread-count', weight: 10 },
  { name: 'arena active round', path: '/api/arena/rounds/active', weight: 8 },
  { name: 'picks current', path: '/api/picks/current', weight: 8 },
  { name: 'game profile', path: '/api/game/profile', weight: 10 },
  { name: 'market session', path: '/api/market/session', weight: 6 },
];
const TOTAL_WEIGHT = MIX.reduce((s, m) => s + m.weight, 0);

function pick() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const m of MIX) {
    r -= m.weight;
    if (r < 0) return m;
  }
  return MIX[MIX.length - 1];
}

const randomIp = () => `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${1 + ((Math.random() * 253) | 0)}`;

function request(method, path, { headers = {}, body } = {}) {
  const url = new URL(BASE + path);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login(username) {
  const res = await request('POST', '/api/auth/dev-login', {
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ username }),
  });
  if (res.status !== 200) throw new Error(`dev-login ${username} → ${res.status} ${res.body.slice(0, 120)}`);
  const cookies = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]);
  if (!cookies.length) throw new Error(`dev-login ${username}: çerez yok`);
  return cookies.join('; ');
}

/** SSE bağlantısı açar; ilk bayt süresini ölçer ve test sonuna kadar açık tutar. */
function openSse(cookie) {
  const url = new URL(`${BASE}/api/notifications/stream`);
  const lib = url.protocol === 'https:' ? https : http;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const req = lib.get(url, { headers: { Cookie: cookie, Accept: 'text/event-stream', Origin: ORIGIN } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve({ status: res.statusCode, ms: performance.now() - t0, close: () => undefined });
        return;
      }
      res.once('data', () => resolve({ status: 200, ms: performance.now() - t0, close: () => req.destroy() }));
      res.on('error', () => undefined);
    });
    req.on('error', (err) => resolve({ status: 0, ms: performance.now() - t0, error: err.message, close: () => undefined }));
  });
}

async function scrapeMetrics() {
  if (!METRICS_TOKEN) return null;
  const res = await request('GET', '/metrics', { headers: { Authorization: `Bearer ${METRICS_TOKEN}` } });
  if (res.status !== 200) return null;
  const series = new Map();
  for (const line of res.body.split('\n')) {
    const m = /^portfoygo_http_request_duration_seconds_(bucket|sum|count)\{([^}]*)\} ([0-9.e+-]+)$/.exec(line);
    if (!m) continue;
    const labels = Object.fromEntries([...m[2].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    const key = `${labels.method} ${labels.route}`;
    const s = series.get(key) || { buckets: new Map(), sum: 0, count: 0 };
    if (m[1] === 'bucket') s.buckets.set(labels.le, (s.buckets.get(labels.le) || 0) + Number(m[3]));
    else if (m[1] === 'sum') s.sum += Number(m[3]);
    else s.count += Number(m[3]);
    series.set(key, s);
  }
  return series;
}

/** Sunucu tarafı: iki kazıma arasındaki fark → uç başına sayı, ortalama, p95 (kova üst sınırı) */
function diffMetrics(before, after) {
  if (!before || !after) return [];
  const rows = [];
  for (const [key, a] of after) {
    const b = before.get(key) || { buckets: new Map(), sum: 0, count: 0 };
    const count = a.count - b.count;
    if (count <= 0) continue;
    const mean = ((a.sum - b.sum) / count) * 1000;
    const les = [...a.buckets.keys()].filter((le) => le !== '+Inf').map(Number).sort((x, y) => x - y);
    let p95 = Infinity;
    for (const le of les) {
      const c = (a.buckets.get(String(le)) || 0) - (b.buckets.get(String(le)) || 0);
      if (c >= 0.95 * count) {
        p95 = le * 1000;
        break;
      }
    }
    rows.push({ route: key, count, mean_ms: +mean.toFixed(1), p95_le_ms: p95 });
  }
  return rows.sort((x, y) => y.mean_ms * y.count - x.mean_ms * x.count);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function runCannon(cookies, seconds, perPath) {
  const instance = autocannon({
    url: BASE,
    connections: CONNECTIONS,
    duration: seconds,
    timeout: 20,
    requests: [
      {
        setupRequest(req, context) {
          const m = pick();
          context.name = m.name;
          context.t0 = performance.now();
          const headers = { ...req.headers, Cookie: cookies[(Math.random() * cookies.length) | 0], Accept: 'application/json' };
          if (SPOOF_IP) headers['X-Forwarded-For'] = randomIp();
          return { ...req, method: 'GET', path: m.path, headers };
        },
        onResponse(status, _body, context) {
          if (!perPath) return;
          const row = perPath.get(context.name) || { lat: [], codes: {} };
          row.lat.push(performance.now() - context.t0);
          row.codes[status] = (row.codes[status] || 0) + 1;
          perPath.set(context.name, row);
        },
      },
    ],
  });
  return instance;
}

async function main() {
  console.log(`[load] hedef ${BASE} · ${CONNECTIONS} bağlantı × ${DURATION} sn (+${WARMUP} sn ısınma) · SSE ${SSE} · kullanıcılar: ${USERS.join(', ')}`);
  const health = await request('GET', '/readyz').catch((e) => ({ status: 0, body: e.message }));
  if (health.status !== 200) throw new Error(`API hazır değil (${BASE}/readyz → ${health.status})`);

  const cookies = [];
  for (const u of USERS) cookies.push(await login(u));

  if (WARMUP > 0) await runCannon(cookies, WARMUP, null);

  // SSE: kullanıcı başına en fazla 5 akış (MAX_STREAMS_PER_USER); test boyunca açık
  const sse = [];
  for (let i = 0; i < SSE; i++) sse.push(openSse(cookies[i % cookies.length]));
  const sseResults = await Promise.all(sse);

  const before = await scrapeMetrics();
  const perPath = new Map();
  const result = await runCannon(cookies, DURATION, perPath);
  const after = await scrapeMetrics();

  // SSE bağlanma süresi yük altında (yeni bağlantılar)
  const sseUnderLoad = await Promise.all(cookies.slice(0, 3).map((c) => openSse(c)));
  for (const s of [...sseResults, ...sseUnderLoad]) s.close();

  const sseOk = sseResults.filter((s) => s.status === 200).map((s) => s.ms).sort((a, b) => a - b);
  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    connections: CONNECTIONS,
    duration_s: DURATION,
    requests_total: result.requests.total,
    rps_avg: result.requests.average,
    latency_ms: { p50: result.latency.p50, p90: result.latency.p90, p99: result.latency.p99, max: result.latency.max, mean: result.latency.mean },
    non2xx: result.non2xx,
    errors: result.errors,
    timeouts: result.timeouts,
    status_codes: result.statusCodeStats,
    sse: {
      opened: sseOk.length,
      rejected: sseResults.filter((s) => s.status !== 200).map((s) => s.status),
      connect_ms_p50: +percentile(sseOk, 50).toFixed(1),
      connect_ms_max: +(sseOk.at(-1) ?? 0).toFixed(1),
      connect_under_load_ms: sseUnderLoad.map((s) => `${s.status}:${s.ms.toFixed(0)}`),
    },
    per_endpoint_client: [...perPath.entries()]
      .map(([name, r]) => {
        const lat = r.lat.sort((a, b) => a - b);
        return {
          endpoint: name,
          count: lat.length,
          p50_ms: +percentile(lat, 50).toFixed(1),
          p95_ms: +percentile(lat, 95).toFixed(1),
          p99_ms: +percentile(lat, 99).toFixed(1),
          codes: r.codes,
        };
      })
      .sort((a, b) => b.p95_ms - a.p95_ms),
    per_route_server: diffMetrics(before, after),
  };

  console.log(`\n[load] ${summary.requests_total} istek · ${summary.rps_avg} istek/sn · gecikme p50 ${summary.latency_ms.p50} ms, p90 ${summary.latency_ms.p90} ms, p99 ${summary.latency_ms.p99} ms, max ${summary.latency_ms.max} ms`);
  console.log(`[load] 2xx dışı: ${summary.non2xx} · hata: ${summary.errors} · zaman aşımı: ${summary.timeouts} · durum kodları: ${JSON.stringify(summary.status_codes)}`);
  console.log(`[load] SSE: ${summary.sse.opened}/${SSE} açık (reddedilen: ${summary.sse.rejected.join(',') || '-'}) · bağlanma p50 ${summary.sse.connect_ms_p50} ms, max ${summary.sse.connect_ms_max} ms · yük altında: ${summary.sse.connect_under_load_ms.join(' ')}`);
  console.log('\n[load] uç başına (istemci tarafı):');
  console.table(summary.per_endpoint_client.map((r) => ({ ...r, codes: JSON.stringify(r.codes) })));
  if (summary.per_route_server.length) {
    console.log('[load] uç başına (sunucu, Prometheus farkı; toplam süreye göre sıralı):');
    console.table(summary.per_route_server);
  }
  if (OUT) {
    writeFileSync(OUT, JSON.stringify(summary, null, 2));
    console.log(`[load] sonuç: ${OUT}`);
  }
}

main().catch((err) => {
  console.error(`[load] HATA: ${err?.message || err}`);
  process.exit(1);
});
