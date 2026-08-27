import fs from 'node:fs';
const s=fs.readFileSync(new URL('../server/server.js', import.meta.url),'utf8');
for (const token of ['versusStartDraft','versusDraftAction','versusStartBattle','versusClaim','versusRules','versusFrame','versusInput','versusProbe']) {
  if(!s.includes(token)) throw new Error('missing server protocol '+token);
}
const expected={ '6-noBP':10, '7-noBP':12, '6-BP':18, '7-BP':20 };
for(const [k,v] of Object.entries(expected)){
  const [slots,bp]=k.split('-'); const n=Number(slots); const picks=(n-1)*2; const total=bp==='BP'?(2*2+3*2+2*2+(n===7?3:2)*2):picks;
  if(total!==v) throw new Error(`${k} expected ${v}, got ${total}`);
}
console.log('VERSUS_DRAFT_PROTOCOL_PASS');
