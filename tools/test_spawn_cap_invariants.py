"""Verify that the 1.2.2 spawn/cap contract remains byte-for-byte unchanged."""
from __future__ import annotations
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "updateSpawnForLane": "c3363ec0f29de664a4835248270dd996a39f87cccb39b7d5211da3f90d9deaa0",
    "s7SpawnInterval": "d6a4042062f75e630ddf08572ab62dd8ac3f4b942980e097fdd97a634848fd57",
    "S7_RULES_object": "814cab02b66e0967279fbed7327c0bd688320a2183e47820b29a7775167059b4",
    "PERF_object": "946c8194470c9bd959245cf35f4539a02ea5060d230be03009cdd5aa947abcd0",
}

def extract_balanced(text: str, start: int, open_ch: str = "{", close_ch: str = "}") -> str:
    op = text.find(open_ch, start)
    if op < 0:
        raise ValueError("opening delimiter not found")
    depth = 0
    mode = "code"
    quote = ""
    escaped = False
    i = op
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if mode == "code":
            if ch in "'\"`":
                mode, quote, escaped = "string", ch, False
            elif ch == "/" and nxt == "/":
                mode = "line_comment"
                i += 1
            elif ch == "/" and nxt == "*":
                mode = "block_comment"
                i += 1
            elif ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        elif mode == "string":
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                mode = "code"
        elif mode == "line_comment":
            if ch == "\n":
                mode = "code"
        elif mode == "block_comment" and ch == "*" and nxt == "/":
            mode = "code"
            i += 1
        i += 1
    raise ValueError("unterminated block")

def extract_function(text: str, name: str) -> str:
    marker = f"function {name}("
    start = text.find(marker)
    if start < 0:
        raise ValueError(f"missing function {name}")
    return extract_balanced(text, start)

def extract_object(text: str, marker: str) -> str:
    start = text.find(marker)
    if start < 0:
        raise ValueError(f"missing object {marker}")
    return extract_balanced(text, start)

def sha(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()

zombie_source = (ROOT / "src/js/60_zombie_simulation.js").read_text()
blind_source = (ROOT / "src/js/94_s7_blind_commands_main.js").read_text()
config_source = (ROOT / "src/js/20_config_rules.js").read_text()
bootstrap_source = (ROOT / "src/js/00_bootstrap.js").read_text()
actual = {
    "updateSpawnForLane": sha(extract_function(zombie_source, "updateSpawnForLane")),
    "s7SpawnInterval": sha(extract_function(blind_source, "s7SpawnInterval")),
    "S7_RULES_object": sha(extract_object(config_source, "const S7_RULES = Object.freeze(")),
    "PERF_object": sha(extract_object(bootstrap_source, "const PERF = {")),
}
results = {key: {"expected": EXPECTED[key], "actual": actual[key], "equal": EXPECTED[key] == actual[key]} for key in EXPECTED}
results["MAX_ZOMBIES"] = {
    "value": 65536,
    "equal": "MAX_ZOMBIES: 2 ** 16" in bootstrap_source,
}
report = {"ok": all(item["equal"] for item in results.values()), "results": results}
out = ROOT / "dist/2026-08-04_spawn_and_cap_invariant.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False, indent=2))
if not report["ok"]:
    raise SystemExit(1)
