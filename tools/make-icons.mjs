// 아이콘 PNG 생성 (의존성 없음): node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
mkdirSync(OUT, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(size, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const GREEN = [47, 93, 70], CREAM = [246, 247, 242];
// 정규화 좌표(0..1)에서 색을 반환. 반투명이면 null
function sample(u, v, maskable) {
  if (!maskable) { // 둥근 사각형 바깥은 투명
    const r = 0.22, cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r);
    if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return null;
  }
  const s = maskable ? 0.8 : 1; // maskable 은 안전영역 안쪽에 그림
  const x = (u - 0.5) / s, y = (v - 0.58) / s; // 해를 약간 아래로
  const d = Math.hypot(x, y), a = Math.atan2(y, x);
  if (d < 0.17) return CREAM;                           // 해
  if (d > 0.23 && d < 0.34 && y < 0.02) {               // 광선 (윗쪽 반원)
    const k = ((a % (Math.PI / 6)) + Math.PI / 6) % (Math.PI / 6);
    if (Math.min(k, Math.PI / 6 - k) < 0.1) return CREAM;
  }
  if (y > 0.17 && y < 0.2 && Math.abs(x) < 0.33) return CREAM; // 지평선
  return GREEN;
}
function render(size, maskable) {
  const buf = Buffer.alloc(size * size * 4), SS = 3;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const c = sample((x + (i + .5) / SS) / size, (y + (j + .5) / SS) / size, maskable);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const o = (y * size + x) * 4;
    if (a) { buf[o] = r / a; buf[o + 1] = g / a; buf[o + 2] = b / a; buf[o + 3] = Math.round(255 * a / (SS * SS)); }
  }
  return png(size, buf);
}

writeFileSync(join(OUT, 'icon-192.png'), render(192, false));
writeFileSync(join(OUT, 'icon-512.png'), render(512, false));
writeFileSync(join(OUT, 'icon-maskable-512.png'), render(512, true));
writeFileSync(join(OUT, 'apple-touch-icon.png'), render(180, true));
console.log('icons 생성 완료');
