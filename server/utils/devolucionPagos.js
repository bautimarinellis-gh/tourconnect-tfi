const mercadoPago = require('./mercadoPago');

/**
 * Qué hacer con los pagos de una reserva que el mayorista cancela.
 *
 *   pagada          → se devuelve cada pago vigente:
 *                       - de la pasarela: reembolso automático por la API de MP;
 *                       - manual: el mayorista indica cómo lo devolvió (medio y
 *                         comprobante); sin esos datos no se cancela.
 *   pago_informado  → - pendiente en MP (cupón sin pagar): se anula en MP. Si
 *                         justo se acreditó, se reembolsa;
 *                       - manual sin revisar: primero hay que confirmarlo o
 *                         rechazarlo, para saber si hay plata que devolver.
 *
 * Las llamadas a MP se hacen antes de tocar la base: si MP falla, la reserva
 * no se cancela y nunca queda cancelada con la plata cobrada. Si falla la base
 * después de reembolsar, el reintento es seguro (los reembolsos y anulaciones
 * usan una clave de idempotencia fija por pago).
 *
 * Devuelve { error } o { cambios, resumen, devueltos }: los cambios se aplican
 * a cada Pago dentro de la transacción de la cancelación.
 */
const resolverPagosAlCancelar = async ({ reserva, pagos, devolucionManual, usuarioId }) => {
  const vigentes = pagos.filter((p) => !p.rechazado && !p.devuelto);
  const cambios = [];
  const resumen = [];
  const devueltos = [];
  const ahora = new Date();

  const devolverPorMP = async (pago) => {
    const reembolso = await mercadoPago.reembolsarPago(pago.pasarela.payment_id, reserva.mayorista_id);
    const simulada = Boolean(reembolso.simulado);
    const refundId = reembolso.id != null ? String(reembolso.id) : null;
    cambios.push({
      pago,
      set: {
        devuelto: true,
        devolucion: { origen: 'pasarela', refund_id: refundId, simulada, fecha: ahora, registrado_por: usuarioId },
      },
    });
    resumen.push(simulada
      ? `Devolución SIMULADA por Mercado Pago (${mercadoPago.MOTIVO_SIMULACION})`
      : `Pago devuelto por Mercado Pago (reembolso N° ${refundId})`);
    devueltos.push({ pago_id: pago._id, origen: 'pasarela', payment_id: pago.pasarela.payment_id, refund_id: refundId, simulada });
  };

  if (reserva.estado === 'pagada') {
    const manuales = vigentes.filter((p) => p.origen !== 'pasarela');
    const metodo = typeof devolucionManual?.metodo === 'string' ? devolucionManual.metodo.trim() : '';
    if (manuales.length > 0 && !metodo) {
      return {
        error: {
          status: 400,
          code: 'DEVOLUCION_REQUERIDA',
          message: 'La reserva tiene pagos manuales: indicá cómo devolviste el dinero para poder cancelarla',
        },
      };
    }
    const comprobante = typeof devolucionManual?.comprobante === 'string'
      ? devolucionManual.comprobante.trim().slice(0, 100) : '';

    for (const pago of vigentes) {
      if (pago.origen === 'pasarela') {
        await devolverPorMP(pago);
      } else {
        cambios.push({
          pago,
          set: {
            devuelto: true,
            devolucion: {
              origen: 'manual',
              metodo: metodo.slice(0, 50),
              comprobante: comprobante || null,
              fecha: ahora,
              registrado_por: usuarioId,
            },
          },
        });
        resumen.push(`Pago devuelto por ${metodo}${comprobante ? ` (comprobante ${comprobante})` : ''}`);
        devueltos.push({ pago_id: pago._id, origen: 'manual', metodo, comprobante: comprobante || null });
      }
    }
  }

  if (reserva.estado === 'pago_informado') {
    const pendiente = vigentes[vigentes.length - 1];
    if (pendiente && pendiente.origen !== 'pasarela') {
      return {
        error: {
          status: 400,
          code: 'PAGO_SIN_REVISAR',
          message: 'Hay un pago informado sin revisar: confirmalo o rechazalo antes de cancelar la reserva',
        },
      };
    }
    if (pendiente) {
      const paymentId = pendiente.pasarela.payment_id;
      const pagoMP = await mercadoPago.obtenerPago(paymentId, reserva.mayorista_id);
      if (pagoMP.status === 'approved') {
        // Se acreditó entre que se cargó la pantalla y se canceló.
        await devolverPorMP(pendiente);
      } else {
        let simulada = false;
        if (['pending', 'in_process', 'authorized'].includes(pagoMP.status)) {
          simulada = Boolean((await mercadoPago.anularPago(paymentId, reserva.mayorista_id)).simulado);
        }
        cambios.push({
          pago: pendiente,
          set: {
            rechazado: true,
            motivo_rechazo: simulada
              ? 'Reserva cancelada: anulación SIMULADA del pago pendiente en Mercado Pago'
              : 'Reserva cancelada: el pago pendiente se anuló en Mercado Pago',
            rechazado_at: ahora,
            'pasarela.status': 'cancelled',
          },
        });
        resumen.push(simulada
          ? `Anulación SIMULADA del pago pendiente en Mercado Pago, operación N° ${paymentId} (${mercadoPago.MOTIVO_SIMULACION})`
          : `Pago pendiente anulado en Mercado Pago (operación N° ${paymentId})`);
      }
    }
  }

  return { cambios, resumen, devueltos };
};

module.exports = { resolverPagosAlCancelar };
