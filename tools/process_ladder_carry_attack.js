/**
 * Process ladder_carry_attack user-drawn sprite sheet:
 * 1. Remove white background → transparent
 * 2. Align frames by centroid
 * 3. Output webp
 */
const sharp = require('sharp');

const SRC = '/Users/chenfengxiao/.qwen/tmp/clipboard/clipboard-1785671444901-0.png';
const DST = '/Users/chenfengxiao/OpenClawShare/chenxiling/PVZ-TS/S7/S7_气球仙人掌向日葵猫尾草修复_多文件可读版/S7_气球仙人掌向日葵猫尾草修复_多文件可读版/assets/final_runtime/ladder_carry_attack.webp';

const COLS = 5, ROWS = 4, TOTAL = 20, WHITE_T = 240;

async function main() {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const fW = W / COLS | 0, fH = H / ROWS | 0;
  console.log(`Source: ${W}x${H}, frame: ${fW}x${fH}`);

  const frames = [], centroids = [];
  for (let i = 0; i < TOTAL; i++) {
    const r = i / COLS | 0, c = i % COLS;
    const buf = Buffer.alloc(fW * fH * 4);
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < fH; y++) for (let x = 0; x < fW; x++) {
      const so = ((r * fH + y) * W + c * fW + x) * 4, do2 = (y * fW + x) * 4;
      const R = data[so], G = data[so+1], B = data[so+2];
      if (R >= WHITE_T && G >= WHITE_T && B >= WHITE_T) {
        buf[do2] = buf[do2+1] = buf[do2+2] = buf[do2+3] = 0;
      } else {
        buf[do2] = R; buf[do2+1] = G; buf[do2+2] = B; buf[do2+3] = 255;
        sx += x; sy += y; n++;
      }
    }
    frames.push(buf);
    centroids.push(n > 0 ? { cx: sx/n, cy: sy/n } : { cx: fW/2, cy: fH/2 });
  }

  const ref = centroids.reduce((a,c) => ({ cx: a.cx+c.cx, cy: a.cy+c.cy }), {cx:0,cy:0});
  ref.cx /= TOTAL; ref.cy /= TOTAL;

  const sW = fW * COLS, sH = fH * ROWS;
  const sheet = Buffer.alloc(sW * sH * 4);
  for (let i = 0; i < TOTAL; i++) {
    const c = i % COLS, r = i / COLS | 0;
    const dx = Math.round(ref.cx - centroids[i].cx), dy = Math.round(ref.cy - centroids[i].cy);
    for (let y = 0; y < fH; y++) for (let x = 0; x < fW; x++) {
      const sX = x - dx, sY = y - dy;
      const dOff = ((r * fH + y) * sW + c * fW + x) * 4;
      if (sX >= 0 && sX < fW && sY >= 0 && sY < fH) {
        const sOff = (sY * fW + sX) * 4;
        sheet[dOff] = frames[i][sOff]; sheet[dOff+1] = frames[i][sOff+1];
        sheet[dOff+2] = frames[i][sOff+2]; sheet[dOff+3] = frames[i][sOff+3];
      }
    }
  }

  await sharp(sheet, { raw: { width: sW, height: sH, channels: 4 } })
    .webp({ quality: 90 }).toFile(DST);
  console.log(`Output: ${sW}x${sH} -> ${DST}`);
}

main().catch(e => { console.error(e); process.exit(1); });
