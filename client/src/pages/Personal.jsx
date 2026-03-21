import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, UserCog, X } from 'lucide-react';
import api from '../lib/api.js';

const ROLES = [
  { value: 'cocina', label: 'Cocina' },
  { value: 'cajero', label: 'Cajero' },
  { value: 'mozo', label: 'Mozo' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'ayudante', label: 'Ayudante' },
  { value: 'encargado', label: 'Encargado' },
];

const TURNOS = [
  { value: 'manana', label: 'Manana' },
  { value: 'noche', label: 'Noche' },
  { value: 'doble', label: 'Doble turno' },
];

const EMPTY_FORM = {
  nombre: '',
  rol_operativo: 'cocina',
  telefono: '',
  turno_preferido: 'manana',
  activo: 1,
  notas: '',
};

export default function Personal() {
  const [personal, setPersonal] = useState([]);
  const [turnoActual, setTurnoActual] = useState('');
  const [equipoTurnoActual, setEquipoTurnoActual] = useState([]);
  const [resumenTurnos, setResumenTurnos] = useState([]);
  const [porRol, setPorRol] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    try {
      const data = await api.get('/personal');
      setPersonal(data.items || []);
      setTurnoActual(data.turno_actual || '');
      setEquipoTurnoActual(data.equipo_turno_actual || []);
      setResumenTurnos(data.resumen_turnos || []);
      setPorRol(data.por_rol || []);
    } catch {
      toast.error('No se pudo cargar el personal');
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const stats = useMemo(() => ({
    total: personal.length,
    activos: personal.filter((item) => item.activo).length,
    manana: personal.filter((item) => item.activo && item.turno_preferido === 'manana').length,
    noche: personal.filter((item) => item.activo && item.turno_preferido === 'noche').length,
  }), [personal]);

  const abrirNuevo = () => {
    setForm(EMPTY_FORM);
    setModal('nuevo');
  };

  const abrirEditar = (item) => {
    setForm({
      nombre: item.nombre || '',
      rol_operativo: item.rol_operativo || 'cocina',
      telefono: item.telefono || '',
      turno_preferido: item.turno_preferido || 'manana',
      activo: item.activo ? 1 : 0,
      notas: item.notas || '',
    });
    setModal(item);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    setSaving(true);
    try {
      if (modal === 'nuevo') {
        await api.post('/personal', form);
        toast.success('Personal agregado');
      } else {
        await api.put(`/personal/${modal.id}`, form);
        toast.success('Personal actualizado');
      }
      setModal(null);
      setForm(EMPTY_FORM);
      cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (item) => {
    if (!window.confirm(`Eliminar a ${item.nombre}?`)) return;
    try {
      await api.delete(`/personal/${item.id}`);
      toast.success('Personal eliminado');
      cargar();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personal</h1>
          <p className="text-sm text-gray-500">Equipo operativo por rol y turno.</p>
        </div>
        <button onClick={abrirNuevo} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600">
          <Plus size={15} />
          Agregar personal
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Total', stats.total],
          ['Activos', stats.activos],
          ['Turno manana', stats.manana],
          ['Turno noche', stats.noche],
        ].map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Equipo del turno actual</h2>
              <p className="mt-1 text-sm text-gray-500">{turnoActual || 'Sin turno activo ahora'}</p>
            </div>
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">{equipoTurnoActual.length} en turno</span>
          </div>
          <div className="mt-4 space-y-3">
            {equipoTurnoActual.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                No hay personal activo vinculado a este turno.
              </div>
            ) : (
              equipoTurnoActual.map((item) => (
                <div key={`shift-${item.id}`} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.nombre}</p>
                      <p className="text-xs capitalize text-gray-500">{item.rol_operativo} · {item.turno_preferido || 'sin turno'}</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Activo</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Cobertura por rol y turno</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Por turno</p>
              <div className="mt-3 space-y-3">
                {resumenTurnos.map((item) => (
                  <div key={item.turno} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold capitalize text-gray-900">{item.turno.replace('_', ' ')}</p>
                      <p className="text-xs text-gray-500">{item.total} cargados</p>
                    </div>
                    <p className="text-sm font-bold text-orange-600">{item.activos} activos</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Por rol</p>
              <div className="mt-3 space-y-3">
                {porRol.map((item) => (
                  <div key={item.rol} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold capitalize text-gray-900">{item.rol}</p>
                      <p className="text-xs text-gray-500">{item.total} personas</p>
                    </div>
                    <p className="text-sm font-bold text-slate-900">{item.activos} activos</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        {personal.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-400">
            Todavia no cargaste personal.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {personal.map((item) => (
              <div key={item.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                      <UserCog size={18} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{item.nombre}</p>
                      <p className="text-xs text-gray-500 capitalize">{item.rol_operativo}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => abrirEditar(item)} className="rounded-xl p-2 text-gray-500 hover:bg-white hover:text-blue-700">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => eliminar(item)} className="rounded-xl p-2 text-gray-500 hover:bg-white hover:text-rose-700">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-1 text-sm text-gray-600">
                  <p><strong>Turno:</strong> {item.turno_preferido || '-'}</p>
                  <p><strong>Telefono:</strong> {item.telefono || '-'}</p>
                  <p><strong>Estado:</strong> {item.activo ? 'Activo' : 'Inactivo'}</p>
                  {item.notas ? <p><strong>Notas:</strong> {item.notas}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{modal === 'nuevo' ? 'Nuevo personal' : 'Editar personal'}</h2>
              <button onClick={() => setModal(null)} className="rounded-xl p-2 text-gray-500 hover:bg-gray-50">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Nombre</label>
                <input value={form.nombre} onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))} className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Rol operativo</label>
                <select value={form.rol_operativo} onChange={(e) => setForm((prev) => ({ ...prev, rol_operativo: e.target.value }))} className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Turno</label>
                <select value={form.turno_preferido} onChange={(e) => setForm((prev) => ({ ...prev, turno_preferido: e.target.value }))} className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                  {TURNOS.map((turno) => <option key={turno.value} value={turno.value}>{turno.label}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Telefono</label>
                <input value={form.telefono} onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))} className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-gray-600">Notas</label>
                <textarea value={form.notas} onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))} rows={3} className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-gray-200 p-4 text-sm text-gray-700">
                <input type="checkbox" checked={Boolean(form.activo)} onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked ? 1 : 0 }))} className="h-4 w-4 accent-orange-500" />
                Personal activo
              </label>
            </div>

            <div className="mt-5 flex gap-3">
              <button onClick={() => setModal(null)} className="flex-1 rounded-xl border py-2.5 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardar} disabled={saving} className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
