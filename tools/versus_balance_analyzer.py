#!/usr/bin/env python3
"""Analyze S7 Versus telemetry without letting BP hide true card strength.

Truth samples are ONLY the canonical format:
No-BP / 6 slots / fixed economy cores / Zombie first / 5 alternating public picks.
BP samples are reported separately as resilience data and never enter strength fitting.
"""
from __future__ import annotations
import argparse, json, math, sys
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression

FORMAT_ID = "versus-nobp-6slot-zfirst-v1"

def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, x))))

def telemetry_class(row: dict) -> str:
    m = row.get("meta", {}) or {}
    if m.get("formatId") == FORMAT_ID:
        return "strength_truth"
    if m.get("bpEnabled") is False and int(m.get("totalSlots", 0) or 0) == 6 and int(m.get("combatSlots", m.get("draftedCombatSlots", 0)) or 0) == 5 and m.get("firstPicker") == "zombie" and m.get("alternating") is True:
        return "strength_truth"
    if m.get("bpEnabled") is True:
        return "bp_resilience"
    return "excluded_other_format"

def load_rows(path: Path):
    rows=[]
    for i,line in enumerate(path.read_text(encoding="utf-8").splitlines(),1):
        line=line.strip()
        if not line: continue
        try: rows.append(json.loads(line))
        except Exception as e: raise SystemExit(f"JSONL line {i}: {e}")
    return rows

def own_card_lists(row):
    d=row.get("draft",{}) or {}
    return list(d.get("plantCards",[]) or []), list(d.get("zombieCards",[]) or [])

def source_weight(row):
    source=str((row.get("meta",{}) or {}).get("agentSource", "bot"))
    return {"human":3.0,"llm":2.5,"human_llm":2.5,"bot":1.0,"selfplay":1.0}.get(source,1.0)

def fit_strength(rows):
    truth=[r for r in rows if telemetry_class(r)=="strength_truth" and (r.get("result",{}) or {}).get("winner") in ("plant","zombie")]
    plant_cards=sorted({c for r in truth for c in own_card_lists(r)[0]})
    zombie_cards=sorted({c for r in truth for c in own_card_lists(r)[1]})
    names=[f"plant:{c}" for c in plant_cards]+[f"zombie:{c}" for c in zombie_cards]
    ix={n:i for i,n in enumerate(names)}
    X=np.zeros((len(truth),len(names)),dtype=float)
    y=np.zeros(len(truth),dtype=int)
    w=np.ones(len(truth),dtype=float)
    support=Counter()
    rawwins=defaultdict(lambda:[0,0])
    for r_i,r in enumerate(truth):
        pc,zc=own_card_lists(r)
        for c in pc: X[r_i,ix[f"plant:{c}"]]=1; support[f"plant:{c}"]+=1
        for c in zc: X[r_i,ix[f"zombie:{c}"]]=1; support[f"zombie:{c}"]+=1
        plantwin=(r["result"]["winner"]=="plant"); y[r_i]=int(plantwin); w[r_i]=source_weight(r)
        for c in pc: rawwins[f"plant:{c}"][0]+=int(plantwin); rawwins[f"plant:{c}"][1]+=1
        for c in zc: rawwins[f"zombie:{c}"][0]+=int(not plantwin); rawwins[f"zombie:{c}"][1]+=1
    out={"truthMatches":len(truth),"plantCards":{},"zombieCards":{}}
    if len(truth)<20 or len(set(y.tolist()))<2 or not names:
        out["warning"]="Too few truth matches for adjusted logistic fit (need >=20 and both winners)."
        coef=np.zeros(len(names)); intercept=math.log((y.sum()+1)/(len(y)-y.sum()+1)) if len(y) else 0
    else:
        model=LogisticRegression(C=0.35, solver="liblinear", max_iter=300, fit_intercept=True)
        model.fit(X,y,sample_weight=w)
        coef=model.coef_[0]; intercept=float(model.intercept_[0])
    base=sigmoid(intercept)
    for n,c in zip(names,coef):
        side,card=n.split(":",1)
        plant_delta=sigmoid(intercept+float(c))-base
        own_delta=plant_delta if side=="plant" else -plant_delta
        rw=rawwins[n]
        entry={
            "support":int(support[n]),
            "rawOwnSideWinRate": (rw[0]/rw[1]) if rw[1] else None,
            "adjustedOwnSideMarginalWinPp": round(own_delta*100,3),
            "modelCoefficient":round(float(c),5),
        }
        out["plantCards" if side=="plant" else "zombieCards"][card]=entry
    out["plantSideWinRate"]=float(y.mean()) if len(y) else None
    out["weightedSampleCount"]=float(w.sum()) if len(w) else 0
    return out, truth

def config_lookup(truth):
    # newest truth match with config wins; telemetry captures the actual parameters used.
    for r in reversed(truth):
        cfg=r.get("config") or {}
        if cfg: return cfg
    return {}

def recommend(strength, cfg):
    rec=[]
    for side,key in (("plant","plantCards"),("zombie","zombieCards")):
        table=(cfg.get("plants") if side=="plant" else cfg.get("zombies")) or {}
        for card,e in strength.get(key,{}).items():
            pp=float(e["adjustedOwnSideMarginalWinPp"]); n=int(e["support"])
            if n<25 or abs(pp)<1.0: continue
            cur=table.get(card,{})
            cost=int(cur.get("resourceCost",0) or 0); cd=float(cur.get("cooldownSeconds",0) or 0)
            direction="nerf" if pp>0 else "buff"
            mag=abs(pp)
            cost_step=25 if mag<3.5 else 50
            new_cost=max(0,cost+(cost_step if direction=="nerf" else -cost_step)) if cost else None
            cd_factor=(1.06 if direction=="nerf" else 0.94) if mag<3.5 else (1.10 if direction=="nerf" else 0.90)
            new_cd=round(max(0.5,cd*cd_factor),2) if cd else None
            rec.append({"side":side,"card":card,"support":n,"marginalWinPp":pp,"direction":direction,"currentCost":cost or None,"candidateCost":new_cost,"currentCooldown":cd or None,"candidateCooldown":new_cd,"note":"candidate only; must pass paired holdout before acceptance"})
    rec.sort(key=lambda x:abs(x["marginalWinPp"]),reverse=True)
    return rec

def bp_report(rows):
    bp=[r for r in rows if telemetry_class(r)=="bp_resilience"]
    bans={"plant":Counter(),"zombie":Counter()}; picks={"plant":Counter(),"zombie":Counter()}
    for r in bp:
        d=r.get("draft",{}) or {}
        for c in d.get("plantBans",[]) or []: bans["plant"][c]+=1
        for c in d.get("zombieBans",[]) or []: bans["zombie"][c]+=1
        for c in d.get("plantCards",[]) or []: picks["plant"][c]+=1
        for c in d.get("zombieCards",[]) or []: picks["zombie"][c]+=1
    return {"matches":len(bp),"plantCardsBanned":dict(bans["plant"].most_common()),"zombieCardsBanned":dict(bans["zombie"].most_common()),"plantCardsPicked":dict(picks["plant"].most_common()),"zombieCardsPicked":dict(picks["zombie"].most_common()),"usedForStrengthFit":False}

def markdown(report):
    s=report["strength"]
    lines=["# S7 Versus Balance Analyzer", "", "## 数据隔离", f"- 真实强度样本（No-BP 6槽）：**{s['truthMatches']}**", f"- BP韧性样本：**{report['bpResilience']['matches']}**（**不参与**强度拟合）", f"- 其他赛制排除：**{report['excludedMatches']}**", ""]
    if s.get("plantSideWinRate") is not None: lines += [f"- No-BP植物方胜率：**{s['plantSideWinRate']*100:.2f}%**", ""]
    lines += ["## 最强离群卡（调整后边际胜率）", "", "| 阵营 | 卡牌 | 样本 | 边际胜率(pp) |", "|---|---|---:|---:|"]
    rows=[]
    for side,key in (("植物","plantCards"),("僵尸","zombieCards")):
        for c,e in s.get(key,{}).items(): rows.append((abs(e['adjustedOwnSideMarginalWinPp']),side,c,e))
    for _,side,c,e in sorted(rows,reverse=True)[:20]: lines.append(f"| {side} | {c} | {e['support']} | {e['adjustedOwnSideMarginalWinPp']:+.2f} |")
    lines += ["", "## 候选调参（必须经过配对Holdout验证后才能接受）", ""]
    for r in report["recommendations"][:20]: lines.append(f"- {r['side']} `{r['card']}`：{r['marginalWinPp']:+.2f}pp，{r['direction']}；成本 {r['currentCost']}→{r['candidateCost']}，CD {r['currentCooldown']}→{r['candidateCooldown']}")
    lines += ["", "## BP只作为保险丝", "", "BP数据仅用于观察Ban是否能压制极端组合，不得用于证明某张卡已经平衡。"]
    return "\n".join(lines)+"\n"

def analyze(rows):
    strength,truth=fit_strength(rows)
    cfg=config_lookup(truth)
    return {"schemaVersion":1,"truthFormat":FORMAT_ID,"strength":strength,"bpResilience":bp_report(rows),"excludedMatches":sum(telemetry_class(r)=="excluded_other_format" for r in rows),"recommendations":recommend(strength,cfg)}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("input",type=Path)
    ap.add_argument("--json",dest="json_out",type=Path)
    ap.add_argument("--md",dest="md_out",type=Path)
    args=ap.parse_args()
    rows=load_rows(args.input); report=analyze(rows)
    text=json.dumps(report,ensure_ascii=False,indent=2)
    if args.json_out: args.json_out.write_text(text+"\n",encoding="utf-8")
    if args.md_out: args.md_out.write_text(markdown(report),encoding="utf-8")
    if not args.json_out and not args.md_out: print(text)
    print(f"truth={report['strength']['truthMatches']} bp={report['bpResilience']['matches']} excluded={report['excludedMatches']}",file=sys.stderr)
if __name__=="__main__": main()
