# Plan de limpieza — sección "Quitar"

> Deriva de [[AUDITORIA-2]]. Ordenado de menor a mayor riesgo: cada fase es un commit independiente y revertible.
> Todo verificado por grep sobre el repo el 2026-07-30 (rama `main`, árbol limpio salvo los `.md` de auditoría).

---

## Correcciones al checklist original

Al re-verificar antes de planificar, tres ítems resultaron estar mal caracterizados. El plan usa esta versión, no la del checklist:

1. **`email_contacto` NO está muerto del todo.** `reporteController.js:130` lo emite y `admin/Dashboard.jsx:90` lo muestra — eso está **vivo y no se toca**. Lo muerto es solo (a) el `<Input label="Email de Contacto">` de los dos formularios de alta, que nunca se envía, y (b) los fallbacks `?? x.email_contacto` en `Mayoristas.jsx:340`, `Agencias.jsx:284` y `AgenciaDetalle.jsx:174`, que leen un campo que los modelos `Mayorista`/`Agencia` no tienen (siempre caen a `'-'`).
2. **`exports.createReserva` NO se puede borrar.** `createReservaFromCotizacion` (`reservaController.js:53`) delega en él. Se elimina únicamente la línea de ruta `POST /reservas`.
3. **`admin_nombre` / `nombre_usuario` no es limpieza, es una decisión de producto.** El campo está rotulado *"Nombre del Administrador \*"* — con asterisco de obligatorio — en ambos formularios de alta, y el backend lo destructura y lo tira. O se borra el input, o se persiste el dato. Va a la Fase 6 con decisión tuya.

---

## Fase 0 — Red de seguridad

- [ ] Rama de trabajo: `git checkout -b chore/limpieza-codigo-muerto`
- [ ] Registrar el baseline **antes** de tocar nada:

```bash
cd server && node --test && cd ../client && npm run build && npm run lint
```

**Importante sobre el baseline:** `npm run lint` **hoy ya falla** con 6 errores + 1 warning (son ítems de la sección *Arreglar*, no de esta limpieza). Entonces el criterio de éxito de cada fase **no es "lint en verde"**, es **"la misma lista de errores que en el baseline, ni uno más"**. Guardá la salida:

```bash
cd client && npm run lint 2>&1 | tail -20 > ../baseline-lint.txt
```

- [ ] `git commit` de los `.md` de auditoría primero, para que el diff de limpieza quede limpio.

---

## Fase 1 — Archivos huérfanos · riesgo nulo

Cero referencias en todo el repo (verificado con grep sobre `*.js,jsx,mjs,json`).

- [ ] **Borrar `server/utils/testModule3.js`** — script suelto que al ejecutarse abre conexión a Mongo y crea un mayorista de prueba. No lo importa nadie, ni siquiera `package.json`.
- [ ] **Borrar `client/remove-bg.mjs`** — script one-off del logo; su único import es `@napi-rs/canvas`, que no está en `package.json` (o sea: hoy ni corre).
- [ ] **Reemplazar `client/README.md`** — no borrarlo: dejar 10 líneas reales (cómo levantar el cliente, qué proxea Vite). Hoy es la plantilla por defecto de Vite y en una tesis eso se nota.

**Verificación:** `npm run build` en `client/`. Nada más — ningún archivo del bundle los referenciaba.
**Rollback:** `git revert` del commit.

---

## Fase 2 — Backend, símbolos internos · riesgo nulo

Ninguno cruza el límite HTTP, así que no puede romper al cliente.

- [ ] **`matchReservaBase`** — `server/utils/reporteHelpers.js:33` y su línea en `module.exports:42`. Definido y exportado, nunca importado.
- [ ] **`nombre_usuario`** en los dos destructuring — `adminController.js:46` y `agenciaController.js:57`. Solo se saca de la desestructuración; el campo sigue llegando en el body hasta que se resuelva la Fase 6.

**Verificación:** `cd server && node --test`, y arrancar el server (`npm run dev`) para confirmar que no hay `ReferenceError` de arranque.
**Rollback:** trivial, son 3 líneas.

---

## Fase 3 — Backend, rutas sin consumidor · riesgo bajo

Cada una: primero se saca la **ruta**, después el **handler**, después el **import**. En ese orden, porque si algo consumía la ruta el fallo aparece como 404 y no como crash de arranque.

- [ ] **Cotizaciones — `PUT /:id/confirmar` y `PUT /:id/rechazar`**
  - `server/routes/cotizacionRoute.js`: líneas de ruta 33-39 e imports 10-11
  - `server/controllers/cotizacionController.js`: `confirmarCotizacion` (289-350) y `rechazarCotizacion` (355-419)
  - Duplican exactamente `PATCH /:id/estado`, que es lo único que llama el frontend (`cotizacionService.updateStatus`). ~130 líneas menos.
  - ⚠️ `verificarCupoDisponible` se usa también en `actualizarEstadoCotizacion:244` → **no tocar el import de `cupoValidator`**.

- [ ] **Reportes — `GET /reservas` y `GET /ingresos/agencias`**
  - `server/routes/reporteRoute.js`: líneas 34 y 36, imports 4 y 6
  - `server/controllers/reporteController.js`: `getReservasPorMes` (143-204) y `getIngresosPorAgencia` (206-259)
  - `client/src/services/reporteService.js:8`: `getReservasPorMes` (ningún componente lo llama)
  - ⚠️ **No tocar** `fetchIngresosData`, `fetchRankingAgenciasData` ni `fetchProductosTopData`: los comparte `exportarReportePDF`.
  - ⚠️ Tras borrar, revisar si `agenciaCollection` sigue importado con uso — sí lo usa `fetchRankingAgenciasData`, pero confirmalo con grep antes de tocar el import.

- [ ] **Reservas — `POST /reservas`**
  - `server/routes/reservaRoute.js:35`: solo la línea `.post(role('agencia'), createReserva)` y el import de la línea 7.
  - ⚠️ **`exports.createReserva` se queda**: `createReservaFromCotizacion` lo llama. El cliente solo usa `POST /reservas/cotizacion/:cotizacionId`.

- [ ] **Reservas — `GET /:id/historial`**
  - `server/routes/reservaRoute.js:69` + import línea 13, y `reservaController.getHistorial` (431-460).
  - El detalle (`getReservaById`) ya devuelve el historial embebido.
  - ⚠️ No confundir con `getHistorialMayorista` (`adminController:538`) ni `getHistorialAgencia` (`agenciaController:558`): **ambos están en uso** desde `mayoristaService.historial` y `agenciaService.historial`.

**Verificación:** arrancar el server + recorrido manual tuyo por: aprobar y rechazar una cotización (mayorista), generar una reserva desde cotización (agencia), abrir el detalle de una reserva y ver el timeline, y abrir Reportes + exportar el PDF.
**Rollback:** un commit por bullet, así podés revertir solo el que falle.

---

## Fase 4 — Frontend, métodos de servicio sin consumidor · riesgo nulo

- [ ] **`productoService.getById`** y **`cotizacionService.getById`** — `client/src/services/` — ningún `.jsx` los llama (verificado).
- ⚠️ **Dejar viva la ruta `GET /productos/:id`** del backend aunque quede sin consumidor: es la única que aplica el markup por agencia y oculta `precio_base`, y es superficie REST razonable. Sacarla es más riesgo que beneficio.

**Verificación:** `npm run build`.

---

## Fase 5 — Consolidar los tres wrappers de Auditoría · riesgo bajo

Los tres archivos son idénticos: `<AuditoriaPage title="Mi actividad" />`.

- [ ] Borrar `client/src/pages/{admin,mayorista,agencia}/Auditoria.jsx`
- [ ] En `client/src/App.jsx`: quitar los tres imports (líneas 20, 23, 33) y poner uno solo — ojo con el cambio de forma de import: los wrappers eran `export default`, `AuditoriaPage` es **named export**.

```js
import { AuditoriaPage } from './pages/auditoria/AuditoriaPage';
```

- [ ] Reemplazar los tres `element={<AdminAuditoria />}` / `<MayoristaAuditoria />` / `<AgenciaAuditoria />` por `element={<AuditoriaPage title="Mi actividad" />}`.

**Oportunidad:** ya que tocás el `title`, es el momento de diferenciarlo por rol si vas a resolver el ítem de scoping de auditoría que quedó en *Revisar*. Si todavía no decidiste, dejá `"Mi actividad"` y no mezcles las dos cosas en un commit.

**Verificación:** `npm run build`, y navegar vos a `/admin/auditoria`, `/mayorista/auditoria` y `/agencia/auditoria` con los tres roles.

---

## Fase 6 — Campos de formulario muertos · requiere decisión tuya

Estos tocan **UI visible**. No son limpieza mecánica: borrar un input cambia lo que ve el usuario, y dos de ellos están rotulados como obligatorios. Los dejo al final y separados para que decidas uno por uno.

### 6a — Sin ambigüedad, borrar

- [ ] **`hotel_ciudad`** — `Productos.jsx` líneas 27, 186, 432, 545 — se edita en alta y edición, `buildPayload` no lo manda y el modelo `Producto` no tiene `ciudad`. El input "Ciudad" **siempre vuelve vacío al reabrir el modal**, lo cual además se ve como bug.
- [ ] **`dias_antelacion`** — `Productos.jsx` líneas 25 y 185 — está en el estado del form, no tiene input, no se envía, no existe en el modelo.
- [ ] **`datos_extra`** — `agencia/Cotizaciones.jsx:86` y el bloque de parseo de JSON de las líneas ~78-88 — se arma (con `JSON.parse` y fallback a `notas_agencia`) y `createReserva` lo ignora entero.

### 6b — Decisión: ¿borrar o implementar?

- [ ] **`cancelMotivo`** — `agencia/Cotizaciones.jsx:53` y el `<Input>` de la línea 293 — la agencia escribe un motivo al cancelar su cotización y se descarta: `cotizacionService.cancelar(id)` no lo manda y `cancelarCotizacion` no lo recibe. **Decidí:** ¿lo borrás del modal, o lo persistís? Nótese que el flujo espejo (rechazo del mayorista) **sí** exige `motivo_rechazo` y lo guarda — por simetría, persistirlo es lo más coherente.
- [ ] **`email_contacto` (solo el input del form)** — `Mayoristas.jsx:398` y `Agencias.jsx:350` — se captura y no se envía. Los fallbacks de lectura (`Mayoristas.jsx:340`, `Agencias.jsx:284`, `AgenciaDetalle.jsx:174`) leen un campo inexistente en el modelo y siempre caen a `'-'`: se pueden simplificar a `usuario_id?.email ?? '-'`.
  ⚠️ **No tocar** `reporteController.js:130` ni `admin/Dashboard.jsx:90`: ese `email_contacto` es otro, se arma en el servidor y está en uso.
- [ ] **`admin_nombre` → `nombre_usuario`** — `Mayoristas.jsx:129/403` y `Agencias.jsx:109/355` — rotulado **"Nombre del Administrador \*"** (obligatorio) y descartado por el backend. **Decidí:** borrar el input, o agregar el campo al modelo `Usuario` y persistirlo. Hoy le estás pidiendo al usuario un dato obligatorio que tirás a la basura.

**Verificación:** recorrido manual tuyo — alta de producto (hotel), edición de producto, alta de agencia, alta de mayorista, cancelación de cotización desde agencia.

---

## Qué NO tocar (protección contra sobre-borrado)

| Símbolo | Por qué se queda |
|---|---|
| `exports.createReserva` | `createReservaFromCotizacion` delega en él |
| `reporteController` → `email_contacto` | Vivo: lo consume `admin/Dashboard.jsx:90` |
| `GET /productos/:id` + `getProductoById` | Sin consumidor pero aplica markup y oculta `precio_base` |
| `getHistorialMayorista` / `getHistorialAgencia` | En uso desde `mayoristaService` y `agenciaService` |
| `checkProductoAgencias` | En uso desde `Productos.jsx:244` |
| `fetchIngresosData` / `fetchRankingAgenciasData` / `fetchProductosTopData` | Compartidos con `exportarReportePDF` |
| `verificarCupoDisponible` | Sigue usándose en `actualizarEstadoCotizacion` |
| `mayoristaController` + `mayoristaRoute` | Está en *Revisar*, no en *Quitar*: decidí primero si implementás la UI de perfil |

---

## Orden sugerido y esfuerzo

| Fase | Riesgo | Esfuerzo | Requiere decisión |
|---|---|---|---|
| 0 · baseline | — | 5 min | no |
| 1 · archivos huérfanos | nulo | 10 min | no |
| 2 · símbolos internos | nulo | 5 min | no |
| 3 · rutas sin consumidor | bajo | 30 min | no |
| 4 · métodos de servicio | nulo | 5 min | no |
| 5 · wrappers de auditoría | bajo | 15 min | no |
| 6a · campos muertos claros | bajo | 20 min | no |
| 6b · campos con decisión | medio | — | **sí, 3 decisiones** |

Las fases 1 a 5 se pueden hacer de corrido sin consultarte nada. La 6 conviene hacerla después de que decidas los tres puntos de 6b, para no tocar los mismos archivos dos veces.
