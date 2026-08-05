const crypto = require('crypto');
const mongoose = require('mongoose');
const Usuario = require('../models/Usuario');
const Rol = require('../models/Rol');
const Permiso = require('../models/Permiso');
const { enviarInvitacion } = require('../utils/mailer');
const { registrarAuditoria } = require('../utils/auditService');
const { PERMISOS_NO_ASIGNABLES } = require('../utils/permisosCatalogo');

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

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

    registrarAuditoria({
      req,
      accion: 'ROL_CREADO',
      entidad_afectada: 'Rol',
      entidad_id: rol._id,
      detalle: { nombre: rol.nombre, permisos: permisos ?? [] },
    });

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

    const antes = {
      nombre: rol.nombre,
      permisos: rol.permisos.map(String),
    };

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

    // Editar el rol afecta a todos los usuarios que lo tengan: el rol es
    // atómico a nivel usuario y esta es la única vía para cambiar su alcance.
    const alcanzados = await Usuario.countDocuments({ rol_id: rol._id });

    registrarAuditoria({
      req,
      accion: 'ROL_ACTUALIZADO',
      entidad_afectada: 'Rol',
      entidad_id: rol._id,
      detalle: {
        antes,
        despues: { nombre: rol.nombre, permisos: permisos ?? antes.permisos },
        usuarios_alcanzados: alcanzados,
      },
    });

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

    registrarAuditoria({
      req,
      accion: 'ROL_ELIMINADO',
      entidad_afectada: 'Rol',
      entidad_id: rol._id,
      detalle: { nombre: rol.nombre },
    });

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
      .select('email nombre activo rol_id permisos_individuales created_at')
      .populate('rol_id', 'nombre protegido personalizado')
      .populate('permisos_individuales', 'codigo descripcion modulo')
      .sort({ created_at: 1 })
      .lean();

    res.json({ success: true, data: usuarios });
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

    if (rolAsignado) {
      registrarAuditoria({
        req,
        accion: 'ROL_ASIGNADO',
        entidad_afectada: 'Usuario',
        entidad_id: usuario._id,
        detalle: { rol: rolAsignado.nombre, rol_id: rolAsignado._id },
      });
    }

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

    const rolAnterior = usuario.rol_id;

    // rol_id: null quita el rol. Los permisos individuales no se tocan: son
    // independientes del rol.
    if (!rol_id) {
      usuario.rol_id = null;
      await usuario.save();

      registrarAuditoria({
        req,
        accion: 'ROL_DESASIGNADO',
        entidad_afectada: 'Usuario',
        entidad_id: usuario._id,
        detalle: { rol_anterior: rolAnterior },
      });

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

    registrarAuditoria({
      req,
      accion: 'ROL_ASIGNADO',
      entidad_afectada: 'Usuario',
      entidad_id: usuario._id,
      detalle: { rol: rol.nombre, rol_id: rol._id, rol_anterior: rolAnterior },
    });

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

    const antes = await Permiso.find({ _id: { $in: usuario.permisos_individuales } })
      .select('codigo')
      .lean();
    const codigosAntes = antes.map((p) => p.codigo);
    const codigosDespues = permisos ?? [];

    usuario.permisos_individuales = idsPermisos;
    await usuario.save();

    // Se auditan los deltas por separado, porque los permisos individuales
    // son independientes entre sí: agregar uno y quitar otro son dos hechos
    // distintos, no una edición en bloque.
    const agregados = codigosDespues.filter((c) => !codigosAntes.includes(c));
    const revocados = codigosAntes.filter((c) => !codigosDespues.includes(c));

    if (agregados.length > 0) {
      registrarAuditoria({
        req,
        accion: 'PERMISO_INDIVIDUAL_ASIGNADO',
        entidad_afectada: 'Usuario',
        entidad_id: usuario._id,
        detalle: { permisos: agregados },
      });
    }
    if (revocados.length > 0) {
      registrarAuditoria({
        req,
        accion: 'PERMISO_INDIVIDUAL_REVOCADO',
        entidad_afectada: 'Usuario',
        entidad_id: usuario._id,
        detalle: { permisos: revocados },
      });
    }

    res.json({ success: true, data: usuario });
  } catch (err) {
    next(err);
  }
};
