import json
import os
import sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def table_prelude():
    with open(os.path.join(ROOT, "av3", "noise.json"), encoding="utf-8") as f:
        noise = json.load(f)
    return "window.AV3_NOISE=" + json.dumps(noise, separators=(",", ":")) + ";\n"
def build():
    dist = os.path.join(ROOT, "dist")
    os.makedirs(dist, exist_ok=True)
    parts = [table_prelude()]
    for name in ("core.js", "v3crypto.js", "renderer.js"):
        with open(os.path.join(ROOT, "src", name), encoding="utf-8") as f:
            parts.append(f.read().rstrip() + "\n")
    out = os.path.join(dist, "renderer.js")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        for s in parts:
            f.write(s if s.endswith("\n") else s + "\n")
    print(f"built {out} ({os.path.getsize(out)} bytes)")
    with open(os.path.join(ROOT, "src", "bootstrap.js"), encoding="utf-8") as f:
        boot = f.read()
    with open(os.path.join(dist, "bootstrap.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(boot.rstrip() + "\n")
    print(f"built {os.path.join(dist, 'bootstrap.js')}")
    return 0
if __name__ == "__main__":
    sys.exit(build())