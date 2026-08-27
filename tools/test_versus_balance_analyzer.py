#!/usr/bin/env python3
import json, random, tempfile
from pathlib import Path
from versus_balance_analyzer import analyze
random.seed(7)
rows=[]
# 240 No-BP truth matches. pStrong genuinely adds a large plant-side advantage.
for i in range(240):
    p=["pStrong" if i%2==0 else "pAvg", "p1","p2","p3","p4"]
    z=["zAvg","z1","z2","z3","z4"]
    prob=.72 if "pStrong" in p else .43
    rows.append({"meta":{"formatId":"versus-nobp-6slot-zfirst-v1","bpEnabled":False,"totalSlots":6,"combatSlots":5,"firstPicker":"zombie","alternating":True},"draft":{"plantCards":p,"zombieCards":z},"result":{"winner":"plant" if random.random()<prob else "zombie"},"config":{"plants":{"pStrong":{"resourceCost":50,"cooldownSeconds":5},"pAvg":{"resourceCost":50,"cooldownSeconds":5}},"zombies":{}}})
# 120 BP matches always ban pStrong; these MUST NOT dilute/erase its measured strength.
for i in range(120):
    rows.append({"meta":{"bpEnabled":True,"totalSlots":6,"combatSlots":5},"draft":{"plantCards":["pAvg","p1","p2","p3","p4"],"zombieCards":["zAvg","z1","z2","z3","z4"],"plantBans":["pStrong"],"zombieBans":["zWeak"]},"result":{"winner":"plant" if random.random()<.50 else "zombie"}})
r=analyze(rows)
assert r["strength"]["truthMatches"]==240
assert r["bpResilience"]["matches"]==120
assert r["bpResilience"]["usedForStrengthFit"] is False
assert r["strength"]["plantCards"]["pStrong"]["adjustedOwnSideMarginalWinPp"] > 3.0, r["strength"]["plantCards"]["pStrong"]
assert r["bpResilience"]["plantCardsBanned"].get("pStrong")==120
print("Versus balance analyzer tests: PASS")
print("BP ban masking test: PASS — pStrong remains flagged from No-BP truth data")
