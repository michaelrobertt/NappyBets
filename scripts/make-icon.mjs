import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/* ---------- CRC32 / PNG encoder ---------- */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- Desenho do ícone (fundo escuro, barras verdes ascendentes) ---------- */
const SIZE = 256;
const SS = 3; // supersampling
const W = SIZE * SS;

function roundedRectAlpha(x, y, rx, ry, rw, rh, radius) {
  const cx = Math.min(Math.max(x, rx + radius), rx + rw - radius);
  const cy = Math.min(Math.max(y, ry + radius), ry + rh - radius);
  const dx = x - cx;
  const dy = y - cy;
  if (x < rx || x > rx + rw || y < ry || y > ry + rh) return 0;
  return dx * dx + dy * dy <= radius * radius ? 1 : 0;
}

function capsuleDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

const hi = Buffer.alloc(W * W * 4);
const bg = [10, 14, 17];
const bars = [
  { x: 58, h: 52, color: [16, 185, 129], alpha: 0.55 },
  { x: 104, h: 82, color: [16, 185, 129], alpha: 0.8 },
  { x: 150, h: 116, color: [52, 211, 153], alpha: 1 },
];

for (let y = 0; y < W; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 4;
    const px = (x / SS) + 0.5 / SS;
    const py = (y / SS) + 0.5 / SS;
    const inCard = roundedRectAlpha(px, py, 10, 10, 236, 236, 52);
    if (!inCard) {
      hi[i + 3] = 0;
      continue;
    }
    // fundo com leve gradiente
    const g = (py - 10) / 236;
    hi[i] = Math.round(bg[0] + g * 6);
    hi[i + 1] = Math.round(bg[1] + g * 14);
    hi[i + 2] = Math.round(bg[2] + g * 10);
    hi[i + 3] = 255;
  }
}

// barras
for (const bar of bars) {
  const bw = 32;
  const bx = bar.x;
  const by = 194 - bar.h;
  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const px = (x / SS) + 0.5 / SS;
      const py = (y / SS) + 0.5 / SS;
      if (!roundedRectAlpha(px, py, bx, by, bw, bar.h, 9)) continue;
      const i = (y * W + x) * 4;
      const base = Math.min(1, (py - by) / bar.h);
      const blend = 0.72 + 0.28 * (1 - base);
      hi[i] = Math.round(hi[i] * (1 - blend) + bar.color[0] * blend);
      hi[i + 1] = Math.round(hi[i + 1] * (1 - blend) + bar.color[1] * blend);
      hi[i + 2] = Math.round(hi[i + 2] * (1 - blend) + bar.color[2] * blend);
    }
  }
}

// linha ascendente + ponto final
const pts = [
  [64, 150],
  [110, 118],
  [156, 96],
  [196, 58],
];
for (let seg = 0; seg < pts.length - 1; seg += 1) {
  const [ax, ay] = pts[seg];
  const [bx, by] = pts[seg + 1];
  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const px = (x / SS) + 0.5 / SS;
      const py = (y / SS) + 0.5 / SS;
      const d = capsuleDist(px, py, ax, ay, bx, by);
      const alpha = Math.max(0, Math.min(1, 5.5 - d));
      if (alpha <= 0) continue;
      const i = (y * W + x) * 4;
      hi[i] = Math.round(hi[i] * (1 - alpha) + 236 * alpha);
      hi[i + 1] = Math.round(hi[i + 1] * (1 - alpha) + 253 * alpha);
      hi[i + 2] = Math.round(hi[i + 2] * (1 - alpha) + 245 * alpha);
    }
  }
}
for (const [cx, cy] of [pts[pts.length - 1]]) {
  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const px = (x / SS) + 0.5 / SS;
      const py = (y / SS) + 0.5 / SS;
      const d = Math.hypot(px - cx, py - cy);
      const alpha = Math.max(0, Math.min(1, 8.5 - d));
      if (alpha <= 0) continue;
      const i = (y * W + x) * 4;
      hi[i] = Math.round(hi[i] * (1 - alpha) + 52 * alpha);
      hi[i + 1] = Math.round(hi[i + 1] * (1 - alpha) + 211 * alpha);
      hi[i + 2] = Math.round(hi[i + 2] * (1 - alpha) + 153 * alpha);
    }
  }
}

// downsample
const out = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += 1) {
  for (let x = 0; x < SIZE; x += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy += 1) {
      for (let sx = 0; sx < SS; sx += 1) {
        const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
        const alpha = hi[i + 3] / 255;
        r += hi[i] * alpha;
        g += hi[i + 1] * alpha;
        b += hi[i + 2] * alpha;
        a += alpha;
      }
    }
    const o = (y * SIZE + x) * 4;
    const n = SS * SS;
    const avgA = a / n;
    if (avgA > 0) {
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
    }
    out[o + 3] = Math.round(avgA * 255);
  }
}

const png = encodePng(SIZE, SIZE, out);
const dir = path.resolve('build');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.png'), png);
fs.mkdirSync(path.resolve('public'), { recursive: true });
fs.writeFileSync(path.resolve('public', 'icon.png'), png);

// ICO com PNG embutido (Windows Vista+)
const dirHeader = Buffer.alloc(6);
dirHeader.writeUInt16LE(0, 0);
dirHeader.writeUInt16LE(1, 2);
dirHeader.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0;
entry[1] = 0;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(dir, 'icon.ico'), Buffer.concat([dirHeader, entry, png]));

console.log('Ícones gerados em build/icon.png, build/icon.ico e public/icon.png');
