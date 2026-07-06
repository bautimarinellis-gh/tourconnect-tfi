const mongoose = require('mongoose');
const crypto = require('crypto');
const Agencia = require('../models/Agencia');
const Mayorista = require('../models/Mayorista');
const Usuario = require('../models/Usuario');
const AgenciaProducto = require('../models/AgenciaProducto');
const Cotizacion = require('../models/Cotizacion');
const Reserva = require('../models/Reserva');
const { enviarInvitacion } = require('../utils/mailer');
const { getSubscriptionPlan } = require('../utils/subscriptionPlans');
const { registrarAuditoria } = require('../utils/auditService');

/**
 * @route   GET /api/v1/agencias
 * @desc    Lista las agencias del mayorista autenticado
 * @access  Private (Mayorista)
 */
exports.getAgencias = async (req, res, next) => {
  try {
    const mayoristaId = req.usuario.mayorista_id;

    // Obtener agencias con el usuario asociado para el mail/nombre
    const agencias = await Agencia.find({ mayorista_id: mayoristaId })
      .populate('usuario_id', 'email activo')
      .lean(); // usar lean para modificar el objeto y agregar campos extras

    // Calcular la cantidad de productos habilitados para cada agencia
    for (let agencia of agencias) {
      const productosCount = await AgenciaProducto.countDocuments({
        agencia_id: agencia._id,
        habilitado: true,
      });
      agencia.productos_habilitados = productosCount;
    }

    res.status(200).json({
      success: true,
      data: agencias,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/v1/agencias
 * @desc    Crea una nueva agencia (con su usuario asociado envíando invitación)
 * @access  Private (Mayorista)
 */
exports.createAgencia = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { nombre, razon_social, telefono, cuit, email, nombre_usuario, password } = req.body;
    const mayoristaId = req.usuario.mayorista_id;

    const mayorista = await Mayorista.findById(mayoristaId).session(session);
    if (!mayorista) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: 'Mayorista no encontrado.',
      });
    }

    const plan = getSubscriptionPlan(mayorista.plan_suscripcion);
    if (plan.maxAgencias !== null) {
      const agenciasActivas = await Agencia.countDocuments({
        mayorista_id: mayoristaId,
        activo: true,
      }).session(session);

      if (agenciasActivas >= plan.maxAgencias) {
        await session.abortTransaction();
        session.endSession();
        return res.status(403).json({
          success: false,
          message: `El plan ${plan.label} permite crear hasta ${plan.maxAgencias} agencias. Actualizá el plan para agregar más agencias.`,
        });
      }
    }

    // 1. Verificar si el email ya existe
    const usuarioExistente = await Usuario.findOne({ email }).session(session);
    if (usuarioExistente) {
      throw new Error('El correo electrónico ya está registrado.');
    }

    // Validar longitud mínima de password si fue proporcionado
    if (password && String(password).trim().length < 8) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 8 caracteres.',
      });
    }

    const tienePassword = password && String(password).trim().length >= 8;
    let inviteToken = null;
    let inviteTokenExpires = null;

    if (!tienePassword) {
      inviteToken = crypto.randomBytes(32).toString('hex');
      inviteTokenExpires = Date.now() + 48 * 60 * 60 * 1000; // 48 horas
    }

    // 2. Crear el usuario (agencia)
    const nuevoUsuario = new Usuario({
      email,
      rol: 'agencia',
      activo: tienePassword,
      invite_token: tienePassword ? undefined : inviteToken,
      invite_token_expires: tienePassword ? undefined : inviteTokenExpires,
    });
    if (tienePassword) {
      nuevoUsuario.password_hash = await Usuario.hashPassword(password.trim());
    }
    await nuevoUsuario.save({ session });

    // 4. Crear la agencia
    const nuevaAgencia = new Agencia({
      mayorista_id: mayoristaId,
      usuario_id: nuevoUsuario._id,
      nombre,
      razon_social,
      telefono,
      cuit,
      activo: true,
    });

    await nuevaAgencia.save({ session });

    // Enviar correo de invitación (solo si no se configuró password)
    if (!tienePassword && inviteToken) {
      try {
        await enviarInvitacion(email, inviteToken, 'Agencia');
      } catch (mailError) {
        console.error('Error al enviar email de invitación, pero la agencia fue creada:', mailError.message);
      }
    }

    // Confirmar transacción
    await session.commitTransaction();
    session.endSession();

    registrarAuditoria({
      req,
      accion: 'AGENCIA_CREADA',
      entidad_afectada: 'Agencia',
      entidad_id: nuevaAgencia._id,
      detalle: { nombre, email },
    });
    registrarAuditoria({
      req,
      accion: 'USUARIO_CREADO',
      entidad_afectada: 'Usuario',
      entidad_id: nuevoUsuario._id,
      detalle: { email, rol: 'agencia', con_invitacion: !tienePassword },
    });

    res.status(201).json({
      success: true,
      data: nuevaAgencia,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    // Si es un error arrojado manualmente o validación de mongoose
    if (error.message === 'El correo electrónico ya está registrado.') {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @route   GET /api/v1/agencias/:id
 * @desc    Detalle completo de una agencia
 * @access  Private (Mayorista)
 */
exports.getAgencia = async (req, res, next) => {
  try {
    const agencias = await Agencia.findOne({
      _id: req.params.id,
      mayorista_id: req.usuario.mayorista_id,
    })
      .populate('usuario_id', 'email activo')
      .lean();

    if (!agencias) {
      return res.status(404).json({
        success: false,
        message: 'Agencia no encontrada.',
      });
    }

    // Buscar productos habilitados
    const productos = await AgenciaProducto.find({
      agencia_id: agencias._id,
      habilitado: true,
    })
      .populate('producto_id', 'nombre tipo precio_base')
      .lean();

    agencias.productos = productos;

    res.status(200).json({
      success: true,
      data: agencias,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/v1/agencias/:id
 * @desc    Actualiza los datos de la agencia
 * @access  Private (Mayorista)
 */
exports.updateAgencia = async (req, res, next) => {
  try {
    const { nombre, razon_social, telefono } = req.body;

    const agencia = await Agencia.findOneAndUpdate(
      { _id: req.params.id, mayorista_id: req.usuario.mayorista_id },
      { nombre, razon_social, telefono },
      { new: true, runValidators: true }
    );

    if (!agencia) {
      return res.status(404).json({
        success: false,
        message: 'Agencia no encontrada.',
      });
    }

    res.status(200).json({
      success: true,
      data: agencia,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cuenta las operaciones activas de una agencia dentro de un mayorista.
 * Cotizaciones activas: estado IN ['pendiente', 'aprobada']
 * Reservas activas:     estado = 'pendiente_pago'
 *                    OR (estado = 'pagada' AND fecha_fin >= hoy)
 */
async function contarOperacionesActivas(agenciaId, mayoristaId) {
  const ahora = new Date();
  const cotizacionCollection = Cotizacion.collection.name;

  const [cotizacionesActivas, reservasActivasAgg] = await Promise.all([
    Cotizacion.countDocuments({
      agencia_id: agenciaId,
      mayorista_id: mayoristaId,
      estado: { $in: ['pendiente', 'aprobada'] },
    }),
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
      {
        $match: {
          'cot.agencia_id': agenciaId,
          'cot.mayorista_id': mayoristaId,
          $or: [
            { estado: 'pendiente_pago' },
            { estado: 'pagada', 'cot.fecha_fin': { $gte: ahora } },
          ],
        },
      },
      { $count: 'total' },
    ]),
  ]);

  const reservasActivas = reservasActivasAgg[0]?.total ?? 0;

  return { cotizacionesActivas, reservasActivas };
}

/**
 * @route   GET /api/v1/agencias/:id/verificar-desactivacion
 * @desc    Previsualiza si la agencia puede ser desactivada
 * @access  Private (Mayorista)
 */
exports.verificarDesactivacion = async (req, res, next) => {
  try {
    const agencia = await Agencia.findOne({
      _id: req.params.id,
      mayorista_id: req.usuario.mayorista_id,
    });

    if (!agencia) {
      return res.status(404).json({ success: false, message: 'Agencia no encontrada.' });
    }

    const { cotizacionesActivas, reservasActivas } = await contarOperacionesActivas(
      agencia._id,
      req.usuario.mayorista_id
    );

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
 * @route   PATCH /api/v1/agencias/:id/reactivar
 * @desc    Reactiva una agencia desactivada y su usuario asociado
 * @access  Private (Mayorista)
 */
exports.reactivarAgencia = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const agencia = await Agencia.findOne({
      _id: req.params.id,
      mayorista_id: req.usuario.mayorista_id,
    }).session(session);

    if (!agencia) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: 'Agencia no encontrada.' });
    }

    if (agencia.activo) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: 'La agencia ya está activa.' });
    }

    // Verificar límite de plan antes de reactivar
    const mayorista = await Mayorista.findById(req.usuario.mayorista_id).session(session);
    if (mayorista) {
      const plan = getSubscriptionPlan(mayorista.plan_suscripcion);
      if (plan.maxAgencias !== null) {
        const agenciasActivas = await Agencia.countDocuments({
          mayorista_id: req.usuario.mayorista_id,
          activo: true,
        }).session(session);

        if (agenciasActivas >= plan.maxAgencias) {
          await session.abortTransaction();
          session.endSession();
          return res.status(403).json({
            success: false,
            message: `El plan ${plan.label} permite hasta ${plan.maxAgencias} agencias activas. Actualizá el plan para reactivar esta agencia.`,
          });
        }
      }
    }

    agencia.activo = true;
    await agencia.save({ session });

    const usuario = await Usuario.findById(agencia.usuario_id).session(session);
    if (usuario) {
      usuario.activo = true;
      await usuario.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    registrarAuditoria({
      req,
      accion: 'AGENCIA_REACTIVADA',
      entidad_afectada: 'Agencia',
      entidad_id: agencia._id,
      detalle: { nombre: agencia.nombre },
    });
    if (usuario) {
      registrarAuditoria({
        req,
        accion: 'USUARIO_REACTIVADO',
        entidad_afectada: 'Usuario',
        entidad_id: usuario._id,
        detalle: { email: usuario.email, rol: 'agencia' },
      });
    }

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    next(error);
  }
};

/**
 * @route   DELETE /api/v1/agencias/:id
 * @desc    Desactiva la agencia y su usuario asociado
 * @access  Private (Mayorista)
 */
exports.deleteAgencia = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const agencia = await Agencia.findOne({
      _id: req.params.id,
      mayorista_id: req.usuario.mayorista_id,
    }).session(session);

    if (!agencia) {
      throw new Error('Agencia_Not_Found');
    }

    // Verificar integridad operacional dentro de la transacción
    const { cotizacionesActivas, reservasActivas } = await contarOperacionesActivas(
      agencia._id,
      req.usuario.mayorista_id
    );

    if (cotizacionesActivas > 0 || reservasActivas > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        error: 'No se puede desactivar la agencia',
        motivo: 'Existen operaciones activas',
        detalles: {
          cotizaciones_activas: cotizacionesActivas,
          reservas_activas: reservasActivas,
        },
        mensaje: 'Debe cerrar todas las cotizaciones y reservas activas antes de desactivar la agencia',
      });
    }

    agencia.activo = false;
    await agencia.save({ session });

    const usuario = await Usuario.findById(agencia.usuario_id).session(session);
    if (usuario) {
      usuario.activo = false;
      await usuario.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    registrarAuditoria({
      req,
      accion: 'AGENCIA_DESACTIVADA',
      entidad_afectada: 'Agencia',
      entidad_id: agencia._id,
      detalle: { nombre: agencia.nombre },
    });
    if (usuario) {
      registrarAuditoria({
        req,
        accion: 'USUARIO_DESACTIVADO',
        entidad_afectada: 'Usuario',
        entidad_id: usuario._id,
        detalle: { email: usuario.email, rol: 'agencia' },
      });
    }

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (error.message === 'Agencia_Not_Found') {
      return res.status(404).json({
        success: false,
        message: 'Agencia no encontrada.',
      });
    }
    next(error);
  }
};
