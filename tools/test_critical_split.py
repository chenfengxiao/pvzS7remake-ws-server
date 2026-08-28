#!/usr/bin/env python3
from pathlib import Path
from playwright.sync_api import sync_playwright
from playwright_browser import launch_chromium, open_standalone_page
import json

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / 'dist/S7_FAST_ENTRY.html'
OUT = ROOT / 'dist/2026-08-05_critical_split_verification.json'
html = HTML.read_text(encoding='utf-8')
html = html.replace('const QUAD_DOCUMENT_BASE = new URL(".", location.href).href;', 'const QUAD_DOCUMENT_BASE = "https://example.invalid/game/";')
script = r'''
<script>
(() => {
  const results=[];
  const test=(name,fn)=>{try{fn();results.push({name,ok:true})}catch(e){results.push({name,ok:false,error:String(e&&e.stack||e)})}};
  const eq=(a,b,msg)=>{if(a!==b)throw new Error(`${msg}: ${a} !== ${b}`)};
  const ok=(v,msg)=>{if(!v)throw new Error(msg)};
  test('base critical zombies use thirds except fixed vehicles',()=>{
    let count=0;
    for(const [type,d] of Object.entries(ZOMBIES)){
      if(d.noCrit || !(d.crit>0)) continue;
      count++;
      const expected=(type==='zomboni'||type==='catapult')?199:Math.floor(d.hp/3);
      eq(d.crit,expected,`${type} crit`);
      eq(d.hp-d.crit,d.hp-expected,`${type} noncritical`);
      const z=makeZombie(type,0,8,{variant:false});
      eq(z.maxHp,d.hp,`${type} total preserved`);
      eq(z.crit,expected,`${type} instance crit`);
      ok(z.s7UsesCriticalSplit,`${type} split flag`);
    }
    eq(count,35,'critical type count');
  });
  test('remaining no-critical zombies remain no-critical',()=>{
    for(const type of ['bungee','garg','giga','blackolive']){
      const z=makeZombie(type,0,8,{variant:false});
      eq(z.crit,0,`${type} crit`);
      ok(z.noCrit,`${type} noCrit`);
    }
  });
  test('zomboni and catapult use fixed 199 critical without adding hp',()=>{
    const cases=[['zomboni',1350,1151],['catapult',650,451]];
    for(const [type,total,noncritical] of cases){
      const z=makeZombie(type,0,8,{variant:false});
      eq(z.maxHp,total,`${type} body total`);
      eq(z.hp,total,`${type} current body`);
      eq(z.crit,199,`${type} fixed critical`);
      eq(z.maxHp-z.crit,noncritical,`${type} noncritical`);
      ok(!z.noCrit,`${type} critical enabled`);
      ok(z.s7UsesCriticalSplit,`${type} split flag`);
    }
  });
  test('fixed vehicle critical refresh remains 199 at normal totals',()=>{
    for(const type of ['zomboni','catapult']){
      const z=makeZombie(type,0,8,{variant:false});
      z.maxHp+=100; z.hp=z.maxHp; s7RefreshZombieCriticalSplit(z);
      eq(z.crit,199,`${type} refreshed fixed critical`);
    }
  });
  test('fixed vehicles enter critical state at 199 on damage',()=>{
    if(!state) newState(false);
    for(const type of ['zomboni','catapult']){
      state.zombies.length=0;
      const z=makeZombie(type,0,5,{variant:false});
      state.zombies.push(z);
      damageZombie(z,100000,{noSource:true});
      eq(z.hp,199,`${type} critical stop hp`);
      ok(z.dying,`${type} dying state`);
      ok(!z.dead,`${type} not immediately dead`);
    }
  });
  test('fractional fixed vehicle never raises hp at critical entry',()=>{
    if(!state) newState(false);
    const z=makeZombie('catapult',0,5,{variant:false});
    s7ApplyHpFraction(z,1);
    eq(z.maxHp,130,'catapult 1/5 total preserved');
    eq(z.crit,129,'catapult low-total safety threshold');
    state.zombies.length=0; state.zombies.push(z);
    damageZombie(z,100000,{noSource:true});
    eq(z.hp,129,'catapult low-total critical stop');
    ok(z.dying,'catapult low-total dying');
  });
  test('blind box body and roadblock armor',()=>{
    const z=makeBlind(0,8);
    eq(z.maxHp,270,'blind body total');
    eq(z.hp,270,'blind current body');
    eq(z.crit,90,'blind critical');
    eq(z.maxHp-z.crit,180,'blind noncritical');
    eq(z.armors.length,1,'blind armor layers');
    eq(z.armors[0].max,370,'blind armor max');
    eq(z.armors[0].hp,370,'blind armor current');
  });
  test('command special blind armor remains separate',()=>{
    const z=makeBlind(0,8,{armorHp:S7_COMMAND_BLIND_BOX_ARMOR_HP});
    eq(z.armors[0].max,1,'command special armor');
    eq(z.maxHp,270,'command blind body');
    eq(z.crit,90,'command blind critical');
  });
  test('variant body rewrites refresh critical split',()=>{
    const cases=[['pole',640,213],['dolphin',500,166],['balloon',350,116],['bobsledSled',600,200],['newspaper',600,200]];
    for(const [type,total,crit] of cases){
      const z=makeZombie(type,0,8,{variant:true});
      eq(z.maxHp,total,`${type} variant total`);
      eq(z.crit,crit,`${type} variant crit`);
    }
  });
  test('fractional hp uses resulting body total',()=>{
    const z=makeZombie('normal',0,8,{variant:false});
    s7ApplyHpFraction(z,4);
    eq(z.maxHp,216,'4/5 total');
    eq(z.crit,72,'4/5 crit');
    eq(z.maxHp-z.crit,144,'4/5 noncritical');
  });
  test('dynamic body bonus refresh helper',()=>{
    const z=makeZombie('imp',0,8,{variant:false});
    z.hp+=150; z.maxHp+=150; s7RefreshZombieCriticalSplit(z);
    eq(z.maxHp,420,'imp bonus total');
    eq(z.crit,140,'imp bonus crit');
  });
  test('damage enters critical phase at new threshold',()=>{
    if(!state) newState(false);
    state.zombies.length=0;
    const z=makeZombie('normal',0,5,{variant:false});
    state.zombies.push(z);
    damageZombie(z,1000,{noSource:true});
    eq(z.hp,90,'critical stop hp');
    ok(z.dying,'critical dying state');
    ok(!z.dead,'not immediately dead');
  });
  window.__criticalSplitResults=results;
})();
</script>
'''
html = html.replace('</body>', script + '\n</body>')
with sync_playwright() as p:
    browser = launch_chromium(p, headless=True, args=['--no-sandbox','--disable-gpu'])
    page = browser.new_page()
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    open_standalone_page(page, html)
    page.wait_for_function('window.__criticalSplitResults !== undefined', timeout=120000)
    results=page.evaluate('window.__criticalSplitResults')
    browser.close()
report={'ok':all(x.get('ok') for x in results) and not errors,'tests':results,'pageErrors':errors}
OUT.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if not report['ok']:
    raise SystemExit(1)
