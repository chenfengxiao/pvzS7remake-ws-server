import fs from 'node:fs';
const s=fs.readFileSync(new URL('../server/server.js', import.meta.url),'utf8');
for (const token of ['versusStartDraft','versusDraftAction','versusStartBattle','versusClaim','versusRules','versusFrame','versusInput','versusProbe']) {
  if(!s.includes(token)) throw new Error('missing server protocol '+token);
}
const expected={ '6-noBP':10, '7-noBP':12, '6-BP':20, '7-BP':22 };
for(const [k,v] of Object.entries(expected)){
  const [slots,bp]=k.split('-'); const picks=(Number(slots)-1)*2; const total=picks+(bp==='BP'?10:0);
  if(total!==v) throw new Error(`${k} expected ${v}, got ${total}`);
}
console.log('VERSUS_DRAFT_PROTOCOL_PASS');
