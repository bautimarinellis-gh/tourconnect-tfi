# Auditoría TourConnect — Iteración 2

> Revisión completa del repo desde cero (2026-07-30). No incluye el módulo de seguridad RBAC (roles/permisos personalizables), que se aborda por separado.
> Prioridades: **alta** = rompe algo o compromete la tesis · **media** = deuda visible · **baja** = pulido.

---

## Sumar

- [ ] **Activación de usuarios de agencia sin email** — `server/controllers/agenciaController.js` + `client/src/pages/mayorista/Agencias.jsx` — con `ENABLE_EMAIL=false` la agencia se crea con `activo: false` y solo un `invite_token` que nunca llega; existe `POST /admin/mayoristas/:id/activar-usuario` pero no hay equivalente para agencias, así que una agencia recién creada **no puede loguear nunca**. — **alta**
- [ ] **Tests de integración de controllers y middlewares** — `server/tests/` — los 51 tests actuales son todos de funciones puras (`precioCalculator`, `cuit`, `dateRanges`, `telefono`); nada cubre auth, el borde multi-tenant (`tenantMiddleware` / `validarAccesoReserva`) ni las máquinas de estado de cotización/reserva. — **alta**
- [ ] **Hacer testeable `server/index.js`** — `server/index.js:152` — `startServer()` se ejecuta al importar el módulo, así que `require('./index')` abre conexión a Mongo y escucha el puerto: bloquea montar la app en supertest. Separar `app.js` de `server.js`. — **alta**
- [ ] **Paginación en listados operativos** — `cotizacionController.getCotizaciones`, `reservaController.getReservas`, `productosController.getProductos`, `agenciaController.getAgencias` — devuelven la colección entera; solo auditoría pagina. — **media**
- [ ] **Auditoría de acciones sobre productos** — `server/controllers/productosController.js` — crear / editar / eliminar producto no registran nada en `AuditLog`, aunque el módulo de auditoría se presenta como transversal. — **media**
- [ ] **Auditoría del vencimiento automático de cotizaciones** — `server/utils/cotizacionVencimiento.js` — el cron cambia estados a `vencida` sin dejar rastro en `AuditLog` ni acción `COTIZACION_VENCIDA` en el enum. — **media**
- [ ] **Toggle activo/inactivo de producto** — `client/src/pages/mayorista/Productos.jsx` — la card muestra el badge Activo/Inactivo pero no hay ninguna acción que setee `activo: false`; el estado es inalcanzable desde la UI. — **media**
- [ ] **Validar cupo al crear la cotización, no solo al aprobarla** — `server/utils/cupoValidator.js` + `cotizacionController.createCotizacion` — hoy la agencia puede generar cotizaciones de actividades sin cupo que están condenadas a rechazo. — **media**
- [ ] **Reenviar / copiar link de invitación** — `client/src/pages/mayorista/Agencias.jsx`, `client/src/pages/admin/Mayoristas.jsx` — no hay forma de recuperar el `invite_token` si el email no llegó. — **baja**
- [ ] **Filtro de reservas por agencia server-side** — `client/src/pages/mayorista/Reservas.jsx` — `getReservas` ya soporta `?agencia_id=`, pero la UI filtra por nombre en cliente sobre el set completo. — **baja**

---

## Arreglar

### Auditoría (logs que se pierden en silencio)

- [x] **`MAYORISTA_REACTIVADO` y `CAMBIO_PASSWORD` no están en el enum `ACCIONES`** — `server/models/AuditLog.js` vs `adminController.js:485` y `authController.js:599` — la validación de Mongoose falla, `auditService` atrapa el error y solo hace `console.error`: los eventos nunca se guardan. — **alta**
- [x] **`AGENCIA_REACTIVADA` y `USUARIO_REACTIVADO` no están en `CATEGORIA_POR_ACCION`** — `server/utils/auditService.js` — `categoria` queda `undefined`, el campo es `required`, y el log se descarta igual que el punto anterior. — **alta**
- [x] **`activarUsuarioMayorista` no registra auditoría** — `server/controllers/adminController.js:223` — el admin fija la contraseña de la cuenta de otro usuario y no queda ninguna traza. — **alta**
- [x] **`REPORTE_EXPORTADO` falta en las constantes del frontend** — `client/src/utils/auditoriaConstants.js` — el backend lo escribe, pero no tiene label (se muestra la clave cruda) ni aparece en el filtro del mayorista. — **media**
- [x] **`updateAgencia` y `updatePerfil` no auditan** — `agenciaController.js:227`, `mayoristaController.js:32` — inconsistente con el resto de mutaciones de negocio. — **media**

### Flujo de pagos

- [x] **`rechazarPago` borra el registro de pago** — `server/controllers/reservaController.js:749` — resuelto: ahora marca `rechazado`/`motivo_rechazo`/`rechazado_at` en vez de borrar. — **alta**
- [x] **El pago manual del mayorista no valida el monto** — resuelto de raíz, no parcheado: se probó en vivo que el parche inicial (validar el total en `pagarReserva`) no alcanzaba — `createPago` seguía creando `Pago` sin transacción ni validación, y cada reintento se sumaba sobre el intento fallido anterior en vez de reemplazarlo (100 + 1610 exigía 1710). Decisión de negocio: el mayorista no puede registrar un pago sin que la agencia lo informe antes. Se eliminaron `createPago`, `pagarReserva`, el botón "Registrar Pago" y sus rutas — el único camino a `pagada` es `informarPago` (monto ya validado exacto) → `confirmarPago`/`rechazarPago`. — **alta**
- [x] **`createPago` no registra historial de estado ni auditoría** — moot: `createPago` ya no existe. — **alta**
- [x] **Registrar pago son dos llamadas no atómicas desde el cliente** — moot: el flujo `addPayment()` + `pagar()` que era no atómico ya no existe. — **media**

### Backend

- [x] **`catch` que nunca matchea en agencia-producto** — `server/controllers/agenciaProductoController.js` (eran 5 ocurrencias, no 4) — `error.message.includes('No encontrada')` con N mayúscula, pero el mensaje lanzado es `'Agencia no encontrada o no pertenece a este mayorista'`: devuelve 500 en vez de 404. — **media**
- [x] **`deleteProducto` cuenta un campo inexistente** — `server/controllers/productosController.js:328` — `Reserva.countDocuments({ producto_id: id })`; el modelo `Reserva` no tiene `producto_id` (se llega vía `cotizacion_id`), así que ese contador siempre da 0. — **media**
- [x] **`productosController` responde 500 con `error.message`** — `server/controllers/productosController.js` (eran 6 handlers, no 5 — `checkProductoAgencias` ni siquiera tenía `next` en su firma) — no usa `next(error)`, se saltea el error handler global y filtra detalles internos al cliente. — **media**
- [x] **N+1 en el listado de agencias** — `server/controllers/agenciaController.js:30` — un `countDocuments` por agencia dentro del `for`; reemplazar por un `aggregate` con `$group`. — **media**
- [x] **`/auth/set-password` sin rate limit** — `server/routes/authRoute.js` — es el único endpoint público del flujo de credenciales sin limiter; el `invite_token` es fuerza-bruteable en teoría. — **media**
- [x] **Falta `app.set('trust proxy', ...)`** — `server/index.js` — `express-rate-limit` y `auditService.getIp()` leen `X-Forwarded-For` sin que Express lo valide: la IP auditada es spoofeable y el rate limit se puede evadir. — **media**
- [x] **`contarOperacionesActivas` duplicada** — `adminController.js:254` y `agenciaController.js:259` — misma aggregation con distinto scope; unificar en `utils/`. — **baja**
- [x] **`createAgencia` manda el email antes del commit** — `server/controllers/agenciaController.js:139` — si la transacción aborta después, ya se envió la invitación de una agencia que no existe. — **baja**
- [x] **72h de vencimiento hardcodeadas en dos lugares** — `server/utils/cotizacionVencimiento.js:100` y `client/src/pages/agencia/Cotizaciones.jsx:20` — si cambia una, la UI miente. — **baja**

### Frontend

- [x] **`Toast.jsx` reasigna una variable de módulo durante el render** — `client/src/components/ui/Toast.jsx:37` — `_addToast = useCallback(...)` es un side-effect en render; ESLint lo marca como error de `react-hooks/globals`. — **media**
- [x] **`eslint-disable` de una regla que no existe** — `client/src/components/shared/AssistantChat.jsx:31` — `react-doctor/no-array-index-as-key` no está instalada, así que `npm run lint` falla con error. — **media**
- [x] **`AuthContext.loading` es siempre `false`** — `client/src/context/AuthContext.jsx:41` — las ramas `if (loading)` de `ProtectedRoute` y `RootRedirect` son código muerto, y nunca se revalida la sesión con `/auth/me` al montar: el usuario se ve logueado hasta que un request devuelve 401. — **media** — *implementado con cuidado explícito de no introducir un loop de recarga en `/login`; pendiente de tu verificación manual en navegador (ver checklist en el commit).*
- [x] **Formato de moneda inconsistente** — `client/src/utils/formatters.js` usa `en-US`/`USD`, los dashboards usan `toLocaleString('es-AR')`, y `Productos.jsx` rotula "Precio Base (USD)" en un sistema con CUIT argentino. — **media**
- [x] **El modal de eliminar producto miente** — `client/src/pages/mayorista/Productos.jsx` — dice "Esta acción lo marcará como inactivo", pero `deleteProducto` hace hard delete + borrado en cascada de `AgenciaProducto`. — **media**
- [x] **`no-unused-vars` en el catch** — `client/src/pages/agencia/Cotizaciones.jsx:80` — `catch(e)` sin usar `e`. — **baja** — *ya resuelto como efecto colateral de [[PLAN-QUITAR]] (se eliminó el bloque `datos_extra` que lo contenía).*
- [x] **`logout` sin `navigate` en las deps del `useCallback`** — `client/src/context/AuthContext.jsx:38` — warning de `exhaustive-deps`. — **baja**
- [x] **Las tres páginas de Auditoría se titulan "Mi actividad"** — `client/src/pages/{admin,mayorista,agencia}/Auditoria.jsx` — no distinguen rol ni scope. — **baja**
- [x] **Dashboard mayorista: kicker desalineado con los datos** — `client/src/pages/mayorista/Dashboard.jsx` — dice "Ultimos 30 dias" (además sin tildes) pero `getMayoristaDashboard` calcula sobre el mes calendario en curso. — **baja**

### Documentación

- [x] **`CLAUDE.md` referencia `seeds/admin.seed.js`** — el archivo real es `server/seeds/adminSeed.js`. También omite el estado `cancelada` de `Cotizacion`. — **baja**
- [x] **`AGENTS_RULES.md` referencia un `AGENTS.md` inexistente** — el contexto de proyecto vive en `CLAUDE.md`. — **baja**

---

## Quitar

- [x] **`server/utils/testModule3.js`** — script huérfano que al ejecutarse se conecta a Mongo y crea un mayorista de prueba; no lo importa nadie. — **alta**
- [x] **`client/remove-bg.mjs`** — script one-off para el logo; importa `@napi-rs/canvas`, que ni siquiera está en `package.json`. — **media**
- [x] **`confirmarCotizacion` / `rechazarCotizacion` + rutas `PUT /:id/confirmar` y `PUT /:id/rechazar`** — `server/controllers/cotizacionController.js`, `server/routes/cotizacionRoute.js` — duplican exactamente `PATCH /:id/estado`, que es lo único que usa el frontend. — **media**
- [x] **`getReservasPorMes` y `getIngresosPorAgencia` + rutas `/reportes/reservas` y `/reportes/ingresos/agencias`** — `server/controllers/reporteController.js` — ninguna página los consume; `reporteService.getReservasPorMes` tampoco se usa. — **media**
- [x] **Los tres wrappers idénticos de auditoría** — `client/src/pages/{admin,mayorista,agencia}/Auditoria.jsx` — los tres son `<AuditoriaPage title="Mi actividad" />`; una sola ruta compartida alcanza. — **media**
- [x] **Campos muertos del form de producto** — `client/src/pages/mayorista/Productos.jsx` — `hotel_ciudad` y `dias_antelacion`: se editan en la UI, `buildPayload` no los envía y el modelo `Producto` no los tiene. — **media**
- [x] **Campos muertos del form de agencia** — `client/src/pages/mayorista/Agencias.jsx` — `email_contacto` nunca se envía; `admin_nombre` viaja como `nombre_usuario`, que el backend destructura y descarta. — **media**
- [x] **`datos_extra` y `cancelMotivo`** — `client/src/pages/agencia/Cotizaciones.jsx` — se recolectan (incluso con parseo de JSON) y el backend los ignora por completo. — **media**
- [x] **`nombre_usuario` en `crearMayorista` y `createAgencia`** — `server/controllers/adminController.js:46`, `agenciaController.js:57` — destructurado y nunca usado. — **baja**
- [x] **`POST /reservas` (`createReserva` sin id en URL)** — `server/routes/reservaRoute.js` — el cliente solo usa `POST /reservas/cotizacion/:cotizacionId`. — **baja**
- [x] **`GET /reservas/:id/historial`** — `server/routes/reservaRoute.js` — el endpoint de detalle ya devuelve el historial embebido; sin consumidor. — **baja**
- [x] **`reporteHelpers.matchReservaBase`** — `server/utils/reporteHelpers.js:33` — definido y exportado, nunca importado. — **baja**
- [x] **`productoService.getById` y `cotizacionService.getById`** — `client/src/services/` — métodos sin consumidor (y con ellos queda huérfano `GET /productos/:id`). — **baja**
- [x] **`client/README.md`** — sigue siendo la plantilla por defecto de Vite. — **baja**

---

## Revisar

- [ ] **Scoping del módulo de auditoría** — `server/controllers/auditoriaController.js:42` — hoy cada usuario (admin incluido) ve **solo las acciones que él mismo ejecutó**. El mayorista no ve la actividad de sus agencias dentro de su propio tenant, lo que deja el panel bastante vacío. ¿Es la decisión que querés defender, o el mayorista debería ver todo su tenant? — **alta**
- [ ] **Transacciones de Mongoose** — `adminController`, `agenciaController`, `reservaController`, `agenciaProductoController` — `session.startTransaction()` requiere replica set. Si la instancia de desarrollo/defensa es un Mongo standalone, **todo el alta de mayoristas, agencias y reservas falla**. Confirmar si es Atlas o standalone. — **alta**
- [ ] **`ENABLE_EMAIL` desactivado** — `server/utils/mailer.js:27` — con el flag en false todos los envíos retornan `null` en silencio, pero la UI igual dice "Se le envió un email de invitación". ¿Se activa SMTP para la defensa o se documenta como fuera de alcance y se agrega una alternativa in-app? Condiciona el ítem de activación de agencias. — **alta**
- [ ] **`activarUsuarioMayorista`** — `server/controllers/adminController.js:223` — el admin puede fijar la contraseña de la cuenta de un mayorista. ¿Se justifica como recuperación operativa, o preferís forzar siempre el flujo de invitación/reset? Decide también si se replica para agencias. — **media**
- [ ] **Moneda del sistema** — ¿USD o ARS? La decisión define `formatters.js`, los labels de `Productos.jsx` y el PDF de reportes, que hoy mezclan las tres cosas. — **media**
- [ ] **Perfil de mayorista** — `server/controllers/mayoristaController.js` + `server/routes/mayoristaRoute.js` — `GET`/`PUT /mayoristas/perfil` funcionan pero ningún componente los llama (`ProfileModal` es solo lectura vía `/auth/me`). ¿Se implementa la UI de edición o se borra el módulo? — **media**
- [ ] **Cancelación de reservas ya pagadas** — `server/controllers/reservaController.js:345` — se permite cancelar desde `pagada` sin ninguna lógica de reembolso ni nota contable. ¿Debería bloquearse o requerir un paso extra? — **media**
- [ ] **Token blacklist en memoria** — `server/controllers/authController.js:33` — el `Set` se vacía en cada reinicio, así que los tokens deslogueados vuelven a ser válidos hasta expirar (7 días). ¿Se documenta como limitación conocida o se acorta el `JWT_EXPIRES_IN`? — **media**
- [ ] **`buildCotizacionIdsFilter` con `distinct('_id')`** — `server/utils/reservaHelpers.js:53` — trae todos los ids de cotización en memoria para armar un `$in`; no escala más allá de unos miles. ¿Vale refactorizar a aggregation o se acepta para el alcance de la tesis? — **media**
- [ ] **`POST /productos` sin middleware `tenant`** — `server/routes/productoRoute.js` — usa `req.usuario.mayorista_id` directo mientras que `PUT`/`DELETE` sí pasan por `tenant` + `checkOwnership`. Funciona, pero rompe el patrón que documenta `CLAUDE.md`. — **baja**
- [ ] **Vencimiento de cotizaciones** — `server/utils/cotizacionVencimiento.js` — 72h fijas y `setInterval` dentro del proceso web. ¿Configurable por mayorista? ¿Cron externo o índice TTL? — **baja**
