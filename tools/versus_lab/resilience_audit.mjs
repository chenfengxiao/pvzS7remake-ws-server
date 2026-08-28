// Phase-4 resilience audit: BP-draft bans+picks, 7-slot decks, and forced-use of
// low-usage cards — all driven by the SAME shared AI (S7VersusAI.draftChoice /
// draftDeck) and the SAME real battle core (runMatch -> 99 controller).
// Supplementary to the >=5000 qualification audit (No-BP 6-slot main sample).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createS7HeadlessRuntime} from './headless_runtime.mjs';
import {runMatch} from './match_runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../dist/versus_lab/balance');
const overrides = JSON.parse(fs.readFileSync(path.join(OUT, 'candidate_overrides.json'), 'utf8'));

const rt = createS7HeadlessRuntime();
const CARDS = rt.S7VersusBattle.CARDS;
const pools = {plant: Object.keys(CARDS.plant), zombie: Object.keys(CARDS.zombie)};
const AI = rt.S7VersusAI;

// archetype decks used by the main audit (batch_worker.mjs) — anything not in
// them is a "low-usage" card for the forced-use pass.
const ARCHETYPE = new Set(('repeater wallnut gatling cherrybomb hypno fume snowpea melon jalapeno ' +
  'spikerock cattail doomshroom tallnut starfruit winter squash kernel normal cone bucket football ' +
  'garg digger dancer giga balloon pole zomboni pogo newspaper dolphin jack screen bobsledSled').split(' '));
const LOW = {
  plant: pools.plant.filter(id => !ARCHETYPE.has(id)),
  zombie: pools.zombie.filter(id => !ARCHETYPE.has(id))
};

function pickDecks(side, pool, count, banned, picked){
  const out = [];
  for (let i = 0; i < count; i++){
    const avail = pool.filter(id => !banned.includes(id) && !picked.includes(id));
    const id = AI.draftChoice(side, 'pick', avail, x => banned.includes(x) || picked.includes(x), {});
    if (!id) break;
    picked.push(id); out.push(id);
  }
  return out;
}

function bpDecks(slots){
  const picks = slots - 1;
  const bans = {plant: [], zombie: []};
  for (let i = 0; i < 2; i++){
    bans.zombie.push(AI.draftChoice('zombie', 'ban', pools.plant, id => bans.zombie.includes(id), {}));
    bans.plant.push(AI.draftChoice('plant', 'ban', pools.zombie, id => bans.plant.includes(id), {}));
  }
  const p = [], z = [];
  const pd = pickDecks('plant', pools.plant, picks, bans.plant, p);
  const zd = pickDecks('zombie', pools.zombie, picks, bans.zombie, z);
  return {pd, zd, bans};
}

const stat = {bp: {plant: 0, zombie: 0, draw: 0, n: 0}, slots7: {plant: 0, zombie: 0, draw: 0, n: 0}};
const forced = [];
let t0 = Date.now();

// 1) BP 6-slot (bans + picks via shared AI)
{
  const N = Number(process.argv[2] || 20);
  for (let i = 0; i < N; i++){
    const seed = 700000 + i * 131;
    const {pd, zd} = bpDecks(6);
    const m = runMatch({seed, plantCards: pd, zombieCards: zd, overrides});
    stat.bp.n++;
    if (m.result?.winner) stat.bp[m.result.winner]++;
    else stat.bp.draw++;
  }
}
// 2) 7-slot No-BP (6-card decks via shared draftDeck)
{
  const N = Number(process.argv[2] || 20);
  for (let i = 0; i < N; i++){
    const seed = 710000 + i * 137;
    const pd = AI.draftDeck('plant', pools.plant, 6);
    const zd = AI.draftDeck('zombie', pools.zombie, 6);
    const m = runMatch({seed, plantCards: pd, zombieCards: zd, overrides});
    stat.slots7.n++;
    if (m.result?.winner) stat.slots7[m.result.winner]++;
    else stat.slots7.draw++;
  }
}
// 3) forced-use: each sampled low-usage card forced into a deck, measure exchange
{
  const sample = [
    ...LOW.plant.filter(id => !['twinSunflower','zombieGravestone','bombdoor','blackolive','polecmd','warflag','tacticflag'].includes(id)).slice(0, 8),
    ...LOW.zombie.filter(id => !['twinSunflower','zombieGravestone'].includes(id)).slice(0, 8)
  ];
  for (const forcedCard of sample){
    const side = CARDS.plant[forcedCard] ? 'plant' : 'zombie';
    const other = side === 'plant' ? 'zombie' : 'plant';
    let uses = 0, paid = 0, res = 0;
    for (let i = 0; i < 3; i++){
      const seed = 720000 + forcedCard.length * 1000 + i * 101;
      const deck = [forcedCard, ...AI.draftDeck(side, pools[side].filter(x => x !== forcedCard), 4)];
      const opp = AI.draftDeck(other, pools[other], 5);
      const m = runMatch({seed, plantCards: side === 'plant' ? deck : opp, zombieCards: side === 'plant' ? opp : deck, overrides});
      for (const d of m.ledger.deployments){
        if (d.cardId === forcedCard && d.side === side){
          uses++; paid += d.paidCost;
          res += d.resolvedPaidValueDirect + d.resolvedPaidValueDamageEquivalent;
        }
      }
    }
    forced.push({card: forcedCard, side, forcedUses: uses, paidAvg: uses ? Math.round(paid / uses) : 0, exchangeRatio: paid > 0 ? Math.round((res / paid) * 100) / 100 : null, resolvedTotal: Math.round(res)});
  }
}

const report = {
  wallSeconds: Math.round((Date.now() - t0) / 1000),
  bp6slot: {n: stat.bp.n, sideWR: {plant: Math.round(stat.bp.plant / stat.bp.n * 1000) / 1000, zombie: Math.round(stat.bp.zombie / stat.bp.n * 1000) / 1000, draw: Math.round(stat.bp.draw / stat.bp.n * 1000) / 1000}},
  slots7: {n: stat.slots7.n, sideWR: {plant: Math.round(stat.slots7.plant / stat.slots7.n * 1000) / 1000, zombie: Math.round(stat.slots7.zombie / stat.slots7.n * 1000) / 1000, draw: Math.round(stat.slots7.draw / stat.slots7.n * 1000) / 1000}},
  forcedUse: forced,
  lowUsageTotal: {plant: LOW.plant.length, zombie: LOW.zombie.length}
};
fs.writeFileSync(path.join(OUT, 'resilience_report.json'), JSON.stringify(report, null, 2));
console.log('RESILIENCE_DONE', JSON.stringify({bp: report.bp6slot, slots7: report.slots7, forced: forced.length, lowPlant: LOW.plant.length, lowZombie: LOW.zombie.length}));
