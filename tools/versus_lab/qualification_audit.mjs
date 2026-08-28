// Final qualification audit: N (>=5000) matches with the FROZEN candidate,
// outputs per-card price/CD/exchange-value/usage/winrate/best-response/
// solvability and anomaly report. Parallel across workers.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../dist/versus_lab/balance');

async function runBatch(seedBase, count, overridesFile, tag, workers){
  fs.mkdirSync(OUT, {recursive: true});
  const per = Math.ceil(count / workers);
  const jobs = [];
  for (let w = 0; w < workers; w++){
    const start = seedBase + w * per;
    const n = Math.min(per, count - w * per);
    if (n <= 0) break;
    jobs.push({start, n, out: path.join(OUT, `qual_${tag}_${w}.jsonl`)});
  }
  const cp = await import('node:child_process');
  await Promise.all(jobs.map(j => new Promise((resolve, reject) => {
    const c = cp.spawn('node', [path.join(HERE, 'batch_worker.mjs'), String(j.start), String(j.n), j.out, overridesFile], {stdio: ['ignore', 'ignore', 'inherit']});
    c.on('close', code => code === 0 ? resolve() : reject(new Error('worker ' + code)));
    c.on('error', reject);
  })));
  const lines = [];
  for (const j of jobs) lines.push(...fs.readFileSync(j.out, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
  for (const j of jobs) fs.rmSync(j.out);
  return lines;
}

function audit(matches, cards, overrides){
  const stat = {};
  const sideWR = {plant: 0, zombie: 0, draw: 0};
  const deckWR = {}; // best-response proxy: deck archetype winrates
  const ashDoom = {uses: 0, resolved: []};
  for (const m of matches){
    const w = m.winner === 'plant' ? 'plant' : m.winner === 'zombie' ? 'zombie' : 'draw';
    sideWR[w]++;
    const zk = m.zombieDeck.join('+'), pk = m.plantDeck.join('+');
    const k = pk + ' vs ' + zk;
    if (!deckWR[k]) deckWR[k] = {n: 0, plant: 0, zombie: 0, draw: 0};
    deckWR[k].n++; deckWR[k][w]++;
    const seen = new Set();
    for (const d of m.deps){
      const k2 = d.side + ':' + d.cardId;
      if (!stat[k2]) stat[k2] = {side: d.side, cardId: d.cardId, uses: 0, paid: 0, res: 0, obj: 0, killed: 0, mowed: 0, survived: 0, breached: 0, wonWhenUsed: 0, matches: new Set()};
      const s = stat[k2];
      s.uses++; s.paid += d.paid; s.res += d.res; s.obj += d.obj;
      if (d.outcome === 'killed') s.killed++;
      if (d.outcome === 'mowed') s.mowed++;
      if (d.outcome === 'survived') s.survived++;
      if (d.outcome === 'breached') s.breached++;
      if (m.winner === d.side) s.wonWhenUsed++;
      if (!seen.has(k2)){ seen.add(k2); s.matches.add(m.seed); }
      if (d.cardId === 'doomshroom') ashDoom.resolved.push(d.res);
    }
  }
  const total = matches.length;
  const rows = [];
  for (const [sideName, table] of Object.entries(cards)){
    for (const [id, c] of Object.entries(table)){
      const k = sideName + ':' + id;
      const s = stat[k] || {uses: 0, paid: 0, res: 0, obj: 0, matches: new Set(), killed: 0, mowed: 0, survived: 0, wonWhenUsed: 0, breached: 0};
      const ov = overrides[sideName]?.[id] || {};
      rows.push({
        side: sideName, cardId: id,
        price: ov.cost ?? c.cost, cd: ov.cd ?? c.cd, guaranteed: c.guaranteed ?? null,
        uses: s.uses, matchUsage: s.matches.size / total,
        paidAvg: s.uses ? Math.round(s.paid / s.uses) : 0,
        exchangeRatio: s.paid > 0 ? Math.round((s.res / s.paid) * 100) / 100 : null,
        resolvedTotal: Math.round(s.res),
        objectiveDamage: s.obj,
        winRateWhenUsed: s.uses ? Math.round((s.wonWhenUsed / s.uses) * 100) / 100 : null,
        outcomeKilled: s.killed, outcomeMowed: s.mowed, outcomeSurvived: s.survived, outcomeBreached: s.breached
      });
    }
  }
  rows.sort((a, b) => (b.paidAvg * b.uses) - (a.paidAvg * a.uses));
  const anomalies = [];
  for (const r of rows){
    if (r.matchUsage > 0.1 && r.exchangeRatio != null && r.exchangeRatio > 1.9) anomalies.push({card: r.cardId, side: r.side, issue: `交换比 ${r.exchangeRatio} 过强`, advice: '涨价或加CD'});
    if (r.matchUsage > 0.1 && r.exchangeRatio != null && r.exchangeRatio < 0.35) anomalies.push({card: r.cardId, side: r.side, issue: `交换比 ${r.exchangeRatio} 过弱`, advice: '降价或减CD'});
    if (r.matchUsage === 0) anomalies.push({card: r.cardId, side: r.side, issue: '零使用', advice: '检查定价/AI覆盖'});
  }
  // best-response 表：每个卡组对位胜率
  const matchups = Object.entries(deckWR).map(([k, v]) => ({matchup: k, n: v.n, plantWR: Math.round((v.plant / v.n) * 100) / 100, draw: Math.round((v.draw / v.n) * 100) / 100})).sort((a, b) => b.n - a.n);
  // 毁灭菇优质使用带判定（目标 200-350 合理 / 常态≈500 过强 / 好时机<200 过弱）
  const doomStats = {uses: ashDoom.uses, avgResolved: ashDoom.resolved.length ? Math.round(ashDoom.resolved.reduce((a, b) => a + b, 0) / ashDoom.resolved.length) : null, band: null};
  if (doomStats.avgResolved != null) doomStats.band = doomStats.avgResolved >= 500 ? '过强(≈500+)' : doomStats.avgResolved >= 200 ? '合理(200-350)' : '过弱(<200)';
  return {total, sideWR: {plant: Math.round((sideWR.plant / total) * 1000) / 1000, zombie: Math.round((sideWR.zombie / total) * 1000) / 1000, draw: Math.round((sideWR.draw / total) * 1000) / 1000}, rows, anomalies, matchups, doom: doomStats};
}

async function main(){
  const TOTAL = Number(process.argv[2] || 5000);
  const overridesFile = process.argv[3] || path.join(OUT, 'candidate_overrides.json');
  const overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf8'));
  const rt = (await import('./headless_runtime.mjs')).createS7HeadlessRuntime();
  const cards = JSON.parse(JSON.stringify(rt.S7VersusBattle.CARDS));
  const t0 = Date.now();
  const CHUNK = 600, WORKERS = 3;
  let all = [];
  let done = 0;
  while (done < TOTAL){
    const n = Math.min(CHUNK, TOTAL - done);
    all = all.concat(await runBatch(900000 + done, n, overridesFile, 'p', WORKERS));
    done += n;
    console.log(`qualification progress: ${done}/${TOTAL} (${Math.round((Date.now() - t0) / 1000)}s)`);
  }
  const report = audit(all, cards, overrides);
  report.wallSeconds = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(OUT, 'qualification_report.json'), JSON.stringify(report, null, 2));
  console.log('QUALIFICATION_DONE', JSON.stringify({total: report.total, sideWR: report.sideWR, doom: report.doom, anomalies: report.anomalies.length, wall: report.wallSeconds}));
}
main().catch(e => { console.error(e); process.exit(1); });
