"""Pure commerce logic for VÉLOURA ATELIER: pricing, promos, fit, search, delivery.

Nothing in this module touches the database or HTTP. Every rule here is mirrored
line-for-line in ``web/src/lib/commerce.ts`` (the offline fallback used by the
storefront), and ``tests/parity`` checks that both produce identical JSON.

Floating point notes (to stay bit-identical with JavaScript):
  * rounding is always ``floor(x * 10**n + 0.5) / 10**n`` (== JS Math.round),
  * money is integer INR throughout,
  * numbers rendered into strings go through :func:`fmt_num`.
"""

from __future__ import annotations

import json
import math
import os
import re
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = Path(os.environ.get("VELOURA_CATALOG", REPO_ROOT / "shared" / "catalog.json"))

PAYMENTS = ("upi", "card", "cod")
SHIPPING_MODES = ("standard", "express")
PREFERENCES = ("true", "relaxed", "snug")
SORTS = ("featured", "price-asc", "price-desc", "rating", "new")
DEPTS = ("men", "women", "drops")
MAX_QTY = 10
ROOMY_FITS = ("Boxy", "Oversized")


class CommerceError(Exception):
    """A business-rule violation. ``status`` maps directly to an HTTP status code."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def load_catalog(path: Path | str | None = None) -> dict[str, Any]:
    with open(path or CATALOG_PATH, encoding="utf-8") as fh:
        return json.load(fh)


# --------------------------------------------------------------------------- helpers

def round_to(x: float, places: int) -> float:
    """Round half up, identical to JavaScript ``Math.round(x * 10**n) / 10**n``."""
    f = 10 ** places
    return math.floor(x * f + 0.5) / f


def fmt_num(x: float | int) -> str:
    """Render a number the way JavaScript's ``String(n)`` does for ordinary values."""
    xf = float(x)
    if xf.is_integer():
        return str(int(xf))
    return repr(xf)


def format_inr(n: int) -> str:
    """₹ with Indian digit grouping (1,23,456). Integer rupees only."""
    neg = n < 0
    s = str(abs(int(n)))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups: list[str] = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups) + "," + tail
    return ("-" if neg else "") + "₹" + s


def _words(text: str) -> list[str]:
    return [w for w in re.split(r"[^a-z0-9]+", text.lower()) if w]


def _find_product(catalog: Mapping[str, Any], product_id: str) -> Optional[dict]:
    for p in catalog["products"]:
        if p["id"] == product_id:
            return p
    return None


StockLookup = Callable[[str, str], int]


def catalog_stock(catalog: Mapping[str, Any]) -> StockLookup:
    """Stock lookup that reads the static catalog (used when no DB is around)."""

    def lookup(pid: str, size: str) -> int:
        p = _find_product(catalog, pid)
        return int(p["stock"].get(size, 0)) if p else 0

    return lookup


# --------------------------------------------------------------------------- difflib port

def seq_ratio(a: str, b: str) -> float:
    """difflib.SequenceMatcher(None, a, b).ratio() — explicit port so the TS twin matches.

    No junk function and inputs are short (< 200 chars) so autojunk never triggers.
    """
    la, lb = len(a), len(b)
    if la + lb == 0:
        return 1.0
    b2j: dict[str, list[int]] = {}
    for j, ch in enumerate(b):
        b2j.setdefault(ch, []).append(j)

    def longest(alo: int, ahi: int, blo: int, bhi: int) -> tuple[int, int, int]:
        besti, bestj, bestsize = alo, blo, 0
        j2len: dict[int, int] = {}
        for i in range(alo, ahi):
            newj2len: dict[int, int] = {}
            for j in b2j.get(a[i], []):
                if j < blo:
                    continue
                if j >= bhi:
                    break
                k = newj2len[j] = j2len.get(j - 1, 0) + 1
                if k > bestsize:
                    besti, bestj, bestsize = i - k + 1, j - k + 1, k
            j2len = newj2len
        while besti > alo and bestj > blo and a[besti - 1] == b[bestj - 1]:
            besti, bestj, bestsize = besti - 1, bestj - 1, bestsize + 1
        while besti + bestsize < ahi and bestj + bestsize < bhi and a[besti + bestsize] == b[bestj + bestsize]:
            bestsize += 1
        return besti, bestj, bestsize

    matches = 0
    queue = [(0, la, 0, lb)]
    while queue:
        alo, ahi, blo, bhi = queue.pop()
        i, j, k = longest(alo, ahi, blo, bhi)
        if k:
            matches += k
            if alo < i and blo < j:
                queue.append((alo, i, blo, j))
            if i + k < ahi and j + k < bhi:
                queue.append((i + k, ahi, j + k, bhi))
    return 2.0 * matches / (la + lb)


# --------------------------------------------------------------------------- search

SYNONYMS: dict[str, list[str]] = {
    "pants": ["cargo"],
    "pant": ["cargo"],
    "trousers": ["cargo"],
    "trouser": ["cargo"],
    "joggers": ["cargo"],
    "jacket": ["puffer", "blazer"],
    "jackets": ["puffer", "blazer"],
    "coat": ["puffer", "blazer"],
    "sweatshirt": ["hoodie"],
    "sweatshirts": ["hoodie"],
    "hoody": ["hoodie"],
    "tshirt": ["tee"],
    "tshirts": ["tee"],
    "tees": ["tee"],
    "corset": ["corset"],
    "corsets": ["corset"],
    # colour words shoppers type -> our colourway names
    "black": ["onyx"],
    "white": ["bone", "ivory"],
    "cream": ["ivory", "bone"],
    "red": ["oxblood"],
    "burgundy": ["oxblood"],
    "maroon": ["oxblood"],
    "blue": ["cobalt"],
    "purple": ["plum"],
    "green": ["moss"],
    "grey": ["steel"],
    "gray": ["steel"],
    "yellow": ["saffron"],
    "orange": ["saffron"],
}
SYNONYM_FUZZY_MIN = 0.85

# (field name, weight). Order matters for tie-breaking and the suggestion vocabulary.
SEARCH_FIELDS: tuple[tuple[str, float], ...] = (
    ("name", 1.0),
    ("garment", 1.0),
    ("tags", 0.9),
    ("colors", 0.8),
    ("material", 0.6),
    ("dept", 0.7),
)
FUZZY_MIN = 0.8
MAX_RESULTS = 8
MAX_SUGGESTIONS = 5
DEFAULT_SUGGESTIONS = ["hoodie", "cargo", "puffer", "corset", "drops"]


def tokenize_query(q: str) -> list[str]:
    s = (q or "").lower().strip()
    s = re.sub(r"\bt[\s-]?shirts?\b", "tee", s)
    return [t for t in re.split(r"[^a-z0-9]+", s) if t][:8]


def _product_fields(p: Mapping[str, Any]) -> list[tuple[list[str], float]]:
    out: list[tuple[list[str], float]] = []
    for field, weight in SEARCH_FIELDS:
        if field == "name":
            words = _words(p["name"])
        elif field == "garment":
            words = _words(p["garment"])
        elif field == "tags":
            words = [w for t in p["tags"] for w in _words(t)]
        elif field == "colors":
            words = [w for c in p["colors"] for w in _words(c["name"])]
        elif field == "material":
            words = _words(p["material"])
        else:
            words = _words(p["dept"])
        out.append((words, weight))
    return out


def _match_word(t: str, w: str) -> float:
    if t == w:
        return 1.0
    if len(t) >= 3 and w.startswith(t):
        return 0.9
    if len(t) >= 3:
        r = seq_ratio(t, w)
        if r >= FUZZY_MIN:
            return r * 0.9
    return 0.0


def _alternatives(t: str) -> list[tuple[str, float]]:
    """The token itself plus synonyms. A typo'd synonym key ("jaket") still expands, at 0.9."""
    alts = [(t, 1.0)]
    if t in SYNONYMS:
        alts += [(syn, 1.0) for syn in SYNONYMS[t]]
    elif len(t) >= 4:
        for key, syns in SYNONYMS.items():
            if seq_ratio(t, key) >= SYNONYM_FUZZY_MIN:
                alts += [(syn, 0.9) for syn in syns]
                break
    return alts


def score_product(tokens: list[str], p: Mapping[str, Any]) -> float:
    if not tokens:
        return 0.0
    fields = _product_fields(p)
    total = 0.0
    for t in tokens:
        best = 0.0
        for alt, factor in _alternatives(t):
            for words, weight in fields:
                for w in words:
                    s = _match_word(alt, w) * weight * factor
                    if s > best:
                        best = s
        total += best
    return round_to(total / len(tokens), 3)


def _vocabulary(catalog: Mapping[str, Any]) -> list[str]:
    seen: set[str] = set()
    vocab: list[str] = []
    for p in catalog["products"]:
        for words, _ in _product_fields(p):
            for w in words:
                if re.fullmatch(r"[a-z]{3,}", w) and w not in seen:
                    seen.add(w)
                    vocab.append(w)
    return vocab


def _correct_token(t: str, vocab: list[str], vocab_set: set[str]) -> str:
    if t in vocab_set or t in SYNONYMS or not re.fullmatch(r"[a-z]+", t):
        return t
    if len(t) >= 2:
        for w in vocab:
            if w.startswith(t):
                return w
    best_w, best_r = t, 0.0
    for w in vocab:
        r = seq_ratio(t, w)
        if r > best_r:
            best_w, best_r = w, r
    return best_w if best_r >= 0.75 else t


def search(catalog: Mapping[str, Any], q: str, decorate: Callable[[dict], dict] = lambda p: p) -> dict:
    tokens = tokenize_query(q)
    if not tokens:
        return {"results": [], "suggestions": list(DEFAULT_SUGGESTIONS)}
    scored = []
    for idx, p in enumerate(catalog["products"]):
        s = score_product(tokens, p)
        if s > 0:
            scored.append((s, idx, p))
    scored.sort(key=lambda x: (-x[0], x[1]))
    top = scored[:MAX_RESULTS]

    suggestions: list[str] = []
    vocab = _vocabulary(catalog)
    vocab_set = set(vocab)
    vocab = vocab + [k for k in SYNONYMS if k not in vocab_set]  # typo'd synonyms correct too
    corrected = " ".join(_correct_token(t, vocab, vocab_set) for t in tokens)
    if corrected != " ".join(tokens):
        suggestions.append(corrected)
    for _, _, p in top:
        if len(suggestions) >= MAX_SUGGESTIONS:
            break
        if p["name"] not in suggestions:
            suggestions.append(p["name"])
    return {
        "results": [{"product": decorate(p), "score": s} for s, _, p in top],
        "suggestions": suggestions,
    }


def list_products(
    catalog: Mapping[str, Any],
    dept: Optional[str] = None,
    garment: Optional[str] = None,
    q: Optional[str] = None,
    sort: str = "featured",
    decorate: Callable[[dict], dict] = lambda p: p,
) -> dict:
    if sort not in SORTS:
        raise CommerceError(422, f"Sort must be one of: {', '.join(SORTS)}")
    if dept and dept not in DEPTS:
        raise CommerceError(422, f"Department must be one of: {', '.join(DEPTS)}")
    tokens = tokenize_query(q or "")
    rows: list[tuple[float, int, dict]] = []
    for idx, p in enumerate(catalog["products"]):
        if dept and p["dept"] != dept:
            continue
        if garment and p["garment"] != garment.lower():
            continue
        s = 0.0
        if tokens:
            s = score_product(tokens, p)
            if s <= 0:
                continue
        rows.append((s, idx, p))

    if sort == "featured":
        if tokens:
            rows.sort(key=lambda r: (-r[0], r[1]))
    elif sort == "price-asc":
        rows.sort(key=lambda r: (r[2]["price"], r[1]))
    elif sort == "price-desc":
        rows.sort(key=lambda r: (-r[2]["price"], r[1]))
    elif sort == "rating":
        rows.sort(key=lambda r: (-r[2]["rating"], -r[2]["reviews"], r[1]))
    elif sort == "new":
        dropped = [r for r in rows if r[2].get("drop")]
        rest = [r for r in rows if not r[2].get("drop")]
        dropped.sort(key=lambda r: r[2]["drop"], reverse=True)  # stable for equal keys
        rows = dropped + rest
    return {"products": [decorate(r[2]) for r in rows]}


# --------------------------------------------------------------------------- pricing

def find_promo(catalog: Mapping[str, Any], code: str) -> Optional[dict]:
    c = code.strip().upper()
    for promo in catalog["promos"]:
        if promo["code"].upper() == c:
            return promo
    return None


def quote_cart(
    catalog: Mapping[str, Any],
    items: Iterable[Mapping[str, Any]],
    promo: Optional[str],
    payment: str,
    shipping: str,
    stock: Optional[StockLookup] = None,
) -> dict:
    if payment not in PAYMENTS:
        raise CommerceError(422, "Payment must be upi, card or cod")
    if shipping not in SHIPPING_MODES:
        raise CommerceError(422, "Shipping must be standard or express")
    stock = stock or catalog_stock(catalog)
    ship = catalog["shipping"]
    items = list(items)

    # Resolve and validate every line first.
    resolved = []
    wanted: dict[tuple[str, str], int] = {}
    for it in items:
        pid, size, color, qty = it["id"], it["size"], it["color"], it["qty"]
        p = _find_product(catalog, pid)
        if p is None:
            raise CommerceError(404, f"We couldn't find product {pid}")
        if size not in p["sizes"]:
            raise CommerceError(422, f"Size {size} isn't available for {p['name']}")
        col = next((c for c in p["colors"] if c["name"].lower() == str(color).strip().lower()), None)
        if col is None:
            raise CommerceError(422, f"{p['name']} doesn't come in {color}")
        if not isinstance(qty, int) or isinstance(qty, bool) or qty < 1 or qty > MAX_QTY:
            raise CommerceError(422, f"Quantity must be between 1 and {MAX_QTY}")
        resolved.append((p, size, col["name"], qty))
        wanted[(pid, size)] = wanted.get((pid, size), 0) + qty

    lines = []
    subtotal = 0
    compare_savings = 0
    for p, size, color, qty in resolved:
        line_total = p["price"] * qty
        subtotal += line_total
        if p.get("compareAt") and p["compareAt"] > p["price"]:
            compare_savings += (p["compareAt"] - p["price"]) * qty
        lines.append({
            "id": p["id"],
            "name": p["name"],
            "size": size,
            "color": color,
            "qty": qty,
            "unitPrice": p["price"],
            "lineTotal": line_total,
            "inStock": stock(p["id"], size) >= wanted[(p["id"], size)],
        })

    discount = 0
    promo_applied: Optional[str] = None
    promo_error: Optional[str] = None
    code = (promo or "").strip()
    if code:
        pr = find_promo(catalog, code)
        if pr is None:
            promo_error = "That code isn't valid"
        elif pr.get("requiresPrepaid") and payment == "cod":
            promo_error = f"{pr['code']} works with UPI or card payments"
        elif subtotal < pr.get("minSubtotal", 0):
            promo_error = f"Add {format_inr(pr['minSubtotal'] - subtotal)} more to use {pr['code']}"
        else:
            if pr["type"] == "percent":
                discount = subtotal * pr["value"] // 100
            else:
                discount = pr["value"]
            discount = min(discount, subtotal)
            promo_applied = pr["code"]

    net = subtotal - discount
    if not lines:
        shipping_fee = 0
    elif shipping == "express":
        shipping_fee = ship["expressFee"]
    else:
        shipping_fee = 0 if net >= ship["freeAbove"] else ship["standardFee"]
    cod_fee = ship["codFee"] if (payment == "cod" and lines) else 0
    total = net + shipping_fee + cod_fee

    return {
        "lines": lines,
        "subtotal": subtotal,
        "discount": discount,
        "promoApplied": promo_applied,
        "promoError": promo_error,
        "shippingFee": shipping_fee,
        "codFee": cod_fee,
        "total": total,
        "savings": compare_savings + discount,
        "freeShippingRemaining": max(0, ship["freeAbove"] - net),
    }


# --------------------------------------------------------------------------- fit

FIT_LIMITS = {
    "heightCm": ("Height", 120, 230),
    "weightKg": ("Weight", 30, 250),
    "chestCm": ("Chest", 60, 160),
    "shoulderCm": ("Shoulder width", 30, 70),
}
FIT_UNITS = {"heightCm": "cm", "weightKg": "kg", "chestCm": "cm", "shoulderCm": "cm"}


def garment_fit(catalog: Mapping[str, Any], garment: str) -> Optional[str]:
    """Default cut for a garment family: the fit of its first product in the catalog."""
    for p in catalog["products"]:
        if p["garment"] == garment:
            return p["fit"]
    return None


def recommend_fit(catalog: Mapping[str, Any], inp: Mapping[str, Any], product: Optional[Mapping[str, Any]] = None) -> dict:
    for key, (label, lo, hi) in FIT_LIMITS.items():
        v = inp.get(key)
        if key == "heightCm" and v is None:
            raise CommerceError(422, "Height is required")
        if v is not None and not (lo <= v <= hi):
            raise CommerceError(422, f"{label} must be between {lo} and {hi} {FIT_UNITS[key]}")
    pref = inp.get("preference") or "true"
    if pref not in PREFERENCES:
        raise CommerceError(422, "Preference must be true, relaxed or snug")

    garment = inp.get("garment")
    fit_name: Optional[str] = None
    if product is not None:
        fit_name = product["fit"]
    elif garment:
        fit_name = garment_fit(catalog, str(garment).lower())
        if fit_name is None:
            raise CommerceError(422, f"We don't make a {garment} yet")

    rows = catalog["sizeChart"]["rows"]
    n = len(rows)
    h = inp["heightCm"]
    w = inp.get("weightKg")
    c = inp.get("chestCm")
    s = inp.get("shoulderCm")
    reasons: list[str] = []

    if c is not None:
        idx = -1
        for i, r in enumerate(rows):
            lo, hi = r["chest"]
            if lo <= c < hi or (i == n - 1 and c == hi):
                idx = i
                break
        if idx < 0:
            best = math.inf
            for i, r in enumerate(rows):
                lo, hi = r["chest"]
                d = lo - c if c < lo else c - hi
                if d < best:
                    best, idx = d, i
            reasons.append(f"Chest {fmt_num(c)} cm is outside our chart, so we started from {rows[idx]['size']}")
        else:
            lo, hi = rows[idx]["chest"]
            reasons.append(f"Chest {fmt_num(c)} cm sits in our {rows[idx]['size']} range ({lo}–{hi} cm)")
        lo, hi = rows[idx]["chest"]
        direction = -1 if c < (lo + hi) / 2 else 1
    else:
        cands = [i for i, r in enumerate(rows) if r["height"][0] <= h <= r["height"][1]]
        if not cands:
            best = math.inf
            idx = 0
            for i, r in enumerate(rows):
                lo, hi = r["height"]
                d = lo - h if h < lo else h - hi
                if d < best:
                    best, idx = d, i
            reasons.append(f"Height {fmt_num(h)} cm is outside our chart, so we started from {rows[idx]['size']}")
        elif len(cands) == 1:
            idx = cands[0]
            reasons.append(f"Height {fmt_num(h)} cm maps to {rows[idx]['size']} on our size chart")
        else:
            idx = cands[0]
            best = math.inf
            for i in cands:
                lo, hi = rows[i]["height"]
                d = abs(h - (lo + hi) / 2)
                if d < best:
                    best, idx = d, i
            names = " and ".join(rows[i]["size"] for i in cands)
            reasons.append(f"Height {fmt_num(h)} cm sits between {names}; {rows[idx]['size']} is the closer match")
        lo, hi = rows[idx]["height"]
        direction = -1 if h < (lo + hi) / 2 else 1

    bumped = False

    def step(i: int, d: int) -> tuple[int, bool]:
        j = max(0, min(n - 1, i + d))
        return j, j != i

    if c is None and w is not None:
        m = h / 100
        bmi = w / (m * m)
        if bmi > 27:
            idx, changed = step(idx, 1)
            bumped = bumped or changed
            if changed:
                reasons.append(f"Your build suggests sizing up to {rows[idx]['size']}")
        elif bmi < 19:
            idx, changed = step(idx, -1)
            bumped = bumped or changed
            if changed:
                reasons.append(f"A leaner build suggests sizing down to {rows[idx]['size']}")

    if s is not None:
        if idx < n - 1 and s >= rows[idx + 1]["shoulder"]:
            idx, _ = step(idx, 1)
            bumped = True
            reasons.append(f"Shoulders {fmt_num(s)} cm need the {rows[idx]['size']} shoulder width ({rows[idx]['shoulder']} cm)")
        else:
            reasons.append(f"Shoulders {fmt_num(s)} cm sit comfortably in {rows[idx]['size']}")

    if pref == "relaxed":
        if fit_name in ROOMY_FITS:
            reasons.append(f"The {fit_name} cut is already roomy, so we kept {rows[idx]['size']} for a relaxed drape")
        else:
            idx, changed = step(idx, 1)
            bumped = bumped or changed
            if changed:
                reasons.append(f"Sized up to {rows[idx]['size']} for a relaxed drape")
            else:
                reasons.append(f"{rows[idx]['size']} is our largest size, so it's already the roomiest option")
    elif pref == "snug":
        idx, changed = step(idx, -1)
        bumped = bumped or changed
        if changed:
            reasons.append(f"Sized down to {rows[idx]['size']} for a snug fit")
        else:
            reasons.append(f"{rows[idx]['size']} is our smallest size, so it's already the closest fit")
    else:
        reasons.append(f"{rows[idx]['size']} keeps a true-to-size fit")

    confidence = 0.92 if c is not None else (0.84 if s is not None else 0.72)
    if bumped:
        confidence -= 0.08
    alt = idx + direction
    if alt < 0 or alt >= n:
        alt = idx - direction
    return {
        "size": rows[idx]["size"],
        "confidence": round_to(confidence, 2),
        "alternatives": [rows[alt]["size"]] if 0 <= alt < n else [],
        "reasons": reasons,
    }


# --------------------------------------------------------------------------- delivery

METROS = {
    "11": "Delhi",
    "40": "Mumbai",
    "56": "Bengaluru",
    "60": "Chennai",
    "70": "Kolkata",
    "50": "Hyderabad",
    "41": "Pune",
    "38": "Ahmedabad",
}
REGIONS = {
    "1": "Northern India",
    "2": "Uttar Pradesh & Uttarakhand",
    "3": "Rajasthan & Gujarat",
    "4": "Maharashtra & Central India",
    "5": "Andhra Pradesh, Telangana & Karnataka",
    "6": "Tamil Nadu & Kerala",
    "7": "East & Northeast India",
    "8": "Bihar & Jharkhand",
}


def check_delivery(pincode: str) -> dict:
    p = (pincode or "").strip()
    if not re.fullmatch(r"[0-9]{6}", p):
        raise CommerceError(422, "Enter a valid 6-digit pincode")
    if p[0] in ("0", "9"):
        return {"pincode": p, "serviceable": False, "city": None, "etaDays": None, "expressDays": None, "cod": False}
    metro = METROS.get(p[:2])
    if metro:
        return {"pincode": p, "serviceable": True, "city": metro, "etaDays": 2, "expressDays": 1, "cod": True}
    eta = 3 + int(p[:3]) % 4
    return {"pincode": p, "serviceable": True, "city": REGIONS[p[0]], "etaDays": eta, "expressDays": eta - 1, "cod": True}
