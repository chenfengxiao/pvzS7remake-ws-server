#!/usr/bin/env python3
# 把平衡候选（candidate_overrides.json）真实写回 99 CARDS（运行时 owner）与 22 profile（展示层）。
# 灰烬锁定值绝不被覆盖（求解器也不该产出，双保险）。
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCKED = {'cherrybomb': 150, 'jalapeno': 125, 'doomshroom': 200}

def main(candidate_path):
    ov = json.loads(Path(candidate_path).read_text(encoding='utf-8'))
    p99 = ROOT / 'src/js/99_versus_battle_controller.js'
    t = p99.read_text(encoding='utf-8')
    changes = []
    for side in ('plant', 'zombie'):
        for card_id, delta in (ov.get(side) or {}).items():
            if card_id in LOCKED and side == 'plant':
                continue  # 锁定卡不写
            cost = delta.get('cost')
            cd = delta.get('cd')
            # CARDS 条目形式: "id":{"cost":N,"cd":M,...}
            pat = re.compile(r'("' + re.escape(card_id) + r'":\{"cost":)(\d+)(,"cd":)([\d.]+)(.*?\})')
            m = pat.search(t)
            if not m:
                print(f'WARN: {side}:{card_id} not found in 99 CARDS, skipped')
                continue
            old_cost, old_cd = m.group(2), m.group(4)
            new_cost = str(int(cost)) if cost is not None else old_cost
            new_cd = str(cd) if cd is not None else old_cd
            if new_cost != old_cost or new_cd != old_cd:
                t = t[:m.start()] + m.group(1) + new_cost + m.group(3) + new_cd + m.group(5) + t[m.end():]
                changes.append(f'{side}.{card_id}: cost {old_cost}->{new_cost}, cd {old_cd}->{new_cd}')
    # 经济核 CD
    rules = ov.get('__rules') or {}
    p22 = ROOT / 'src/js/22_versus_feature_profiles.js'
    t22 = p22.read_text(encoding='utf-8')
    if rules.get('twinCd') is not None:
        t22, n = re.subn(r'twinCooldownSeconds: [\d.]+', f'twinCooldownSeconds: {rules["twinCd"]}', t22)
        if n: changes.append(f'22.twinCooldownSeconds -> {rules["twinCd"]}')
    if rules.get('graveCd') is not None:
        t22, n = re.subn(r'gravestoneCooldownSeconds: [\d.]+', f'gravestoneCooldownSeconds: {rules["graveCd"]}', t22)
        if n: changes.append(f'22.gravestoneCooldownSeconds -> {rules["graveCd"]}')
    p99.write_text(t, encoding='utf-8')
    p22.write_text(t22, encoding='utf-8')
    for c in changes:
        print('WROTE', c)
    print(f'WRITEBACK_DONE {len(changes)} changes')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / 'dist/versus_lab/balance/candidate_overrides.json'))
