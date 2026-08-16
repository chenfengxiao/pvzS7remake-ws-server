/**
 * Extract giga animation frames as individual PNGs for user to paint red eyes.
 * Input: giga_walk/hammer/throw/death.webp sprite sheets
 * Output: /tmp/giga_frames/{anim}_frame_{N}.png
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ASSET_DIR = '/Users/chenfengxiao/OpenClawShare/chenxiling/PVZ-TS/S7/S7_气球仙人掌向日葵猫尾草修复_多文件可读版/S7_气球仙人掌向日葵猫尾草修复_多文件可读版/assets/final_runtime';
const OUT_DIR = '/tmp/giga_frames';

const ANIMS = {
  giga_walk:   { file:'giga_walk.webp',   frameWidth:320, frameHeight:216, columns:5, frameCount:10 },
  giga_hammer: { file:'giga_hammer.webp', frameWidth:320, frameHeight:216, columns:8, frameCount:24 },
  giga_throw:  { file:'giga_throw.webp',  frameWidth:320, frameHeight:216, columns:8, frameCount:24 },
  giga_death:  { file:'giga_death.webp',  frameWidth:320, frameHeight:216, columns:8, frameCount:22 },
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const [name, cfg] of Object.entries(ANIMS)) {
    const srcPath = path.join(ASSET_DIR, cfg.file);
    const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;

    console.log(`${name}: ${width}x${height}, extracting ${cfg.frameCount} frames...`);

    for (let i = 0; i < cfg.frameCount; i++) {
      const col = i % cfg.columns;
      const row = Math.floor(i / cfg.columns);
      const x0 = col * cfg.frameWidth;
      const y0 = row * cfg.frameHeight;

      // Extract frame region
      const frameBuf = Buffer.alloc(cfg.frameWidth * cfg.frameHeight * 4);
      for (let y = 0; y < cfg.frameHeight; y++) {
        for (let x = 0; x < cfg.frameWidth; x++) {
          const srcOff = ((y0 + y) * width + x0 + x) * 4;
          const dstOff = (y * cfg.frameWidth + x) * 4;
          frameBuf[dstOff]   = data[srcOff];
          frameBuf[dstOff+1] = data[srcOff+1];
          frameBuf[dstOff+2] = data[srcOff+2];
          frameBuf[dstOff+3] = data[srcOff+3];
        }
      }

      const outPath = path.join(OUT_DIR, `${name}_frame_${String(i).padStart(2,'0')}.png`);
      await sharp(frameBuf, { raw: { width: cfg.frameWidth, height: cfg.frameHeight, channels: 4 } })
        .png()
        .toFile(outPath);
    }
    console.log(`  -> ${cfg.frameCount} frames written to ${OUT_DIR}/${name}_frame_*.png`);
  }

  // Also create composite contact sheets
  for (const [name, cfg] of Object.entries(ANIMS)) {
    const frames = [];
    for (let i = 0; i < cfg.frameCount; i++) {
      const p = path.join(OUT_DIR, `${name}_frame_${String(i).padStart(2,'0')}.png`);
      frames.push(await sharp(p).raw().toBuffer());
    }

    const cols = cfg.columns;
    const rows = Math.ceil(cfg.frameCount / cols);
    const sheetW = cols * cfg.frameWidth;
    const sheetH = rows * cfg.frameHeight;
    const sheet = Buffer.alloc(sheetW * sheetH * 4);

    for (let i = 0; i < cfg.frameCount; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      for (let y = 0; y < cfg.frameHeight; y++) {
        for (let x = 0; x < cfg.frameWidth; x++) {
          const srcOff = (y * cfg.frameWidth + x) * 4;
          const dstOff = ((r * cfg.frameHeight + y) * sheetW + c * cfg.frameWidth + x) * 4;
          sheet[dstOff]   = frames[i][srcOff];
          sheet[dstOff+1] = frames[i][srcOff+1];
          sheet[dstOff+2] = frames[i][srcOff+2];
          sheet[dstOff+3] = frames[i][srcOff+3];
        }
      }
    }

    const sheetPath = path.join(OUT_DIR, `${name}_contact_sheet.png`);
    await sharp(sheet, { raw: { width: sheetW, height: sheetH, channels: 4 } })
      .png().toFile(sheetPath);
    console.log(`  Contact sheet: ${sheetPath}`);
  }

  console.log('\nDone! All giga frames extracted to /tmp/giga_frames/');
}

main().catch(e => { console.error(e); process.exit(1); });
