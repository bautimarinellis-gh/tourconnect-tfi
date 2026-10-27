# Tarjetas de prueba — Mercado Pago (sandbox)

Datos públicos de prueba de Mercado Pago Argentina. **No mueven dinero real.**

## Tarjetas

| Tarjeta | Número | CVV | Vencimiento |
|---|---|---|---|
| Visa | 4509 9535 6623 3704 | 123 | 11/30 |
| Mastercard | 5031 7557 3453 0604 | 123 | 11/30 |
| American Express | 3711 803032 57522 | 1234 | 11/30 |

- **DNI del titular:** 12345678
- **Email del comprobante:** cualquiera ficticio (ej.: `test_user_x@testuser.com`)

## Nombre del titular → resultado

| Nombre | Resultado | En TourConnect |
|---|---|---|
| `APRO` | Aprobado | La reserva pasa a **Pagada** |
| `CONT` | Pendiente | La reserva pasa a **Pago informado** (pendiente de acreditación) |
| `OTHE` | Rechazado (error general) | Sigue en **Pendiente de pago**, con el motivo |
| `FUND` | Rechazado por fondos insuficientes | Ídem |
| `SECU` | Rechazado por código de seguridad inválido | Ídem |
| `EXPI` | Rechazado por fecha de vencimiento | Ídem |
| `CALL` | Rechazado: pide autorizar con el banco | Ídem |

**Efectivo:** en el checkout elegí *Efectivo → Rapipago / Pago Fácil*. Genera un cupón que queda **pendiente**.

## Recordatorios

- Pagá en **incógnito** o sin tu cuenta real de MP abierta en ese navegador (si no, MP dice que "una de las partes es de prueba").
- **No pagues con el usuario vendedor de prueba** (`TESTUSER…`): MP rechaza pagarse a uno mismo. Pagá como invitado.
- Elegí **1 cuota**.
- Si el CVV marca "Completá este campo" aunque se vea cargado, borralo y escribilo de nuevo después de cargar el número.
- Al terminar, **volvé a la pestaña de TourConnect**: la reserva consulta a MP sola y se actualiza.
- Cancelar una reserva pagada (solo el mayorista) registra una **devolución simulada**: el sandbox de MP no permite reembolsos por API con cuentas de prueba.
