# Plan de correcciones — sección "Arreglar"

> Deriva de [[AUDITORIA-2]]. Mismo criterio que [[PLAN-QUITAR]]: re-verifiqué cada ítem contra el código actual (post-merge de la limpieza) antes de planificar. Fases ordenadas de menor a mayor riesgo; commit por fase.

---

## Correcciones al checklist original

Al re-verificar aparecieron matices que cambian el alcance de 4 ítems:

1. **`AGENCIA_REACTIVADA` y `USUARIO_REACTIVADO` sí están en el enum `ACCIONES`** de `AuditLog.js` (ya estaban). El bug real es más angosto de lo que decía el ítem: solo faltan en `CATEGORIA_POR_ACCION` de `auditService.js`. El fix es una línea menos de lo previsto, pero el bug es el mismo (log descartado).
2. **`agenciaProductoController.js` tiene 5 ocurrencias del catch roto, no 4.** Y el matiz exacto no es "N mayúscula" sino case-sensitivity: el mensaje real es `'Agencia no encontrada...'` (n minúscula) y el check busca `'No encontrada'` (N mayúscula) — `.includes()` es case-sensitive en JS, nunca matchea. Una de las 5 (la de `syncProductosAgencia`) tiene un `||` con `'no pertenece'` en minúscula que sí matchea, así que ahí el bug es inofensivo por casualidad; en las otras 4 no hay red de contención y cae al 500 genérico.
3. **`productosController.js` tiene 6 handlers con `res.status(500)`, no 5** (conté `checkProductoAgencias`, que además ni siquiera recibe `next` en su firma).
4. **`deleteProducto` — el bug es real pero su impacto práctico es menor de lo que sugiere la redacción original.** `Cotizacion.countDocuments({ producto_id: id })` sí cuenta correctamente (Cotizacion tiene ese campo), y como las Cotizacion nunca se borran, toda Reserva activa tiene necesariamente una Cotizacion viva con ese `producto_id` — así que el chequeo de cotizaciones ya bloquea el borrado en la práctica. El bug real es que el mensaje de error siempre dice "0 reserva(s) asociada(s)" aunque exista una activa: es un bug de exactitud del mensaje, no un agujero que permita borrar un producto con reservas vivas. Igual se corrige (la prioridad `media` del checklist ya reflejaba esto correctamente).

Además, dos ítems no listados como tales resultaron ser la misma cosa vista desde dos ángulos:

5. **"Formato de moneda inconsistente" (Arreglar) es el síntoma de "Moneda del sistema" (Revisar).** No se puede arreglar el formato sin decidir la moneda. Este plan lo separa: la inconsistencia *interna* (una función de formato vs. llamadas sueltas a `toLocaleString` desperdigadas) se corrige sí o sí unificando en una sola función; pero qué moneda/locale usa esa función es una decisión tuya, iprevia a implementar la Fase 6.
6. **"Las tres páginas de Auditoría se titulan igual" ya cambió de forma** tras la limpieza anterior: ya no son tres wrappers, es una sola `AuditoriaPage` reutilizada tres veces con el mismo `title="Mi actividad"` fijo. El bug (no distinguen rol) sigue vivo, el fix es igual de simple.

---

## Fase 0 — Baseline

```bash
cd server && node --test
cd ../client && npm run build && npm run lint 2>&1 | tail -20
```

Baseline esperado (confirmado ahora): tests 5/5 ✓, build ✓, lint **5 errores + 1 warning**. Igual que en la limpieza, el criterio de cada fase no es "lint en verde" sino "no aumentó la lista de errores" — con la salvedad de que en la Fase 8 el número va a **bajar** (dos de esos errores están en el checklist).

```bash
git checkout -b fix/correcciones-auditoria-2
```

---

## Fase 1 — Documentación · riesgo nulo

- [ ] **`CLAUDE.md:44`** — agregar el estado `cancelada` a la lista de `Cotizacion`: `pendiente → aprobada/rechazada/vencida/cancelada → reserva_generada`.
- [ ] **`CLAUDE.md:59`** — `seeds/admin.seed.js` → `seeds/adminSeed.js` (el archivo real).
- [ ] **`AGENTS_RULES.md`** — las 3 referencias a un `AGENTS.md` en la raíz (líneas 4, 103, 113) no corresponden a este repo, donde el contexto de proyecto vive en `CLAUDE.md`. Corregir la referencia.

**Verificación:** ninguna, son archivos `.md`.

---

## Fase 2 — Auditoría: logs que se pierden en silencio · riesgo bajo

Los tres bugs comparten el mismo mecanismo (Mongoose rechaza el `create()`, `auditService` atrapa el error y solo hace `console.error`), así que van en un solo commit.

- [ ] **`server/models/AuditLog.js`** — agregar `'MAYORISTA_REACTIVADO'` y `'CAMBIO_PASSWORD'` al array `ACCIONES` (se emiten desde `adminController.js:485` y `authController.js:599` respectivamente, pero la validación del enum los rechaza).
- [ ] **`server/utils/auditService.js`** — agregar las 4 acciones que faltan en `CATEGORIA_POR_ACCION` (sin esto, `categoria` queda `undefined`, que es `required`, y el log se descarta igual):
  - `MAYORISTA_REACTIVADO: 'seguridad'`
  - `CAMBIO_PASSWORD: 'seguridad'`
  - `AGENCIA_REACTIVADA: 'seguridad'`
  - `USUARIO_REACTIVADO: 'seguridad'`
- [ ] **`server/controllers/adminController.js:223`** (`activarUsuarioMayorista`) — agregar `registrarAuditoria` con una acción nueva. No hay ninguna existente que le quede bien (`USUARIO_CREADO`/`SET_PASSWORD` no aplican: no es el usuario configurando su propia clave, es el admin fijándosela). Agrego `'ACTIVACION_MANUAL_USUARIO'` al enum, categoría `seguridad`, con `detalle: { usuario_id, email }`.
- [ ] **`client/src/utils/auditoriaConstants.js`** — como consecuencia de lo anterior, sumar las 3 acciones nuevas a `ACCION_LABELS` y a `ACCIONES_POR_ROL.admin.seguridad` (para `MAYORISTA_REACTIVADO` y `ACTIVACION_MANUAL_USUARIO`, que son admin-only) y agregar `CAMBIO_PASSWORD` a `SEGURIDAD_ADMIN`, `SEGURIDAD_MAYORISTA` y `SEGURIDAD_AGENCIA` (los tres roles pueden cambiar su contraseña desde `ProfileModal`).
- [ ] **`REPORTE_EXPORTADO`** — ya está en el enum del backend y en `CATEGORIA_POR_ACCION`; solo falta en el frontend: agregar a `ACCION_LABELS` (`'Reporte exportado'`) y a `NEGOCIO_MAYORISTA` en `auditoriaConstants.js`.
- [ ] **`updateAgencia`** (`agenciaController.js:227`) y **`updatePerfil`** (`mayoristaController.js:32`) — agregar `registrarAuditoria({ accion: 'AGENCIA_ACTUALIZADA' / 'MAYORISTA_ACTUALIZADO', detalle: { cambios: updateFields } })`, mismo patrón que `updateMayorista` en `adminController.js`. `MAYORISTA_ACTUALIZADO` ya existe en el enum; `AGENCIA_ACTUALIZADA` es nueva (agregar a `AuditLog.js`, `auditService.js` categoría `negocio`, y a `auditoriaConstants.js` en `NEGOCIO_MAYORISTA`).

**Verificación:** `node --test` en server (no hay tests de este módulo, pero confirma que nada rompe al cargar). Recorrido manual tuyo: reactivar un mayorista, reactivar una agencia, cambiar tu contraseña desde el perfil, activar-usuario de un mayorista desde el admin, editar el perfil de una agencia — y confirmar en `/mayorista/auditoria` (o `/admin/auditoria`) que cada acción aparece con su label correcto, no con la clave cruda.

---

## Fase 3 — Backend: bugs de lógica sin riesgo de romper flujos · riesgo bajo

Cada uno es independiente; agrupo en un commit por ser todos del mismo tamaño y naturaleza (correcciones puntuales, sin cambio de contrato de API).

- [ ] **`agenciaProductoController.js`** (5 ocurrencias: líneas 40, 90, 188, 249, 287) — cambiar `error.message.includes('No encontrada')` por `error.message.includes('no encontrada')` (case correcto). Devuelven 404 en vez de 500 cuando corresponde.
- [ ] **`productosController.js` — `deleteProducto` (línea 328)** — reemplazar el conteo roto:
  ```js
  const cotizacionIds = await Cotizacion.find({ producto_id: id }).distinct('_id');
  const reservas = await Reserva.countDocuments({ cotizacion_id: { $in: cotizacionIds } });
  ```
  (en paralelo con el conteo de `cotizaciones`, como ya está).
- [ ] **`productosController.js` — los 6 handlers con `res.status(500).json({ message: error.message })`** — cambiar a `next(error)`, preservando las ramas específicas que ya existen (`ValidationError` → 400, `error.kind === 'ObjectId'` → 404) antes del fallback genérico. Agregar `next` a la firma de `checkProductoAgencias`, que no lo tiene.
- [ ] **`agenciaController.js` — `getAgencias` (N+1, línea ~20-36)** — reemplazar el `for` con un `countDocuments` por agencia por una sola aggregation:
  ```js
  const counts = await AgenciaProducto.aggregate([
    { $match: { agencia_id: { $in: agencias.map(a => a._id) }, habilitado: true } },
    { $group: { _id: '$agencia_id', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map(c => [c._id.toString(), c.count]));
  agencias.forEach(a => { a.productos_habilitados = countMap.get(a._id.toString()) ?? 0; });
  ```
- [ ] **`server/routes/authRoute.js:36`** — agregar el limiter al único endpoint público sin rate limit: `router.post('/set-password', authLimiter, setPassword)`.
- [ ] **`server/index.js`** — agregar `app.set('trust proxy', 1)` antes de los middlewares (necesario para que `express-rate-limit` y `auditService.getIp()` lean `X-Forwarded-For` de forma confiable en vez de spoofeable/inútil).
- [ ] **`contarOperacionesActivas` duplicada** — crear `server/utils/operacionesActivas.js` con una función parametrizada por el filtro de Mongo y el `$match` de la aggregation; usarla desde `adminController.contarOperacionesActivasMayorista` y `agenciaController.contarOperacionesActivas`. Mismo comportamiento, sin duplicación.
- [ ] **`createAgencia` — email antes del commit** (`agenciaController.js`, línea del `enviarInvitacion` antes de `commitTransaction`) — mover el bloque `try { await enviarInvitacion(...) } catch` a después de `session.commitTransaction()` / `session.endSession()`, igual que ya hace `crearMayorista` en `adminController.js`.
- [ ] **72h hardcodeadas en dos lugares** — extraer una constante compartida. Como backend y frontend son procesos separados (no comparten módulos), la opción realista es: mover el valor a `server/utils/cotizacionVencimiento.js` como `HORAS_VENCIMIENTO_COTIZACION = 72` (exportada) y, del lado del cliente, dejar `HORAS_VENCIMIENTO` en `agencia/Cotizaciones.jsx` con un comentario que referencia explícitamente el valor del backend, ya que no hay endpoint que lo exponga. (Alternativa más robusta —exponerlo vía `/api/v1/health` o un endpoint de config— es mayor alcance que "arreglar"; lo dejo anotado pero no lo hago acá.)

**Verificación:** `node --test`, arrancar el server, y recorrido manual tuyo: crear una agencia (confirmar que el mail sale después de guardar), listar agencias del mayorista, intentar borrar un producto con cotizaciones asociadas (debe seguir bloqueado), sincronizar productos de una agencia con un `producto_id` inexistente (debe dar 404 no 500).

---

## Fase 4 — Frontend: correcciones de texto y comportamiento menor · riesgo bajo

- [ ] **Modal "Eliminar Producto" miente** (`client/src/pages/mayorista/Productos.jsx`) — cambiar "Esta acción lo marcará como inactivo" por una descripción correcta del hard-delete: *"Esta acción es irreversible: el producto y sus vínculos con agencias se eliminarán definitivamente."*
- [ ] **Dashboard mayorista — kicker desalineado** (`client/src/pages/mayorista/Dashboard.jsx:42`) — "Ultimos 30 dias" no corresponde a lo que calcula `getMayoristaDashboard` (mes calendario en curso, no ventana móvil de 30 días). Cambiar a "Mes actual".
- [ ] **Títulos de Auditoría no distinguen rol** (`client/src/App.jsx`, las 3 rutas `/auditoria`) — cambiar el `title` fijo `"Mi actividad"` por uno específico: admin → "Mi actividad — Administrador", mayorista → "Mi actividad — Mayorista", agencia → "Mi actividad — Agencia". (Cosmético; no toca el scoping de qué eventos ve cada uno, eso sigue en *Revisar*.)

**Verificación:** `npm run build`; recorrido visual tuyo por las 3 páginas de auditoría, el dashboard de mayorista, y el modal de eliminar producto.

---

## Fase 5 — Lint: los dos ítems puntuales de la lista · riesgo bajo

- [ ] **`Toast.jsx:37`** — la reasignación de `_addToast` durante el render. Fix mínimo, sin rediseñar el patrón: mover la asignación a un `useEffect`:
  ```js
  useEffect(() => {
    _addToast = handleAdd; // handleAdd = el mismo useCallback, sin cambios de lógica
  }, [handleAdd]);
  ```
  Esto no cambia el comportamiento (sigue siendo un event-bus module-level), solo saca la mutación del cuerpo de render.
- [ ] **`AssistantChat.jsx:31`** — quitar el comentario `// eslint-disable-next-line react-doctor/no-array-index-as-key`. El plugin `react-doctor` no está en `eslint.config.js`; el disable-comment no protege nada, solo genera el error de "regla no encontrada". No hay ninguna regla activa en el proyecto que sancione usar el índice como `key` en ese `.map()`, así que quitar el comentario no destapa ningún otro error.

**Nota de alcance:** esto deja el lint en **3 errores** (no 0): los dos `react-refresh/only-export-components` de `AuthContext.jsx` y `ThemeContext.jsx`, más el warning de `exhaustive-deps`, que se resuelven en la Fase 7. `Toast.jsx` también tiene un `react-refresh/only-export-components` propio (por exportar `useToast` junto al componente) que **no está en el checklist original** y no lo toco en esta fase — señalarlo por si querés agregarlo a un futuro backlog.

**Verificación:** `npm run lint` — debería bajar a 3 errores + 1 warning (o quedar en 2 errores tras la Fase 7).

---

## Fase 6 — Moneda del sistema · requiere tu decisión

Antes de esta fase necesito que definas: **¿el sistema factura en pesos argentinos (ARS) o en dólares (USD)?**

Contexto para decidir: el modelo `Persona` (base de `Mayorista`/`Agencia`) exige CUIT argentino, no hay ningún campo de moneda en ningún modelo, `formatCurrency` en `formatters.js` usa `Intl.NumberFormat('en-US', { currency: 'USD' })`, pero los dashboards de reportes formatean manualmente con `.toLocaleString('es-AR')` (sin símbolo de moneda), y `Productos.jsx` rotula el campo "Precio Base (USD)". Es decir: hoy conviven tres representaciones distintas del mismo número.

Una vez que decidas:
- [ ] Unificar `formatCurrency` en `formatters.js` a un solo `Intl.NumberFormat` (locale + currency que definas) y usarlo en los lugares que hoy hacen `.toLocaleString('es-AR')` manual (dashboards de mayorista, `Reportes.jsx`) en vez de duplicar el formato.
- [ ] Ajustar el label de `Productos.jsx` (`"Precio Base (USD)"` → lo que corresponda, o quitarlo si se opta por no mostrar moneda explícita).
- [ ] Ajustar `formatMoney` del PDF en `reporteController.js` si el locale elegido difiere del `es-AR` que ya usa ahí.

**Verificación:** recorrido visual tuyo por Dashboard, Reportes, Productos y el PDF exportado, confirmando que el símbolo/formato es el mismo en todas partes.

---

## Fase 7 — `AuthContext.loading` y revalidación de sesión · riesgo medio, requiere tu prueba manual

Este es el ítem de mayor riesgo del lote porque cambia comportamiento en cada carga de la app, no solo corrige un bug aislado.

**El problema real, verificado:** `loading` está hardcodeado en `false` (`AuthContext.jsx:40`), así que las ramas `if (loading)` en `ProtectedRoute` y `RootRedirect` nunca se ejecutan. Más importante: el `user` que ve la UI viene *solo* de `localStorage`, nunca se revalida contra `/auth/me`. Si el usuario fue desactivado, o el JWT expiró, o alguien manipuló el `localStorage`, la UI lo sigue mostrando como logueado hasta que dispare una request que devuelva 401/403.

**Diseño del fix** (ya evalué el riesgo de loop de redirect antes de proponerlo):

```js
const [user, setUser] = useState(() => { /* igual que ahora, lee localStorage */ });
const [loading, setLoading] = useState(true);

useEffect(() => {
  // Si no hay sesión guardada, no hay nada que revalidar: no llamamos a la API.
  // Esto es intencional — evita pegarle a /auth/me en cada visita anónima a
  // /login, /set-password o /reset-password, donde SIEMPRE devolvería 401
  // y el interceptor de api.js redirige a /login en cualquier 401 fuera de
  // /auth/login. Sin este guard, un visitante sin sesión en /login entraría
  // en un loop de recarga infinita.
  if (!user) { setLoading(false); return; }

  let cancelled = false;
  authService.getMe()
    .then((res) => {
      if (cancelled) return;
      const userData = res?.data?.usuario;
      localStorage.setItem('tourconnect_user_v1', JSON.stringify(userData));
      setUser(userData);
    })
    .catch(() => {
      // 401/403: el interceptor de api.js ya limpia localStorage y redirige.
      // No hace falta duplicar esa lógica acá.
    })
    .finally(() => { if (!cancelled) setLoading(false); });

  return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- se ejecuta una
  // sola vez al montar, con el user leído del localStorage en el init.
}, []);
```

**Por qué este diseño específico y no uno más simple:** revisé el interceptor de `api.js` — cualquier 401 fuera de `/auth/login` dispara `window.location.href = '/login'`. Si la revalidación corriera incondicionalmente en cada montaje de `AuthProvider` (que envuelve toda la app, incluido `/login`), un visitante sin sesión en `/login` generaría: `getMe()` → 401 → redirect a `/login` → remonta `AuthProvider` → `getMe()` → 401 → redirect... Un loop de recarga infinita. El guard `if (!user) return` lo evita: solo revalidamos cuando *creíamos* estar logueados.

**Verificación — necesito que la hagas vos en el navegador, no la voy a manejar yo:**
1. Sesión activa: recargar cualquier página logueado → debe cargar normal, sin parpadeos raros.
2. Sesión con usuario desactivado por un admin en otra pestaña: recargar → debe patearte a `/login` con el mensaje de cuenta desactivada.
3. **El caso crítico:** entrar a `/login` sin sesión previa (`localStorage` limpio) → NO debe haber ningún loop de recarga. Confirmalo con las devtools abiertas mirando la pestaña Network, un solo ciclo de carga, cero requests a `/auth/me`.
4. `localStorage` con un usuario guardado pero cookie de sesión vencida/inexistente (podés simularlo borrando la cookie `token` manualmente y dejando el `localStorage`) → al recargar, debe patearte a `/login` sin loop.

Si el punto 3 falla en tu prueba, avisame antes de que esto llegue a `main` — es exactamente el escenario que diseñé para evitar, pero quiero tu confirmación real en navegador antes de darlo por cerrado.

---

## Fase 8 — Flujo de pagos · riesgo alto, el bloque más grande del plan

Los 4 ítems de "Flujo de pagos" del checklist están acoplados: son síntomas del mismo diseño (dos caminos para que el mayorista registre un pago: el "flujo antiguo" de `createPago` + `pagarReserva`, y el flujo nuevo `informarPago` → `confirmarPago`/`rechazarPago`). Los trato en un solo commit grande porque arreglarlos por separado dejaría el sistema en un estado intermedio inconsistente.

### 8.1 — `rechazarPago` borra el pago (no debería eliminarse)

**Modelo `Pago`** — agregar:
```js
rechazado: { type: Boolean, default: false },
motivo_rechazo: { type: String, default: null },
rechazado_at: { type: Date, default: null },
```

**`rechazarPago`** — reemplazar `await Pago.deleteOne({ reserva_id: reserva._id })` por:
```js
const pagoRechazado = await Pago.findOne({ reserva_id: reserva._id, rechazado: false })
  .sort({ created_at: -1 })
  .session(session);
if (pagoRechazado) {
  pagoRechazado.rechazado = true;
  pagoRechazado.motivo_rechazo = motivo.trim();
  pagoRechazado.rechazado_at = new Date();
  await pagoRechazado.save({ session });
}
```
(mismo patrón `.sort({ created_at: -1 })` que ya usa `confirmarPago` para encontrar el pago vigente — antes el `deleteOne` no ordenaba y podía borrar un `Pago` arbitrario si había más de uno para la misma reserva).

### 8.2 — El pago manual del mayorista no valida el monto

**Por qué pasa, exactamente** (confirmado leyendo el código): el frontend (`ReservaDetalle.jsx` del mayorista) llama `addPayment()` y **después** `pagar()` sin body. Dentro de `pagarReserva`, la validación de monto está en la rama `if (pagosExistentes === 0 && monto && fecha_pago)` — pero para cuando `pagarReserva` corre, `pagosExistentes` ya es 1 (lo acaba de crear `createPago`), y además `monto`/`fecha_pago` vienen `undefined` porque el segundo request no manda body. Los dos motivos por los que la condición nunca es cierta se anulan entre sí "por accidente": el resultado es que **nunca se valida el monto en este flujo**, sin importar cuántos pagos existan.

**Fix — mover la validación fuera de la condición "solo si es el primer pago", para que sea siempre "el total pagado debe coincidir con el precio final"**, excluyendo los pagos rechazados (8.1):
```js
// Reemplaza el bloque `if (pagosExistentes === 0 && monto && fecha_pago) { ... }`
if (monto && fecha_pago) {
  const precioFinal = obtenerPrecioFinal(reserva);
  const montoNum = parseFloat(monto);
  if (precioFinal === null || Math.abs(montoNum - precioFinal) > 0.01) {
    await session.abortTransaction();
    session.endSession();
    return res.status(400).json({ success: false, message: `...` });
  }
  await Pago.create([{ ... }], { session });
}

// Antes de marcar 'pagada', validar el total acumulado (excluyendo rechazados):
const pagosValidos = await Pago.find({ reserva_id: reserva._id, rechazado: false }).session(session);
const totalPagado = pagosValidos.reduce((sum, p) => sum + parseFloat(p.monto.toString()), 0);
const precioFinal = obtenerPrecioFinal(reserva);
if (precioFinal !== null && Math.abs(totalPagado - precioFinal) > 0.01) {
  await session.abortTransaction();
  session.endSession();
  return res.status(400).json({
    success: false,
    message: `El total pagado ($${totalPagado}) no coincide con el precio de la reserva ($${precioFinal}).`,
  });
}
```
Esto cierra el agujero real: ya no importa si el monto viene por `createPago` primero, por el body de `pagarReserva`, o por ambos — no se puede marcar `pagada` una reserva cuya suma de pagos (válidos, no rechazados) no coincide con el total.

### 8.3 — `createPago` no registra auditoría

Agregar `registrarAuditoria({ req, accion: 'PAGO_CONFIRMADO', entidad_afectada: 'Reserva', entidad_id: reserva._id, detalle: { monto, metodo } })` al final de `createPago`, mismo patrón que ya usa `pagarReserva`. Reuso `PAGO_CONFIRMADO` (no invento una acción nueva) porque semánticamente es lo mismo que ya representa esa acción en `confirmarPago`: "el mayorista confirma haber recibido dinero", solo que por otra vía.

**No agrego entrada a `HistorialEstadoReserva`** — ese modelo registra *transiciones de estado de la reserva*, y `createPago` no cambia `reserva.estado` (crea un `Pago`, nada más); forzar una entrada ahí sería un cambio de estado ficticio (`estado_anterior === estado_nuevo`), que rompería la semántica del historial. Esto corrige la redacción original del ítem, que pedía ambas cosas.

### 8.4 — Registrar pago son dos llamadas no atómicas (`addPayment` + `pagar`)

Con el fix de 8.2, si `pagarReserva` falla la validación de monto, la reserva **no cambia de estado** — pero el `Pago` creado por `createPago` ya quedó guardado (huérfano, con la reserva todavía en `pendiente_pago`). Eso sigue siendo cierto tras 8.1-8.3. Arreglarlo de raíz requiere fusionar las dos llamadas en una transacción única del lado del servidor (un solo endpoint que reciba los datos del pago y decida el estado resultante), lo cual es un cambio de contrato de API más grande que "corregir un bug" — toca el frontend (`ReservaDetalle.jsx` del mayorista) y el flujo completo.

**Propongo NO tocar esto en esta fase** y dejarlo explícitamente pendiente: con 8.1-8.3 aplicados, el peor caso posible pasa de *"se puede marcar pagada una reserva con el monto equivocado"* (grave, corregido) a *"puede quedar un `Pago` sin aplicar si el segundo request falla por causas ajenas al monto — ej. caída de red"* (raro, visible y recuperable: el mayorista simplemente reintenta *"Registrar Pago"*, ya que el 400 no lo saca del estado `pendiente_pago`). Si querés que igual lo resuelva de raíz, es un ítem aparte — avisame y lo planifico como su propia fase.

**Verificación (esta es la que más necesito que hagas vos, es dinero):**
1. Mayorista registra un pago con monto **distinto** al precio final de la reserva → debe rechazarse con 400, la reserva sigue `pendiente_pago`.
2. Mayorista registra el monto correcto → reserva pasa a `pagada`.
3. Agencia informa un pago (flujo nuevo) → mayorista lo rechaza con un motivo → confirmar que el `Pago` **sigue existiendo** en la lista de pagos de la reserva (ya no se borra), visualmente distinguible como rechazado, y que **no** suma al "Total Pagado" que muestra `EstadoCuentaCard`.
4. Repetir el ciclo informar → rechazar dos veces sobre la misma reserva, y confirmar que la segunda vez no toca por error el `Pago` de la primera ronda (ya rechazado).
5. Confirmar el nuevo evento en Auditoría cuando el mayorista usa "Registrar Pago" (el botón viejo).

Como consecuencia de 8.1, tanto `ReservaDetalle.jsx` (mayorista) como `ReservaDetalle.jsx` (agencia) necesitan un ajuste menor: al sumar `pagos` para `totalPagado`, excluir los que tengan `rechazado: true` (hoy `pagos.reduce((acc, p) => acc + toFloat(p.monto), 0)` sin filtro), y opcionalmente mostrar una etiqueta "Rechazado" en la fila correspondiente de la lista de pagos para que no se vea como un pago normal. Lo incluyo en este mismo commit porque es necesario para que 8.1 no introduzca un bug nuevo (inflar el total pagado con un pago rechazado que antes desaparecía al borrarse).

---

## Qué NO se toca en este plan

| Ítem del checklist | Por qué queda afuera |
|---|---|
| Paginación en listados operativos, auditoría de productos, auditoría del cron de vencimiento, toggle activo/inactivo de producto, validar cupo al crear (no solo al aprobar), reenviar invitación, filtro server-side de reservas | Son de la sección **Sumar**, no *Arreglar* — quedan para esa sección |
| Scoping de auditoría, transacciones de Mongoose (replica set), `ENABLE_EMAIL`, `activarUsuarioMayorista` como recuperación operativa, perfil de mayorista sin UI, cancelar reservas pagadas, token blacklist en memoria, `buildCotizacionIdsFilter` con `distinct`, `POST /productos` sin `tenant` middleware, vencimiento configurable | Son de la sección **Revisar** — decisiones tuyas, no bugs a corregir unilateralmente |
| 8.4 (atomicidad de `addPayment` + `pagar`) | Analizado arriba: mitigado por 8.1-8.3, la resolución completa es un cambio de contrato de API, no un fix puntual |
| `Toast.jsx` — `react-refresh/only-export-components` | No estaba en el checklist original; señalado como hallazgo adicional, no lo toco sin que lo pidas |

---

## Orden sugerido y esfuerzo

| Fase | Riesgo | Esfuerzo | Requiere decisión / prueba tuya |
|---|---|---|---|
| 0 · baseline | — | 5 min | no |
| 1 · documentación | nulo | 10 min | no |
| 2 · auditoría (enums/categorías) | bajo | 30 min | recorrido manual de verificación |
| 3 · backend, bugs puntuales | bajo | 45 min | recorrido manual de verificación |
| 4 · frontend, texto | bajo | 15 min | no |
| 5 · lint | bajo | 15 min | no |
| 6 · moneda | — | 20 min | **sí — definir ARS o USD antes** |
| 7 · `AuthContext.loading` | medio | 30 min | **sí — probar el caso de loop en navegador** |
| 8 · flujo de pagos | alto | 60 min | **sí — es dinero, probar los 5 casos** |

Fases 0-5 se pueden hacer de corrido. Antes de la Fase 6 necesito tu respuesta sobre la moneda; las Fases 7 y 8 las implemento igual, pero no las doy por cerradas hasta que confirmes las pruebas en navegador — son las dos que tocan comportamiento con dinero real y con la sesión de todos los usuarios.
