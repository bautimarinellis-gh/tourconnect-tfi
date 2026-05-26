/**
 * Catálogo de intents del Asistente Inteligente.
 *
 * Cada intent define:
 *  - description: texto legible para mostrar al usuario
 *  - keywords: mapa de keyword (normalizada) → peso para el scoring
 *  - defaultParams: valores usados si el clasificador no extrae el param
 *  - roles: roles que pueden ejecutar este intent
 *  - visualization: tipo de renderizado sugerido para el frontend
 */
const intentCatalog = {
  top_agencias: {
    description: 'Top N agencias por reservas o facturación',
    example: '¿Cuáles son mis top 5 agencias del último mes?',
    keywords: {
      agencia: 2, agencias: 2,
      top: 3, mejor: 3, mejores: 3, ranking: 3, primeras: 2, primeros: 2,
      reservas: 1, facturacion: 1, venta: 1, ventas: 1, ingresos: 1,
      mas: 1, mayor: 1, mayores: 1, activas: 1,
    },
    defaultParams: { limit: 5, time_range: 'last_30_days', orderBy: 'reservas' },
    roles: ['mayorista', 'admin'],
    visualization: 'table',
  },

  cotizaciones_pendientes: {
    description: 'Cotizaciones en estado pendiente de respuesta',
    example: '¿Cuántas cotizaciones tengo pendientes?',
    keywords: {
      cotizacion: 3, cotizaciones: 3,
      pendiente: 3, pendientes: 3,
      esperando: 2, revisar: 2, responder: 2, sin: 1, respuesta: 2,
      nueva: 1, nuevas: 1, reciente: 1, recientes: 1,
    },
    defaultParams: { limit: 10, time_range: 'last_30_days' },
    roles: ['mayorista', 'admin'],
    visualization: 'table',
  },

  agencias_inactivas: {
    description: 'Agencias sin reservas en los últimos N días',
    example: '¿Qué agencias están inactivas?',
    keywords: {
      agencia: 2, agencias: 2,
      inactiva: 3, inactivas: 3, inactivo: 3, inactivos: 3,
      sin: 1, actividad: 2, reservas: 1,
      dormida: 2, dormidas: 2, perdida: 2, perdidas: 2,
      no: 1, reservaron: 2, compro: 1, compraron: 1,
    },
    defaultParams: { dias_inactivos: 30 },
    roles: ['mayorista', 'admin'],
    visualization: 'list',
  },

  ingresos_periodo: {
    description: 'Total de ingresos facturados en un período',
    example: '¿Cuánto facturé este mes?',
    keywords: {
      ingreso: 3, ingresos: 3,
      facturacion: 3, facture: 3, facturado: 3,
      ganancia: 3, ganancias: 3,
      dinero: 2, recaude: 2, recaudacion: 2, cobrado: 2,
      total: 1, monto: 1, importe: 1,
      mes: 1, semana: 1, periodo: 1, hoy: 1,
    },
    defaultParams: { time_range: 'last_30_days' },
    roles: ['mayorista', 'admin'],
    visualization: 'stat',
  },

  reservas_por_estado: {
    description: 'Resumen de reservas agrupadas por estado',
    example: '¿Cómo están mis reservas por estado?',
    keywords: {
      reserva: 2, reservas: 2,
      estado: 3, estados: 3,
      resumen: 2, distribucion: 2,
      cancelada: 2, canceladas: 2, pagada: 2, pagadas: 2,
      pendiente: 1, pendientes: 1, cerrada: 2, cerradas: 2,
      cuantas: 1, cuantos: 1, hay: 1,
    },
    defaultParams: { time_range: 'last_30_days' },
    roles: ['mayorista', 'admin'],
    visualization: 'table',
  },

  producto_top: {
    description: 'Producto más reservado en el período',
    example: '¿Qué producto tuvo más reservas?',
    keywords: {
      producto: 3, productos: 3,
      top: 2, mejor: 2, mejores: 2,
      vendido: 2, reservado: 2, reservados: 2,
      popular: 2, populares: 2, exitoso: 2, exitosos: 2,
      mas: 1, mayor: 1, mas_reservado: 3,
    },
    defaultParams: { limit: 5, time_range: 'last_30_days' },
    roles: ['mayorista', 'admin'],
    visualization: 'table',
  },
};

module.exports = intentCatalog;
