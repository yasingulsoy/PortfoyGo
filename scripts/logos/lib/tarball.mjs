// npm tarball'larını indirir, bütünlüğünü (sha512) doğrular ve BELLEKTE açar.
// Paket içeriği diske çıkarılmaz ve hiçbir dosyası çalıştırılmaz: yalnızca seçilen metin dosyaları okunur.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

/** Sabitlenmiş npm paketini indirir (veya önbellekten okur) ve sha512 bütünlüğünü doğrular. */
export async function fetchTarball(pkg, { cacheDir } = {}) {
  const file = `${pkg.name.replace(/[@/]/g, '_')}-${pkg.version}.tgz`;
  const cached = cacheDir ? join(cacheDir, file) : null;
  let buf;
  if (cached && existsSync(cached)) {
    buf = readFileSync(cached);
  } else {
    const res = await fetch(pkg.tarball, { redirect: 'error' });
    if (!res.ok) throw new Error(`${pkg.name}@${pkg.version}: HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const integrity = `sha512-${createHash('sha512').update(buf).digest('base64')}`;
  if (integrity !== pkg.integrity) {
    throw new Error(`${pkg.name}@${pkg.version}: bütünlük uyuşmuyor (beklenen ${pkg.integrity}, gelen ${integrity})`);
  }
  if (cached && !existsSync(cached)) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cached, buf);
  }
  return buf;
}

/**
 * .tgz içeriğini { 'yol': Buffer } olarak döndürür (yalnızca normal dosyalar; `package/` öneki atılır).
 * `filter(path)` false dönen dosyalar belleğe de alınmaz.
 */
export function readTarball(tgz, filter = () => true) {
  const tar = gunzipSync(tgz);
  const files = new Map();
  let offset = 0;
  let longName = null;
  let paxPath = null;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const str = (start, len) => {
      const raw = header.subarray(start, start + len);
      const end = raw.indexOf(0);
      return raw.subarray(0, end === -1 ? len : end).toString('utf8');
    };
    const size = parseInt(str(124, 12).trim() || '0', 8);
    const type = String.fromCharCode(header[156] || 48);
    const prefix = str(345, 155);
    let name = longName ?? paxPath ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100));
    const dataStart = offset + 512;
    const data = tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (type === 'L') {
      longName = data.toString('utf8').replace(/\0+$/, '');
      continue;
    }
    if (type === 'x') {
      const m = /\d+ path=([^\n]*)\n/.exec(data.toString('utf8'));
      paxPath = m ? m[1] : null;
      continue;
    }
    longName = null;
    paxPath = null;
    if (type !== '0' && type !== '\0') continue; // yalnızca normal dosyalar (bağlantı/dizin yok)
    name = name.replace(/^package\//, '');
    if (name.includes('..') || name.startsWith('/')) continue;
    if (!filter(name)) continue;
    files.set(name, Buffer.from(data));
  }
  return files;
}
