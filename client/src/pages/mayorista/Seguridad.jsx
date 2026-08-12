import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Users, ShieldCheck, Lock, Mail, RotateCcw, KeyRound } from 'lucide-react';
import { Table, TableRow, TableCell } from '../../components/ui/Table';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import { useToast } from '../../components/ui/Toast';
import seguridadService from '../../services/seguridadService';
import './seguridad.css';

/**
 * Notifica un error, salvo que sea un 401.
 *
 * Un 401 significa que la sesión se cerró o venció, y de eso ya se ocupa el
 * interceptor de api.js redirigiendo al login. Mostrar además un toast agrega
 * ruido justo en el momento en que el usuario está saliendo, sobre algo que
 * no puede accionar.
 */
const notificarError = (toast, err, fallback) => {
  if (err?.response?.status === 401) return;
  toast.error(err?.response?.data?.message || fallback);
};

/**
 * Agrupa el catálogo por módulo para que la composición del rol se lea por
 * área de negocio y no como una lista plana de casillas.
 */
const agruparPorModulo = (permisos) =>
  permisos.reduce((acc, permiso) => {
    (acc[permiso.modulo] ??= []).push(permiso);
    return acc;
  }, {});

/**
 * `activo:false` puede significar "invitación nunca aceptada" o "cuenta
 * desactivada": el backend ya las distingue en `estado`, acá solo se mapea a
 * cómo se muestran.
 */
const ESTADO_BADGE = {
  activo: { label: 'Activo', variant: 'success' },
  desactivado: { label: 'Desactivado', variant: 'error' },
  invitacion_pendiente: { label: 'Invitación pendiente', variant: 'warning' },
};

// ---------------------------------------------------------------------------
// Tab: Usuarios
// ---------------------------------------------------------------------------

const TabUsuarios = ({ roles, catalogo }) => {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [modalAlta, setModalAlta] = useState(false);
  const [formAlta, setFormAlta] = useState({ nombre: '', email: '', rol_id: '' });

  const [modalEditar, setModalEditar] = useState(null);
  const [formEditar, setFormEditar] = useState({ nombre: '', email: '' });

  // { tipo: 'desactivar' | 'resetear', usuario } — confirmación de las dos
  // acciones sensibles, en vez de window.confirm.
  const [confirmAccion, setConfirmAccion] = useState(null);

  const [usuarioPermisos, setUsuarioPermisos] = useState(null);
  const [seleccionPermisos, setSeleccionPermisos] = useState([]);

  const cargar = useCallback(async () => {
    try {
      setUsuarios(await seguridadService.getUsuarios());
    } catch (err) {
      notificarError(toast, err, 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const crearUsuario = async () => {
    if (!formAlta.nombre.trim() || !formAlta.email.trim()) {
      toast.warning('El nombre y el email son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      await seguridadService.createUsuario({
        nombre: formAlta.nombre.trim(),
        email: formAlta.email.trim(),
        rol_id: formAlta.rol_id || null,
      });
      toast.success('Usuario creado. Le llegó la invitación por email.');
      setModalAlta(false);
      setFormAlta({ nombre: '', email: '', rol_id: '' });
      cargar();
    } catch (err) {
      notificarError(toast, err, 'No se pudo crear el usuario');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarRol = async (usuario, rolId) => {
    try {
      await seguridadService.asignarRol(usuario._id, rolId || null);
      toast.success('Rol actualizado');
      cargar();
    } catch (err) {
      notificarError(toast, err, 'No se pudo cambiar el rol');
    }
  };

  const abrirEditar = (usuario) => {
    setFormEditar({ nombre: usuario.nombre || '', email: usuario.email });
    setModalEditar(usuario);
  };

  const guardarEdicion = async () => {
    if (!formEditar.nombre.trim() || !formEditar.email.trim()) {
      toast.warning('El nombre y el email son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      await seguridadService.updateUsuario(modalEditar._id, {
        nombre: formEditar.nombre.trim(),
        email: formEditar.email.trim(),
      });
      toast.success('Usuario actualizado');
      setModalEditar(null);
      cargar();
    } catch (err) {
      notificarError(toast, err, 'No se pudo actualizar el usuario');
    } finally {
      setGuardando(false);
    }
  };

  const reactivar = async (usuario) => {
    try {
      await seguridadService.reactivarUsuario(usuario._id);
      toast.success('Usuario reactivado');
      cargar();
    } catch (err) {
      notificarError(toast, err, 'No se pudo reactivar el usuario');
    }
  };

  const confirmarAccion = async () => {
    if (!confirmAccion) return;
    const { tipo, usuario } = confirmAccion;
    setGuardando(true);
    try {
      if (tipo === 'desactivar') {
        await seguridadService.desactivarUsuario(usuario._id);
        toast.success('Usuario desactivado');
        cargar();
      } else {
        await seguridadService.resetearClave(usuario._id);
        toast.success('Se le envió el email para resetear su contraseña');
      }
      setConfirmAccion(null);
    } catch (err) {
      notificarError(
        toast,
        err,
        tipo === 'desactivar' ? 'No se pudo desactivar el usuario' : 'No se pudo resetear la clave'
      );
    } finally {
      setGuardando(false);
    }
  };

  const abrirPermisos = (usuario) => {
    setUsuarioPermisos(usuario);
    setSeleccionPermisos((usuario.permisos_individuales ?? []).map(p => p.codigo));
  };

  const guardarPermisos = async () => {
    setGuardando(true);
    try {
      await seguridadService.asignarPermisos(usuarioPermisos._id, seleccionPermisos);
      toast.success('Permisos actualizados');
      setUsuarioPermisos(null);
      cargar();
    } catch (err) {
      notificarError(toast, err, 'No se pudieron actualizar los permisos');
    } finally {
      setGuardando(false);
    }
  };

  // Solo los roles asignables se ofrecen. El backend igual rechaza los
  // protegidos: esto es para no mostrar una opción que va a fallar.
  const opcionesRol = [
    { value: '', label: 'Sin rol asignado' },
    ...roles.filter(r => r.asignable).map(r => ({ value: r._id, label: r.nombre })),
  ];

  if (loading) return <Spinner center size="lg" />;

  return (
    <>
      <div className="seguridad-toolbar">
        <p className="seguridad-hint">
          Los usuarios que crees acá acceden al panel de tu empresa con el rol y los
          permisos que les asignes.
        </p>
        <Button onClick={() => setModalAlta(true)}>
          <Plus size={16} /> Nuevo usuario
        </Button>
      </div>

      {usuarios.length === 0 ? (
        <EmptyState
          icon={<Users size={48} className="empty-state-icon" />}
          title="Todavía no hay usuarios"
          description="Creá el primero para repartir responsabilidades dentro de tu empresa."
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <TableRow>
                <TableCell isHeader>Usuario</TableCell>
                <TableCell isHeader>Rol</TableCell>
                <TableCell isHeader>Permisos individuales</TableCell>
                <TableCell isHeader>Estado</TableCell>
                <TableCell isHeader>Acciones</TableCell>
              </TableRow>
            </thead>
            <tbody>
              {usuarios.map(usuario => {
                const esAdministrador = usuario.rol_id?.protegido;
                return (
                  <TableRow key={usuario._id}>
                    <TableCell>
                      <div className="seguridad-usuario">
                        <strong>{usuario.nombre || '—'}</strong>
                        <span>{usuario.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {esAdministrador ? (
                        // El rol Administrador no se puede cambiar desde acá:
                        // es protegido y solo lo asigna TourConnect al dar de
                        // alta el mayorista.
                        <Badge variant="warning">
                          <Lock size={12} /> {usuario.rol_id.nombre}
                        </Badge>
                      ) : (
                        <Select
                          options={opcionesRol}
                          value={usuario.rol_id?._id ?? ''}
                          onChange={e => cambiarRol(usuario, e.target.value)}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {usuario.permisos_individuales?.length
                        ? `${usuario.permisos_individuales.length} adicional(es)`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ESTADO_BADGE[usuario.estado]?.variant ?? 'warning'}>
                        {ESTADO_BADGE[usuario.estado]?.label ?? usuario.estado}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="seguridad-acciones">
                        <Button
                          variant="secondary"
                          size="sm"
                          title="Editar nombre y email"
                          onClick={() => abrirEditar(usuario)}
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={esAdministrador}
                          title={
                            esAdministrador
                              ? 'El Administrador ya tiene todos los permisos'
                              : 'Permisos individuales'
                          }
                          onClick={() => abrirPermisos(usuario)}
                        >
                          <ShieldCheck size={14} />
                        </Button>
                        {usuario.estado === 'activo' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            title="Resetear clave"
                            onClick={() => setConfirmAccion({ tipo: 'resetear', usuario })}
                          >
                            <KeyRound size={14} />
                          </Button>
                        )}
                        {usuario.estado === 'desactivado' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            title="Reactivar usuario"
                            onClick={() => reactivar(usuario)}
                          >
                            <RotateCcw size={14} />
                          </Button>
                        )}
                        {usuario.estado === 'activo' && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={esAdministrador}
                            title={
                              esAdministrador
                                ? 'El Administrador no se puede desactivar'
                                : 'Desactivar usuario'
                            }
                            onClick={() => setConfirmAccion({ tipo: 'desactivar', usuario })}
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      <Modal
        isOpen={modalAlta}
        onClose={() => setModalAlta(false)}
        title="Nuevo usuario"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalAlta(false)}>Cancelar</Button>
            <Button onClick={crearUsuario} isLoading={guardando}>Crear e invitar</Button>
          </>
        }
      >
        <Alert variant="info">
          <Mail size={14} /> Se le va a enviar una invitación por email para que
          defina su contraseña. La invitación vence en 48 horas.
        </Alert>
        <Input
          label="Nombre *"
          value={formAlta.nombre}
          onChange={e => setFormAlta({ ...formAlta, nombre: e.target.value })}
        />
        <Input
          label="Email *"
          type="email"
          value={formAlta.email}
          onChange={e => setFormAlta({ ...formAlta, email: e.target.value })}
        />
        <Select
          label="Rol"
          options={opcionesRol}
          value={formAlta.rol_id}
          onChange={e => setFormAlta({ ...formAlta, rol_id: e.target.value })}
        />
      </Modal>

      <Modal
        isOpen={Boolean(modalEditar)}
        onClose={() => setModalEditar(null)}
        title="Editar usuario"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalEditar(null)}>Cancelar</Button>
            <Button onClick={guardarEdicion} isLoading={guardando}>Guardar</Button>
          </>
        }
      >
        <Input
          label="Nombre *"
          value={formEditar.nombre}
          onChange={e => setFormEditar({ ...formEditar, nombre: e.target.value })}
        />
        <Input
          label="Email *"
          type="email"
          value={formEditar.email}
          onChange={e => setFormEditar({ ...formEditar, email: e.target.value })}
        />
      </Modal>

      <Modal
        isOpen={Boolean(confirmAccion)}
        onClose={() => setConfirmAccion(null)}
        title={confirmAccion?.tipo === 'desactivar' ? 'Desactivar usuario' : 'Resetear clave'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAccion(null)}>Cancelar</Button>
            <Button
              variant={confirmAccion?.tipo === 'desactivar' ? 'danger' : 'primary'}
              onClick={confirmarAccion}
              isLoading={guardando}
            >
              {confirmAccion?.tipo === 'desactivar' ? 'Desactivar' : 'Enviar link'}
            </Button>
          </>
        }
      >
        {confirmAccion?.tipo === 'desactivar' && (
          <Alert variant="warning">
            ¿Desactivar a <strong>{confirmAccion.usuario.nombre || confirmAccion.usuario.email}</strong>?
            No va a poder iniciar sesión hasta que lo reactives. Sus datos y su historial de
            auditoría se conservan.
          </Alert>
        )}
        {confirmAccion?.tipo === 'resetear' && (
          <Alert variant="info">
            <Mail size={14} /> Le vamos a enviar a <strong>{confirmAccion.usuario.email}</strong>{' '}
            un link para definir una nueva contraseña. Expira en 48 horas y nadie, ni vos, llega
            a ver la clave.
          </Alert>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(usuarioPermisos)}
        onClose={() => setUsuarioPermisos(null)}
        title={`Permisos individuales — ${usuarioPermisos?.nombre || ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUsuarioPermisos(null)}>Cancelar</Button>
            <Button onClick={guardarPermisos} isLoading={guardando}>Guardar</Button>
          </>
        }
      >
        <Alert variant="info">
          Estos permisos se <strong>suman</strong> a los del rol. Cada uno se
          agrega o se quita por separado, sin afectar a los demás ni al rol.
        </Alert>
        <SelectorPermisos
          catalogo={catalogo}
          seleccion={seleccionPermisos}
          onChange={setSeleccionPermisos}
        />
      </Modal>
    </>
  );
};

// ---------------------------------------------------------------------------
// Selector de permisos agrupado por módulo (compartido por roles y usuarios)
// ---------------------------------------------------------------------------

const SelectorPermisos = ({ catalogo, seleccion, onChange }) => {
  const grupos = agruparPorModulo(catalogo);

  const alternar = (codigo) => {
    onChange(
      seleccion.includes(codigo)
        ? seleccion.filter(c => c !== codigo)
        : [...seleccion, codigo]
    );
  };

  return (
    <div className="permisos-grid">
      {Object.entries(grupos).map(([modulo, permisos]) => (
        <fieldset key={modulo} className="permisos-modulo">
          <legend>{modulo}</legend>
          {permisos.map(permiso => (
            <label key={permiso.codigo} className="permiso-item">
              <input
                type="checkbox"
                checked={seleccion.includes(permiso.codigo)}
                onChange={() => alternar(permiso.codigo)}
              />
              <span>
                <strong>{permiso.codigo}</strong>
                <small>{permiso.descripcion}</small>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tab: Roles
// ---------------------------------------------------------------------------

const TabRoles = ({ roles, catalogo, onCambio }) => {
  const toast = useToast();
  const [guardando, setGuardando] = useState(false);
  const [modal, setModal] = useState(null); // { rol } — rol null = alta
  const [form, setForm] = useState({ nombre: '', permisos: [] });
  const [rolAEliminar, setRolAEliminar] = useState(null);

  const abrirAlta = () => {
    setForm({ nombre: '', permisos: [] });
    setModal({ rol: null });
  };

  const abrirEdicion = (rol) => {
    setForm({ nombre: rol.nombre, permisos: (rol.permisos ?? []).map(p => p.codigo) });
    setModal({ rol });
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      toast.warning('El nombre del rol es obligatorio');
      return;
    }
    setGuardando(true);
    try {
      if (modal.rol) {
        await seguridadService.updateRol(modal.rol._id, {
          nombre: form.nombre.trim(),
          permisos: form.permisos,
        });
        toast.success('Rol actualizado. El cambio afecta a todos sus usuarios.');
      } else {
        await seguridadService.createRol({
          nombre: form.nombre.trim(),
          permisos: form.permisos,
        });
        toast.success('Rol creado');
      }
      setModal(null);
      onCambio();
    } catch (err) {
      notificarError(toast, err, 'No se pudo guardar el rol');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = async () => {
    if (!rolAEliminar) return;
    setGuardando(true);
    try {
      await seguridadService.deleteRol(rolAEliminar._id);
      toast.success('Rol eliminado');
      setRolAEliminar(null);
      onCambio();
    } catch (err) {
      notificarError(toast, err, 'No se pudo eliminar el rol');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="seguridad-toolbar">
        <p className="seguridad-hint">
          Un rol agrupa permisos y se asigna entero. Para cambiar lo que puede
          hacer alguien, editá su rol o creá uno más angosto.
        </p>
        <Button onClick={abrirAlta}>
          <Plus size={16} /> Nuevo rol
        </Button>
      </div>

      <Card>
        <Table>
          <thead>
            <TableRow>
              <TableCell isHeader>Rol</TableCell>
              <TableCell isHeader>Tipo</TableCell>
              <TableCell isHeader>Permisos</TableCell>
              <TableCell isHeader>Acciones</TableCell>
            </TableRow>
          </thead>
          <tbody>
            {roles.map(rol => (
              <TableRow key={rol._id}>
                <TableCell><strong>{rol.nombre}</strong></TableCell>
                <TableCell>
                  {rol.protegido ? (
                    <Badge variant="warning"><Lock size={12} /> Del sistema</Badge>
                  ) : (
                    <Badge variant="info">Personalizado</Badge>
                  )}
                </TableCell>
                <TableCell>{rol.permisos?.length ?? 0}</TableCell>
                <TableCell>
                  {rol.protegido ? (
                    <span className="seguridad-hint">No editable</span>
                  ) : (
                    <div className="seguridad-acciones">
                      <Button variant="secondary" size="sm" onClick={() => abrirEdicion(rol)}>
                        <Pencil size={14} />
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => setRolAEliminar(rol)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>

      <Modal
        isOpen={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.rol ? `Editar rol — ${modal.rol.nombre}` : 'Nuevo rol'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
            <Button onClick={guardar} isLoading={guardando}>Guardar</Button>
          </>
        }
      >
        {modal?.rol && (
          <Alert variant="warning">
            Editar este rol cambia los permisos de <strong>todos</strong> los
            usuarios que lo tengan.
          </Alert>
        )}
        <Input
          label="Nombre del rol *"
          placeholder="Finanzas, Operaciones, RRHH…"
          value={form.nombre}
          onChange={e => setForm({ ...form, nombre: e.target.value })}
        />
        <SelectorPermisos
          catalogo={catalogo}
          seleccion={form.permisos}
          onChange={permisos => setForm({ ...form, permisos })}
        />
      </Modal>

      <Modal
        isOpen={Boolean(rolAEliminar)}
        onClose={() => setRolAEliminar(null)}
        title="Eliminar rol"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRolAEliminar(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmarEliminar} isLoading={guardando}>
              Eliminar
            </Button>
          </>
        }
      >
        {rolAEliminar && (
          <Alert variant="warning">
            ¿Eliminar el rol <strong>{rolAEliminar.nombre}</strong>? Esta acción no se puede
            deshacer. Si hay usuarios con este rol asignado, no se va a poder eliminar hasta que
            les asignes otro.
          </Alert>
        )}
      </Modal>
    </>
  );
};

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

// Llegar acá exige GestionarRoles, que no es delegable: quien ve esta pantalla
// es siempre el Administrador del mayorista y tiene acceso a las dos pestañas.
// La ruta y el backend lo verifican por separado; no hace falta volver a
// chequearlo por pestaña.
export const MayoristaSeguridad = () => {
  const toast = useToast();

  const [tab, setTab] = useState('usuarios');
  const [roles, setRoles] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const [rolesData, catalogoData] = await Promise.all([
        seguridadService.getRoles(),
        seguridadService.getPermisos(),
      ]);
      setRoles(rolesData);
      setCatalogo(catalogoData);
    } catch (err) {
      notificarError(toast, err, 'No se pudo cargar la configuración de seguridad');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  if (loading) return <Spinner center size="lg" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Seguridad</h1>
      </div>

      <div className="seguridad-tabs">
        <button
          type="button"
          className={`seguridad-tab ${tab === 'usuarios' ? 'active' : ''}`}
          onClick={() => setTab('usuarios')}
        >
          <Users size={16} /> Usuarios
        </button>
        <button
          type="button"
          className={`seguridad-tab ${tab === 'roles' ? 'active' : ''}`}
          onClick={() => setTab('roles')}
        >
          <ShieldCheck size={16} /> Roles
        </button>
      </div>

      {tab === 'usuarios' && <TabUsuarios roles={roles} catalogo={catalogo} />}
      {tab === 'roles' && (
        <TabRoles roles={roles} catalogo={catalogo} onCambio={cargar} />
      )}
    </div>
  );
};
