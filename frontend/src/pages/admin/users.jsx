import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Plus, Edit3, Trash2, UserCheck, UserX, Eye, EyeOff } from 'lucide-react';
import { usersAPI } from '../../utils/api';
import { RoleBadge, Modal, ConfirmModal, EmptyState, PageLoader } from '../../components/shared';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function UsersPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showPass, setShowPass] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.list().then(r => r.data),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const openCreate = () => { reset({}); setEditing(null); setShowCreate(true); };
  const openEdit = (u) => {
    reset({ full_name: u.full_name, role: u.role, phone: u.phone, specialty: u.specialty, company: u.company });
    setEditing(u);
    setShowCreate(true);
  };

  const onSubmit = async (data) => {
    try {
      if (editing) {
        await usersAPI.update(editing.id, data);
        toast.success('Usuario actualizado.');
      } else {
        await usersAPI.create(data);
        toast.success('Usuario creado. Comunique las credenciales de forma segura.');
      }
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al guardar usuario.');
    }
  };

  const handleDelete = async () => {
    await usersAPI.delete(deleteTarget.id);
    toast.success('Usuario desactivado.');
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-surface-900">Usuarios</h1>
          <p className="text-sm text-surface-400 mt-0.5">
            Solo el administrador puede crear y gestionar usuarios.
            El registro público está deshabilitado.
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={14} /> Nuevo usuario
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Especialidad</th>
              <th>Empresa</th>
              <th>Teléfono</th>
              <th>Último acceso</th>
              <th>Estado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-brand-600">
                        {u.full_name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-surface-800">{u.full_name}</p>
                      <p className="text-xs text-surface-400">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td><RoleBadge role={u.role} /></td>
                <td><span className="text-xs text-surface-600">{u.specialty || '—'}</span></td>
                <td><span className="text-xs text-surface-600">{u.company || '—'}</span></td>
                <td><span className="text-xs text-surface-600">{u.phone || '—'}</span></td>
                <td>
                  <span className="text-xs text-surface-500">
                    {u.last_login_at
                      ? format(new Date(u.last_login_at), "d MMM yyyy", { locale: es })
                      : 'Nunca'
                    }
                  </span>
                </td>
                <td>
                  {u.is_active
                    ? <span className="badge badge-approved"><UserCheck size={10} /> Activo</span>
                    : <span className="badge badge-rejected"><UserX size={10} /> Inactivo</span>
                  }
                </td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    <button className="btn-ghost p-1.5" onClick={() => openEdit(u)}>
                      <Edit3 size={13} />
                    </button>
                    <button
                      className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(u)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <EmptyState title="Sin usuarios" description="Crea el primer usuario del sistema." />
        )}
      </div>

      {/* Create/Edit modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)}
        title={editing ? `Editar usuario: ${editing.full_name}` : 'Nuevo usuario'} size="sm">
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div>
            <label className="label">Nombre completo <span className="text-red-500">*</span></label>
            <input type="text" className="input"
              placeholder="Juan Pérez López"
              {...register('full_name', { required: true })} />
          </div>
          {!editing && (
            <>
              <div>
                <label className="label">Correo electrónico <span className="text-red-500">*</span></label>
                <input type="email" className="input"
                  placeholder="juan@empresa.com"
                  {...register('email', { required: true })} />
              </div>
              <div>
                <label className="label">Contraseña temporal <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} className="input pr-10"
                    placeholder="Mínimo 8 caracteres, 1 mayúscula, 1 número"
                    {...register('password', {
                      required: !editing,
                      minLength: { value: 8, message: 'Mínimo 8 caracteres.' },
                      pattern: {
                        value: /^(?=.*[A-Z])(?=.*[0-9])/,
                        message: 'Debe incluir una mayúscula y un número.'
                      }
                    })} />
                  <button type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                    onClick={() => setShowPass(!showPass)}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
                )}
              </div>
            </>
          )}
          <div>
            <label className="label">Rol <span className="text-red-500">*</span></label>
            <select className="select" {...register('role', { required: true })}>
              <option value="specialist">Especialista</option>
              <option value="bim_manager">BIM Manager</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Especialidad</label>
              <input type="text" className="input" placeholder="Ej: Arquitectura, MEP..."
                {...register('specialty')} />
            </div>
            <div>
              <label className="label">Empresa</label>
              <input type="text" className="input" placeholder="Ej: Consorcio SDD"
                {...register('company')} />
            </div>
          </div>
          <div>
            <label className="label">Teléfono / WhatsApp</label>
            <input type="text" className="input" placeholder="+51 999 000 000"
              {...register('phone')} />
          </div>
          <div className="flex gap-3 justify-end pt-2 border-t border-surface-100">
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary">
              {editing ? 'Actualizar' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        title={`¿Desactivar a "${deleteTarget?.full_name}"?`}
        message="El usuario no podrá acceder al sistema. Sus datos históricos se conservan."
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        danger
      />
    </div>
  );
}
