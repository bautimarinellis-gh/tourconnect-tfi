# TourConnect — Cliente

Frontend de TourConnect (React 19 + Vite). Consume la API del backend que vive en `/server`.

## Desarrollo

```bash
npm install
npm run dev
```

Levanta Vite en `http://localhost:5173`. El dev server proxea `/api` → `http://localhost:3000`, así que **el backend tiene que estar corriendo en paralelo** (`cd ../server && npm run dev`).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Dev server con HMR (puerto 5173) |
| `npm run build` | Build de producción a `dist/` |
| `npm run preview` | Sirve el build de `dist/` |
| `npm run lint` | ESLint sobre todo el proyecto |
| `npm test` | Tests unitarios con Vitest |

## Estructura

```
src/
  App.jsx        Router + guards de ruta por rol (ProtectedRoute)
  context/       AuthContext (sesión), ThemeContext (dark/light)
  services/      Wrappers de axios por dominio, sobre la instancia base de api.js
  pages/         Una carpeta por rol: admin/, mayorista/, agencia/, auth/
  components/
    layout/      PageWrapper (shell con navbar)
    shared/      Componentes de dominio compartidos entre roles
    ui/          Primitivas reutilizables (Button, Modal, Table, Toast…)
  utils/         Formatters, validaciones (CUIT, teléfono), rangos de fecha
```

La sesión se maneja con una cookie HttpOnly (`token`); en `localStorage` solo se guardan los metadatos del usuario bajo `tourconnect_user_v1`.
