const express = require('express');
const router = express.Router();

const {
  getPermisos,
  getRoles,
  createRol,
  updateRol,
  deleteRol,
  getUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  reactivarUsuario,
  resetearClave,
  asignarRol,
  asignarPermisos,
} = require('../controllers/seguridadController');

const auth = require('../middlewares/authMiddleware');
const role = require('../middlewares/roleMiddleware');
const { tenant } = require('../middlewares/tenantMiddleware');
const { checkPermiso } = require('../middlewares/permisoMiddleware');

// El módulo de seguridad es exclusivo del ámbito mayorista: la agencia
// mantiene la relación 1 usuario ↔ 1 agencia y no participa del modelo de
// roles y permisos.
router.use(auth, role('mayorista'), tenant);


// Todo el módulo exige GestionarRoles, que no es delegable: solo lo tiene el
// rol Administrador. Administrar usuarios, roles y permisos es potestad
// exclusiva del administrador del mayorista.
router.use(checkPermiso('GestionarRoles'));

// Catálogo
router.get('/permisos', getPermisos);

// Roles
router.get('/roles', getRoles);
router.post('/roles', createRol);
router.put('/roles/:id', updateRol);
router.delete('/roles/:id', deleteRol);

// Usuarios
router.get('/usuarios', getUsuarios);
router.post('/usuarios', createUsuario);
router.put('/usuarios/:id', updateUsuario);
router.delete('/usuarios/:id', deleteUsuario);
router.patch('/usuarios/:id/reactivar', reactivarUsuario);
router.patch('/usuarios/:id/resetear-clave', resetearClave);
router.patch('/usuarios/:id/rol', asignarRol);
router.patch('/usuarios/:id/permisos', asignarPermisos);

module.exports = router;
