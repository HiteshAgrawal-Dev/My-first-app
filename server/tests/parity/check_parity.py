"""Python <-> TypeScript commerce parity check.

Builds a deterministic set of cases (quote / fit / delivery / search / products), runs them
through the live FastAPI app (fresh temp DB, so stock == catalog stock) and through
``web/src/lib/commerce.ts`` (bundled with esbuild from web/node_modules, executed by node),
then compares the JSON field-for-field.

    cd server && python tests/parity/check_parity.py        # exit code 0 == identical
"""

from __future__ import annotations

import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlencode

HERE = Path(__file__).resolve().parent
SERVER = HERE.parents[1]
REPO = SERVER.parent
WEB = REPO / "web"
TS_ENTRY = WEB / "src" / "lib" / "commerce.ts"
ESBUILD = WEB / "node_modules" / ".bin" / "esbuild"

sys.path.insert(0, str(SERVER))


def tooling_available() -> bool:
    return shutil.which("node") is not None and ESBUILD.exists() and TS_ENTRY.exists()


def build_cases() -> list[dict]:
    from app.commerce import load_catalog

    cat = load_catalog()
    rnd = random.Random(20261121)
    prods = cat["products"]
    cases: list[dict] = []

    # ---- quotes: hand-picked edge cases
    hoodie = {"id": "vl-m-hoodie-01", "size": "M", "color": "Bone", "qty": 1}
    tee = {"id": "vl-w-tee-01", "size": "S", "color": "Oxblood", "qty": 1}
    edge = [
        ([], None, "upi", "standard"),
        ([], "ATELIER10", "cod", "express"),
        ([hoodie], None, "upi", "standard"),
        ([hoodie], "atelier10", "card", "standard"),
        ([hoodie], " FirstFit ", "upi", "express"),
        ([tee], "FIRSTFIT", "upi", "standard"),  # min subtotal error
        ([tee], "PREPAID5", "cod", "standard"),  # prepaid + COD error
        ([tee], "PREPAID5", "upi", "standard"),
        ([tee], "NOPE", "upi", "standard"),
        ([tee], "", "cod", "standard"),
        ([{**tee, "qty": 2}], None, "upi", "standard"),  # 5980 -> free shipping
        ([{"id": "vl-m-tee-01", "size": "L", "color": "Bone", "qty": 1}, {"id": "vl-w-tee-01", "size": "XS", "color": "Onyx Velour", "qty": 1}], "ATELIER10", "upi", "standard"),  # 6480 -> 5832
        ([{"id": "vl-m-cargo-01", "size": "M", "color": "Kyoto Moss", "qty": 1}], "ATELIER10", "upi", "standard"),  # 6490-649=5841 free
        ([{"id": "vl-w-cargo-01", "size": "M", "color": "Bone", "qty": 1}], "FIRSTFIT", "upi", "standard"),  # 6290 < 7000
        ([{"id": "vl-d-corset-01", "size": "M", "color": "Oxblood", "qty": 3}], None, "upi", "standard"),  # stock 1 -> inStock false
        ([{"id": "vl-m-puffer-01", "size": "XXL", "color": "Shibuya Cobalt", "qty": 1}], None, "card", "express"),  # stock 0
        ([{"id": "vl-m-hoodie-01", "size": "XXL", "color": "Oxblood", "qty": 2}, {"id": "vl-m-hoodie-01", "size": "XXL", "color": "Bone", "qty": 1}], None, "upi", "standard"),  # aggregated 3 > 2
        ([{"id": "vl-m-hoodie-01", "size": "M", "color": "Bone", "qty": 10}], "FIRSTFIT", "cod", "express"),
        ([{"id": "nope", "size": "M", "color": "Bone", "qty": 1}], None, "upi", "standard"),
        ([{"id": "vl-m-hoodie-01", "size": "XXXL", "color": "Bone", "qty": 1}], None, "upi", "standard"),
        ([{"id": "vl-m-hoodie-01", "size": "M", "color": "Pink", "qty": 1}], None, "upi", "standard"),
        ([{"id": "vl-m-hoodie-01", "size": "M", "color": "Bone", "qty": 0}], None, "upi", "standard"),
        ([{"id": "vl-m-hoodie-01", "size": "M", "color": "Bone", "qty": 11}], None, "upi", "standard"),
    ]
    for items, promo, pay, ship in edge:
        cases.append({"kind": "quote", "items": items, "promo": promo, "payment": pay, "shipping": ship})

    # ---- quotes: random baskets
    codes = [None, "ATELIER10", "prepaid5", "FIRSTFIT", "firstfit", "BOGUS"]
    for _ in range(120):
        items = []
        for _ in range(rnd.randint(1, 4)):
            p = rnd.choice(prods)
            items.append({"id": p["id"], "size": rnd.choice(p["sizes"]), "color": rnd.choice(p["colors"])["name"], "qty": rnd.randint(1, 3)})
        cases.append({"kind": "quote", "items": items, "promo": rnd.choice(codes),
                      "payment": rnd.choice(["upi", "card", "cod"]), "shipping": rnd.choice(["standard", "express"])})

    # ---- fit
    fit_edge = [
        {"heightCm": 170},
        {"heightCm": 162},  # XS/S overlap
        {"heightCm": 161.5, "preference": "snug"},
        {"heightCm": 150},
        {"heightCm": 200, "preference": "relaxed"},
        {"heightCm": 175, "weightKg": 95},
        {"heightCm": 175, "weightKg": 50},
        {"heightCm": 180, "chestCm": 104},
        {"heightCm": 180, "chestCm": 88},
        {"heightCm": 180, "chestCm": 126},
        {"heightCm": 180, "chestCm": 70},
        {"heightCm": 180, "chestCm": 140, "preference": "relaxed"},
        {"heightCm": 170, "shoulderCm": 47},
        {"heightCm": 170, "shoulderCm": 44},
        {"heightCm": 170, "preference": "relaxed", "productId": "vl-m-hoodie-01"},
        {"heightCm": 170, "preference": "relaxed", "productId": "vl-m-cargo-01"},
        {"heightCm": 170, "preference": "relaxed", "garment": "puffer"},
        {"heightCm": 170, "preference": "relaxed", "garment": "corset"},
        {"heightCm": 170, "garment": "kilt"},
        {"heightCm": 170, "productId": "nope"},
        {"heightCm": 100},
        {"heightCm": 170, "weightKg": 10},
        {"heightCm": 170, "chestCm": 200},
        {"heightCm": 170, "shoulderCm": 90},
        {"heightCm": 120, "preference": "snug"},
        {"heightCm": 230, "weightKg": 250, "shoulderCm": 70, "preference": "relaxed"},
    ]
    for inp in fit_edge:
        cases.append({"kind": "fit", "input": inp})
    garments = [None, "hoodie", "tee", "cargo", "puffer", "blazer", "corset"]
    for _ in range(250):
        inp: dict = {"heightCm": rnd.choice([rnd.randint(140, 205), round(rnd.uniform(150, 200), 1)])}
        if rnd.random() < 0.5:
            inp["weightKg"] = rnd.randint(40, 120)
        if rnd.random() < 0.35:
            inp["chestCm"] = rnd.choice([rnd.randint(75, 135), round(rnd.uniform(80, 130), 1)])
        if rnd.random() < 0.35:
            inp["shoulderCm"] = rnd.randint(38, 58)
        inp["preference"] = rnd.choice(["true", "relaxed", "snug"])
        r = rnd.random()
        if r < 0.3:
            inp["productId"] = rnd.choice(prods)["id"]
        elif r < 0.6:
            g = rnd.choice(garments)
            if g:
                inp["garment"] = g
        cases.append({"kind": "fit", "input": inp})

    # ---- delivery
    pins = ["110001", "400050", "560034", "600001", "700019", "500081", "411001", "380015",
            "122002", "302001", "682001", "834001", "781001", "248001", "900001", "012345",
            "12345", "1234567", "abcdef", "40005a"]
    pins += [str(rnd.randint(100000, 999999)) for _ in range(60)]
    for pin in pins:
        cases.append({"kind": "delivery", "pincode": pin})

    # ---- search
    queries = ["", "hoodie", "hoodei", "hoo", "pants", "trousers", "jacket", "jaket", "sweatshirt",
               "t-shirt", "tshirt", "T Shirts", "corset", "black hoodie", "red corset", "oxblod", "500gsm",
               "women puffer", "mens tee", "drops", "zip", "tokyo steel", "velour", "xyzzy", "a",
               "parachute cargo", "blazr", "cobalt", "ivory blazer", "wool", "limited drop", "Saffron!!"]
    for q in queries:
        cases.append({"kind": "search", "q": q})

    # ---- product listings
    for dept in [None, "men", "women", "drops"]:
        for sort in ["featured", "price-asc", "price-desc", "rating", "new"]:
            cases.append({"kind": "products", "query": {"dept": dept, "sort": sort}})
    for garment in ["hoodie", "cargo", "corset", "nothing"]:
        cases.append({"kind": "products", "query": {"garment": garment, "sort": "price-asc"}})
    for q in ["hoodie", "jacket", "black", "oxblod", "zzz"]:
        cases.append({"kind": "products", "query": {"q": q, "sort": "featured"}})
        cases.append({"kind": "products", "query": {"q": q, "dept": "men", "sort": "rating"}})
    for pid in ["vl-m-hoodie-01", "vl-d-cargo-01", "missing"]:
        cases.append({"kind": "product", "id": pid})
    return cases


def run_python(cases: list[dict]) -> list[dict]:
    from fastapi.testclient import TestClient
    from app.main import create_app

    tmp = tempfile.mkdtemp(prefix="veloura-parity-")
    client = TestClient(create_app(db_path=os.path.join(tmp, "parity.db"), static_dir=os.path.join(tmp, "nostatic")))
    out = []
    for c in cases:
        k = c["kind"]
        if k == "quote":
            r = client.post("/api/cart/quote", json={"items": c["items"], "promo": c["promo"], "payment": c["payment"], "shipping": c["shipping"]})
        elif k == "fit":
            r = client.post("/api/fit/recommend", json=c["input"])
        elif k == "delivery":
            r = client.get(f"/api/delivery/{c['pincode']}")
        elif k == "search":
            r = client.get("/api/search?" + urlencode({"q": c["q"]}))
        elif k == "products":
            params = {key: v for key, v in c["query"].items() if v is not None}
            r = client.get("/api/products?" + urlencode(params))
        elif k == "product":
            r = client.get(f"/api/products/{c['id']}")
        else:
            raise ValueError(k)
        if r.status_code == 200:
            out.append({"ok": True, "value": r.json()})
        else:
            out.append({"ok": False, "status": r.status_code, "message": r.json().get("detail")})
    shutil.rmtree(tmp, ignore_errors=True)
    return out


def run_ts(cases: list[dict]) -> list[dict]:
    tmp = Path(tempfile.mkdtemp(prefix="veloura-parity-ts-"))
    try:
        bundle = tmp / "commerce.bundle.mjs"
        subprocess.run(
            [str(ESBUILD), str(TS_ENTRY), "--bundle", "--format=esm", "--platform=node", "--log-level=warning", f"--outfile={bundle}"],
            check=True, cwd=WEB,
        )
        cases_file = tmp / "cases.json"
        cases_file.write_text(json.dumps(cases), encoding="utf-8")
        res = subprocess.run(["node", str(HERE / "run_ts.mjs"), str(bundle), str(cases_file)],
                             check=True, capture_output=True, text=True)
        return json.loads(res.stdout)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def diff(a, b, path="$") -> list[str]:
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f"{path}.{k}: only in {'python' if k in a else 'ts'}")
            else:
                out += diff(a[k], b[k], f"{path}.{k}")
        return out
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{path}: length {len(a)} (py) != {len(b)} (ts)"]
        out = []
        for i, (x, y) in enumerate(zip(a, b)):
            out += diff(x, y, f"{path}[{i}]")
        return out
    if type(a) is not type(b) and not (isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool)):
        return [f"{path}: {a!r} (py) != {b!r} (ts)"]
    return [] if a == b else [f"{path}: {a!r} (py) != {b!r} (ts)"]


def main() -> int:
    if not tooling_available():
        print("parity: node or web/node_modules/.bin/esbuild not available — skipped")
        return 0
    cases = build_cases()
    py = run_python(cases)
    ts = run_ts(cases)
    failures = 0
    by_kind: dict[str, list[int]] = {}
    for c, a, b in zip(cases, py, ts):
        d = diff(a, b)
        stats = by_kind.setdefault(c["kind"], [0, 0])
        stats[0] += 1
        if d:
            failures += 1
            stats[1] += 1
            if failures <= 15:
                print(f"MISMATCH {c['kind']}: {json.dumps(c)}")
                for line in d[:8]:
                    print("   ", line)
    summary = ", ".join(f"{k}: {n - f}/{n}" for k, (n, f) in by_kind.items())
    errors = sum(1 for a in py if not a["ok"])
    print(f"parity: {len(cases) - failures}/{len(cases)} cases identical ({summary}); {errors} were error cases")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
