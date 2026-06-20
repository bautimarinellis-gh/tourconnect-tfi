const mongoose = require('mongoose');
const crypto = require('crypto');
const Usuario = require('../models/Usuario');
const Mayorista = require('../models/Mayorista');
const Agencia = require('../models/Agencia');
const Reserva = require('../models/Reserva');
const Producto = require('../models/Producto');
const Cotizacion = require('../models/Cotizacion');
const { enviarEmail } = require('../utils/mailer');
const { SUBSCRIPTION_PLAN_NAMES } = require('../utils/subscriptionPlans');
const { registrarAuditoria } = require('../utils/auditService');

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
    const cotizacionCollection = Cotizacion.collection.name;

    // 3 queries en paralelo en vez de 2N+1 queries secuenciales
    const [mayoristas, agenciasAgg, reservasAgg] = await Promise.all([
      Mayorista.find().populate('usuario_id', 'email activo').lean(),
      Agencia.aggregate([
        { $match: { activo: true } },
        { $group: { _id: '$mayorista_id', count: { $sum: 1 } } },
      ]),
      Reserva.aggregate([
        {
          $lookup: {
            from: cotizacionCollection,
            localField: 'cotizacion_id',
            foreignField: '_id',
            as: 'cot',
          },
        },
        { $unwind: '$cot' },
        { $group: { _id: '$cot.mayorista_id', count: { $sum: 1 } } },
      ]),
    ]);

    const agenciasMap = new Map(agenciasAgg.map((a) => [a._id.toString(), a.count]));
    const reservasMap = new Map(reservasAgg.map((r) => [r._id.toString(), r.count]));

    const result = mayoristas.map((m) => ({
      ...m,
      kpis: {
        agencias_activas: agenciasMap.get(m._id.toString()) ?? 0,
        reservas_totales: reservasMap.get(m._id.toString()) ?? 0,
      },
    }));

    res.json({ success: true, data: result });
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
  const { nombre, razon_social, telefono, cuit, plan_suscripcion, email, nombre_usuario, password } = req.body;
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

    const tienePassword = password && String(password).trim().length >= 8;
    let inviteToken = null;
    let hashedToken = null;
    let expiresIn = null;

    if (!tienePassword) {
      inviteToken = crypto.randomBytes(32).toString('hex');
      hashedToken = crypto.createHash('sha256').update(inviteToken).digest('hex');
      expiresIn = new Date(Date.now() + 48 * 60 * 60 * 1000);
    }

    // 2. Crear el Usuario
    const nuevoUsuario = new Usuario({
      email,
      rol: 'mayorista',
      activo: tienePassword,
      invite_token: tienePassword ? undefined : hashedToken,
      invite_token_expires: tienePassword ? undefined : expiresIn,
    });
    if (tienePassword) {
      nuevoUsuario.password_hash = await Usuario.hashPassword(password.trim());
    }
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

    // Commit de la transacción
    await session.commitTransaction();
    session.endSession();

    registrarAuditoria({
      req,
      accion: 'MAYORISTA_CREADO',
      entidad_afectada: 'Mayorista',
      entidad_id: nuevoMayorista._id,
      detalle: { nombre, email, plan_suscripcion: planSuscripcion },
    });
    registrarAuditoria({
      req,
      accion: 'USUARIO_CREADO',
      entidad_afectada: 'Usuario',
      entidad_id: nuevoUsuario._id,
      detalle: { email, rol: 'mayorista', con_invitacion: !tienePassword },
    });

    // 6. Enviar email de invitación (solo si no se configuró password)
    if (!tienePassword && inviteToken) {
      const inviteUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/set-password/${inviteToken}`;
      const subject = 'Bienvenido a TourConnect - Configura tu contraseña';
      const html = `
        <h1>Hola ${nombre_usuario || nombre}</h1>
        <p>Has sido invitado a sumarte a TourConnect como administrador del mayorista <strong>${nombre}</strong>.</p>
        <p>Por favor, configura tu contraseña haciendo clic en el siguiente enlace (válido por 48 horas):</p>
        <a href="${inviteUrl}">Configurar mi contraseña</a>
        <p>Si no esperabas este correo, puedes ignorarlo.</p>
      `;
      try {
        await enviarEmail({ to: email, subject, html });
      } catch (mailError) {
        console.error('Error al enviar email de invitación, pero la cuenta fue creada:', mailError);
      }
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
    const { nombre, razon_social, telefono, cuit, plan_suscripcion, activo } = req.body;
    const id = req.params.id;

    const activoBool = activo === true || activo === 'true' ? true : activo === false || activo === 'false' ? false : undefined;

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
    if (typeof activoBool === 'boolean') updateFields.activo = activoBool;

    const mayorista = await Mayorista.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!mayorista) {
      return res.status(404).json({ success: false, message: 'Mayorista no encontrado' });
    }

    if (typeof activoBool === 'boolean') {
      await Agencia.updateMany({ mayorista_id: mayorista._id }, { activo: activoBool });
      if (mayorista.usuario_id) {
        await Usuario.findByIdAndUpdate(mayorista.usuario_id, { activo: activoBool });
      }
    }

    registrarAuditoria({
      req,
      accion: 'MAYORISTA_ACTUALIZADO',
      entidad_afectada: 'Mayorista',
      entidad_id: mayorista._id,
      detalle: { cambios: updateFields },
    });

    const updated = await Mayorista.findById(id).populate('usuario_id', 'email activo');
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Activar usuario y configurar contraseña de un mayorista (para mayoristas que no pudieron setearla)
 * @route   POST /api/v1/admin/mayoristas/:id/activar-usuario
 * @access  Private/Admin
 */
exports.activarUsuarioMayorista = async (req, res, next) => {
  try {
    const { password } = req.body;
    const mayorista = await Mayorista.findById(req.params.id);
    if (!mayorista) {
      return res.status(404).json({ success: false, message: 'Mayorista no encontrado' });
    }
    if (!password || String(password).trim().length < 8) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres.' });
    }
    const usuario = await Usuario.findById(mayorista.usuario_id).select('+password_hash');
    if (!usuario) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    usuario.password_hash = await Usuario.hashPassword(password.trim());
    usuario.activo = true;
    usuario.invite_token = undefined;
    usuario.invite_token_expires = undefined;
    await usuario.save();
    res.json({ success: true, data: { message: 'Usuario activado. Puede iniciar sesión.' } });
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
    const mayorista = await Mayorista.findById(req.params.id).session(session);

    if (!mayorista) {
      return res.status(404).json({ success: false, message: 'Mayorista no encontrado' });
    }

    mayorista.activo = false;
    await mayorista.save({ session });

    // Desactivar todas sus agencias usando Mongoose
    await Agencia.updateMany(
      { mayorista_id: mayorista._id },
      { activo: false },
      { session }
    );

    // Opcional: Desactivar también al usuario asociado
    if (mayorista.usuario_id) {
       await Usuario.findByIdAndUpdate(mayorista.usuario_id, { activo: false }, { session });
    }

    await session.commitTransaction();
    session.endSession();

    registrarAuditoria({
      req,
      accion: 'MAYORISTA_DESACTIVADO',
      entidad_afectada: 'Mayorista',
      entidad_id: mayorista._id,
      detalle: { nombre: mayorista.nombre },
    });

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
