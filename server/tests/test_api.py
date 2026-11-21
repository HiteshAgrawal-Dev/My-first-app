import copy
import difflib
import random
import sqlite3
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from app import auth
from app import commerce as C
from app.main import IST, create_app

HOODIE = {"id": "vl-m-hoodie-01", "size": "M", "color": "Bone", "qty": 1}  # 7990, compareAt 9490
TEE = {"id": "vl-w-tee-01", "size": "S", "color": "Oxblood", "qty": 1}  # 2990
ADDRESS = {"name": "Aanya Rao", "phone": "98765 43210", "line1": "12 Carter Road, Bandra West", "city": "Mumbai", "pincode": "400050"}


def quote(client, items, promo=None, payment="upi", shipping="standard"):
    r = client.post("/api/cart/quote", json={"items": items, "promo": promo, "payment": payment, "shipping": shipping})
    assert r.status_code == 200, r.text
    return r.json()


def order_body(items=None, **kw):
    body = {"items": [HOODIE] if items is None else items, "promo": None, "payment": "upi", "shipping": "standard",
            "email": "aanya@example.com", "address": dict(ADDRESS)}
    body.update(kw)
    return body


def register(client, email="mira@example.com", password="velour-2026", **kw):
    r = client.post("/api/auth/register", json={"name": "Mira", "email": email, "password": password, **kw})
    assert r.status_code == 201, r.text
    return r.json()


# --------------------------------------------------------------------------- basics

def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_cors_headers(client):
    r = client.get("/api/health", headers={"Origin": "https://example.com"})
    assert r.headers.get("access-control-allow-origin") == "*"
    pre = client.options("/api/cart/quote", headers={"Origin": "https://x.dev", "Access-Control-Request-Method": "POST"})
    assert pre.status_code == 200


def test_unknown_api_route_is_json_404(client):
    r = client.get("/api/nope")
    assert r.status_code == 404 and "detail" in r.json()


def test_static_frontend_mounted_after_api(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>VELOURA</title>")
    client = TestClient(create_app(db_path=tmp_path / "s.db", static_dir=dist))
    assert "VELOURA" in client.get("/").text
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/missing").status_code == 404


def test_db_path_env_override(tmp_path, monkeypatch):
    target = tmp_path / "env" / "custom.db"
    monkeypatch.setenv("VELOURA_DB", str(target))
    create_app(static_dir=tmp_path / "x")
    assert target.exists()


# --------------------------------------------------------------------------- products

def test_products_list_all(client, catalog):
    r = client.get("/api/products")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()["products"]]
    assert ids == [p["id"] for p in catalog["products"]]


def test_products_filter_dept_and_garment(client):
    men = client.get("/api/products?dept=men").json()["products"]
    assert men and all(p["dept"] == "men" for p in men)
    hoodies = client.get("/api/products?garment=hoodie").json()["products"]
    assert len(hoodies) == 4 and all(p["garment"] == "hoodie" for p in hoodies)
    both = client.get("/api/products?dept=women&garment=cargo").json()["products"]
    assert [p["id"] for p in both] == ["vl-w-cargo-01"]


@pytest.mark.parametrize("sort,key,reverse", [("price-asc", "price", False), ("price-desc", "price", True), ("rating", "rating", True)])
def test_products_sorting(client, sort, key, reverse):
    prods = client.get(f"/api/products?sort={sort}").json()["products"]
    vals = [p[key] for p in prods]
    assert vals == sorted(vals, reverse=reverse)


def test_products_sort_new_puts_latest_drops_first(client):
    prods = client.get("/api/products?sort=new").json()["products"]
    drops = [p["drop"] for p in prods if p["drop"]]
    assert prods[0]["drop"] == max(drops)
    assert all(p["drop"] for p in prods[: len(drops)]) and not any(p["drop"] for p in prods[len(drops):])


def test_products_query_filter(client):
    prods = client.get("/api/products?q=trousers").json()["products"]
    assert prods and all(p["garment"] == "cargo" for p in prods)


def test_products_validation(client):
    r = client.get("/api/products?sort=cheapest")
    assert r.status_code == 422 and "sort" in r.json()["detail"]
    assert client.get("/api/products?dept=kids").status_code == 422


def test_product_detail_and_404(client, catalog):
    r = client.get("/api/products/vl-m-hoodie-01")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Monolith 500 Hoodie" and body["stock"] == catalog["products"][0]["stock"]
    r = client.get("/api/products/does-not-exist")
    assert r.status_code == 404 and r.json()["detail"] == "We couldn't find product does-not-exist"


# --------------------------------------------------------------------------- search

def test_search_exact_and_typo(client):
    res = client.get("/api/search?q=hoodie").json()
    assert res["results"] and all(r["product"]["garment"] == "hoodie" for r in res["results"])
    typo = client.get("/api/search?q=hoodei").json()
    assert typo["results"][0]["product"]["garment"] == "hoodie"
    assert typo["suggestions"][0] == "hoodie"


@pytest.mark.parametrize("q,garments", [
    ("pants", {"cargo"}), ("trousers", {"cargo"}), ("jacket", {"puffer", "blazer", "corset"}),
    ("sweatshirt", {"hoodie"}), ("t-shirt", {"tee"}), ("tshirt", {"tee"}), ("corset", {"corset"}),
])
def test_search_synonyms(client, q, garments):
    res = client.get("/api/search", params={"q": q}).json()["results"]
    assert res
    assert res[0]["product"]["garment"] in garments
    top_score = res[0]["score"]
    assert {r["product"]["garment"] for r in res if r["score"] == top_score} <= garments


def test_search_limits_and_ordering(client):
    res = client.get("/api/search?q=onyx").json()["results"]
    assert 0 < len(res) <= 8
    scores = [r["score"] for r in res]
    assert scores == sorted(scores, reverse=True) and all(0 < s <= 1 for s in scores)


def test_search_colour_material_dept(client):
    assert client.get("/api/search?q=oxblood").json()["results"]
    assert client.get("/api/search?q=ripstop").json()["results"][0]["product"]["garment"] == "cargo"
    women = client.get("/api/search?q=women").json()["results"]
    assert women and all(r["product"]["dept"] == "women" for r in women)


def test_search_empty_and_garbage(client):
    empty = client.get("/api/search?q=").json()
    assert empty["results"] == [] and empty["suggestions"]
    assert client.get("/api/search?q=qqqqzzzz").json()["results"] == []


# --------------------------------------------------------------------------- quotes

def test_quote_basic(client):
    q = quote(client, [HOODIE])
    assert q["lines"] == [{"id": "vl-m-hoodie-01", "name": "Monolith 500 Hoodie", "size": "M", "color": "Bone", "qty": 1,
                           "unitPrice": 7990, "lineTotal": 7990, "inStock": True}]
    assert (q["subtotal"], q["discount"], q["shippingFee"], q["codFee"], q["total"]) == (7990, 0, 0, 0, 7990)
    assert q["savings"] == 1500 and q["freeShippingRemaining"] == 0
    assert q["promoApplied"] is None and q["promoError"] is None


def test_quote_color_is_case_insensitive_and_canonicalised(client):
    q = quote(client, [{**HOODIE, "color": "  onyx velour "}])
    assert q["lines"][0]["color"] == "Onyx Velour"


def test_quote_percent_promo_floors_and_case_insensitive(client):
    q = quote(client, [{**HOODIE, "qty": 1}, TEE], promo="atelier10")  # 10980 -> 1098
    assert q["promoApplied"] == "ATELIER10" and q["discount"] == 1098
    q = quote(client, [{"id": "vl-m-tee-01", "size": "M", "color": "Bone", "qty": 1}, {"id": "vl-w-tee-01", "size": "M", "color": "Bone" if False else "Oxblood", "qty": 1}], promo="ATELIER10")
    assert q["subtotal"] == 6480 and q["discount"] == 648  # floor(648.0)
    q = quote(client, [{"id": "vl-w-cargo-01", "size": "M", "color": "Bone", "qty": 1}, TEE], promo="PREPAID5")  # 9280*5% = 464
    assert q["discount"] == 464
    q = quote(client, [{"id": "vl-m-tee-01", "size": "M", "color": "Bone", "qty": 3}], promo="PREPAID5")  # 10470*5% = 523.5 -> 523
    assert q["discount"] == 523


def test_quote_flat_promo_and_min_subtotal(client):
    q = quote(client, [HOODIE], promo=" firstfit ")
    assert q["promoApplied"] == "FIRSTFIT" and q["discount"] == 1000 and q["total"] == 6990
    q = quote(client, [TEE], promo="FIRSTFIT")
    assert q["discount"] == 0 and q["promoApplied"] is None
    assert q["promoError"] == "Add ₹4,010 more to use FIRSTFIT"


def test_quote_prepaid_rejected_on_cod(client):
    q = quote(client, [TEE], promo="prepaid5", payment="cod")
    assert q["promoError"] == "PREPAID5 works with UPI or card payments" and q["discount"] == 0
    assert quote(client, [TEE], promo="PREPAID5", payment="card")["discount"] == 149


def test_quote_unknown_promo(client):
    q = quote(client, [TEE], promo="FREESTUFF")
    assert q["promoError"] == "That code isn't valid" and q["promoApplied"] is None
    assert quote(client, [TEE], promo="   ")["promoError"] is None


def test_quote_shipping_rules(client):
    q = quote(client, [TEE])
    assert q["shippingFee"] == 199 and q["freeShippingRemaining"] == 4999 - 2990 and q["total"] == 3189
    q = quote(client, [{**TEE, "qty": 2}])  # 5980 >= 4999
    assert q["shippingFee"] == 0 and q["freeShippingRemaining"] == 0
    q = quote(client, [HOODIE], shipping="express")
    assert q["shippingFee"] == 349 and q["total"] == 7990 + 349


def test_quote_cod_fee(client):
    q = quote(client, [HOODIE], payment="cod")
    assert q["codFee"] == 99 and q["total"] == 7990 + 99
    q = quote(client, [TEE], payment="cod", shipping="express")
    assert q["total"] == 2990 + 349 + 99


def test_quote_empty_cart_has_no_fees(client):
    q = quote(client, [], promo="ATELIER10", payment="cod", shipping="express")
    assert (q["subtotal"], q["shippingFee"], q["codFee"], q["total"]) == (0, 0, 0, 0)
    assert q["freeShippingRemaining"] == 4999


def test_quote_in_stock_flags_aggregate_lines(client):
    q = quote(client, [{"id": "vl-m-hoodie-01", "size": "XXL", "color": "Bone", "qty": 2}])
    assert q["lines"][0]["inStock"] is True
    q = quote(client, [{"id": "vl-m-hoodie-01", "size": "XXL", "color": "Bone", "qty": 2},
                       {"id": "vl-m-hoodie-01", "size": "XXL", "color": "Oxblood", "qty": 1}])
    assert [l["inStock"] for l in q["lines"]] == [False, False]
    q = quote(client, [{"id": "vl-m-puffer-01", "size": "XXL", "color": "Onyx Velour", "qty": 1}])
    assert q["lines"][0]["inStock"] is False


@pytest.mark.parametrize("item,status,detail", [
    ({**HOODIE, "id": "ghost"}, 404, "We couldn't find product ghost"),
    ({**HOODIE, "size": "XXXL"}, 422, "Size XXXL isn't available for Monolith 500 Hoodie"),
    ({**HOODIE, "color": "Neon"}, 422, "Monolith 500 Hoodie doesn't come in Neon"),
    ({**HOODIE, "qty": 0}, 422, "Quantity must be between 1 and 10"),
    ({**HOODIE, "qty": 11}, 422, "Quantity must be between 1 and 10"),
])
def test_quote_line_validation(client, item, status, detail):
    r = client.post("/api/cart/quote", json={"items": [item], "payment": "upi", "shipping": "standard"})
    assert r.status_code == status and r.json()["detail"] == detail


def test_quote_body_validation(client):
    r = client.post("/api/cart/quote", json={"items": [HOODIE], "payment": "paypal", "shipping": "standard"})
    assert r.status_code == 422 and r.json()["detail"].startswith("payment:")
    r = client.post("/api/cart/quote", json={"items": [{"id": "x"}], "payment": "upi"})
    assert r.status_code == 422 and r.json()["detail"] == "items.0.size is required"
    r = client.post("/api/cart/quote", content=b"{nope", headers={"content-type": "application/json"})
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)


# pure-function edge cases that the shipped catalog can't express directly
def _cat(**shipping):
    cat = copy.deepcopy(C.load_catalog())
    cat["shipping"].update(shipping)
    return cat


def test_discount_can_push_below_free_shipping():
    cat = _cat(freeAbove=5500)
    q = C.quote_cart(cat, [{**TEE, "qty": 2}], "ATELIER10", "upi", "standard")  # 5980 - 598 = 5382 < 5500
    assert q["discount"] == 598 and q["shippingFee"] == 199 and q["freeShippingRemaining"] == 118
    assert q["total"] == 5382 + 199


def test_free_shipping_threshold_is_inclusive():
    cat = _cat(freeAbove=5980)
    q = C.quote_cart(cat, [{**TEE, "qty": 2}], None, "upi", "standard")
    assert q["shippingFee"] == 0 and q["freeShippingRemaining"] == 0
    cat = _cat(freeAbove=5981)
    assert C.quote_cart(cat, [{**TEE, "qty": 2}], None, "upi", "standard")["shippingFee"] == 199


def test_discount_never_exceeds_subtotal():
    cat = copy.deepcopy(C.load_catalog())
    cat["promos"].append({"code": "HUGE", "type": "flat", "value": 50000, "label": "", "minSubtotal": 0})
    q = C.quote_cart(cat, [TEE], "huge", "upi", "standard")
    assert q["discount"] == 2990 and q["total"] == 199


def test_min_subtotal_message_uses_indian_grouping():
    cat = copy.deepcopy(C.load_catalog())
    cat["promos"].append({"code": "BIG", "type": "flat", "value": 5000, "label": "", "minSubtotal": 250000})
    q = C.quote_cart(cat, [TEE], "BIG", "upi", "standard")
    assert q["promoError"] == "Add ₹2,47,010 more to use BIG"


def test_format_inr():
    assert [C.format_inr(n) for n in (0, 999, 1000, 12345, 123456, 1234567, -4010)] == \
        ["₹0", "₹999", "₹1,000", "₹12,345", "₹1,23,456", "₹12,34,567", "-₹4,010"]


def test_seq_ratio_matches_difflib():
    rnd = random.Random(7)
    words = ["hoodie", "hoodei", "cargo", "puffer", "blazer", "corset", "oxblood", "women", "men", "jaket", "jacket"]
    for a in words:
        for b in words:
            assert C.seq_ratio(a, b) == difflib.SequenceMatcher(None, a, b).ratio()
    for _ in range(3000):
        a = "".join(rnd.choice("abcd") for _ in range(rnd.randint(0, 10)))
        b = "".join(rnd.choice("abcd") for _ in range(rnd.randint(0, 10)))
        assert C.seq_ratio(a, b) == difflib.SequenceMatcher(None, a, b).ratio()


# --------------------------------------------------------------------------- auth

def test_register_login_me_flow(client):
    reg = register(client, email="Mira@Example.com", heightCm=172, drape="relaxed")
    assert reg["user"]["email"] == "mira@example.com" and reg["user"]["heightCm"] == 172 and reg["user"]["drape"] == "relaxed"
    assert "password" not in str(reg["user"]).lower()
    token = reg["token"]
    assert auth.decode_token(token) == reg["user"]["id"]

    r = client.post("/api/auth/login", json={"email": "MIRA@example.com", "password": "velour-2026"})
    assert r.status_code == 200 and r.json()["user"]["id"] == reg["user"]["id"]

    me = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200 and me.json()["name"] == "Mira"


def test_token_has_seven_day_expiry(client):
    token = register(client)["token"]
    payload = jwt.decode(token, auth.SECRET, algorithms=["HS256"])
    assert abs((payload["exp"] - payload["iat"]) - 7 * 24 * 3600) <= 1


def test_register_duplicate_email_409(client):
    register(client)
    r = client.post("/api/auth/register", json={"name": "Again", "email": "MIRA@example.com", "password": "another-pass"})
    assert r.status_code == 409 and "already exists" in r.json()["detail"]


@pytest.mark.parametrize("body,detail", [
    ({"name": "A", "email": "a@b.co", "password": "short"}, "Password must be at least 8 characters"),
    ({"name": "A", "email": "not-an-email", "password": "longenough"}, "Enter a valid email address, like name@example.com"),
    ({"email": "a@b.co", "password": "longenough"}, "name is required"),
    ({"name": "A", "email": "a@b.co", "password": "longenough", "drape": "baggy"}, None),
    ({"name": "A", "email": "a@b.co", "password": "longenough", "heightCm": 20}, None),
])
def test_register_validation(client, body, detail):
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str)
    if detail:
        assert r.json()["detail"] == detail


def test_login_wrong_password_and_unknown_email(client):
    register(client)
    r = client.post("/api/auth/login", json={"email": "mira@example.com", "password": "wrong-password"})
    assert r.status_code == 401 and r.json()["detail"] == "Incorrect email or password"
    r = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "whatever1"})
    assert r.status_code == 401


def test_me_requires_valid_token(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Basic abc"}).status_code == 401
    uid = register(client)["user"]["id"]
    expired = jwt.encode({"sub": str(uid), "exp": datetime.now(timezone.utc) - timedelta(seconds=5)}, auth.SECRET, algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401
    forged = jwt.encode({"sub": str(uid), "exp": datetime.now(timezone.utc) + timedelta(days=1)}, "wrong-secret-that-is-definitely-32-bytes-long", algorithm="HS256")
    assert client.get("/api/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_patch_me(client):
    token = register(client)["token"]
    h = {"Authorization": f"Bearer {token}"}
    r = client.patch("/api/me", json={"heightCm": 181.5, "drape": "snug", "name": "Mira K"}, headers=h)
    assert r.status_code == 200 and r.json()["heightCm"] == 181.5 and r.json()["drape"] == "snug" and r.json()["name"] == "Mira K"
    r = client.patch("/api/me", json={"heightCm": None}, headers=h)
    assert r.json()["heightCm"] is None and r.json()["drape"] == "snug"
    assert client.patch("/api/me", json={"drape": "loose"}, headers=h).status_code == 422
    assert client.patch("/api/me", json={"heightCm": 999}, headers=h).status_code == 422
    assert client.patch("/api/me", json={"name": None}, headers=h).status_code == 422
    assert client.patch("/api/me", json={"drape": "true"}).status_code == 401


# --------------------------------------------------------------------------- orders

def test_create_order_requotes_and_decrements_stock(client):
    before = client.get("/api/products/vl-m-hoodie-01").json()["stock"]["M"]
    body = order_body([{**HOODIE, "qty": 2}], promo="atelier10", total=1, subtotal=1)  # client totals ignored
    r = client.post("/api/orders", json=body)
    assert r.status_code == 201, r.text
    o = r.json()
    assert o["status"] == "confirmed"
    assert o["orderId"].startswith("VA-") and len(o["orderId"]) == 9 and o["orderId"][3:].isalnum()
    assert o["total"] == 15980 - 1598 == o["quote"]["total"]
    assert o["etaDate"] == (datetime.now(IST) + timedelta(days=2)).date().isoformat()
    after = client.get("/api/products/vl-m-hoodie-01").json()["stock"]["M"]
    assert after == before - 2
    # listing and search reflect live stock too
    listed = next(p for p in client.get("/api/products").json()["products"] if p["id"] == "vl-m-hoodie-01")
    assert listed["stock"]["M"] == after


def test_express_eta_and_cod(client):
    r = client.post("/api/orders", json=order_body(payment="cod", shipping="express"))
    assert r.status_code == 201
    assert r.json()["etaDate"] == (datetime.now(IST) + timedelta(days=1)).date().isoformat()
    assert r.json()["total"] == 7990 + 349 + 99


def test_order_out_of_stock_409_and_no_partial_decrement(client):
    before = client.get("/api/products/vl-m-hoodie-01").json()["stock"]["M"]
    items = [HOODIE, {"id": "vl-m-puffer-01", "size": "XXL", "color": "Onyx Velour", "qty": 1}]
    r = client.post("/api/orders", json=order_body(items))
    assert r.status_code == 409 and r.json()["detail"] == "Strata Puffer in size XXL is sold out"
    assert client.get("/api/products/vl-m-hoodie-01").json()["stock"]["M"] == before


def test_order_sells_out_then_409(client):
    item = {"id": "vl-d-corset-01", "size": "XS", "color": "Oxblood", "qty": 1}  # stock 1
    assert client.post("/api/orders", json=order_body([item])).status_code == 201
    assert client.get("/api/products/vl-d-corset-01").json()["stock"]["XS"] == 0
    r = client.post("/api/orders", json=order_body([item]))
    assert r.status_code == 409
    r = client.post("/api/orders", json=order_body([{"id": "vl-d-cargo-01", "size": "XS", "color": "Kyoto Moss", "qty": 3}]))
    assert r.status_code == 409 and r.json()["detail"] == "Only 2 left of MOSS CIRCUIT Cargo in size XS"


@pytest.mark.parametrize("patch,detail", [
    ({"address": {**ADDRESS, "phone": "12345"}}, "Enter a 10-digit Indian mobile number, like 98765 43210"),
    ({"address": {**ADDRESS, "phone": "5876543210"}}, "Enter a 10-digit Indian mobile number, like 98765 43210"),
    ({"address": {**ADDRESS, "pincode": "4000"}}, "Pincode must be exactly 6 digits"),
    ({"address": {**ADDRESS, "pincode": "900001"}}, "Sorry, we don't deliver to 900001 yet"),
    ({"email": "nope"}, "Enter a valid email address, like name@example.com"),
    ({"items": []}, "Your bag is empty"),
    ({"promo": "PREPAID5", "payment": "cod"}, "PREPAID5 works with UPI or card payments"),
    ({"promo": "BOGUS"}, "That code isn't valid"),
    ({"shipping": "drone"}, None),
])
def test_order_validation(client, patch, detail):
    r = client.post("/api/orders", json=order_body(**patch))
    assert r.status_code == 422, r.text
    if detail:
        assert r.json()["detail"] == detail


def test_order_phone_normalisation(client):
    for phone in ("+91 98765 43210", "098765-43210", "919876543210"):
        r = client.post("/api/orders", json=order_body(address={**ADDRESS, "phone": phone}))
        assert r.status_code == 201, (phone, r.text)


def test_order_with_bearer_links_to_user(client):
    token = register(client)["token"]
    h = {"Authorization": f"Bearer {token}"}
    oid = client.post("/api/orders", json=order_body(), headers=h).json()["orderId"]
    mine = client.get("/api/me/orders", headers=h).json()["orders"]
    assert [o["orderId"] for o in mine] == [oid]
    assert client.post("/api/orders", json=order_body(), headers={"Authorization": "Bearer bad"}).status_code == 401


def test_get_order_timeline_progresses(client, app):
    oid = client.post("/api/orders", json=order_body()).json()["orderId"]
    r = client.get(f"/api/orders/{oid.lower()}")
    assert r.status_code == 200
    o = r.json()
    assert o["orderId"] == oid and o["status"] == "confirmed" and o["total"] == 7990
    assert [t["label"] for t in o["timeline"]] == ["Confirmed", "Crafted & QC", "Dispatched", "Out for delivery", "Delivered"]
    assert [t["done"] for t in o["timeline"]] == [True, False, False, False, False]
    assert o["items"][0]["id"] == "vl-m-hoodie-01"

    # pretend the order was placed 5 minutes ago -> steps at 0, 2, 4 min are done
    past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(timespec="seconds").replace("+00:00", "Z")
    conn = sqlite3.connect(app.state.db.path)
    conn.execute("UPDATE orders SET created_at = ? WHERE order_id = ?", (past, oid))
    conn.commit()
    conn.close()
    o = client.get(f"/api/orders/{oid}").json()
    assert [t["done"] for t in o["timeline"]] == [True, True, True, False, False]
    assert o["status"] == "dispatched"


def test_get_order_404(client):
    r = client.get("/api/orders/VA-NOPE00")
    assert r.status_code == 404 and "VA-NOPE00" in r.json()["detail"]


# --------------------------------------------------------------------------- delivery

@pytest.mark.parametrize("pin,city", [("110001", "Delhi"), ("400050", "Mumbai"), ("560034", "Bengaluru"), ("600001", "Chennai"),
                                      ("700019", "Kolkata"), ("500081", "Hyderabad"), ("411001", "Pune"), ("380015", "Ahmedabad")])
def test_delivery_metros(client, pin, city):
    assert client.get(f"/api/delivery/{pin}").json() == {"pincode": pin, "serviceable": True, "city": city, "etaDays": 2, "expressDays": 1, "cod": True}


def test_delivery_non_metro(client):
    d = client.get("/api/delivery/302001").json()
    assert d["serviceable"] and 3 <= d["etaDays"] <= 6 and d["expressDays"] == d["etaDays"] - 1 and d["cod"]
    assert d["city"] == "Rajasthan & Gujarat"


@pytest.mark.parametrize("pin", ["900001", "012345"])
def test_delivery_not_serviceable(client, pin):
    d = client.get(f"/api/delivery/{pin}").json()
    assert d == {"pincode": pin, "serviceable": False, "city": None, "etaDays": None, "expressDays": None, "cod": False}


@pytest.mark.parametrize("pin", ["12345", "1234567", "abcdef", "4000 1"])
def test_delivery_invalid(client, pin):
    r = client.get(f"/api/delivery/{pin}")
    assert r.status_code == 422 and r.json()["detail"] == "Enter a valid 6-digit pincode"


# --------------------------------------------------------------------------- fit

def fit(client, **body):
    r = client.post("/api/fit/recommend", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_fit_by_chest(client):
    f = fit(client, heightCm=180, chestCm=104)
    assert f["size"] == "L" and f["confidence"] == 0.92 and f["alternatives"] == ["XL"]
    assert f["reasons"][0] == "Chest 104 cm sits in our L range (100–108 cm)"
    assert fit(client, heightCm=180, chestCm=88)["size"] == "S"  # boundary belongs to the upper row
    assert fit(client, heightCm=180, chestCm=126)["size"] == "XXL"
    out = fit(client, heightCm=180, chestCm=70)
    assert out["size"] == "XS" and "outside our chart" in out["reasons"][0]


def test_fit_by_height_and_overlap(client):
    f = fit(client, heightCm=170)
    assert f["size"] == "M" and f["confidence"] == 0.72 and f["alternatives"] == ["S"]
    f = fit(client, heightCm=162)  # XS (155-163, mid 159) vs S (160-168, mid 164) -> S closer
    assert f["size"] == "S" and "sits between XS and S" in f["reasons"][0]
    assert fit(client, heightCm=161)["size"] == "XS"


def test_fit_bmi_bumps(client):
    up = fit(client, heightCm=170, weightKg=85)  # base M, BMI 29.4
    assert up["size"] == "L" and up["confidence"] == 0.64
    assert up["reasons"][1] == "Your build suggests sizing up to L"
    down = fit(client, heightCm=170, weightKg=50)  # BMI 17.3
    assert down["size"] == "S" and down["confidence"] == 0.64
    assert fit(client, heightCm=170, weightKg=70)["size"] == "M"
    assert fit(client, heightCm=175, weightKg=70)["size"] == "L"  # M/L overlap: L's midpoint (176.5) is closer


def test_fit_shoulder(client):
    f = fit(client, heightCm=170, shoulderCm=49)  # >= L shoulder (49) when base M
    assert f["size"] == "L" and f["confidence"] == 0.76
    f = fit(client, heightCm=170, shoulderCm=44)
    assert f["size"] == "M" and f["confidence"] == 0.84


def test_fit_preferences(client):
    assert fit(client, heightCm=170, preference="relaxed")["size"] == "L"
    assert fit(client, heightCm=170, preference="snug")["size"] == "S"
    boxy = fit(client, heightCm=170, preference="relaxed", productId="vl-m-hoodie-01")
    assert boxy["size"] == "M" and boxy["confidence"] == 0.72 and any("already roomy" in r for r in boxy["reasons"])
    over = fit(client, heightCm=170, preference="relaxed", garment="puffer")  # first puffer is Oversized
    assert over["size"] == "M"
    relaxed_cargo = fit(client, heightCm=170, preference="relaxed", productId="vl-m-cargo-01")
    assert relaxed_cargo["size"] == "L" and relaxed_cargo["confidence"] == 0.64


def test_fit_clamps(client):
    top = fit(client, heightCm=200, preference="relaxed")
    assert top["size"] == "XXL" and top["confidence"] == 0.72 and top["alternatives"] == ["XL"]
    bottom = fit(client, heightCm=150, preference="snug")
    assert bottom["size"] == "XS" and bottom["alternatives"] == ["S"]


@pytest.mark.parametrize("body,status,detail", [
    ({}, 422, "Height is required"),
    ({"heightCm": 90}, 422, "Height must be between 120 and 230 cm"),
    ({"heightCm": 170, "weightKg": 5}, 422, "Weight must be between 30 and 250 kg"),
    ({"heightCm": 170, "chestCm": 300}, 422, "Chest must be between 60 and 160 cm"),
    ({"heightCm": 170, "preference": "baggy"}, 422, None),
    ({"heightCm": 170, "garment": "kilt"}, 422, "We don't make a kilt yet"),
    ({"heightCm": 170, "productId": "ghost"}, 404, "We couldn't find product ghost"),
    ({"heightCm": "tall"}, 422, None),
])
def test_fit_validation(client, body, status, detail):
    r = client.post("/api/fit/recommend", json=body)
    assert r.status_code == status
    if detail:
        assert r.json()["detail"] == detail


# --------------------------------------------------------------------------- newsletter / styling / alerts

def test_newsletter(client):
    r = client.post("/api/newsletter", json={"email": "Fan@Example.com"})
    assert r.status_code == 200 and r.json() == {"ok": True, "code": "FIRSTFIT"}
    assert client.post("/api/newsletter", json={"email": "fan@example.com"}).status_code == 200  # idempotent
    assert client.post("/api/newsletter", json={"email": "fan"}).status_code == 422


def test_styling_booking(client):
    slot = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    r = client.post("/api/styling", json={"name": "Kenji", "email": "kenji@example.jp", "city": "Tokyo", "slot": slot})
    assert r.status_code == 201 and r.json()["ok"] is True and r.json()["bookingId"].startswith("ST-")
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    r = client.post("/api/styling", json={"name": "Kenji", "email": "kenji@example.jp", "city": "Tokyo", "slot": past})
    assert r.status_code == 422 and r.json()["detail"] == "Pick a styling slot in the future"
    r = client.post("/api/styling", json={"name": "Kenji", "email": "kenji@example.jp", "city": "London", "slot": slot})
    assert r.status_code == 422 and r.json()["detail"].startswith("city:")
    r = client.post("/api/styling", json={"name": "Kenji", "email": "kenji@example.jp", "city": "Video call", "slot": "not a date"})
    assert r.status_code == 422


def test_stock_alert(client):
    r = client.post("/api/stock-alert", json={"productId": "vl-m-puffer-01", "size": "XXL", "email": "w@example.com"})
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert client.post("/api/stock-alert", json={"productId": "vl-m-puffer-01", "size": "XXL", "email": "w@example.com"}).status_code == 200
    r = client.post("/api/stock-alert", json={"productId": "ghost", "size": "M", "email": "w@example.com"})
    assert r.status_code == 404
    r = client.post("/api/stock-alert", json={"productId": "vl-m-puffer-01", "size": "XXXL", "email": "w@example.com"})
    assert r.status_code == 422 and r.json()["detail"] == "Size XXXL isn't available for Strata Puffer"
    assert client.post("/api/stock-alert", json={"productId": "vl-m-puffer-01", "size": "M", "email": "bad"}).status_code == 422
