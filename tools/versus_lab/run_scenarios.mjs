// Runs all rule scenarios in the headless real-core VM and asserts expectations.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createS7HeadlessRuntime} from './headless_runtime.mjs';
import {SCENARIOS} from './scenarios.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = fs.readFileSync(path.join(HERE, 'scenario_engine.js'), 'utf8');

export function runScenarioHeadless(spec){
  const rt = createS7HeadlessRuntime();
  rt._eval(ENGINE);
  return rt._eval(`__VERSUS_SCENARIO_RUN(${JSON.stringify(spec)})`);
}

function checkExpect(spec, res){
  const failures = [];
  for (const [k, v] of Object.entries(spec.expect || {})){
    const actual = res.probes[k];
    if (actual !== v) failures.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual)}`);
  }
  for (const [k, v] of Object.entries(spec.expectMin || {})){
    const actual = Number(res.probes[k]);
    if (!(actual >= v)) failures.push(`${k}: expected >= ${v}, got ${JSON.stringify(res.probes[k])}`);
  }
  for (const [k, v] of Object.entries(spec.expectMax || {})){
    const actual = Number(res.probes[k]);
    if (!(actual <= v)) failures.push(`${k}: expected <= ${v}, got ${JSON.stringify(res.probes[k])}`);
  }
  return failures;
}

const isMain = process.argv[1] && process.argv[1].endsWith('run_scenarios.mjs');
if (isMain){
  const out = [];
  let failed = 0;
  for (const spec of SCENARIOS){
    const res = runScenarioHeadless(spec);
    const failures = checkExpect(spec, res);
    out.push({name: spec.name, time: res.time, result: res.result, probes: res.probes, failures});
    if (failures.length){ failed++; console.log(`FAIL ${spec.name}`); for (const f of failures) console.log('  ' + f); }
    else console.log(`PASS ${spec.name} (t=${res.time}s)`);
  }
  const outDir = path.resolve(HERE, '../../dist/versus_lab');
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(path.join(outDir, 'headless_scenarios.json'), JSON.stringify(out, null, 2));
  console.log(failed ? `SCENARIOS_FAIL ${failed}/${SCENARIOS.length}` : `SCENARIOS_ALL_PASS ${SCENARIOS.length}/${SCENARIOS.length}`);
  process.exit(failed ? 1 : 0);
}
