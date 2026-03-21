import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  AlertTriangle,
  BadgeDollarSign,
  CalendarClock,
  ClipboardList,
  Lock,
  RefreshCw,
  Shield,
  WalletCards,
} from 'lucide-react';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

function StatCard({ icon: Icon, label, value, helper, tone = 'orange' }) {
  const tones = {
    orange: 'bg-orange-100 text-orange-700',
    blue: 'bg-sky-100 text-sky-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    slate: 'bg-slate-100 text-slate-700',
    rose: 'bg-rose-100 text-rose-700',
  };

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
          {helper ? <p className="mt-1 text-sm text-gray-500">{helper}</p> : null}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone] || tones.orange}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function Caja() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState({ monto_inicial: '', notas: '' });
  const [closing, setClosing] = useState({ monto_final_declarado: '', notas: '' });
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const response = await api.get('/caja/estado');
      setData(response);
    } catch {
      toast.error('No se pudo cargar la caja');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const resumen = data?.resumen;
  const diferencia = useMemo(() => {
    if (!data?.activa) return 0;
    const esperado = Number(data.activa.monto_inicial || 0) + Number(resumen?.efectivo || 0);
    return Number(closing.monto_final_declarado || 0) - esperado;
  }, [closing.monto_final_declarado, data?.activa, resumen]);

  const abrirCaja = async () => {
    setSaving(true);
    try {
      await api.post('/caja/apertura', {
        monto_inicial: Number(opening.monto_inicial || 0),
        notas: opening.notas || '',
      });
      toast.success('Caja abierta');
      setOpening({ monto_inicial: '', notas: '' });
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo abrir la caja');
    } finally {
      setSaving(false);
    }
  };

  const cerrarCaja = async () => {
    setSaving(true);
    try {
      await api.post('/caja/cierre', {
        monto_final_declarado: Number(closing.monto_final_declarado || 0),
        notas: closing.notas || '',
      });
      toast.success('Caja cerrada');
      setClosing({ monto_final_declarado: '', notas: '' });
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo cerrar la caja');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Caja y auditoria</h1>
          <p className="text-sm text-gray-500">Apertura, cierre, diferencias y trazabilidad de acciones sensibles.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">
            Usuario: {user?.nombre || 'Admin'}
          </div>
          <button
            onClick={cargar}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw size={15} />
            Recargar
          </button>
        </div>
      </div>

      {data?.activa ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={WalletCards} label="Caja abierta" value={fmt(data.activa.monto_inicial)} helper={`Abierta por ${data.activa.abierta_por_nombre}`} />
            <StatCard icon={BadgeDollarSign} label="Ventas" value={fmt(resumen?.totalVentas || 0)} helper={`${resumen?.pedidos || 0} pedidos`} tone="blue" />
            <StatCard icon={ClipboardList} label="Efectivo esperado" value={fmt((Number(data.activa.monto_inicial || 0) + Number(resumen?.efectivo || 0)) || 0)} helper={`${fmt(resumen?.efectivo || 0)} vendidos en efectivo`} tone="emerald" />
            <StatCard icon={CalendarClock} label="Digitales" value={fmt(resumen?.digitales || 0)} helper={resumen?.turnoActual ? `Turno actual: ${resumen.turnoActual}` : 'MercadoPago, transferencia y otros'} tone="slate" />
            <StatCard icon={AlertTriangle} label="Activos" value={resumen?.activos || 0} helper={`${resumen?.cancelados || 0} cancelados`} tone="rose" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">Resumen de caja abierta</h2>
              <p className="mt-1 text-sm text-gray-500">Todo lo vendido desde la apertura actual.</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Por metodo de pago</p>
                  <div className="mt-3 space-y-3">
                    {(resumen?.porMetodo || []).map((item) => (
                      <div key={item.metodo_pago} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold capitalize text-gray-900">{item.metodo_pago}</p>
                          <p className="text-xs text-gray-500">{item.cantidad} pedidos</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{fmt(item.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Por tipo de venta</p>
                  <div className="mt-3 space-y-3">
                    {(resumen?.porTipo || []).map((item) => (
                      <div key={item.tipo_entrega} className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold capitalize text-gray-900">{item.tipo_entrega}</p>
                          <p className="text-xs text-gray-500">{item.cantidad} pedidos</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{fmt(item.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Por turno</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {(resumen?.porTurno || []).map((item) => (
                    <div key={item.turno} className="rounded-2xl border border-white bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.turno}</p>
                          <p className="text-xs text-gray-500">{item.pedidos} pedidos · ticket {fmt(item.ticketPromedio)}</p>
                        </div>
                        <p className="text-sm font-bold text-orange-600">{fmt(item.total)}</p>
                      </div>
                      <p className="mt-2 text-[11px] text-gray-500">Efectivo {fmt(item.efectivo)} · Digital {fmt(item.digitales)}</p>
                    </div>
                  ))}
                  {!(resumen?.porTurno || []).length ? (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-400">
                      Sin ventas por turno todavia.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-orange-200 bg-orange-50/60 p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-orange-700" />
                <h2 className="text-lg font-bold text-gray-900">Cerrar caja</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600">Declará el efectivo final contado para calcular la diferencia.</p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Efectivo final contado</label>
                  <input
                    type="number"
                    value={closing.monto_final_declarado}
                    onChange={(e) => setClosing((prev) => ({ ...prev, monto_final_declarado: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notas de cierre</label>
                  <textarea
                    rows={4}
                    value={closing.notas}
                    onChange={(e) => setClosing((prev) => ({ ...prev, notas: e.target.value }))}
                    className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    placeholder="Observaciones, pagos sueltos, diferencias, gastos de caja..."
                  />
                </div>
              </div>

              <div className="mt-5 space-y-3 rounded-2xl bg-white p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-500">Fondo inicial</span>
                  <strong className="text-gray-900">{fmt(data.activa.monto_inicial)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-500">Efectivo vendido</span>
                  <strong className="text-gray-900">{fmt(resumen?.efectivo || 0)}</strong>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 text-sm">
                  <span className="text-gray-500">Esperado en caja</span>
                  <strong className="text-orange-600">{fmt((Number(data.activa.monto_inicial || 0) + Number(resumen?.efectivo || 0)) || 0)}</strong>
                </div>
                <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold ${diferencia === 0 ? 'bg-emerald-100 text-emerald-700' : diferencia > 0 ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'}`}>
                  <span>Diferencia proyectada</span>
                  <span>{fmt(diferencia)}</span>
                </div>
              </div>

              <button
                onClick={cerrarCaja}
                disabled={saving}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:opacity-50"
              >
                <Lock size={15} />
                {saving ? 'Cerrando...' : 'Cerrar caja'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <WalletCards size={18} className="text-orange-600" />
              <h2 className="text-lg font-bold text-gray-900">Abrir caja</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">Empezá el turno con un fondo inicial para controlar el cierre real.</p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Monto inicial</label>
                <input
                  type="number"
                  value={opening.monto_inicial}
                  onChange={(e) => setOpening((prev) => ({ ...prev, monto_inicial: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notas de apertura</label>
                <textarea
                  rows={4}
                  value={opening.notas}
                  onChange={(e) => setOpening((prev) => ({ ...prev, notas: e.target.value }))}
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Cambio inicial, turno, responsable, observaciones..."
                />
              </div>
            </div>

            <button
              onClick={abrirCaja}
              disabled={saving}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              <WalletCards size={15} />
              {saving ? 'Abriendo...' : 'Abrir caja'}
            </button>
          </div>

          <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-slate-700" />
              <h2 className="text-lg font-bold text-gray-900">Caja cerrada</h2>
            </div>
            <p className="mt-2 text-sm text-gray-500">No hay un turno abierto. Cuando abras caja, vas a ver el resumen operativo, esperado en efectivo y la bitácora del día.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Historial de cierres</h2>
          <p className="mt-1 text-sm text-gray-500">Ultimos turnos registrados en caja.</p>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-3 pr-4 font-semibold">Fecha</th>
                  <th className="pb-3 pr-4 font-semibold">Estado</th>
                  <th className="pb-3 pr-4 font-semibold">Apertura</th>
                  <th className="pb-3 pr-4 font-semibold">Declarado</th>
                  <th className="pb-3 pr-4 font-semibold">Esperado</th>
                  <th className="pb-3 font-semibold text-right">Dif.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data?.historial || []).map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4 text-gray-700">{String(item.abierta_en || '').slice(0, 16).replace('T', ' ')}</td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.estado === 'abierta' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {item.estado}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-semibold text-gray-900">{fmt(item.monto_inicial)}</td>
                    <td className="py-3 pr-4 text-gray-700">{fmt(item.monto_final_declarado)}</td>
                    <td className="py-3 pr-4 text-gray-700">{fmt(item.efectivo_esperado)}</td>
                    <td className={`py-3 text-right font-bold ${Number(item.diferencia || 0) === 0 ? 'text-emerald-700' : Number(item.diferencia || 0) > 0 ? 'text-sky-700' : 'text-rose-700'}`}>
                      {fmt(item.diferencia)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Auditoria reciente</h2>
          <p className="mt-1 text-sm text-gray-500">Acciones sensibles registradas para control interno.</p>
          <div className="mt-5 space-y-3">
            {(data?.auditoria || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-400">
                Todavia no hay eventos de auditoria.
              </div>
            ) : (
              data.auditoria.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.modulo} / {item.accion}</p>
                      <p className="text-xs text-gray-500">{item.actor_nombre} - {String(item.creado_en || '').slice(0, 16).replace('T', ' ')}</p>
                    </div>
                    {item.entidad_id ? <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600">#{item.entidad_id}</span> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
