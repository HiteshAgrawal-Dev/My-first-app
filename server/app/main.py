"""VÉLOURA ATELIER API — FastAPI app factory.

Run:  cd server && uvicorn app.main:app --reload     (http://localhost:8000)
"""


import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import auth
from . import commerce as C
from .db import Database, stock_map

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STATIC_DIR = REPO_ROOT / "web" / "dist"
IST = timezone(timedelta(hours=5, minutes=30))
TIMELINE_STEPS = ["Confirmed", "Crafted & QC", "Dispatched", "Out for delivery", "Delivered"]
ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# --------------------------------------------------------------------------- models

def _email(v: str) -> str:
    v = (v or "").strip().lower()
    if len(v) > 254 or not EMAIL_RE.match(v):
        raise ValueError("Enter a valid email address, like name@example.com")
    return v


class Model(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class CartItemIn(Model):
    id: str = Field(min_length=1, max_length=64)
    size: str = Field(min_length=1, max_length=8)
    color: str = Field(min_length=1, max_length=64)
    qty: int  # range (1..10) is enforced by commerce.quote_cart so the message matches the TS engine


class QuoteIn(Model):
    items: list[CartItemIn] = Field(max_length=50)
    promo: Optional[str] = Field(default=None, max_length=40)
    payment: Literal["upi", "card", "cod"] = "upi"
    shipping: Literal["standard", "express"] = "standard"


class AddressIn(Model):
    name: str = Field(min_length=1, max_length=80)
    phone: str
    line1: str = Field(min_length=3, max_length=200)
    city: str = Field(min_length=2, max_length=80)
    pincode: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        digits = re.sub(r"[\s\-()]", "", v or "")
        if digits.startswith("+91"):
            digits = digits[3:]
        elif len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        if not re.fullmatch(r"[6-9][0-9]{9}", digits):
            raise ValueError("Enter a 10-digit Indian mobile number, like 98765 43210")
        return digits

    @field_validator("pincode")
    @classmethod
    def _pincode(cls, v: str) -> str:
        if not re.fullmatch(r"[0-9]{6}", v or ""):
            raise ValueError("Pincode must be exactly 6 digits")
        return v


class OrderIn(QuoteIn):
    email: str
    address: AddressIn

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _email(v)

    @field_validator("items")
    @classmethod
    def _not_empty(cls, v: list[CartItemIn]) -> list[CartItemIn]:
        if not v:
            raise ValueError("Your bag is empty")
        return v


Drape = Literal["true", "relaxed", "snug"]


class RegisterIn(Model):
    name: str = Field(min_length=1, max_length=80)
    email: str
    password: str = Field(max_length=128)
    heightCm: Optional[float] = Field(default=None, ge=120, le=230)
    drape: Optional[Drape] = None

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _email(v)

    @field_validator("password")
    @classmethod
    def _pw(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginIn(Model):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return (v or "").strip().lower()


class MePatch(Model):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    heightCm: Optional[float] = Field(default=None, ge=120, le=230)
    drape: Optional[Drape] = None


class FitIn(Model):
    heightCm: Optional[float] = None  # required; checked in commerce.recommend_fit so the message matches the TS engine
    weightKg: Optional[float] = None
    chestCm: Optional[float] = None
    shoulderCm: Optional[float] = None
    preference: Literal["true", "relaxed", "snug"] = "true"
    garment: Optional[str] = None
    productId: Optional[str] = None


class EmailIn(Model):
    email: str
    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _email(v)


class StylingIn(Model):
    name: str = Field(min_length=1, max_length=80)
    email: str
    city: Literal["Paris", "Tokyo", "Mumbai", "Video call"]
    slot: datetime

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _email(v)

    @field_validator("slot")
    @classmethod
    def _future(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            v = v.replace(tzinfo=IST)
        if v <= datetime.now(timezone.utc):
            raise ValueError("Pick a styling slot in the future")
        return v


class StockAlertIn(Model):
    productId: str = Field(min_length=1, max_length=64)
    size: str = Field(min_length=1, max_length=8)
    email: str
    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _email(v)


# --------------------------------------------------------------------------- helpers

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return prefix + "".join(secrets.choice(ID_ALPHABET) for _ in range(6))


def _user_out(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "heightCm": row["height_cm"],
        "drape": row["drape"],
        "createdAt": row["created_at"],
    }


def _validation_message(err: dict) -> str:
    loc = [str(p) for p in err.get("loc", ()) if p not in ("body", "query", "path", "header")]
    field = ".".join(loc)
    etype = err.get("type", "")
    msg = err.get("msg", "Invalid value")
    if etype == "value_error":
        return msg.removeprefix("Value error, ")
    if etype == "missing":
        return f"{field} is required" if field else "A required field is missing"
    if etype == "json_invalid":
        return "Request body isn't valid JSON"
    return f"{field}: {msg}" if field else msg


# --------------------------------------------------------------------------- app factory

def create_app(
    db_path: str | Path | None = None,
    catalog_path: str | Path | None = None,
    static_dir: str | Path | None = None,
    timeline_step_seconds: int | None = None,
) -> FastAPI:
    catalog = C.load_catalog(catalog_path)
    db = Database(db_path)
    db.init(catalog)
    step = timedelta(seconds=timeline_step_seconds or int(os.environ.get("VELOURA_TIMELINE_STEP", "120")))
    products_by_id = {p["id"]: p for p in catalog["products"]}

    app = FastAPI(title="VÉLOURA ATELIER API", version="1.0.0")
    app.state.catalog = catalog
    app.state.db = db
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(RequestValidationError)
    async def _on_validation(_: Request, exc: RequestValidationError):
        msgs = [_validation_message(e) for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": msgs[0] if msgs else "Invalid request", "errors": msgs})

    @app.exception_handler(C.CommerceError)
    async def _on_commerce(_: Request, exc: C.CommerceError):
        return JSONResponse(status_code=exc.status, content={"detail": exc.message})

    Conn = Annotated[sqlite3.Connection, Depends(db.session)]

    # ---- auth dependencies
    def _bearer(authorization: Optional[str]) -> Optional[str]:
        if not authorization:
            return None
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise HTTPException(401, "Use an Authorization: Bearer <token> header")
        return token.strip()

    def optional_user(conn: Conn, authorization: Annotated[Optional[str], Header()] = None) -> Optional[sqlite3.Row]:
        token = _bearer(authorization)
        if token is None:
            return None
        uid = auth.decode_token(token)
        row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone() if uid is not None else None
        if row is None:
            raise HTTPException(401, "Your session has expired. Please sign in again")
        return row

    def current_user(user: Annotated[Optional[sqlite3.Row], Depends(optional_user)]) -> sqlite3.Row:
        if user is None:
            raise HTTPException(401, "Sign in to continue")
        return user

    # ---- product helpers
    def decorator(conn: sqlite3.Connection):
        live = stock_map(conn)

        def decorate(p: dict) -> dict:
            out = dict(p)
            out["stock"] = {s: live.get((p["id"], s), 0) for s in p["sizes"]}
            return out

        return decorate

    # ------------------------------------------------------------------ routes
    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/products")
    def products(
        conn: Conn,
        dept: Optional[Literal["men", "women", "drops"]] = None,
        garment: Optional[str] = None,
        q: Optional[str] = Query(default=None, max_length=100),
        sort: Literal["featured", "price-asc", "price-desc", "rating", "new"] = "featured",
    ):
        return C.list_products(catalog, dept=dept, garment=garment, q=q, sort=sort, decorate=decorator(conn))

    @app.get("/api/products/{product_id}")
    def product(product_id: str, conn: Conn):
        p = products_by_id.get(product_id)
        if p is None:
            raise HTTPException(404, f"We couldn't find product {product_id}")
        return decorator(conn)(p)

    @app.get("/api/search")
    def search(conn: Conn, q: str = Query(default="", max_length=100)):
        return C.search(catalog, q, decorate=decorator(conn))

    @app.post("/api/cart/quote")
    def quote(body: QuoteIn, conn: Conn):
        live = stock_map(conn)
        return C.quote_cart(
            catalog, [i.model_dump() for i in body.items], body.promo, body.payment, body.shipping,
            stock=lambda pid, size: live.get((pid, size), 0),
        )

    # ---- auth
    @app.post("/api/auth/register", status_code=201)
    def register(body: RegisterIn, conn: Conn):
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (body.email,)).fetchone():
            raise HTTPException(409, "An account with this email already exists. Sign in instead")
        try:
            cur = conn.execute(
                "INSERT INTO users (name, email, password_hash, height_cm, drape, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (body.name, body.email, auth.hash_password(body.password), body.heightCm, body.drape, _iso(_now())),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "An account with this email already exists. Sign in instead")
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        return {"token": auth.create_token(row["id"]), "user": _user_out(row)}

    @app.post("/api/auth/login")
    def login(body: LoginIn, conn: Conn):
        row = conn.execute("SELECT * FROM users WHERE email = ?", (body.email,)).fetchone()
        if row is None or not auth.verify_password(body.password, row["password_hash"]):
            raise HTTPException(401, "Incorrect email or password")
        return {"token": auth.create_token(row["id"]), "user": _user_out(row)}

    @app.get("/api/me")
    def me(user: Annotated[sqlite3.Row, Depends(current_user)]):
        return _user_out(user)

    @app.patch("/api/me")
    def patch_me(body: MePatch, conn: Conn, user: Annotated[sqlite3.Row, Depends(current_user)]):
        cols = {"name": "name", "heightCm": "height_cm", "drape": "drape"}
        sets, vals = [], []
        for field in body.model_fields_set:
            value = getattr(body, field)
            if field == "name" and value is None:
                raise HTTPException(422, "name can't be empty")
            sets.append(f"{cols[field]} = ?")
            vals.append(value)
        if sets:
            conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", (*vals, user["id"]))
        return _user_out(conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())

    @app.get("/api/me/orders")
    def my_orders(conn: Conn, user: Annotated[sqlite3.Row, Depends(current_user)]):
        rows = conn.execute(
            "SELECT order_id, total, eta_date, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC", (user["id"],)
        ).fetchall()
        return {"orders": [{"orderId": r["order_id"], "total": r["total"], "etaDate": r["eta_date"], "createdAt": r["created_at"]} for r in rows]}

    # ---- orders
    @app.post("/api/orders", status_code=201)
    def create_order(body: OrderIn, conn: Conn, user: Annotated[Optional[sqlite3.Row], Depends(optional_user)]):
        delivery = C.check_delivery(body.address.pincode)
        if not delivery["serviceable"]:
            raise HTTPException(422, f"Sorry, we don't deliver to {body.address.pincode} yet")
        items = [i.model_dump() for i in body.items]
        conn.execute("BEGIN IMMEDIATE")
        try:
            live = stock_map(conn)
            q = C.quote_cart(catalog, items, body.promo, body.payment, body.shipping,
                             stock=lambda pid, size: live.get((pid, size), 0))
            if q["promoError"]:
                raise HTTPException(422, q["promoError"])
            wanted: dict[tuple[str, str], int] = {}
            for line in q["lines"]:
                wanted[(line["id"], line["size"])] = wanted.get((line["id"], line["size"]), 0) + line["qty"]
            for line in q["lines"]:
                if not line["inStock"]:
                    left = live.get((line["id"], line["size"]), 0)
                    msg = (f"{line['name']} in size {line['size']} is sold out" if left == 0
                           else f"Only {left} left of {line['name']} in size {line['size']}")
                    raise HTTPException(409, msg)
            for (pid, size), qty in wanted.items():
                cur = conn.execute(
                    "UPDATE stock SET qty = qty - ? WHERE product_id = ? AND size = ? AND qty >= ?", (qty, pid, size, qty)
                )
                if cur.rowcount != 1:
                    raise HTTPException(409, f"{products_by_id[pid]['name']} in size {size} just sold out")
            created = _now()
            days = delivery["expressDays"] if body.shipping == "express" else delivery["etaDays"]
            eta = (created.astimezone(IST) + timedelta(days=days)).date().isoformat()
            order_id = _new_id("VA-")
            while conn.execute("SELECT 1 FROM orders WHERE order_id = ?", (order_id,)).fetchone():
                order_id = _new_id("VA-")
            conn.execute(
                "INSERT INTO orders (order_id, user_id, email, address, payment, shipping, quote, total, eta_date, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (order_id, user["id"] if user else None, body.email, json.dumps(body.address.model_dump()),
                 body.payment, body.shipping, json.dumps(q), q["total"], eta, _iso(created)),
            )
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        return {"orderId": order_id, "total": q["total"], "etaDate": eta, "status": "confirmed", "quote": q}

    @app.get("/api/orders/{order_id}")
    def get_order(order_id: str, conn: Conn):
        oid = order_id.strip().upper()
        row = conn.execute("SELECT * FROM orders WHERE order_id = ?", (oid,)).fetchone()
        if row is None:
            raise HTTPException(404, f"We couldn't find order {oid}. It looks like VA-7K2P9Q and is in your confirmation email")
        created = datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
        now = _now()
        timeline = []
        for i, label in enumerate(TIMELINE_STEPS):
            at = created + step * i
            timeline.append({"label": label, "at": _iso(at), "done": now >= at})
        status = [t["label"] for t in timeline if t["done"]][-1].lower()
        q = json.loads(row["quote"])
        return {
            "orderId": row["order_id"],
            "status": status,
            "items": q["lines"],
            "total": row["total"],
            "etaDate": row["eta_date"],
            "createdAt": row["created_at"],
            "timeline": timeline,
        }

    # ---- delivery & fit
    @app.get("/api/delivery/{pincode}")
    def delivery(pincode: str):
        return C.check_delivery(pincode)

    @app.post("/api/fit/recommend")
    def fit(body: FitIn):
        product = None
        if body.productId:
            product = products_by_id.get(body.productId)
            if product is None:
                raise HTTPException(404, f"We couldn't find product {body.productId}")
        return C.recommend_fit(catalog, body.model_dump(exclude={"productId"}), product)

    # ---- marketing / concierge
    @app.post("/api/newsletter")
    def newsletter(body: EmailIn, conn: Conn):
        conn.execute("INSERT OR IGNORE INTO newsletter (email, created_at) VALUES (?, ?)", (body.email, _iso(_now())))
        return {"ok": True, "code": "FIRSTFIT"}

    @app.post("/api/styling", status_code=201)
    def styling(body: StylingIn, conn: Conn):
        booking_id = _new_id("ST-")
        conn.execute(
            "INSERT INTO styling_bookings (booking_id, name, email, city, slot, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (booking_id, body.name, body.email, body.city, body.slot.isoformat(), _iso(_now())),
        )
        return {"ok": True, "bookingId": booking_id}

    @app.post("/api/stock-alert")
    def stock_alert(body: StockAlertIn, conn: Conn):
        p = products_by_id.get(body.productId)
        if p is None:
            raise HTTPException(404, f"We couldn't find product {body.productId}")
        if body.size not in p["sizes"]:
            raise HTTPException(422, f"Size {body.size} isn't available for {p['name']}")
        conn.execute(
            "INSERT OR IGNORE INTO stock_alerts (product_id, size, email, created_at) VALUES (?, ?, ?, ?)",
            (body.productId, body.size, body.email, _iso(_now())),
        )
        return {"ok": True}

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    def api_not_found(rest: str):
        raise HTTPException(404, f"No API route at /api/{rest}")

    # ---- built frontend (mounted last so /api wins)
    sdir = Path(static_dir) if static_dir else DEFAULT_STATIC_DIR
    if sdir.is_dir():
        app.mount("/", StaticFiles(directory=sdir, html=True), name="web")

    return app


app = create_app()
