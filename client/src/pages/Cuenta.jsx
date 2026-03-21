import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../lib/api.js';

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

export default function Cuenta() {
  const { user } = useAuth();
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNuevo, setPasswordNuevo] = useState('');
  const [passwordConfirmacion, setPasswordConfirmacion] = useState('');
  const [saving, setSaving] = useState(false);

  const permisos = useMemo(() => user?.permissions || [], [user]);

  const guardarPassword = async (e) => {
    e.preventDefault();
    if (!passwordActual || !passwordNuevo) {
      toast.error('Completa la contrasena actual y la nueva');
      return;
    }
    if (passwordNuevo.length < 6) {
      toast.error('La nueva contrasena debe tener al menos 6 caracteres');
      return;
    }
    if (passwordNuevo !== passwordConfirmacion) {
      toast.error('La confirmacion no coincide');
      return;
    }

    setSaving(true);
    try {
      await api.put('/auth/password', {
        password_actual: passwordActual,
        password_nuevo: passwordNuevo,
      });
      setPasswordActual('');
      setPasswordNuevo('');
      setPasswordConfirmacion('');
      toast.success('Contrasena actualizada');
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar la contrasena');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi cuenta</h1>
        <p className="text-sm text-gray-500">Datos de acceso, rol y permisos del usuario actual.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card title="Perfil actual" subtitle="Informacion basica del usuario autenticado">
          <div className="flex items-center gap-4 rounded-3xl bg-gray-50 p-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
              <UserRound size={24} />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{user?.nombre || 'Usuario'}</p>
              <p className="text-sm text-gray-500">{user?.email || 'Sin email'}</p>
              <p className="mt-1 inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                {user?.rol || 'sin rol'}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <ShieldCheck size={16} />
              Permisos del rol
            </div>
            <div className="flex flex-wrap gap-2">
              {permisos.length > 0 ? permisos.map((permiso) => (
                <span key={permiso} className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
                  {permiso}
                </span>
              )) : (
                <span className="text-sm text-gray-400">No hay permisos cargados.</span>
              )}
            </div>
          </div>
        </Card>

        <Card title="Seguridad" subtitle="Cambia la contrasena de este usuario">
          <form className="space-y-4" onSubmit={guardarPassword}>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Contrasena actual</label>
              <input
                type="password"
                value={passwordActual}
                onChange={(e) => setPasswordActual(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Nueva contrasena</label>
              <input
                type="password"
                value={passwordNuevo}
                onChange={(e) => setPasswordNuevo(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Confirmar nueva contrasena</label>
              <input
                type="password"
                value={passwordConfirmacion}
                onChange={(e) => setPasswordConfirmacion(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
            >
              <KeyRound size={15} />
              {saving ? 'Guardando...' : 'Actualizar contrasena'}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
