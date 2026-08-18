// Measure non-transparent bounding box of frame 0 for given sprite sheets.
// Uses bilibili ffmpeg to decode (sharp unavailable), pure-JS RGBA analysis.
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';

const FFMPEG = '/Users/chenfengxiao/Library/Application Support/bilibili/ffmpeg/ffmpeg';

const targets = [
  { name: 'normal.walk', file: 'assets/zombies_b04r/normal.walk.png', fw: 166, fh: 144 },
  { name: 'football_run', file: 'assets/zombies_b05b/football_run.png', fw: 154, fh: 160 },
  { name: 'pole_run', file: 'assets/zombies_b05a/pole_run.png', fw: 348, fh: 218 },
  { name: 'balloon_fly', file: 'assets/final_runtime/balloon_fly.webp', fw: 280, fh: 230 },
  { name: 'balloon_walk', file: 'assets/final_runtime/balloon_walk_new.webp', fw: 514, fh: 674 },
  { name: 'digger_walk', file: 'assets/final_runtime/digger_walk.webp', fw: 303, fh: 414 },
];

for (const t of targets) {
  const out = `tools/.bbox_${t.name}.rgba`;
  execFileSync(FFMPEG, ['-y', '-i', t.file, '-vf', `crop=${t.fw}:${t.fh}:0:0`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', out], { stdio: 'pipe' });
  const data = readFileSync(out);
  unlinkSync(out);
  let minX = t.fw, maxX = -1, minY = t.fh, maxY = -1;
  for (let y = 0; y < t.fh; y++) {
    for (let x = 0; x < t.fw; x++) {
      const a = data[(y * t.fw + x) * 4 + 3];
      if (a > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const w = maxX >= 0 ? maxX - minX + 1 : 0;
  const h = maxY >= 0 ? maxY - minY + 1 : 0;
  console.log(`${t.name}: frame ${t.fw}x${t.fh} -> content ${w}x${h} (x:${minX}-${maxX}, y:${minY}-${maxY})`);
}
