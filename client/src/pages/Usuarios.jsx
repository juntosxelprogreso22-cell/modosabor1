import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { ShieldCheck, Plus, Pencil, Save, UserCog, X } from 'lucide-react';

const EMPTY_FORM = {
  nombre: '',
  email: '',
  password: '',
  rol: 'caja',
  activo: true,
};

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'caja', label: 'Caja' },
  { value: 'cocina', label: 'Cocina' },
  { value: 'delivery', label: 'Delivery' },
];

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const cargar = async () => {
    setLoading(true);
    try {
      const rows = await api.get('/auth/usuarios');
      setUsuarios(rows);
    } catch {
      toast.error('No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const abrirNuevo = () => {
    setForm(EMPTY_FORM);
    setModal('nuevo');
  };

  const abrirEditar = (usuario) => {
    setForm({
      nombre: usuario.nombre || '',
      email: usuario.email || '',
      password: '',
      rol: usuario.rol || 'caja',
      activo: Boolean(usuario.activo),
    });
    setModal(usuario);
  };

  const guardar = async () => {
    if (!form.nombre.trim() || !form.email.trim()) {
      toast.error('Nombre y email son obligatorios');
      return;
    }
    if (modal === 'nuevo' && !form.password.trim()) {
      toast.error('La contraseña inicial es obligatoria');
      return;
    }

    setSaving(true);
    try {
      if (modal === 'nuevo') {
        await api.post('/auth/usuarios', {
          nombre: form.nombre,
          email: form.email,
          password: form.password,
          rol: form.rol,
        });
        toast.success('Usuario creado');
      } else {
        await api.put(`/auth/usuarios/${modal.id}`, {
          nombre: form.nombre,
          email: form.email,
          password: form.password || undefined,
          rol: form.rol,
          activo: form.activo,
        });
        toast.success('Usuario actualizado');
      }
      setModal(null);
      setForm(EMPTY_FORM);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar el usuario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios y roles</h1>
          <p className="text-sm text-gray-500">Controla accesos por perfil para caja, cocina, delivery y administracion.</p>
        </div>
        <button
          onClick={abrirNuevo}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
        >
          <Plus size={15} />
          Nuevo usuario
        </button>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {usuarios.map((usuario) => (
              <div key={usuario.id} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                    <UserCog size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{usuario.nombre}</p>
                    <p className="text-xs text-gray-500">{usuario.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-gray-700">{usuario.rol}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${usuario.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {usuario.activo ? 'Activo' : 'Inactivo'}
                  </span>
                  <button
                    onClick={() => abrirEditar(usuario)}
                    className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <Pencil size={13} />
                    Editar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="w-full max-w-2xl rounded-3xl border border-white/70 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-orange-600" />
                <h2 className="text-lg font-bold text-gray-900">{modal === 'nuevo' ? 'Nuevo usuario' : 'Editar usuario'}</h2>
              </div>
              <button onClick={() => setModal(null)} className="rounded-xl border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50">
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Nombre</label>
                <input value={form.nombre} onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">{modal === 'nuevo' ? 'Contrasena inicial' : 'Nueva contrasena (opcional)'}</label>
                <input type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Rol</label>
                <select value={form.rol} onChange={(e) => setForm((prev) => ({ ...prev, rol: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
              {modal !== 'nuevo' ? (
                <label className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 md:col-span-2">
                  <input type="checkbox" checked={form.activo} onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))} className="h-4 w-4 accent-orange-500" />
                  Usuario activo
                </label>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button onClick={() => setModal(null)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50">
                <Save size={15} />
                {saving ? 'Guardando...' : modal === 'nuevo' ? 'Crear usuario' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
