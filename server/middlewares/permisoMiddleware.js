const { CODIGOS_VALIDOS } = require('../utils/permisosCatalogo');
const { registrarAuditoria } = require('../utils/auditService');

/**
 * Middlewares de autorización por permiso.
 *
 * Se apoyan en `req.permisos`, que arma `authMiddleware` resolviendo el rol y
 * los permisos individuales contra la base. Si eso no está, fallan cerrado:
 * antes un 403 indebido que dejar pasar una request sin autorizar.
 *
 * Semántica de varios códigos: alcanza con tener **alguno** (igual que
 * `role('a', 'b')`). Para exigir dos permisos a la vez, encadenar dos
 * llamadas.
 */

const validarCodigos = (codigos) => {
  // Se valida al armar las rutas, no en runtime: un código mal escrito rompe
  // el arranque del servidor en vez de generar un 403 silencioso que nadie
  // detecta hasta producción.
  const invalidos = codigos.filter((c) => !CODIGOS_VALIDOS.has(c));
  if (invalidos.length > 0) {
    throw new Error(
      `checkPermiso: código de permiso inexistente: ${invalidos.join(', ')}`
    );
  }
};

const construirMiddleware = (codigos, { soloAmbitoMayorista }) => {
  validarCodigos(codigos);

  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: 'Acceso denegado. Usuario no autenticado.',
      });
    }

    // Las rutas compartidas con agencias no se evalúan por permisos: por
    // diseño la agencia mantiene la relación 1 usuario ↔ 1 agencia y se
    // autoriza por ámbito. El `role('agencia')` de la ruta ya la filtró.
    if (soloAmbitoMayorista && req.usuario.rol !== 'mayorista') {
      return next();
    }

    const permisos = req.permisos;
    const autorizado =
      permisos instanceof Set && codigos.some((c) => permisos.has(c));

    if (!autorizado) {
      // El intento denegado se audita: es la señal que hace útil el módulo de
      // auditoría para detectar escaladas o usuarios mal configurados.
      registrarAuditoria({
        req,
        accion: 'ACCESO_DENEGADO',
        resultado: 'fallido',
        detalle: {
          permisos_requeridos: codigos,
          metodo: req.method,
          ruta: req.originalUrl,
        },
      });

      return res.status(403).json({
        success: false,
        message: 'No tenés permisos para realizar esta acción.',
      });
    }

    next();
  };
};

/**
 * Exige el permiso a cualquier usuario que llegue a la ruta.
 * Usar en rutas exclusivas del ámbito mayorista.
 *
 * Uso: checkPermiso('GestionarProductos')
 */
const checkPermiso = (...codigos) =>
  construirMiddleware(codigos.flat(), { soloAmbitoMayorista: false });

/**
 * Exige el permiso solo si quien llama es del ámbito mayorista; deja pasar a
 * los demás ámbitos sin evaluar.
 *
 * Usar en rutas compartidas entre mayorista y agencia (por ejemplo
 * `GET /reservas`), donde el mayorista sí se filtra por permisos y la agencia
 * no participa del modelo.
 *
 * Uso: checkPermisoMayorista('GestionarReservas')
 */
const checkPermisoMayorista = (...codigos) =>
  construirMiddleware(codigos.flat(), { soloAmbitoMayorista: true });

module.exports = { checkPermiso, checkPermisoMayorista };
