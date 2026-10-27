const Producto = require('../models/Producto');
const AgenciaProducto = require('../models/AgenciaProducto');
const Cotizacion = require('../models/Cotizacion');
const Reserva = require('../models/Reserva');
const { calcularPrecioFinal } = require('../utils/precioCalculator');
const { hoyDateString, toDateString } = require('../utils/dateHelpers');
const {
  calcularDisponibilidad,
  picoComprometidoDesde,
  compromisosFueraDeRango,
} = require('../utils/cupoValidator');

/**
 * Filtro de productos vigentes: los que todavía tienen días por vender. Un
 * producto con la disponibilidad vencida no se borra ni se desactiva (activo
 * es "pausado por el mayorista"), simplemente deja de ofrecerse.
 * Las fechas de calendario se guardan como medianoche UTC del día elegido.
 */
const filtroVigente = () => ({ disponibilidad_hasta: { $gte: new Date(hoyDateString()) } });

/**
 * Obtener todos los productos (con filtrado y comportamiento por rol)
 */
exports.getProductos = async (req, res, next) => {
  try {
    const { rol, id: usuario_id, mayorista_id, agencia_id } = req.usuario;
    const { tipo, activo } = req.query;

    const query = {};

    // Filtros opcionales transversales
    if (tipo) {
      query.tipo = tipo;
    }

    // Comportamiento según el rol
    if (rol === 'mayorista') {
      // El mayorista solo ve sus productos (mayorista_id = ID del documento Mayorista)
      query.mayorista_id = mayorista_id;
      
      if (activo !== undefined) {
        query.activo = activo === 'true';
      }

      const productos = await Producto.find(query).sort({ created_at: -1 });

      return res.status(200).json({
        success: true,
        data: productos,
      });

    } else if (rol === 'agencia') {
      // Las agencias solo ven productos activos y con disponibilidad vigente
      query.activo = true;
      Object.assign(query, filtroVigente());

      // Buscar las relaciones AgenciaProducto habilitadas para la agencia
      const relaciones = await AgenciaProducto.find({
        agencia_id: agencia_id,
        habilitado: true,
      }).populate({
        path: 'producto_id',
        match: query,
      });

      // Filtrar aquellos donde el populate devolvió null (por mismatch en match de mongoose)
      const productosDisponibles = relaciones
        .filter(rel => rel.producto_id !== null)
        .map(rel => {
          const productoObj = rel.producto_id.toObject();
          
          // Calcular precio final
          const precio_final = calcularPrecioFinal(productoObj.precio_base, rel.markup_porcentaje);
          
          // NUNCA DEVOLVER precio_base. Tampoco el markup: con el precio
          // final y el porcentaje, la agencia despejaría el precio base.
          delete productoObj.precio_base;

          return {
            ...productoObj,
            precio_final,
          };
        });

      return res.status(200).json({
        success: true,
        data: productosDisponibles,
      });
    }

    return res.status(403).json({ success: false, message: 'Rol no autorizado' });
  } catch (error) {
    next(error);
  }
};

/**
 * Valida el rango de disponibilidad.
 * @param {Object} opts
 * @param {string|Date} opts.desde - fecha de inicio efectiva
 * @param {string|Date} opts.hasta - fecha de fin efectiva
 * @param {boolean} opts.validarDesdeHoy - si debe exigirse desde >= hoy
 * @returns {string|null} mensaje de error o null si es válido
 */
const validarDisponibilidad = ({ desde, hasta, validarDesdeHoy }) => {
  const desdeStr = toDateString(desde);
  const hastaStr = toDateString(hasta);
  if (validarDesdeHoy && desdeStr && desdeStr < hoyDateString()) {
    return 'La fecha de disponibilidad no puede ser anterior a la fecha actual.';
  }
  if (desdeStr && hastaStr && hastaStr < desdeStr) {
    return 'La fecha de disponibilidad final debe ser igual o posterior a la inicial.';
  }
  return null;
};

/**
 * Campos que el mayorista puede definir en un producto. Todo lo demás
 * (mayorista_id, cupo_lock_version, _id, fechas de sistema) lo maneja el
 * servidor: copiar el body entero permitía pisarlos desde la request.
 */
const CAMPOS_EDITABLES = [
  'tipo', 'nombre', 'descripcion', 'precio_base',
  'disponibilidad_desde', 'disponibilidad_hasta', 'activo', 'cupo_maximo',
  // hotel
  'direccion', 'estrellas',
  // actividad
  'duracion_horas',
  // paquete
  'itinerario',
];

const tomarCamposEditables = (body = {}) =>
  Object.fromEntries(
    CAMPOS_EDITABLES.filter((campo) => body[campo] !== undefined).map((campo) => [campo, body[campo]])
  );

/**
 * Validar campos obligatorios según el tipo de producto.
 *
 * El cupo es obligatorio para los tres tipos. `exigirCupo` es false solo al
 * editar un producto anterior a esa regla que todavía no tiene cupo: así se
 * puede seguir editando sin obligar a definirlo en ese momento.
 */
const validateTipoFields = (tipo, body, { exigirCupo = true } = {}) => {
  const errors = [];
  if (exigirCupo && !body.cupo_maximo) errors.push('El cupo máximo de plazas es obligatorio');
  if (tipo === 'hotel') {
    if (!body.direccion) errors.push('La dirección es obligatoria para hoteles');
    if (!body.estrellas) errors.push('La cantidad de estrellas es obligatoria para hoteles');
  } else if (tipo === 'actividad') {
    if (!body.duracion_horas) errors.push('La duración es obligatoria para actividades');
  } else if (tipo === 'paquete') {
    if (!body.itinerario) errors.push('El itinerario es obligatorio para paquetes');
  }
  return errors;
};

/**
 * Crear un nuevo producto (Solo Mayoristas)
 */
exports.createProducto = async (req, res, next) => {
  try {
    const { tipo } = req.body;
    
    // Validar tipo manualmente antes de crear
    if (!['hotel', 'actividad', 'paquete'].includes(tipo)) {
      return res.status(400).json({ success: false, message: 'Tipo de producto inválido' });
    }

    const validationErrors = validateTipoFields(tipo, req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, message: validationErrors.join(', ') });
    }

    // En el alta, la disponibilidad no puede empezar antes de hoy
    const errorFechas = validarDisponibilidad({
      desde: req.body.disponibilidad_desde,
      hasta: req.body.disponibilidad_hasta,
      validarDesdeHoy: true,
    });
    if (errorFechas) {
      return res.status(400).json({ success: false, message: errorFechas });
    }

    // Asegurar que el producto se asocie al mayorista del token
    const productoData = {
      ...tomarCamposEditables(req.body),
      mayorista_id: req.usuario.mayorista_id,
    };

    const producto = await Producto.create(productoData);

    res.status(201).json({
      success: true,
      data: producto,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    next(error);
  }
};

/**
 * Obtener un producto por ID
 */
exports.getProductoById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rol, mayorista_id, agencia_id } = req.usuario;

    const producto = await Producto.findById(id);

    if (!producto) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    if (rol === 'mayorista') {
      if (producto.mayorista_id.toString() !== mayorista_id?.toString()) {
        return res.status(403).json({ success: false, message: 'Acceso denegado a este producto' });
      }

      return res.status(200).json({
        success: true,
        data: producto,
      });

    } else if (rol === 'agencia') {
      if (!producto.activo || toDateString(producto.disponibilidad_hasta) < hoyDateString()) {
        return res.status(404).json({ success: false, message: 'Producto no disponible' });
      }

      const relacion = await AgenciaProducto.findOne({
        agencia_id: agencia_id,
        producto_id: id,
        habilitado: true,
      });

      if (!relacion) {
        return res.status(403).json({ success: false, message: 'Producto no habilitado para su agencia' });
      }

      const productoObj = producto.toObject();
      const precio_final = calcularPrecioFinal(productoObj.precio_base, relacion.markup_porcentaje);
      
      // Ni precio_base ni markup (ver getProductos).
      delete productoObj.precio_base;

      return res.status(200).json({
        success: true,
        data: {
          ...productoObj,
          precio_final,
        },
      });
    }

    return res.status(403).json({ success: false, message: 'Rol no autorizado' });
  } catch (error) {
    // Si el ID es inválido para mongoose
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    next(error);
  }
};

/**
 * Revisa que un cambio de cupo o de disponibilidad no deje afuera plazas ya
 * comprometidas (cotizaciones aprobadas vigentes y reservas no canceladas).
 * Solo consulta la base cuando el cambio achica algo.
 * @returns {Promise<string|null>} mensaje de error o null si el cambio es válido
 */
const validarCambiosDeCupo = async (existente, { cupo, desde, hasta }) => {
  const hoy = hoyDateString();

  const cupoAnterior = existente.cupo_maximo;
  const achicaCupo = cupo != null && (cupoAnterior == null || cupo < cupoAnterior);
  if (achicaCupo) {
    const { pico, dia_pico } = await picoComprometidoDesde(existente, hoy);
    if (cupo < pico) {
      return `No se puede bajar el cupo a ${cupo}: hay ${pico} plazas comprometidas el ${formatearDia(dia_pico)}.`;
    }
  }

  const achicaRango =
    desde > toDateString(existente.disponibilidad_desde) ||
    hasta < toDateString(existente.disponibilidad_hasta);
  if (achicaRango) {
    const afuera = await compromisosFueraDeRango(existente, desde, hasta, hoy);
    if (afuera.length > 0) {
      return `No se puede achicar la disponibilidad: ${afuera.length} cotización(es) aprobada(s) o reservada(s) quedarían fuera del nuevo período.`;
    }
  }

  return null;
};

/** YYYY-MM-DD → DD/MM/YYYY, para los mensajes. */
const formatearDia = (dia) => (dia ? dia.split('-').reverse().join('/') : '');

/**
 * Actualizar un producto (Solo Mayorista)
 */
exports.updateProducto = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // El tenantMiddleware garantiza que el producto existe y pertenece al
    // mayorista. Solo se aplican los campos editables: el dueño, el lock de
    // cupo y los campos de sistema no se tocan desde la request.
    const updates = tomarCamposEditables(req.body);

    const existente = await Producto.findById(id);
    if (!existente) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    // El tipo define cómo se calcula el precio y cómo se interpretan las
    // fechas de las cotizaciones (ver precioCalculator). Cambiarlo con
    // cotizaciones existentes las dejaría calculadas con otra regla.
    if (updates.tipo !== undefined && updates.tipo !== existente.tipo) {
      const cotizaciones = await Cotizacion.countDocuments({ producto_id: id });
      if (cotizaciones > 0) {
        return res.status(409).json({
          success: false,
          message: `No se puede cambiar el tipo: el producto tiene ${cotizaciones} cotización(es) asociada(s). Creá un producto nuevo con el tipo correcto.`,
        });
      }
    }

    // Revalidar campos obligatorios por tipo contra el resultado efectivo del
    // update (existente + cambios), no solo contra lo que vino en el body:
    // si no, un PATCH parcial puede vaciar un campo requerido (ej. cupo_maximo)
    // sin que nadie lo haya decidido explícitamente.
    const tipoEfectivo = updates.tipo ?? existente.tipo;
    const bodyEfectivo = { ...existente.toObject(), ...updates };
    const exigirCupo = existente.cupo_maximo != null || updates.cupo_maximo !== undefined;
    const validationErrors = validateTipoFields(tipoEfectivo, bodyEfectivo, { exigirCupo });
    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, message: validationErrors.join(', ') });
    }

    // Fechas efectivas: las del payload, o las ya guardadas si no se modifican.
    // "Desde >= hoy" solo se exige si la fecha de inicio realmente cambia,
    // para no bloquear la edición de productos cuya vigencia ya comenzó.
    const desdeNuevo = toDateString(updates.disponibilidad_desde);
    const desdeActual = toDateString(existente.disponibilidad_desde);
    const errorFechas = validarDisponibilidad({
      desde: desdeNuevo ?? desdeActual,
      hasta: updates.disponibilidad_hasta ?? existente.disponibilidad_hasta,
      validarDesdeHoy: desdeNuevo !== null && desdeNuevo !== desdeActual,
    });
    if (errorFechas) {
      return res.status(400).json({ success: false, message: errorFechas });
    }

    // Lo ya vendido no puede quedar afuera del producto: ni por bajar el cupo
    // por debajo de lo comprometido, ni por achicar la disponibilidad.
    const errorCupo = await validarCambiosDeCupo(existente, {
      cupo: updates.cupo_maximo !== undefined ? Number(updates.cupo_maximo) : existente.cupo_maximo,
      desde: desdeNuevo ?? desdeActual,
      hasta: toDateString(updates.disponibilidad_hasta ?? existente.disponibilidad_hasta),
    });
    if (errorCupo) {
      return res.status(409).json({ success: false, message: errorCupo });
    }

    const producto = await Producto.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!producto) {
       return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    res.status(200).json({
      success: true,
      data: producto,
    });
  } catch (error) {
     if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    next(error);
  }
};

/**
 * Verificar cuántas agencias tienen vinculado un producto (Solo Mayoristas)
 */
exports.checkProductoAgencias = async (req, res, next) => {
  try {
    const { id } = req.params;
    const count = await AgenciaProducto.countDocuments({ producto_id: id });
    res.status(200).json({ success: true, agencias_count: count });
  } catch (error) {
    next(error);
  }
};

/**
 * Eliminar un producto (Solo Mayoristas)
 * Hard-delete: elimina el documento y en cascada sus registros AgenciaProducto.
 * Bloqueado si el producto tiene cotizaciones o reservas asociadas.
 */
exports.deleteProducto = async (req, res, next) => {
  try {
    const { id } = req.params;

    const producto = await Producto.findById(id);

    if (!producto) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    const cotizacionIds = await Cotizacion.find({ producto_id: id }).distinct('_id');

    const [cotizaciones, reservas] = await Promise.all([
      cotizacionIds.length,
      Reserva.countDocuments({ cotizacion_id: { $in: cotizacionIds } }),
    ]);

    if (cotizaciones > 0 || reservas > 0) {
      return res.status(409).json({
        success: false,
        message: `No se puede eliminar el producto porque tiene ${cotizaciones} cotización(es) y ${reservas} reserva(s) asociada(s).`,
        cotizaciones,
        reservas,
      });
    }

    const agencias_afectadas = await AgenciaProducto.countDocuments({ producto_id: id });

    await producto.deleteOne();
    await AgenciaProducto.removeByProducto(id);

    res.status(200).json({
      success: true,
      agencias_afectadas,
      message: 'Producto eliminado correctamente',
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    next(error);
  }
};

/**
 * Plazas disponibles de un producto para unas fechas.
 * GET /api/v1/productos/:id/disponibilidad?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
 *
 * La agencia solo ve cuántas plazas quedan (no el cupo total ni lo vendido),
 * y solo de productos que tiene habilitados. El mayorista ve el detalle.
 */
exports.getDisponibilidad = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rol, mayorista_id, agencia_id } = req.usuario;

    const producto = await Producto.findById(id);
    if (!producto) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    if (rol === 'mayorista') {
      if (producto.mayorista_id.toString() !== mayorista_id?.toString()) {
        return res.status(404).json({ success: false, message: 'Producto no encontrado' });
      }
    } else if (rol === 'agencia') {
      const relacion = await AgenciaProducto.findOne({ agencia_id, producto_id: id, habilitado: true });
      if (!relacion || !producto.activo) {
        return res.status(404).json({ success: false, message: 'Producto no encontrado' });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Rol no autorizado' });
    }

    // Igual que al cotizar: una actividad es de un solo día.
    const fechaInicio = toDateString(req.query.fecha_inicio);
    const fechaFin = producto.tipo === 'actividad' ? fechaInicio : toDateString(req.query.fecha_fin);
    const formato = /^\d{4}-\d{2}-\d{2}$/;
    if (!formato.test(fechaInicio || '') || !formato.test(fechaFin || '') || fechaFin < fechaInicio) {
      return res.status(400).json({ success: false, message: 'Las fechas no tienen un formato válido.' });
    }

    const disponibilidad = await calcularDisponibilidad(producto, fechaInicio, fechaFin);

    const data = rol === 'agencia'
      ? { ilimitado: disponibilidad.ilimitado, disponibles: disponibilidad.disponibles }
      : disponibilidad;

    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }
    next(error);
  }
};
