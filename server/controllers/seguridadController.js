const crypto = require('crypto');
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const Rol = require('../models/Rol');
const Permiso = require('../models/Permiso');
const { enviarInvitacion, enviarResetClave } = require('../utils/mailer');
const { registrarAuditoria } = require('../utils/auditService');
const { PERMISOS_NO_ASIGNABLES } = require('../utils/permisosCatalogo');

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
const RESET_ADMIN_TTL_MS = 48 * 60 * 60 * 1000;

const error = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/**
 * Traduce una lista de códigos de permiso a documentos, rechazando los que no
 * existen y los que nunca son asignables.
 *
 * La validación vive acá y no solo en la UI: filtrar `GestionarRoles` en el
 * frontend sería esquivable con una llamada directa a la API, y con eso se
 * caería toda la protección del rol Administrador.
 */
const resolverPermisosAsignables = async (codigos) => {
  if (!Array.isArray(codigos)) {
    throw error('Se esperaba una lista de códigos de permiso', 400);
  }

  const unicos = [...new Set(codigos)];

  const prohibidos = unicos.filter((c) => PERMISOS_NO_ASIGNABLES.includes(c));
  if (prohibidos.length > 0) {
    throw error(
      `Estos permisos no se pueden asignar: ${prohibidos.join(', ')}`,
      403
    );
  }

  const encontrados = await Permiso.find({ codigo: { $in: unicos } })
    .select('_id codigo')
    .lean();

  if (encontrados.length !== unicos.length) {
    const hallados = new Set(encontrados.map((p) => p.codigo));
    const faltantes = unicos.filter((c) => !hallados.has(c));
    throw error(`Permisos inexistentes: ${faltantes.join(', ')}`, 400);
  }

  return encontrados.map((p) => p._id);
};

/**
 * Busca un usuario garantizando que pertenece al tenant de quien llama.
 *
 * No se usa `checkOwnership` porque además del tenant hay que exigir el
 * ámbito: sin el filtro por `rol: 'mayorista'`, un id de usuario de agencia o
 * del super-admin entraría por acá.
 */
const buscarUsuarioDelTenant = async (usuarioId, mayoristaId) => {
  if (!mongoose.isValidObjectId(usuarioId)) {
    throw error('Usuario no encontrado', 404);
  }

  const usuario = await Usuario.findOne({
    _id: usuarioId,
    rol: 'mayorista',
    mayorista_id: mayoristaId,
  });

  if (!usuario) throw error('Usuario no encontrado', 404);
  return usuario;
};

const buscarRolEditable = async (rolId, mayoristaId) => {
  if (!mongoose.isValidObjectId(rolId)) {
    throw error('Rol no encontrado', 404);
  }

  const rol = await Rol.findById(rolId);
  if (!rol) throw error('Rol no encontrado', 404);

  // Un rol protegido no se edita ni se elimina desde la aplicación.
  if (rol.protegido) {
    throw error('Este rol es del sistema y no se puede modificar', 403);
  }

  // Y nadie toca los roles de otro mayorista.
  if (String(rol.mayorista_id) !== String(mayoristaId)) {
    throw error('Rol no encontrado', 404);
  }

  return rol;
};

// ---------------------------------------------------------------------------
// Permisos
// ---------------------------------------------------------------------------

/**
 * @desc    Catálogo de permisos ofrecibles, agrupado por módulo
 * @route   GET /api/v1/seguridad/permisos
 * @access  Private/GestionarRoles
 */
exports.getPermisos = async (req, res, next) => {
  try {
    const permisos = await Permiso.find({
      codigo: { $nin: PERMISOS_NO_ASIGNABLES },
    })
      .select('codigo descripcion modulo')
      .sort({ modulo: 1, codigo: 1 })
      .lean();

    res.json({ success: true, data: permisos });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * @desc    Roles disponibles para el tenant: los del sistema más los propios
 * @route   GET /api/v1/seguridad/roles
 * @access  Private/GestionarRoles
 */
exports.getRoles = async (req, res, next) => {
  try {
    const roles = await Rol.find({
      ambito: 'Mayorista',
      $or: [{ personalizado: false }, { mayorista_id: req.mayorista_id }],
    })
      .populate('permisos', 'codigo descripcion modulo')
      .sort({ personalizado: 1, nombre: 1 })
      .lean();

    // `asignable` le dice al frontend qué puede ofrecer sin tener que conocer
    // la regla. El backend igual la vuelve a validar al asignar.
    const data = roles.map((rol) => ({ ...rol, asignable: !rol.protegido }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Crear un rol personalizado
 * @route   POST /api/v1/seguridad/roles
 * @access  Private/GestionarRoles
 */
exports.createRol = async (req, res, next) => {
  try {
    const { nombre, permisos } = req.body;

    if (!nombre || !String(nombre).trim()) {
      throw error('El nombre del rol es obligatorio', 400);
    }

    const idsPermisos = await resolverPermisosAsignables(permisos ?? []);

    // El ámbito, la marca de personalizado y el tenant no se toman del body:
    // se fuerzan. Así un cliente no puede pedir un rol del sistema, ni uno
    // protegido, ni uno de otro mayorista.
    const rol = new Rol({
      nombre: String(nombre).trim(),
      ambito: 'Mayorista',
      personalizado: true,
      protegido: false,
      mayorista_id: req.mayorista_id,
      permisos: idsPermisos,
    });

    await rol.save();

    res.status(201).json({ success: true, data: rol });
  } catch (err) {
    if (err.code === 11000) {
      return next(error('Ya existe un rol con ese nombre', 409));
    }
    next(err);
  }
};

/**
 * @desc    Editar un rol personalizado (nombre y composición de permisos)
 * @route   PUT /api/v1/seguridad/roles/:id
 * @access  Private/GestionarRoles
 */
exports.updateRol = async (req, res, next) => {
  try {
    const { nombre, permisos } = req.body;
    const rol = await buscarRolEditable(req.params.id, req.mayorista_id);

    if (nombre !== undefined) {
      if (!String(nombre).trim()) {
        throw error('El nombre del rol es obligatorio', 400);
      }
      rol.nombre = String(nombre).trim();
    }

    if (permisos !== undefined) {
      rol.permisos = await resolverPermisosAsignables(permisos);
    }

    await rol.save();

    res.json({ success: true, data: rol });
  } catch (err) {
    if (err.code === 11000) {
      return next(error('Ya existe un rol con ese nombre', 409));
    }
    next(err);
  }
};

/**
 * @desc    Eliminar un rol personalizado
 * @route   DELETE /api/v1/seguridad/roles/:id
 * @access  Private/GestionarRoles
 */
exports.deleteRol = async (req, res, next) => {
  try {
    const rol = await buscarRolEditable(req.params.id, req.mayorista_id);

    // Borrar un rol en uso dejaría a esos usuarios sin acceso a nada y sin
    // aviso. Se bloquea y se informa a cuántos afecta.
    const enUso = await Usuario.countDocuments({ rol_id: rol._id });
    if (enUso > 0) {
      return res.status(409).json({
        success: false,
        message:
          `No se puede eliminar: ${enUso} usuario(s) tienen este rol asignado. ` +
          'Asignales otro rol primero.',
        data: { usuarios_asignados: enUso },
      });
    }

    await rol.deleteOne();

    res.json({ success: true, message: 'Rol eliminado' });
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

/**
 * @desc    Usuarios internos del mayorista
 * @route   GET /api/v1/seguridad/usuarios
 * @access  Private/GestionarRoles
 */
exports.getUsuarios = async (req, res, next) => {
  try {
    const usuarios = await Usuario.find({
      rol: 'mayorista',
      mayorista_id: req.mayorista_id,
    })
      .select('email nombre activo rol_id permisos_individuales created_at +password_hash')
      .populate('rol_id', 'nombre protegido personalizado')
      .populate('permisos_individuales', 'codigo descripcion modulo')
      .sort({ created_at: 1 })
      .lean();

    // `activo: false` significa dos cosas distintas según haya password_hash
    // o no: invitación nunca aceptada vs. cuenta desactivada a propósito. El
    // frontend necesita distinguirlas para ofrecer la acción correcta (no
    // tiene sentido "reactivar" a alguien que nunca aceptó la invitación).
    const data = usuarios.map(({ password_hash, ...u }) => ({
      ...u,
      estado: u.activo ? 'activo' : password_hash ? 'desactivado' : 'invitacion_pendiente',
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Crear un usuario interno e invitarlo por mail
 * @route   POST /api/v1/seguridad/usuarios
 * @access  Private/GestionarRoles
 */
exports.createUsuario = async (req, res, next) => {
  try {
    const { email, nombre, rol_id } = req.body;

    if (!email || !String(email).trim()) {
      throw error('El email es obligatorio', 400);
    }
    if (!nombre || !String(nombre).trim()) {
      throw error('El nombre es obligatorio', 400);
    }

    const emailNormalizado = String(email).trim().toLowerCase();

    if (await Usuario.findOne({ email: emailNormalizado })) {
      throw error('El email ya está registrado', 400);
    }

    // El rol es opcional al crear: se puede dar de alta y asignarlo después.
    let rolAsignado = null;
    if (rol_id) {
      rolAsignado = await Rol.findById(rol_id).select(
        '_id nombre protegido personalizado mayorista_id ambito'
      );
      if (!rolAsignado) throw error('El rol indicado no existe', 400);

      // Misma regla que en PATCH /:id/rol — un rol protegido (Administrador)
      // no se asigna nunca desde la aplicación.
      if (rolAsignado.protegido) {
        throw error('Este rol no se puede asignar', 403);
      }
      if (
        rolAsignado.personalizado &&
        String(rolAsignado.mayorista_id) !== String(req.mayorista_id)
      ) {
        throw error('El rol indicado no existe', 400);
      }
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');

    const usuario = new Usuario({
      email: emailNormalizado,
      nombre: String(nombre).trim(),
      rol: 'mayorista',
      mayorista_id: req.mayorista_id,
      rol_id: rolAsignado?._id ?? null,
      activo: false,
      invite_token: inviteToken,
      invite_token_expires: new Date(Date.now() + INVITE_TTL_MS),
    });

    await usuario.save();

    registrarAuditoria({
      req,
      accion: 'USUARIO_CREADO',
      entidad_afectada: 'Usuario',
      entidad_id: usuario._id,
      detalle: {
        email: emailNormalizado,
        rol: 'mayorista',
        rol_asignado: rolAsignado?.nombre ?? null,
        con_invitacion: true,
      },
    });

    // Después de persistir: si el mail falla, la cuenta ya existe y se puede
    // reenviar la invitación. Al revés no se puede deshacer.
    try {
      await enviarInvitacion(emailNormalizado, inviteToken, 'Mayorista');
    } catch (mailError) {
      console.error(
        'Error al enviar la invitación, la cuenta fue creada igual:',
        mailError.message
      );
    }

    res.status(201).json({
      success: true,
      data: usuario,
      message: 'Usuario creado. Se le envió la invitación por email.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Asignar o quitar el rol de un usuario (bloque completo)
 * @route   PATCH /api/v1/seguridad/usuarios/:id/rol
 * @access  Private/GestionarRoles
 */
exports.asignarRol = async (req, res, next) => {
  try {
    const { rol_id } = req.body;
    const usuario = await buscarUsuarioDelTenant(
      req.params.id,
      req.mayorista_id
    );

    // rol_id: null quita el rol. Los permisos individuales no se tocan: son
    // independientes del rol.
    if (!rol_id) {
      usuario.rol_id = null;
      await usuario.save();

      return res.json({ success: true, data: usuario });
    }

    if (!mongoose.isValidObjectId(rol_id)) {
      throw error('El rol indicado no existe', 400);
    }

    const rol = await Rol.findById(rol_id).select(
      '_id nombre protegido personalizado mayorista_id ambito'
    );
    if (!rol) throw error('El rol indicado no existe', 400);

    // Acá se cierra la protección del rol Administrador: es el único rol
    // protegido y por eso nunca se puede asignar desde la aplicación. La
    // única vía es el alta de mayorista que ejecuta el super-admin.
    if (rol.protegido) {
      throw error('Este rol no se puede asignar', 403);
    }

    if (rol.ambito !== 'Mayorista') {
      throw error('El rol indicado no existe', 400);
    }

    // Un rol personalizado solo lo puede usar el mayorista que lo creó.
    if (
      rol.personalizado &&
      String(rol.mayorista_id) !== String(req.mayorista_id)
    ) {
      throw error('El rol indicado no existe', 400);
    }

    usuario.rol_id = rol._id;
    await usuario.save();

    res.json({ success: true, data: usuario });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Reemplazar los permisos individuales de un usuario
 * @route   PATCH /api/v1/seguridad/usuarios/:id/permisos
 * @access  Private/GestionarRoles
 */
exports.asignarPermisos = async (req, res, next) => {
  try {
    const { permisos } = req.body;
    const usuario = await buscarUsuarioDelTenant(
      req.params.id,
      req.mayorista_id
    );

    const idsPermisos = await resolverPermisosAsignables(permisos ?? []);

    usuario.permisos_individuales = idsPermisos;
    await usuario.save();

    res.json({ success: true, data: usuario });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Editar nombre y/o email de un usuario interno
 * @route   PUT /api/v1/seguridad/usuarios/:id
 * @access  Private/GestionarRoles
 */
exports.updateUsuario = async (req, res, next) => {
  try {
    const { nombre, email } = req.body;
    const usuario = await buscarUsuarioDelTenant(req.params.id, req.mayorista_id);

    if (nombre !== undefined) {
      if (!String(nombre).trim()) throw error('El nombre es obligatorio', 400);
      usuario.nombre = String(nombre).trim();
    }

    if (email !== undefined) {
      const emailNormalizado = String(email).trim().toLowerCase();
      if (!emailNormalizado) throw error('El email es obligatorio', 400);

      if (emailNormalizado !== usuario.email) {
        const existente = await Usuario.findOne({
          email: emailNormalizado,
          _id: { $ne: usuario._id },
        });
        if (existente) throw error('El email ya está registrado', 400);
        usuario.email = emailNormalizado;
      }
    }

    await usuario.save();

    res.json({ success: true, data: usuario });
  } catch (err) {
    if (err.code === 11000) return next(error('El email ya está registrado', 400));
    next(err);
  }
};

/**
 * @desc    Desactivar un usuario interno. No se elimina físicamente para no
 *          perder la trazabilidad de auditoría de lo que hizo mientras
 *          estuvo activo.
 * @route   DELETE /api/v1/seguridad/usuarios/:id
 * @access  Private/GestionarRoles
 */
exports.deleteUsuario = async (req, res, next) => {
  try {
    const usuario = await buscarUsuarioDelTenant(req.params.id, req.mayorista_id);
    await usuario.populate('rol_id', 'protegido');

    // El rol Administrador es el único con GestionarRoles: desactivar a quien
    // lo tiene dejaría al mayorista sin nadie que pueda administrar la
    // seguridad de su propia cuenta.
    if (usuario.rol_id?.protegido) {
      throw error('No se puede desactivar al Administrador del mayorista', 403);
    }

    if (!usuario.activo) {
      throw error('El usuario ya está desactivado', 400);
    }

    usuario.activo = false;
    await usuario.save();

    registrarAuditoria({
      req,
      accion: 'USUARIO_DESACTIVADO',
      entidad_afectada: 'Usuario',
      entidad_id: usuario._id,
      detalle: { email: usuario.email },
    });

    res.json({ success: true, message: 'Usuario desactivado' });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Reactivar un usuario interno previamente desactivado
 * @route   PATCH /api/v1/seguridad/usuarios/:id/reactivar
 * @access  Private/GestionarRoles
 */
exports.reactivarUsuario = async (req, res, next) => {
  try {
    await buscarUsuarioDelTenant(req.params.id, req.mayorista_id);
    const usuario = await Usuario.findById(req.params.id).select('+password_hash');

    if (usuario.activo) {
      throw error('El usuario ya está activo', 400);
    }
    // Sin password_hash nunca aceptó la invitación: no hay nada que
    // reactivar, hay que reinvitarlo en su lugar.
    if (!usuario.password_hash) {
      throw error('Este usuario todavía no aceptó su invitación', 400);
    }

    usuario.activo = true;
    await usuario.save();

    res.json({ success: true, message: 'Usuario reactivado' });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    El administrador fuerza el reseteo de la clave de un usuario:
 *          genera un link de un solo uso y se lo reenvía por email. No pasa
 *          por el código de verificación del autoservicio porque quien lo
 *          dispara ya está autenticado como administrador.
 * @route   PATCH /api/v1/seguridad/usuarios/:id/resetear-clave
 * @access  Private/GestionarRoles
 */
exports.resetearClave = async (req, res, next) => {
  try {
    const usuario = await buscarUsuarioDelTenant(req.params.id, req.mayorista_id);

    if (!usuario.activo) {
      throw error('El usuario debe estar activo para poder resetear su clave', 400);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    usuario.reset_token = resetToken;
    usuario.reset_token_expires = new Date(Date.now() + RESET_ADMIN_TTL_MS);
    // Invalida cualquier código de verificación del autoservicio que haya
    // quedado pendiente, para no dejar dos vías de reseteo abiertas a la vez.
    usuario.reset_code_hash = undefined;
    usuario.reset_code_expires = undefined;
    usuario.reset_code_attempts = 0;
    await usuario.save();

    try {
      await enviarResetClave(usuario.email, usuario.nombre, resetToken);
    } catch (mailError) {
      console.error('Error al enviar el email de reseteo de clave:', mailError.message);
    }

    res.json({
      success: true,
      message: 'Se le envió un email para que defina una nueva contraseña.',
    });
  } catch (err) {
    next(err);
  }
};
