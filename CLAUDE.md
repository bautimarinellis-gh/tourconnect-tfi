# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TourConnect is a B2B travel management SaaS. The system has three user roles: **admin** (platform owner), **mayorista** (wholesaler, multi-tenant owner), and **agencia** (travel agency, belongs to a mayorista). Every data operation is scoped to a mayorista tenant.

## Commands

### Backend (`/server`)
```bash
cd server
npm run dev          # Start with nodemon (development)
npm start            # Start with node (production)
npm run seed:admin   # Seed the initial admin user
```

### Frontend (`/client`)
```bash
cd client
npm run dev          # Start Vite dev server (port 5173, proxies /api → localhost:3000)
npm run build        # Production build to dist/
npm run lint         # ESLint
npm run preview      # Preview production build
```

Both servers must run simultaneously for local development. The `.env` file lives at the repo root and is loaded by the server with `dotenv.config({ path: '../.env' })`.

## Architecture

### Multi-tenancy
The `tenantMiddleware` (`server/middlewares/tenantMiddleware.js`) injects `req.mayorista_id` on every authenticated request. All controllers filter queries using `req.mayorista_id` — this is the primary multi-tenancy boundary. Admins bypass it.

### Auth flow
- JWT stored in an HttpOnly cookie named `token`
- User metadata (email, rol, mayorista_id) stored in `localStorage` under `tourconnect_user` for client-side reads
- Token blacklist is an in-memory Set in `authController.js` — cleared on server restart
- Middleware chain: `auth` → `role` → `tenant` → controller

### Data model (MongoDB/Mongoose)
- `Persona` is the discriminator base with `__t` key. `Mayorista` and `Agencia` extend it.
- `Usuario` stores credentials separately from `Persona`; linked by `usuario_id`.
- `Cotizacion` connects Agencia → Producto → Mayorista. States: `pendiente → aprobada/rechazada/vencida → reserva_generada`.
- `Reserva` is 1:1 with `Cotizacion`. States: `pendiente_pago → pago_informado → pagada → cerrada/cancelada`.
- `HistorialEstadoReserva` tracks every state transition with timestamps.
- Cotizaciones auto-expire via a polling loop in `server/utils/cotizacionVencimiento.js` (runs hourly).

### Backend structure
```
server/
  index.js              # Express app entry, middleware stack, route registration
  config/db.js          # Mongoose connection
  models/               # Mongoose schemas (Persona discriminator pattern)
  controllers/          # Business logic, one file per domain
  routes/               # Express routers, one file per domain
  middlewares/          # auth, role, tenant
  utils/                # Email (mailer), pricing calc, report helpers, AI assistant internals
  seeds/admin.seed.js   # One-time admin bootstrap
```

### Frontend structure
```
client/src/
  App.jsx               # Router + role-based route guards (ProtectedRoute)
  context/              # AuthContext (user state), ThemeContext (dark/light)
  hooks/                # useAuth, useTheme
  services/             # Axios wrappers per domain, all share api.js base instance
  pages/
    admin/              # Admin dashboard + mayorista management
    mayorista/          # Full CRUD for agencies, products, quotes, bookings, reports
    agencia/            # Catalog browsing, quoting, booking tracking
    auth/               # Login, SetPassword (invite flow), ResetPassword
  components/
    layout/             # PageWrapper (sidebar + header shell)
    shared/             # ProtectedRoute
    ui/                 # Toast, ThemeToggle, reusable primitives
```

### AI Assistant module
The assistant (`/api/v1/assistant`) uses a keyword-scoring intent classifier (not an LLM). Flow: `assistantController` → `intentClassifier` (scores against `intentCatalog`) → `queryExecutor` (runs Mongoose queries). Intents are in `server/utils/intentCatalog.js`. Visualization type is declared per intent (`table`, `list`, `stat`).

### API conventions
- All responses: `{ success: boolean, data?: any, message?: string }`
- Base path: `/api/v1/`
- Health check: `GET /api/v1/health`
- All non-auth routes require the `auth` middleware; most also require `tenant`

## Key constraints from AGENTS_RULES.md
- Plan changes before touching more than 2 files
- Only modify files required by the task; don't clean up unrelated code
- Do not install dependencies without notifying the user
- Do not commit or push without explicit instruction
