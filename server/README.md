# VÉLOURA ATELIER — API server

FastAPI + SQLite backend for the storefront. Prices are integer INR. Catalog data comes from
`../shared/catalog.json`; live stock, users, orders and sign-ups live in SQLite.

```bash
cd server
pip install -r requirements.txt        # fastapi, pydantic 2, pyjwt, bcrypt, uvicorn, pytest, httpx
uvicorn app.main:app --reload          # http://localhost:8000  (docs at /docs)
python -m pytest -q                    # full suite (includes the Python/TypeScript parity check)
python tests/parity/check_parity.py    # parity check on its own
```

If `../web/dist` exists (after `npm run build` in `web/`), it is served at `/`. API routes are registered first, so `/api/*` always wins.

## Configuration

| env var | default | purpose |
|---|---|---|
| `VELOURA_DB` | `server/data/veloura.db` | SQLite file (tables are created automatically, stock is seeded from the catalog) |
| `VELOURA_SECRET` | dev value | HS256 JWT signing secret. **Set this in production.** |
| `VELOURA_CATALOG` | `shared/catalog.json` | catalog override |
| `VELOURA_TIMELINE_STEP` | `120` | seconds between order-tracking steps (demo timeline) |

## Layout

```
app/main.py      app factory create_app(db_path, catalog_path, static_dir), routes, validation
app/commerce.py  pure logic: pricing, promos, fit, search, delivery (mirrored in web/src/lib/commerce.ts)
app/db.py        sqlite3 schema + per-request connections
app/auth.py      bcrypt hashing, JWT (HS256, 7-day expiry)
tests/           pytest suite; tests/parity/ runs the same cases through the TypeScript engine
```

## Endpoints (all JSON, CORS open)

Errors always come back as `{"detail": "<human-readable message>"}`. Validation errors are 422 and also carry an `errors` list.

| method | path | notes |
|---|---|---|
| GET | `/api/health` | `{status:"ok"}` |
| GET | `/api/products?dept=&garment=&q=&sort=` | `sort`: `featured` \| `price-asc` \| `price-desc` \| `rating` \| `new`. Stock is live from the DB. |
| GET | `/api/products/{id}` | 404 if unknown |
| GET | `/api/search?q=` | `{results:[{product,score}], suggestions}`. Up to 8 results; tolerates typos and synonyms. |
| POST | `/api/cart/quote` | `{items:[{id,size,color,qty}], promo?, payment, shipping}` returns the full quote |
| POST | `/api/auth/register` | 201 `{token,user}`; 409 if the email is taken |
| POST | `/api/auth/login` | `{token,user}`; 401 if the email or password is wrong |
| GET/PATCH | `/api/me` | Bearer token. PATCH `{name?, heightCm?, drape?}` |
| GET | `/api/me/orders` | Bearer token. Lists the user's orders (extra) |
| POST | `/api/orders` | Bearer token optional. Quotes again on the server, 409 if out of stock, decrements stock, 201 |
| GET | `/api/orders/{orderId}` | timeline moves forward one step every 2 minutes |
| GET | `/api/delivery/{pincode}` | metro: 2 days standard / 1 express; other areas: 3–6 days; 0xxxxx/9xxxxx are not serviceable |
| POST | `/api/fit/recommend` | `{heightCm, weightKg?, chestCm?, shoulderCm?, preference, garment?, productId?}` |
| POST | `/api/newsletter` | `{ok, code:"FIRSTFIT"}` |
| POST | `/api/styling` | `{name,email,city,slot}`: the slot must be in the future. 201 `{ok, bookingId}` |
| POST | `/api/stock-alert` | `{productId,size,email}` |

## Pricing rules (shared with the TypeScript engine)

- `subtotal = Σ price × qty` (qty 1–10). Only one promo code, matched without case. Percent codes take `floor(subtotal × value / 100)`; flat codes take `value`. A discount never exceeds the subtotal.
- Promo errors: `"That code isn't valid"`, `"PREPAID5 works with UPI or card payments"` (when the code requires prepaid and payment is COD), and `"Add ₹X more to use CODE"` (when the subtotal is below `minSubtotal`).
- Shipping: express always costs `expressFee`. Standard is free when `subtotal − discount ≥ freeAbove`, otherwise it costs `standardFee`. An empty cart has no fees.
- `codFee` applies only when payment is COD. `total = subtotal − discount + shippingFee + codFee`. `savings` = compare-at savings + discount.
- Orders reject an invalid promo with a 422 and never charge a total that differs from the quote the server computed.
