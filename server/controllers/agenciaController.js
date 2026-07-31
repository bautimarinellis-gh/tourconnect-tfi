const mongoose = require('mongoose');
const crypto = require('crypto');
const Agencia = require('../models/Agencia');
const Mayorista = require('../models/Mayorista');
const Usuario = require('../models/Usuario');
const AgenciaProducto = require('../models/AgenciaProducto');
const { enviarInvitacion, enviarNotificacionDesactivacion, enviarNotificacionReactivacion } = require('../utils/mailer');
const { getSubscriptionPlan } = require('../utils/subscriptionPlans');
const { registrarAuditoria } = require('../utils/auditService');
const { registrarCambioEstadoPersona } = require('../utils/historialEstadoPersona');
const HistorialEstadoPersona = require('../models/HistorialEstadoPersona');
const { contarOperacionesActivas } = require('../utils/operacionesActivas');

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
    // en una sola aggregation en vez de un countDocuments por agencia.
    const counts = await AgenciaProducto.aggregate([
      { $match: { agencia_id: { $in: agencias.map((a) => a._id) }, habilitado: true } },
      { $group: { _id: '$agencia_id', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));
    agencias.forEach((agencia) => {
      agencia.productos_habilitados = countMap.get(agencia._id.toString()) ?? 0;
    });

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
    const { nombre, razon_social, telefono, cuit, email, password } = req.body;
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

    // Enviar correo de invitación (solo si no se configuró password). Se
    // envía después del commit: si la transacción abortara más tarde, no
    // queremos haber invitado a una cuenta que nunca existió.
    if (!tienePassword && inviteToken) {
      try {
        await enviarInvitacion(email, inviteToken, 'Agencia');
      } catch (mailError) {
        console.error('Error al enviar email de invitación, pero la agencia fue creada:', mailError.message);
      }
    }

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
    const updateFields = { nombre, razon_social, telefono };

    const agencia = await Agencia.findOneAndUpdate(
      { _id: req.params.id, mayorista_id: req.usuario.mayorista_id },
      updateFields,
      { new: true, runValidators: true }
    );

    if (!agencia) {
      return res.status(404).json({
        success: false,
        message: 'Agencia no encontrada.',
      });
    }

    registrarAuditoria({
      req,
      accion: 'AGENCIA_ACTUALIZADA',
      entidad_afectada: 'Agencia',
      entidad_id: agencia._id,
      detalle: { cambios: updateFields },
    });

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
 */
async function contarOperacionesActivasAgencia(agenciaId, mayoristaId) {
  return contarOperacionesActivas(
    { agencia_id: agenciaId, mayorista_id: mayoristaId },
    { 'cot.agencia_id': agenciaId, 'cot.mayorista_id': mayoristaId }
  );
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

    const { cotizacionesActivas, reservasActivas } = await contarOperacionesActivasAgencia(
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
    agencia.motivo_desactivacion = null;
    agencia.motivo_desactivacion_mensaje = null;
    agencia.fecha_desactivacion = null;
    await agencia.save({ session });

    await registrarCambioEstadoPersona(
      agencia._id, 'Agencia', req.usuario.id, false, true, null, null, session
    );

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

      try {
        await enviarNotificacionReactivacion(usuario.email, agencia.nombre);
      } catch (mailError) {
        console.error('Error al enviar email de reactivación, pero la agencia fue reactivada:', mailError.message);
      }
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
    const { motivo, mensaje } = req.body;

    if (!motivo || !Agencia.MOTIVOS_DESACTIVACION.includes(motivo)) {
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

    const agencia = await Agencia.findOne({
      _id: req.params.id,
      mayorista_id: req.usuario.mayorista_id,
    }).session(session);

    if (!agencia) {
      throw new Error('Agencia_Not_Found');
    }

    // Verificar integridad operacional dentro de la transacción
    const { cotizacionesActivas, reservasActivas } = await contarOperacionesActivasAgencia(
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
    agencia.motivo_desactivacion = motivo;
    agencia.motivo_desactivacion_mensaje = mensajeTrim || null;
    agencia.fecha_desactivacion = new Date();
    await agencia.save({ session });

    await registrarCambioEstadoPersona(
      agencia._id, 'Agencia', req.usuario.id, true, false, motivo, mensajeTrim, session
    );

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
      detalle: { nombre: agencia.nombre, motivo, mensaje: mensajeTrim || undefined },
    });
    if (usuario) {
      registrarAuditoria({
        req,
        accion: 'USUARIO_DESACTIVADO',
        entidad_afectada: 'Usuario',
        entidad_id: usuario._id,
        detalle: { email: usuario.email, rol: 'agencia' },
      });

      try {
        await enviarNotificacionDesactivacion(usuario.email, agencia.nombre, motivo, mensajeTrim);
      } catch (mailError) {
        console.error('Error al enviar email de desactivación, pero la agencia fue desactivada:', mailError.message);
      }
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

/**
 * @route   GET /api/v1/agencias/:id/historial
 * @desc    Historial de activaciones/desactivaciones de la agencia
 * @access  Private (Mayorista)
 */
exports.getHistorialAgencia = async (req, res, next) => {
  try {
    const agencia = await Agencia.findOne({
      _id: req.params.id,
      mayorista_id: req.usuario.mayorista_id,
    }).lean();

    if (!agencia) {
      return res.status(404).json({ success: false, message: 'Agencia no encontrada.' });
    }

    const historial = await HistorialEstadoPersona.find({
      persona_id: agencia._id,
      persona_tipo: 'Agencia',
    })
      .populate('usuario_id', 'email rol')
      .sort({ created_at: -1 })
      .lean();

    res.status(200).json({ success: true, data: historial });
  } catch (error) {
    next(error);
  }
};
