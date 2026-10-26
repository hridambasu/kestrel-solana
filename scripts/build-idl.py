#!/usr/bin/env python3
"""Builds target/idl/kestrel.json by running Anchor's IDL print test directly.

Equivalent to `anchor idl build`, but avoids the CLI's toolchain-download step
(useful in CI / offline). Usage: python3 scripts/build-idl.py
"""
import json, os, re, subprocess, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
prog = os.path.join(root, "programs", "kestrel")
env = dict(os.environ, ANCHOR_IDL_BUILD_NO_DOCS="FALSE", ANCHOR_IDL_BUILD_RESOLUTION="TRUE",
           ANCHOR_IDL_BUILD_SKIP_LINT="FALSE", ANCHOR_IDL_BUILD_PROGRAM_PATH=prog, RUSTFLAGS="-A warnings")
out = subprocess.run(["cargo", "test", "__anchor_private_print_idl", "--features", "idl-build", "--",
                      "--show-output", "--quiet"], cwd=prog, env=env, capture_output=True, text=True)
if out.returncode != 0:
    sys.stderr.write(out.stderr); sys.exit(1)

sections = re.findall(r"--- IDL begin (\w+) ---\n(.*?)\n--- IDL end \1 ---", out.stdout, re.S)
idl, events, types, errors, address = None, [], [], [], None
for kind, body in sections:
    if kind == "address":
        address = body.strip()
        while address.startswith('"') or address.startswith('\\'):
            address = address.strip('"').strip('\\')
    elif kind == "program": idl = json.loads(body)
    elif kind == "event":
        e = json.loads(body); events.append(e["event"]); types.extend(e.get("types", []))
    elif kind == "errors": errors = json.loads(body)
idl["address"] = address
idl["events"] = sorted({e["name"]: e for e in idl.get("events", []) + events}.values(), key=lambda e: e["name"])
idl["types"] = sorted({t["name"]: t for t in idl.get("types", []) + types}.values(), key=lambda t: t["name"])
if errors: idl["errors"] = errors
# Strip module paths (`kestrel::state::market_state::Market` -> `Market`), as the Anchor CLI does.
idl = json.loads(re.sub(r'"(?:[A-Za-z_][A-Za-z0-9_]*::)+([A-Za-z_][A-Za-z0-9_]*)"', r'"\1"', json.dumps(idl)))
os.makedirs(os.path.join(root, "target", "idl"), exist_ok=True)
path = os.path.join(root, "target", "idl", "kestrel.json")
json.dump(idl, open(path, "w"), indent=2)
print(f"wrote {path}: {len(idl['instructions'])} instructions, {len(idl.get('accounts', []))} accounts, "
      f"{len(idl['events'])} events, {len(idl.get('errors', []))} errors")
