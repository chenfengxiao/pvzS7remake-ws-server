// Versus balance solver: deployment-level exchange value FIRST.
// Price grid = PVZ-style (25-multiples preferred, 15-multiples legal).
// Ash cards are LOCKED (150/125/200 @50s) - measured, never adjusted.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../dist/versus_lab/balance');
// 求解轮用 900s 截断视野（v8.3 默认 maxGameSeconds=900 同款做法）；终审(qualification)仍用真实 2400s 全量
const SOLVE_MAX_SECONDS = Number(process.env.SOLVE_MAX_SECONDS || 900);
const LOCKED = {cherrybomb: 150, jalapeno: 125, doomshroom: 200};
const LOCKED_CD = 50;

function quantizePvZPrice(v){
  const x = Math.max(15, Math.round(v));
  let best = 25, bestScore = Infinity;
  for (let c = 15; c <= Math.max(200, x + 60); c++){
    if (c % 15 !== 0 && c % 25 !== 0) continue;
    const raw = Math.abs(c - x), score = raw + (c % 25 === 0 ? 0 : 4);
    if (score < bestScore){ bestScore = score; best = c; }
  }
  return best;
}

async function runBatch(seedBase, count, overrides){
  fs.mkdirSync(OUT, {recursive: true});
  const workers = 3;
  const jobs = [];
  const per = Math.ceil(count / workers);
  const ovPath = path.join(OUT, '_overrides.json');
  fs.writeFileSync(ovPath, JSON.stringify(overrides));
  for (let w = 0; w < workers; w++){
    const start = seedBase + w * per;
    const n = Math.min(per, count - w * per);
    if (n <= 0) break;
    const out = path.join(OUT, `_chunk_${w}.jsonl`);
    jobs.push({start, n, out});
  }
  await Promise.all(jobs.map(j => new Promise((resolve, reject) => {
    const child = import('node:child_process').then(cp => {
      const c = cp.spawn('node', [path.join(HERE, 'batch_worker.mjs'), String(j.start), String(j.n), j.out, ovPath, String(SOLVE_MAX_SECONDS)], {stdio: ['ignore', 'inherit', 'inherit']});
      c.on('close', code => code === 0 ? resolve() : reject(new Error('worker failed ' + code)));
      c.on('error', reject);
    });
  })));
  const lines = [];
  for (const j of jobs) lines.push(...fs.readFileSync(j.out, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
  return lines;
}

function aggregate(matches, baselineCards){
  const cards = {};
  const sideWR = {plant: 0, zombie: 0, draw: 0};
  for (const m of matches){
    sideWR[m.winner === 'plant' ? 'plant' : m.winner === 'zombie' ? 'zombie' : 'draw']++;
    const seen = new Set();
    for (const d of m.deps){
      if (d.paid <= 0) continue;
      const k = d.side + ':' + d.cardId;
      if (!cards[k]) cards[k] = {side: d.side, cardId: d.cardId, uses: 0, paid: 0, res: 0, obj: 0, won: 0, matches: new Set()};
      const c = cards[k];
      c.uses++; c.paid += d.paid; c.res += d.res; c.obj += d.obj;
      if (!seen.has(k)){ seen.add(k); c.matches.add(m.seed); }
      if (m.winner === d.side) c.won++;
    }
  }
  const total = matches.length;
  const rows = Object.values(cards).map(c => ({
    ...c, matches: c.matches.size, matchUsage: c.matches / total,
    ratio: c.paid > 0 ? c.res / c.paid : 0,
    winRateWhenUsed: c.uses ? c.won / c.uses : 0
  })).sort((a, b) => b.paid - a.paid);
  return {total, sideWR: {plant: sideWR.plant / total, zombie: sideWR.zombie / total, draw: sideWR.draw / total}, rows};
}

function adjust(overrides, baselineCards, agg){
  const changes = [];
  const base = (side, id) => baselineCards[side][id];
  for (const r of agg.rows){
    if (LOCKED[r.cardId] && r.side === 'plant') continue;
    const cur = overrides[r.side][r.cardId] || {};
    const b = base(r.side, r.cardId);
    if (!b) continue;
    const curCost = cur.cost ?? b.cost, curCd = cur.cd ?? b.cd;
    let cost = curCost, cd = curCd;
    let why = '';
    if (r.matchUsage >= 0.10 || r.uses >= 12){
      if (r.ratio > 1.6 && cost < b.cost * 2.2){ cost = quantizePvZPrice(cost + 25); why = `ratio ${r.ratio.toFixed(2)}>1.6 涨价`; }
      else if (r.ratio > 1.6 && cost >= b.cost * 2.2){ cd = Math.round(cd * 1.15 * 10) / 10; why = `ratio ${r.ratio.toFixed(2)}>1.6 已到价顶改涨CD`; }
      else if (r.ratio < 0.5 && cost > Math.max(15, b.cost * 0.5)){ cost = quantizePvZPrice(cost - 25); why = `ratio ${r.ratio.toFixed(2)}<0.5 降价`; }
    } else if (r.uses === 0 && r.matchUsage === 0){
      // 该轮完全没人用：温和降价吸引使用（限在基准价的0.6以上）
      if (cost > Math.max(15, b.cost * 0.6)){ cost = quantizePvZPrice(cost - 15); why = '零使用温和降价'; }
    }
    if (cost !== curCost || cd !== curCd){
      overrides[r.side][r.cardId] = {cost, cd};
      changes.push({side: r.side, id: r.cardId, from: {cost: curCost, cd: curCd}, to: {cost, cd}, why});
    }
  }
  // 全局阵营平衡（次要指标，只微调，不牺牲交换价值结构）
  const wr = agg.sideWR;
  const dominant = wr.plant - wr.zombie;
  if (Math.abs(dominant) > 0.14){
    const domSide = dominant > 0 ? 'plant' : 'zombie';
    // 对强势阵营：挑已使用且ratio最高的非锁定卡，涨一档
    const cands = agg.rows.filter(r => r.side === domSide && !(domSide === 'plant' && LOCKED[r.cardId]) && r.matchUsage > 0.2);
    if (cands.length){
      const t = cands[0];
      const cur = overrides[t.side][t.cardId] || {};
      const b = base(t.side, t.cardId);
      const cost = quantizePvZPrice(Math.min((cur.cost ?? b.cost) + 25, b.cost * 2.2));
      overrides[t.side][t.cardId] = {cost, cd: cur.cd ?? b.cd};
      changes.push({side: t.side, id: t.cardId, to: cost, why: `${domSide} WR ${(domSide === 'plant' ? wr.plant : wr.zombie).toFixed(2)} 阵营微调`});
    }
  }
  return changes;
}

async function main(){
  const ROUNDS = Number(process.argv[2] || 8);
  const PER_ROUND = Number(process.argv[3] || 96);
  // baseline cards from source of truth
  const rt = await import('./headless_runtime.mjs').then(m => m.createS7HeadlessRuntime());
  const baselineCards = JSON.parse(JSON.stringify(rt.S7VersusBattle.CARDS));
  const overrides = {plant: {}, zombie: {}, __rules: {twinCd: 8, graveCd: 12}};
  let seedBase = 100000;
  for (let round = 1; round <= ROUNDS; round++){
    const t0 = Date.now();
    const matches = await runBatch(seedBase, PER_ROUND, overrides);
    seedBase += PER_ROUND + 1000;
    const agg = aggregate(matches, baselineCards);
    const changes = adjust(overrides, baselineCards, agg);
    fs.writeFileSync(path.join(OUT, `round_${round}.json`), JSON.stringify({round, wallSeconds: Math.round((Date.now() - t0) / 1000), sideWR: agg.sideWR, cards: agg.rows, changes}, null, 2));
    const wr = agg.sideWR;
    console.log(`round ${round}: plant=${wr.plant.toFixed(2)} zombie=${wr.zombie.toFixed(2)} draw=${wr.draw.toFixed(2)} matches=${agg.total} changes=${changes.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
    for (const c of changes.slice(0, 8)) console.log('  ', c.side, c.id, c.why, c.to?.cost ?? c.to);
    const ratioSpread = agg.rows.filter(r => r.matchUsage > 0.15).map(r => r.ratio);
    const converged = Math.abs(wr.plant - wr.zombie) < 0.12 && wr.draw < 0.2 &&
      ratioSpread.length >= 6 && ratioSpread.every(x => x > 0.35 && x < 1.9);
    if (converged && round >= 4){ console.log('CONVERGED'); break; }
  }
  fs.writeFileSync(path.join(OUT, 'candidate_overrides.json'), JSON.stringify(overrides, null, 2));
  console.log('CANDIDATE_SAVED', path.join(OUT, 'candidate_overrides.json'));
}
main().catch(e => { console.error(e); process.exit(1); });
