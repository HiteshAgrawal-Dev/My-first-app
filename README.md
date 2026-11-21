# VÉLOURA Atelier

Luxury streetwear storefront (Paris / Tokyo / Mumbai) with a WebGL velvet backdrop, scroll-driven animation, live 3D garments and a camera virtual try-on.

## What's inside

| Layer | Tech | Where |
|---|---|---|
| Storefront | React 18 + TypeScript, Vite | `web/src` |
| 3D & shaders | Three.js, React Three Fiber, custom GLSL (velvet cloth, dust) | `web/src/three`, `web/src/garments` |
| Motion | GSAP ScrollTrigger + Lenis smooth scroll | `web/src/lib/motion.ts` |
| Camera try-on | MediaPipe Pose Landmarker, runs fully on-device | `web/src/tryon` |
| API | Python FastAPI + SQLite, JWT auth, bcrypt | `server/` |
| Commerce engine | Same pricing/fit/search rules in Python and TypeScript, checked by a parity test | `server/app/commerce.py`, `web/src/lib/commerce.ts` |
| Asset pipeline | Procedural garments rendered with Playwright, film encoded with ffmpeg | `tools/render` |

Product data lives in one place: `shared/catalog.json`.

## Run it locally

```bash
# 1. API (port 8000)
cd server
pip install -r requirements.txt
uvicorn app.main:app --reload

# 2. Storefront (port 5173, proxies /api to the API)
cd web
npm install
npm run dev
```

Open http://localhost:5173. The camera try-on needs `localhost` or HTTPS.

**Without the API**, the storefront still works fully: it falls back to the TypeScript commerce engine in the browser (accounts and orders are kept in local storage).

## Production

```bash
cd web && npm run build          # outputs web/dist
cd ../server && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

FastAPI serves `web/dist` at `/` and the API at `/api`, so one process hosts everything. `web/dist` also works on any static host (GitHub Pages, Netlify), using the in-browser fallback.

Set `VELOURA_SECRET` to a long random string in production.

## Tests

```bash
cd server && python -m pytest -q   # API, pricing edge cases, and Python/TypeScript parity
```

## Features

- WebGL velvet backdrop that re-dyes per department and reacts to the cursor
- 3D hero garment that turns with scroll; 90-frame scroll-scrubbed exploded view
- Campaign film (desktop and vertical cuts)
- Live camera try-on with body tracking, shoulder measurement and size recommendation; photo upload and mannequin fallbacks
- Fit finder (height, optional weight and chest) with a confidence score
- Bag with one-tap offer codes (ATELIER10, PREPAID5, FIRSTFIT), free-shipping progress and upsells
- Checkout with pincode delivery dates, UPI / card / EMI / cash on delivery, and order tracking
- Typo-tolerant search (press `/`), wishlist, recently viewed, currency switcher (INR/EUR/JPY/USD)
- Concierge chat for sizing, delivery, returns and payment questions
- Drop countdowns with notify-me, back-in-stock alerts, styling session booking
- Mobile bottom bar, sticky add-to-bag, reduced-motion support, keyboard navigation
