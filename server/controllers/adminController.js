const mongoose = require('mongoose');
const crypto = require('crypto');
const Usuario = require('../models/Usuario');
const Mayorista = require('../models/Mayorista');
const Agencia = require('../models/Agencia');
const Reserva = require('../models/Reserva');
const Producto = require('../models/Producto');
const Cotizacion = require('../models/Cotizacion');
const { enviarInvitacion, enviarNotificacionDesactivacion, enviarNotificacionReactivacion } = require('../utils/mailer');
const { SUBSCRIPTION_PLAN_NAMES } = require('../utils/subscriptionPlans');
const { vencimientoInvitacion } = require('../utils/invitacion');
const { registrarAuditoria } = require('../utils/auditService');
const { registrarCambioEstadoPersona } = require('../utils/historialEstadoPersona');
const HistorialEstadoPersona = require('../models/HistorialEstadoPersona');
const { contarOperacionesActivas } = require('../utils/operacionesActivas');
const Rol = require('../models/Rol');
const { ROL_ADMINISTRADOR } = require('../utils/permisosCatalogo');

const validarPlanSuscripcion = (plan) => {
  if (!SUBSCRIPTION_PLAN_NAMES.includes(plan)) {
    const error = new Error('El plan de suscripción no es válido');
    error.statusCode = 400;
    throw error;
  }
};

/**
 * @desc    Obtener lista de mayoristas con KPIs
 * @route   GET /api/v1/admin/mayoristas
 * @access  Private/Admin
 */
exports.getMayoristas = async (req, res, next) => {
  try {
    // El admin no debe ver datos operativos de sus tenants (agencias/reservas):
    // se devuelven solo los datos del mayorista, sin KPIs.
    const mayoristas = await Mayorista.find().populate('usuario_id', 'email activo').lean();

    res.json({ success: true, data: mayoristas });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Crear un nuevo mayorista
 * @route   POST /api/v1/admin/mayoristas
 * @access  Private/Admin
 */
exports.crearMayorista = async (req, res, next) => {
  const { nombre, razon_social, telefono, cuit, plan_suscripcion, email } = req.body;
  const planSuscripcion = plan_suscripcion || 'Starter';

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    validarPlanSuscripcion(planSuscripcion);

    // 1. Verificar si el email ya existe
    const existeUsuario = await Usuario.findOne({ email }).session(session);
    if (existeUsuario) {
      const error = new Error('El email ya está registrado');
      error.statusCode = 400;
      throw error;
    }

    // Solo por invitación: la contraseña la define el propio usuario, nunca
    // el admin (Ley 25.326: nadie más conoce la credencial).
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const expiresIn = vencimientoInvitacion();

    // El rol Administrador es protegido y no se puede asignar desde la
    // aplicación: esta alta que ejecuta el super-admin es la única vía por la
    // que un usuario lo obtiene, y con él el permiso GestionarRoles.
    const rolAdministrador = await Rol.findOne({
      nombre: ROL_ADMINISTRADOR,
      mayorista_id: null,
    })
      .select('_id')
      .session(session);

    if (!rolAdministrador) {
      // No debería pasar: lo crea bootstrapSeguridad() al arrancar el server.
      const error = new Error(
        'El rol Administrador no está inicializado. Reiniciá el servidor.'
      );
      error.statusCode = 500;
      throw error;
    }

    // 2. Crear el Usuario
    const nuevoUsuario = new Usuario({
      email,
      rol: 'mayorista',
      rol_id: rolAdministrador._id,
      activo: false,
      invite_token: inviteToken,
      invite_token_expires: expiresIn,
    });
    await nuevoUsuario.save({ session });

    // 3. Crear el Mayorista
    const nuevoMayorista = new Mayorista({
      usuario_id: nuevoUsuario._id,
      nombre,
      razon_social,
      telefono,
      cuit,
      plan_suscripcion: planSuscripcion,
      activo: true,
    });
    await nuevoMayorista.save({ session });

    // 4. Cerrar el vínculo en la dirección Usuario → Mayorista. Es circular
    //    (el Mayorista necesita el usuario_id y el Usuario el mayorista_id),
    //    así que se completa recién acá, dentro de la misma transacción.
    nuevoUsuario.mayorista_id = nuevoMayorista._id;
    await nuevoUsuario.save({ session });

    // Commit de la transacción
    await session.commitTransaction();
    session.endSession();

    registrarAuditoria({
      req,
      accion: 'USUARIO_CREADO',
      entidad_afectada: 'Usuario',
      entidad_id: nuevoUsuario._id,
      detalle: { email, rol: 'mayorista', con_invitacion: true },
    });

    // 6. Enviar email de invitación
    try {
      await enviarInvitacion(email, inviteToken, 'Mayorista');
    } catch (mailError) {
      console.error('Error al enviar email de invitación, pero la cuenta fue creada:', mailError.message);
    }

    res.status(201).json({
      success: true,
      data: nuevoMayorista,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

/**
 * @desc    Obtener detalles de un mayorista por ID
 * @route   GET /api/v1/admin/mayoristas/:id
 * @access  Private/Admin
 */
exports.getMayoristaById = async (req, res, next) => {
  try {
    const mayorista = await Mayorista.findById(req.params.id)
      .populate('usuario_id', 'email activo')
      .lean();

    if (!mayorista) {
      return res.status(404).json({ success: false, message: 'Mayorista no encontrado' });
    }

    const agenciasCount = await Agencia.countDocuments({ mayorista_id: mayorista._id });
    const productosCount = await Producto.countDocuments({ mayorista_id: mayorista._id });

    res.json({
      success: true,
      data: {
        ...mayorista,
        kpis: {
          agencias: agenciasCount,
          productos: productosCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Actualizar un mayorista (incluye reactivación si activo: true)
 * @route   PUT /api/v1/admin/mayoristas/:id
 * @access  Private/Admin
 */
exports.updateMayorista = async (req, res, next) => {
  try {
    const { nombre, razon_social, telefono, cuit, plan_suscripcion } = req.body;
    const id = req.params.id;

    const updateFields = {};
    if (nombre !== undefined) updateFields.nombre = nombre;
    if (razon_social !== undefined) {
      const rs = (razon_social && String(razon_social).trim());
      updateFields.razon_social = rs || nombre || 'Sin especificar';
    }
    if (telefono !== undefined) updateFields.telefono = telefono || null;
    if (cuit !== undefined) updateFields.cuit = cuit;
    if (plan_suscripcion !== undefined) {
      const planSuscripcion = plan_suscripcion || 'Starter';
      validarPlanSuscripcion(planSuscripcion);
      updateFields.plan_suscripcion = planSuscripcion;
    }

    const mayorista = await Mayorista.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!mayorista) {
      return res.status(404).json({ success: false, message: 'Mayorista no encontrado' });
    }

    const updated = await Mayorista.findById(id).populate('usuario_id', 'email activo');
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reenviar la invitación a un mayorista que todavía no definió su
 *          contraseña (se le venció el link o no le llegó el email).
 * @route   POST /api/v1/admin/mayoristas/:id/reenviar-invitacion
 * @access  Private/Admin
 *
 * Reemplaza al endpoint que dejaba al admin escribir la contraseña del
 * mayorista: la credencial la define solo su dueño (Ley 25.326).
 */
exports.reenviarInvitacionMayorista = async (req, res, next) => {
  try {
    const mayorista = await Mayorista.findById(req.params.id);
    if (!mayorista) {
      return res.status(404).json({ success: false, message: 'Mayorista no encontrado' });
    }
    // Un mayorista desactivado se reactiva por su propio flujo (con motivo e
    // historial), no reenviándole una invitación.
    if (!mayorista.activo) {
      return res.status(400).json({ success: false, message: 'El mayorista está desactivado. Reactivalo antes de reenviar la invitación.' });
    }
    const usuario = await Usuario.findById(mayorista.usuario_id).select('+password_hash');
    if (!usuario) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    if (usuario.password_hash) {
      return res.status(400).json({
        success: false,
        message: 'El usuario ya definió su contraseña. Si la olvidó, puede recuperarla con "¿Olvidaste tu contraseña?" en el login.',
      });
    }

    // Token nuevo: el link anterior deja de valer.
    const inviteToken = crypto.randomBytes(32).toString('hex');
    usuario.invite_token = inviteToken;
    usuario.invite_token_expires = vencimientoInvitacion();
    await usuario.save();

    try {
      await enviarInvitacion(usuario.email, inviteToken, 'Mayorista');
    } catch (mailError) {
      console.error('Error al reenviar la invitación:', mailError.message);
      return res.status(502).json({ success: false, message: 'No se pudo enviar el email de invitación. Intentá de nuevo más tarde.' });
    }

    res.json({ success: true, data: { message: `Invitación reenviada a ${usuario.email}.` } });
  } catch (error) {
    next(error);
  }
};

/**
 * Cuenta las operaciones activas de TODAS las agencias de un mayorista.
 */
async function contarOperacionesActivasMayorista(mayoristaId) {
  return contarOperacionesActivas(
    { mayorista_id: mayoristaId },
    { 'cot.mayorista_id': mayoristaId }
  );
}

/**
 * @desc    Previsualiza si el mayorista puede ser desactivado
 * @route   GET /api/v1/admin/mayoristas/:id/verificar-desactivacion
 * @access  Private/Admin
 */
exports.verificarDesactivacionMayorista = async (req, res, next) => {
  try {
    const mayorista = await Mayorista.findById(req.params.id).lean();
    if (!mayorista) {
      return res.status(404).json({ success: false, message: 'Mayorista no encontrado' });
    }

    const { cotizacionesActivas, reservasActivas } = await contarOperacionesActivasMayorista(mayorista._id);
    const puede_desactivar = cotizacionesActivas === 0 && reservasActivas === 0;

    res.status(200).json({
      success: true,
      data: {
        puede_desactivar,
        cotizaciones_activas: cotizacionesActivas,
        reservas_activas: reservasActivas,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Desactivar un mayorista (borrado lógico) y sus agencias
 * @route   DELETE /api/v1/admin/mayoristas/:id
 * @access  Private/Admin
 */
exports.deleteMayorista = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { motivo, mensaje } = req.body;

    if (!motivo || !Mayorista.MOTIVOS_DESACTIVACION.includes(motivo)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Debe seleccionar un motivo de desactivación válido.',
      });
    }

    const mensajeTrim = typeof mensaje === 'string' ? mensaje.trim() : '';
    if (motivo === 'otro' && !mensajeTrim) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Debe especificar un mensaje al elegir el motivo "Otro".',
      });
    }

    const mayorista = await Mayorista.findById(req.params.id).session(session);

    if (!mayorista) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Mayorista no encontrado' });
    }

    // Verificar integridad operacional dentro de la transacción
    const { cotizacionesActivas, reservasActivas } = await contarOperacionesActivasMayorista(mayorista._id);

    if (cotizacionesActivas > 0 || reservasActivas > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: 'No se puede desactivar el mayorista',
        motivo: 'Existen operaciones activas',
        detalles: {
          cotizaciones_activas: cotizacionesActivas,
          reservas_activas: reservasActivas,
        },
        mensaje: 'Debe cerrar todas las cotizaciones y reservas activas de sus agencias antes de desactivar el mayorista',
      });
    }

    mayorista.activo = false;
    mayorista.motivo_desactivacion = motivo;
    mayorista.motivo_desactivacion_mensaje = mensajeTrim || null;
    mayorista.fecha_desactivacion = new Date();
    await mayorista.save({ session });

    await registrarCambioEstadoPersona(
      mayorista._id, 'Mayorista', req.usuario.id, true, false, motivo, mensajeTrim, session
    );

    // Desactivar todas sus agencias usando Mongoose
    await Agencia.updateMany(
      { mayorista_id: mayorista._id },
      { activo: false },
      { session }
    );

    // Opcional: Desactivar también al usuario asociado
    let usuario = null;
    if (mayorista.usuario_id) {
      // findByIdAndUpdate no pasa por el hook de save: el $inc de
      // sesion_version (que invalida sus sesiones abiertas) va explícito.
      usuario = await Usuario.findByIdAndUpdate(
        mayorista.usuario_id,
        { activo: false, $inc: { sesion_version: 1 } },
        { session, new: true }
      );
    }

    await session.commitTransaction();
    session.endSession();

    // Se audita como USUARIO_DESACTIVADO (no un accion propia de Mayorista):
    // lo que importa desde seguridad es que se revocó el acceso de esa
    // cuenta, igual que al desactivar cualquier otro usuario.
    if (usuario) {
      registrarAuditoria({
        req,
        accion: 'USUARIO_DESACTIVADO',
        entidad_afectada: 'Usuario',
        entidad_id: usuario._id,
        detalle: { email: usuario.email, motivo, mensaje: mensajeTrim || undefined },
      });
    }

    if (usuario) {
      try {
        await enviarNotificacionDesactivacion(usuario.email, mayorista.nombre, motivo, mensajeTrim);
      } catch (mailError) {
        console.error('Error al enviar email de desactivación, pero el mayorista fue desactivado:', mailError.message);
      }
    }

    res.json({
      success: true,
      data: {},
      message: 'Mayorista y agencias desactivados',
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

/**
 * @desc    Reactivar un mayorista desactivado y su usuario asociado
 * @route   PATCH /api/v1/admin/mayoristas/:id/reactivar
 * @access  Private/Admin
 */
exports.reactivarMayorista = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const mayorista = await Mayorista.findById(req.params.id).session(session);

    if (!mayorista) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Mayorista no encontrado' });
    }

    if (mayorista.activo) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'El mayorista ya está activo.' });
    }

    mayorista.activo = true;
    mayorista.motivo_desactivacion = null;
    mayorista.motivo_desactivacion_mensaje = null;
    mayorista.fecha_desactivacion = null;
    await mayorista.save({ session });

    await registrarCambioEstadoPersona(
      mayorista._id, 'Mayorista', req.usuario.id, false, true, null, null, session
    );

    // Las agencias NO se reactivan en cascada: cada una debe reactivarse
    // individualmente desde el panel del mayorista.

    let usuario = null;
    if (mayorista.usuario_id) {
      usuario = await Usuario.findByIdAndUpdate(
        mayorista.usuario_id,
        { activo: true },
        { session, new: true }
      );
    }

    await session.commitTransaction();
    session.endSession();

    if (usuario) {
      try {
        await enviarNotificacionReactivacion(usuario.email, mayorista.nombre);
      } catch (mailError) {
        console.error('Error al enviar email de reactivación, pero el mayorista fue reactivado:', mailError.message);
      }
    }

    res.json({ success: true, data: {} });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

/**
 * @desc    Obtener estadisticas basicas globales (KPIs) de la plataforma
 * @route   GET /api/v1/admin/stats
 * @access  Private/Admin
 */
exports.getGlobalStats = async (req, res, next) => {
  try {
    const totalMayoristas = await Mayorista.countDocuments({ activo: true });
    const totalAgencias = await Agencia.countDocuments({ activo: true });
    const totalReservas = await Reserva.countDocuments();
    const totalCotizacionesPendientes = await Cotizacion.countDocuments({ estado: 'pendiente' });

    res.json({
      success: true,
      data: {
        total_mayoristas_activos: totalMayoristas,
        total_agencias_activas: totalAgencias,
        total_reservas: totalReservas,
        total_cotizaciones_pendientes: totalCotizacionesPendientes,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Historial de activaciones/desactivaciones de un mayorista
 * @route   GET /api/v1/admin/mayoristas/:id/historial
 * @access  Private/Admin
 */
exports.getHistorialMayorista = async (req, res, next) => {
  try {
    const mayorista = await Mayorista.findById(req.params.id).lean();
    if (!mayorista) {
      return res.status(404).json({ success: false, message: 'Mayorista no encontrado' });
    }

    const historial = await HistorialEstadoPersona.find({
      persona_id: mayorista._id,
      persona_tipo: 'Mayorista',
    })
      .populate('usuario_id', 'email rol')
      .sort({ created_at: -1 })
      .lean();

    res.json({ success: true, data: historial });
  } catch (error) {
    next(error);
  }
};
