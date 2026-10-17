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
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'use', 'symbol', 'pattern',
]);

/** Sessizce atılan (beklenen) öğeler; diğer atılanlar raporlanır. */
const SILENT_DROP = new Set(['title', 'desc', 'metadata', 'filter']);

const ALLOWED_ATTRS = new Set([
  'id', 'd', 'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr',
  'width', 'height', 'viewBox', 'preserveAspectRatio', 'transform', 'gradientTransform', 'gradientUnits',
  'patternUnits', 'patternContentUnits', 'patternTransform', 'spreadMethod', 'offset',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity',
  'clip-path', 'clip-rule', 'mask', 'maskUnits', 'maskContentUnits', 'clipPathUnits',
  'stop-color', 'stop-opacity', 'color', 'href', 'style', 'display', 'visibility', 'overflow',
  'shape-rendering', 'vector-effect', 'paint-order',
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

/** Yol verisindeki sayıları `decimals` basamağa yuvarlar (ayırıcılar korunur). */
export function roundPathNumbers(value, decimals) {
  const re = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
  return value.replace(re, (num, offset, whole) => {
    let n = Number(num);
    if (!Number.isFinite(n)) return num;
    n = Number(n.toFixed(decimals));
    let out = String(n === 0 ? 0 : n);
    if (out.includes('e')) out = n.toFixed(decimals);
    out = out.replace(/^(-?)0\./, '$1.');
    // İşaret ayırıcı görevi görüyordu ("2.1-0.00001" → "2.1 0"): işaret kaybolduysa boşluk koy
    if (/^[-+]/.test(num) && !out.startsWith('-')) out = ` ${out}`;
    // "1.04.5" → "1 .5": yuvarlanan sayı tam sayıya dönüştüyse ve hemen ardından '.' geliyorsa ayırıcı ekle
    const next = whole[offset + num.length];
    if (next === '.' && !out.includes('.')) out += ' ';
    return out;
  });
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
      report.droppedAttrs.add(name);
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
    if ((name === 'd' || name === 'points') && ctx.decimals != null) {
      value = roundPathNumbers(value, ctx.decimals);
    }
    if (name === 'id') ctx.ids.add(value);
    attrs.push([name, value.replace(/\s+/g, ' ')]);
  }
  const children = [];
  for (const child of node.children) {
    // filter="url(#…)" taşıyan öğeler yalnızca gölge katmanıdır; <filter> tutulmadığı için öğe de atılır
    if (child.attrs.some(([k]) => k === 'filter')) {
      report.droppedElements.add('(filtreli gölge katmanı)');
      continue;
    }
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
  const ctx = { report, ids: new Set(), decimals: round ? decimalsFor(viewBox) : null };
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
  if (/<script|<foreignObject|<style|<iframe|<image|<a[\s>]/i.test(svg)) problems.push('yasak öğe');
  if (/\son[a-z]+\s*=/i.test(svg)) problems.push('olay işleyici');
  if (/javascript:|data:|https?:\/\/(?!www\.w3\.org\/2000\/svg")/i.test(svg)) problems.push('dış bağlantı');
  if (/href="(?!#)/i.test(svg)) problems.push('dış href');
  if (problems.length) throw new Error(`Güvensiz SVG: ${problems.join(', ')}`);
}
