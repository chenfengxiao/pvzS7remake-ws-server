/**
 * Process miner zombie animation package.
 * Input: 6 animation folders with sprite sheets (PNG) + frames
 * Output: 6 webp sprite sheets matching sprite sheet format for the game
 * 
 * Mapping:
 *   05_地下挖掘 -> digger_underground.webp (14 frames, 456x276, 8 cols)
 *   06_旋转出土 -> digger_surface.webp (16 frames, 544x860, 8 cols)
 *   07_眩晕     -> digger_stun.webp (29 frames, 602x854, 8 cols)
 *   02_走路     -> digger_walk.webp (32 frames, 606x828, 8 cols)
 *   03_啃食     -> digger_attack.webp (13 frames, 592x822, 8 cols)
 *   04_死亡     -> digger_death.webp (31 frames - drop last frame, 616x746, 8 cols)
 */
const sharp = require('/Users/chenfengxiao/OpenClawShare/chenxiling/PVZ-TS/S7/S7_气球仙人掌向日葵猫尾草修复_多文件可读版/S7_气球仙人掌向日葵猫尾草修复_多文件可读版/tools/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const SRC_BASE = '/Users/chenfengxiao/OpenClawShare/chenxiling/PVZ-TS/S7/S丐版/assets/temp/miner_frames/矿工僵尸_6类动画_透明PNG_80ms';
const OUT_DIR = '/Users/chenfengxiao/OpenClawShare/chenxiling/PVZ-TS/S7/S丐版/assets/final_runtime';

const ANIMS = [
  { name: 'digger_underground', srcDir: '05_地下挖掘', cols: 8, dropLast: 0 },
  { name: 'digger_surface',     srcDir: '06_旋转出土', cols: 8, dropLast: 0 },
  { name: 'digger_stun',         srcDir: '07_眩晕',     cols: 8, dropLast: 0 },
  { name: 'digger_walk',        srcDir: '02_走路',     cols: 8, dropLast: 0 },
  { name: 'digger_attack',      srcDir: '03_啃食',     cols: 8, dropLast: 0 },
  { name: 'digger_death',       srcDir: '04_死亡',     cols: 8, dropLast: 1 }, // drop last frame (underground digging)
];

async function main() {
  for (const anim of ANIMS) {
    const srcPath = path.join(SRC_BASE, anim.srcDir, anim.srcDir.split('_')[0] + '_' + anim.srcDir.split('_')[1] + '_精灵图_8列.png');
    // Try to find the sprite sheet PNG
    const dir = path.join(SRC_BASE, anim.srcDir);
    const files = fs.readdirSync(dir);
    const spriteSheet = files.find(f => f.includes('精灵图') && f.endsWith('.png'));
    
    if (!spriteSheet) {
      console.error(`No sprite sheet found for ${anim.name} in ${dir}`);
      continue;
    }
    
    const sheetPath = path.join(dir, spriteSheet);
    const outPath = path.join(OUT_DIR, anim.name + '.webp');
    
    const info = await sharp(sheetPath).metadata();
    
    // Read animation.json for frame count and canvas dimensions
    const animJson = JSON.parse(fs.readFileSync(path.join(dir, 'animation.json'), 'utf8'));
    const frameCount = animJson.frame_count - anim.dropLast;
    const frameW = animJson.canvas_width;
    const frameH = animJson.canvas_height;
    const rows = Math.ceil(frameCount / anim.cols);
    
    // If dropping last frame, we need to crop the sprite sheet
    if (anim.dropLast > 0) {
      const cropWidth = anim.cols * frameW;
      const cropHeight = rows * frameH;
      await sharp(sheetPath)
        .resize(cropWidth, cropHeight, { fit: 'cover', position: 'left top' })
        .extract({ left: 0, top: 0, width: cropWidth, height: cropHeight })
        .webp({ quality: 90 })
        .toFile(outPath);
      console.log(`${anim.name}: ${info.width}x${info.height} -> cropped to ${cropWidth}x${cropHeight} (${frameCount} frames, dropped ${anim.dropLast})`);
    } else {
      await sharp(sheetPath)
        .webp({ quality: 90 })
        .toFile(outPath);
      console.log(`${anim.name}: ${info.width}x${info.height} (${frameCount} frames, ${anim.cols} cols)`);
    }
  }
  
  console.log('\nDone! Miner zombie sprites saved.');
}

main().catch(e => { console.error(e); process.exit(1); });
