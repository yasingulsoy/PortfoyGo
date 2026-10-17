// İzin listesi (allowlist) tabanlı SVG temizleyici + küçültücü.
//
// Dış kaynaklardan gelen her SVG buradan geçer: dosya bir ağaç olarak ayrıştırılır ve yalnızca bilinen,
// pasif SVG öğeleri / öznitelikleri yeniden yazılır. Böylece <script>, <foreignObject>, <style>, olay
// işleyicileri (on*), dış bağlantılar (href / url() / data: / javascript:) ve bilinmeyen her şey düşer.
// Kaynaktaki metin içerikleri (<title>, <desc>) da atılır. Çıktıda her zaman bir viewBox bulunur.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Çocuklarıyla birlikte korunur. Listede olmayan öğeler içerikleriyle birlikte atılır. */
const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'use', 'symbol', 'pattern', 'marker',
  // Pasif filtre ilkelleri (gölge, renk matrisi). feImage (dış görsel yükleyebilir) bilinçli olarak YOK.
  'filter', 'feColorMatrix', 'feOffset', 'feGaussianBlur', 'feComposite', 'feMerge', 'feMergeNode', 'feFlood', 'feBlend',
]);

/** Sessizce atılan (beklenen) öğeler; diğer atılanlar raporlanır. */
const SILENT_DROP = new Set(['title', 'desc', 'metadata']);
/** Yalnızca metin düzenini etkileyen, sessizce atılan öznitelikler. */
const SILENT_DROP_ATTRS = new Set(['xml:space', 'version', 'class', 'data-name']);

const ALLOWED_ATTRS = new Set([
  'id', 'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr',
  'width', 'height', 'viewBox', 'preserveAspectRatio', 'transform', 'gradientTransform', 'gradientUnits',
  'patternUnits', 'patternContentUnits', 'patternTransform', 'spreadMethod', 'offset',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity',
  'clip-path', 'clip-rule', 'mask', 'maskUnits', 'maskContentUnits', 'clipPathUnits',
  'stop-color', 'stop-opacity', 'color', 'href', 'style', 'display', 'visibility', 'overflow',
  'shape-rendering', 'vector-effect', 'paint-order',
  'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'orient',
  'filter', 'filterUnits', 'primitiveUnits', 'color-interpolation-filters', 'in', 'in2', 'result', 'values', 'type',
  'stdDeviation', 'dx', 'dy', 'operator', 'k1', 'k2', 'k3', 'k4', 'mode', 'flood-color', 'flood-opacity',
]);

/** style="" içinde izin verilen CSS özellikleri (sunum öznitelikleriyle aynı küme). */
const ALLOWED_STYLE_PROPS = new Set([
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity',
  'clip-rule', 'stop-color', 'stop-opacity', 'color', 'display', 'visibility',
]);

const DANGEROUS_VALUE = /javascript:|data:|vbscript:|expression\s*\(|@import|<|>/i;

/** url(#id) dışındaki her url(...) referansı reddedilir. */
function urlsAreLocal(value) {
  const urls = value.match(/url\s*\(([^)]*)\)/gi) ?? [];
  return urls.every((u) => /^url\s*\(\s*['"]?#[A-Za-z_][\w.:-]*['"]?\s*\)$/i.test(u));
}

// ---------------------------------------------------------------------------
// Ayrıştırıcı (yalnızca SVG için yeterli olan basit bir XML okuyucu)
// ---------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });

export function parseSvg(text) {
  const root = { name: '#root', attrs: [], children: [] };
  const stack = [root];
  let i = 0;
  const src = text.replace(/^﻿/, '');
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) break;
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) throw new Error('Kapanmamış yorum');
      i = end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt);
      if (end === -1) throw new Error('Kapanmamış CDATA');
      i = end + 3; // CDATA içeriği (yalnızca <style>/<script> içinde olur) atılır
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt);
      if (end === -1) throw new Error('Kapanmamış işlem talimatı');
      i = end + 2;
      continue;
    }
    if (src.startsWith('<!', lt)) {
      // DOCTYPE (iç alt küme dahil) — varlık tanımları desteklenmez, tamamen atlanır
      let depth = 0;
      let j = lt + 2;
      for (; j < src.length; j++) {
        if (src[j] === '[') depth++;
        else if (src[j] === ']') depth--;
        else if (src[j] === '>' && depth <= 0) break;
      }
      i = j + 1;
      continue;
    }
    if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      const name = src.slice(lt + 2, end).trim();
      const top = stack.pop();
      if (!top || top.name !== name) throw new Error(`Eşleşmeyen kapanış etiketi </${name}>`);
      i = end + 1;
      continue;
    }
    // Açılış etiketi
    const tagRe = /<([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
    tagRe.lastIndex = lt;
    const m = tagRe.exec(src);
    if (!m) throw new Error(`Geçersiz etiket: ${src.slice(lt, lt + 60)}`);
    const attrs = [];
    const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = attrRe.exec(m[2]))) attrs.push([a[1], decode(a[2] ?? a[3] ?? '')]);
    const node = { name: m[1], attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!m[3]) stack.push(node);
    i = tagRe.lastIndex;
  }
  if (stack.length !== 1) throw new Error('Kapanmamış öğe');
  const svg = root.children.find((c) => c.name === 'svg');
  if (!svg) throw new Error('<svg> kök öğesi yok');
  return svg;
}

// ---------------------------------------------------------------------------
// Temizleme
// ---------------------------------------------------------------------------

const NUMBER_RE = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;
const COMMANDS = 'MmZzLlHhVvCcSsQqTtAa';

function formatNumber(raw, decimals) {
  const n = Number(Number(raw).toFixed(decimals));
  if (!Number.isFinite(n)) throw new Error(`Geçersiz sayı: ${raw}`);
  let out = Object.is(n, -0) ? '0' : String(n);
  if (out.includes('e')) out = n.toFixed(decimals).replace(/\.?0+$/, '');
  return out.replace(/^(-?)0\./, '$1.');
}

/**
 * Yol verisini (`d`) komut/argüman olarak ayrıştırır ve sayıları `decimals` basamağa yuvarlar.
 * Yay (A/a) komutlarının bayrakları (4. ve 5. argüman) tek karakterdir ve "01.5" gibi bitişik
 * yazılabilir; bunlar sayı olarak OKUNMAZ (aksi halde şekil bozulur). Ayrıştırılamayan veri olduğu gibi kalır.
 */
export function roundPathData(d, decimals) {
  const tokens = [];
  let cmd = null;
  let arg = 0;
  let i = 0;
  while (i < d.length) {
    const ch = d[i];
    if (ch === ' ' || ch === ',' || ch === '\n' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    if (COMMANDS.includes(ch)) {
      cmd = ch;
      arg = 0;
      tokens.push({ kind: 'cmd', text: ch });
      i++;
      continue;
    }
    if (!cmd) return d;
    if ((cmd === 'A' || cmd === 'a') && (arg % 7 === 3 || arg % 7 === 4)) {
      if (ch !== '0' && ch !== '1') return d;
      tokens.push({ kind: 'flag', text: ch });
      arg++;
      i++;
      continue;
    }
    NUMBER_RE.lastIndex = i;
    const m = NUMBER_RE.exec(d);
    if (!m) return d;
    tokens.push({ kind: 'num', text: formatNumber(m[0], decimals) });
    arg++;
    i = NUMBER_RE.lastIndex;
  }
  return joinTokens(tokens);
}

/** points="" (polyline / polygon) için aynı yuvarlama */
export function roundPoints(value, decimals) {
  const tokens = [];
  let i = 0;
  while (i < value.length) {
    if (/[\s,]/.test(value[i])) {
      i++;
      continue;
    }
    NUMBER_RE.lastIndex = i;
    const m = NUMBER_RE.exec(value);
    if (!m) return value;
    tokens.push({ kind: 'num', text: formatNumber(m[0], decimals) });
    i = NUMBER_RE.lastIndex;
  }
  return joinTokens(tokens);
}

/** Belirteçleri en kısa GÜVENLİ biçimde birleştirir: yalnızca '-' ve "x.y.z" ayırıcısız yazılır. */
function joinTokens(tokens) {
  let out = '';
  let prev = null;
  for (const t of tokens) {
    if (prev && prev.kind !== 'cmd' && t.kind !== 'cmd') {
      const glued = t.kind === 'num' && (t.text.startsWith('-') || (t.text.startsWith('.') && prev.kind === 'num' && prev.text.includes('.')));
      if (!glued) out += ' ';
    }
    out += t.text;
    prev = t;
  }
  return out;
}

function cleanStyle(value, report) {
  const kept = [];
  for (const decl of value.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop) || DANGEROUS_VALUE.test(val) || !urlsAreLocal(val)) {
      report.droppedAttrs.add(`style:${prop}`);
      continue;
    }
    kept.push(`${prop}:${val}`);
  }
  return kept.join(';');
}

function cleanNode(node, ctx) {
  const { report } = ctx;
  const attrs = [];
  for (let [name, value] of node.attrs) {
    if (name === 'xlink:href') name = 'href';
    if (name === 'xmlns' || name.startsWith('xmlns:')) continue; // yeniden yazılır
    if (!ALLOWED_ATTRS.has(name)) {
      if (!SILENT_DROP_ATTRS.has(name)) report.droppedAttrs.add(name);
      continue;
    }
    value = value.trim();
    if (DANGEROUS_VALUE.test(value) || !urlsAreLocal(value)) {
      report.droppedAttrs.add(`${name}(değer)`);
      continue;
    }
    if (name === 'href' && !/^#[A-Za-z_][\w.:-]*$/.test(value)) {
      report.droppedAttrs.add('href(dış)');
      continue;
    }
    if (name === 'style') {
      value = cleanStyle(value, report);
      if (!value) continue;
    }
    if (ctx.decimals != null) {
      if (name === 'd') value = roundPathData(value, ctx.decimals);
      else if (name === 'points') value = roundPoints(value, ctx.decimals);
    }
    attrs.push([name, value.replace(/\s+/g, ' ')]);
  }
  const children = [];
  for (const child of node.children) {
    if (!ALLOWED_ELEMENTS.has(child.name)) {
      if (!SILENT_DROP.has(child.name)) report.droppedElements.add(child.name);
      continue;
    }
    children.push(cleanNode(child, ctx));
  }
  return { name: node.name, attrs, children };
}

const esc = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function serialize(node) {
  const attrs = node.attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  if (node.children.length === 0) return `<${node.name}${attrs}/>`;
  return `<${node.name}${attrs}>${node.children.map(serialize).join('')}</${node.name}>`;
}

/** Ölçeğe göre yol hassasiyeti: 512'lik viewBox'ta 1, 32'likte 2 ondalık basamak yeterli. */
function decimalsFor(viewBox) {
  const parts = viewBox.split(/[\s,]+/).map(Number);
  const extent = Math.max(parts[2] || 0, parts[3] || 0);
  if (!(extent > 0)) return 3;
  return Math.min(3, Math.max(1, Math.ceil(3 - Math.log10(extent))));
}

/**
 * SVG metnini temizler ve küçültür.
 * Dönüş: { svg, report: { droppedElements:Set, droppedAttrs:Set } }
 */
export function sanitizeSvg(text, { round = true } = {}) {
  const parsed = parseSvg(text);
  const report = { droppedElements: new Set(), droppedAttrs: new Set() };

  // viewBox'ı garanti et (yoksa width/height'tan türet)
  const get = (n) => parsed.attrs.find(([k]) => k === n)?.[1];
  let viewBox = get('viewBox');
  if (!viewBox) {
    const w = parseFloat(get('width') ?? '');
    const h = parseFloat(get('height') ?? '');
    if (!(w > 0 && h > 0)) throw new Error('viewBox yok ve width/height\'tan türetilemiyor');
    viewBox = `0 0 ${w} ${h}`;
  }
  const ctx = { report, decimals: round ? decimalsFor(viewBox) : null };
  const cleaned = cleanNode(parsed, ctx);
  // Kök: xmlns + viewBox + sunum öznitelikleri; boyutu <img> belirler (width/height/x/y/id atılır)
  const ROOT_DROP = new Set(['viewBox', 'width', 'height', 'x', 'y', 'id']);
  cleaned.attrs = [
    ['xmlns', SVG_NS],
    ['viewBox', viewBox.trim().replace(/[\s,]+/g, ' ')],
    ...cleaned.attrs.filter(([k]) => !ROOT_DROP.has(k)),
  ];

  const svg = serialize(cleaned);
  assertSafeSvg(svg);
  return { svg, report };
}

/** Son savunma hattı: çıktıda tehlikeli bir kalıp kalmadığını doğrular (testler de aynı kontrolü yapar). */
export function assertSafeSvg(svg) {
  const problems = [];
  if (!/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[^"]+"/.test(svg)) problems.push('kök/viewBox');
  if (/<script|<foreignObject|<style|<iframe|<image|<feImage|<a[\s>]/i.test(svg)) problems.push('yasak öğe');
  if (/\son[a-z]+\s*=/i.test(svg)) problems.push('olay işleyici');
  if (/javascript:|data:|https?:\/\/(?!www\.w3\.org\/2000\/svg")/i.test(svg)) problems.push('dış bağlantı');
  if (/href="(?!#)/i.test(svg)) problems.push('dış href');
  if (problems.length) throw new Error(`Güvensiz SVG: ${problems.join(', ')}`);
}
