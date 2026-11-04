# TourConnect

Plataforma B2B SaaS que digitaliza la relación comercial entre **operadores mayoristas turísticos** y **agencias minoristas**: catálogo con precios calculados por agencia, cotizaciones con control de cupo, reservas con trazabilidad, pagos (informados a mano o con Mercado Pago en modo prueba) y un asistente que responde consultas en lenguaje natural (Google Gemini, con un modo básico de respaldo).

Trabajo Final de Ingeniería — Bautista Marinelli Scaglia, UAI, Facultad de Tecnología Informática (2026).

Stack MERN: React 19 + Vite en el cliente, Node.js + Express en el servidor y MongoDB Atlas con Mongoose.

---

## Cómo levantarlo

1. Crear un `.env` en la raíz del repo con estas variables (no se sube al repositorio):

   | Variable | Para qué |
   |---|---|
   | `MONGO_URI` (*) | MongoDB con replica set (Atlas ya lo es); la demo usa la base `tourconnect_mesa` |
   | `JWT_SECRET` (*) | Secreto para firmar las sesiones, de 32 caracteres o más |
   | `PORT`, `CLIENT_URL` | Puerto de la API (3000) y URL del cliente (`http://localhost:5173`) |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin de la plataforma que crean los seeds |
   | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS` | Asistente con IA; sin clave responde en modo básico |
   | `MP_ACCESS_TOKEN`, `MP_TIPO_CAMBIO_ARS` | Mercado Pago con credenciales de prueba; sin token el pago con MP queda deshabilitado |
   | `MP_WEBHOOK_URL`, `MP_WEBHOOK_SECRET` | Opcionales: webhook público de Mercado Pago y su firma |
   | `ENABLE_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Envío de mails; con `ENABLE_EMAIL` distinto de `true` no se envía ninguno |
   | `JWT_EXPIRES_IN`, `INVITE_TOKEN_EXPIRES_HOURS`, `COTIZACION_EXPIRA_HORAS`, `TAREAS_PERIODICAS` | Opcionales: duración de la sesión (7d), de las invitaciones (48 h), de las cotizaciones (72 h) y si esta instancia corre los vencimientos (`true`) |

   Las marcadas con (*) son obligatorias: sin ellas el servidor no arranca.
2. Instalar dependencias:

   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

3. Levantar el servidor y el cliente, cada uno en su terminal:

   ```bash
   cd server && npm run dev     # API en http://localhost:3000
   cd client && npm run dev     # App en http://localhost:5173
   ```

   El cliente redirige `/api` al puerto 3000, así que los dos tienen que estar corriendo.

Al arrancar, el servidor crea solo el catálogo de permisos y el rol Administrador, y corre los vencimientos automáticos (cotizaciones, reservas y productos).

---

## Base de datos de la demo

`npm run seed:mesa` (desde `server/`) **vacía y vuelve a cargar** la base `tourconnect_mesa` con un año de operación: catálogo, márgenes por agencia, cotizaciones en todos sus estados, reservas con su historial, pagos manuales y con Mercado Pago de prueba, rechazos, devoluciones, grupos de seguridad y auditoría. Solo corre si el `MONGO_URI` apunta a esa base.

Las fechas se calculan desde el día en que se corre y las cotizaciones vencen solas a las 72 horas: conviene correrlo el día antes de mostrar la app.

### Usuarios

| Rol | Email | Contraseña | Qué se puede mostrar |
|---|---|---|---|
| Mayorista | `mayorista@gmail.com` | `Mayorista123@` | Panel, 4 cotizaciones para responder, 2 pagos para confirmar, reportes, auditoría, seguridad y el asistente |
| Agencia | `agencia@gmail.com` | `Agencia123@` | Catálogo con precios, 2 cotizaciones aprobadas para reservar, reservas para informar un pago o pagar con Mercado Pago |
| Admin | `ADMIN_EMAIL` del `.env` | `ADMIN_PASSWORD` del `.env` | Mayoristas de la plataforma y sus planes |

Son los únicos tres usuarios que pueden iniciar sesión. Las otras seis agencias del mayorista ("Viajes del Sur", "Norte Turismo", etc.) tienen usuario pero no contraseña: están para que los reportes y el asistente tengan con qué comparar.

`npm run seed:admin` crea solo el admin (con las variables del `.env`), para arrancar una base vacía.

---

## Pagos de prueba con Mercado Pago

Datos públicos del entorno de prueba de Mercado Pago Argentina. **No mueven dinero real.**

| Tarjeta | Número | CVV | Vencimiento |
|---|---|---|---|
| Visa | 4509 9535 6623 3704 | 123 | 11/30 |
| Mastercard | 5031 7557 3453 0604 | 123 | 11/30 |
| American Express | 3711 803032 57522 | 1234 | 11/30 |

DNI del titular: `12345678`. Email del comprobante: cualquiera ficticio (por ejemplo `test_user_x@testuser.com`).

El **nombre del titular** decide el resultado:

| Nombre | Resultado | En TourConnect |
|---|---|---|
| `APRO` | Aprobado | La reserva pasa a **Pagada** |
| `CONT` | Pendiente | Pasa a **Pago informado** (pendiente de acreditación) |
| `OTHE` | Rechazado (error general) | Sigue en **Pendiente de pago**, con el motivo |
| `FUND` | Rechazado por fondos insuficientes | Ídem |
| `SECU` | Rechazado por código de seguridad inválido | Ídem |
| `EXPI` | Rechazado por fecha de vencimiento | Ídem |
| `CALL` | Rechazado: pide autorizar con el banco | Ídem |

**Efectivo:** en el checkout, *Efectivo → Rapipago / Pago Fácil*. Genera un cupón que queda pendiente.

- Pagar en una ventana de incógnito o sin una cuenta real de Mercado Pago abierta en ese navegador.
- No pagar con el usuario vendedor de prueba (`TESTUSER…`): Mercado Pago rechaza pagarse a uno mismo. Pagar como invitado y en 1 cuota.
- Si el CVV marca "Completá este campo" aunque se vea cargado, borrarlo y escribirlo de nuevo.
- Al terminar, volver a la pestaña de TourConnect: la reserva consulta a Mercado Pago sola y se actualiza.
- Cancelar una reserva pagada (solo el mayorista) registra una **devolución simulada**: el entorno de prueba no permite reembolsos por API.

---

## Estructura

```
server/              API REST (Node.js + Express)
  index.js           Arranque: middlewares globales, rutas, tareas periódicas
  config/            Conexión a MongoDB y validación del .env
  routes/            Endpoints por módulo
  middlewares/       Autenticación (JWT), rol, tenant, permisos, límites de uso
  controllers/       Lógica de cada caso de uso
  services/          Servicios externos y transversales: Gemini, Mercado Pago, correo, auditoría
  models/            Esquemas de Mongoose
  utils/             Reglas de negocio (precio, cupo, vencimientos, fechas) y helpers
    asistente/       Asistente inteligente: catálogo de consultas, clasificador y armado de consultas
  seeds/             Base de la demo (seed:mesa) y admin inicial (seed:admin)
  tests/             Pruebas automatizadas (node:test)
client/              SPA (React 19 + Vite)
  src/
    App.jsx          Rutas y guardas por rol
    config/          Menú de navegación por rol
    context/         Sesión y tema (claro / oscuro)
    services/        Llamadas a la API por módulo
    pages/           Una carpeta por rol: admin/, mayorista/, agencia/, auth/, auditoria/
    components/
      layout/        Estructura de página (navbar)
      shared/        Componentes de dominio compartidos entre roles
      ui/            Componentes base (Button, Modal, Table, Toast…)
    hooks/           Sesión, permisos, tema, toasts y auditoría
    utils/           Formatos, validaciones (CUIT, teléfono), precios y fechas
```

La sesión viaja en una cookie HttpOnly (`token`); en `localStorage` solo se guardan los datos visibles del usuario.

---

## Scripts

| Dónde | Comando | Qué hace |
|---|---|---|
| `server` | `npm run dev` | API con recarga automática (puerto 3000) |
| `server` | `npm test` | Pruebas automatizadas (156 casos) |
| `server` | `npm run seed:mesa` | Vacía y carga la base de la demo |
| `server` | `npm run seed:admin` | Crea el admin de la plataforma |
| `client` | `npm run dev` | App con recarga automática (puerto 5173) |
| `client` | `npm run build` | Build de producción a `dist/` |
| `client` | `npm test` | Pruebas del cliente (vitest) |
| `client` | `npm run lint` | ESLint |
