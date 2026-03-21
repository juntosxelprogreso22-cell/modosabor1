import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api.js';
import {
  format,
  subDays,
  startOfMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Armchair,
  Bike,
  Cake,
  CalendarRange,
  Clock3,
  Download,
  MapPin,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const today = new Date();
const COLORS = ['#f97316', '#fb923c', '#f59e0b', '#38bdf8', '#22c55e', '#a855f7'];

function toDate(value) {
  return new Date(String(value || '').replace(' ', 'T'));
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function StatCard({ icon: Icon, label, value, helper, tone = 'orange' }) {
  const tones = {
    orange: 'bg-orange-100 text-orange-700',
    blue: 'bg-sky-100 text-sky-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    slate: 'bg-slate-100 text-slate-700',
    purple: 'bg-violet-100 text-violet-700',
  };

  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {helper ? <p className="mt-1 text-sm text-gray-500">{helper}</p> : null}
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone] || tones.orange}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }) {
  return <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-400">{message}</div>;
}

export default function Reportes() {
  const [desde, setDesde] = useState(format(subDays(today, 6), 'yyyy-MM-dd'));
  const [hasta, setHasta] = useState(format(today, 'yyyy-MM-dd'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const cargar = async (customDesde = desde, customHasta = hasta) => {
    setLoading(true);
    try {
      const response = await api.get(`/reportes/premium?desde=${customDesde}&hasta=${customHasta}`);
      setData(response);
    } catch {
      toast.error('No se pudieron cargar los reportes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const aplicarPreset = (preset) => {
    let nextDesde = desde;
    let nextHasta = format(today, 'yyyy-MM-dd');

    if (preset === 'hoy') {
      nextDesde = nextHasta;
    } else if (preset === '7d') {
      nextDesde = format(subDays(today, 6), 'yyyy-MM-dd');
    } else if (preset === '30d') {
      nextDesde = format(subDays(today, 29), 'yyyy-MM-dd');
    } else if (preset === 'mes') {
      nextDesde = format(startOfMonth(today), 'yyyy-MM-dd');
    }

    setDesde(nextDesde);
    setHasta(nextHasta);
    cargar(nextDesde, nextHasta);
  };

  const metodoPagoChart = useMemo(
    () =>
      (data?.paymentMethods || []).map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length],
      })),
    [data]
  );

  const exportarCsv = () => {
    if (!data) return;

    const rows = [
      ['Seccion', 'Nombre', 'Valor 1', 'Valor 2', 'Valor 3'].join(','),
      ['Resumen', 'Ventas totales', data.resumen.totalVentas, '', ''].join(','),
      ['Resumen', 'Pedidos', data.resumen.cantidadPedidos, '', ''].join(','),
      ['Resumen', 'Ticket promedio', data.resumen.ticketPromedio, '', ''].join(','),
      ['Resumen', 'Tiempo promedio', data.resumen.tiempoPromedio, 'min', ''].join(','),
      ...(data.products.topProductos || []).map((item) =>
        ['Top producto', csvEscape(item.nombre), item.cantidad, item.total, csvEscape(item.categoria)].join(',')
      ),
      ...(data.clients.topClientes || []).map((item) =>
        ['Top cliente', csvEscape(item.nombre), item.pedidos, item.total, csvEscape(item.telefono)].join(',')
      ),
      ...(data.delivery.ranking || []).map((item) =>
        ['Delivery', csvEscape(item.nombre), item.entregas, item.total, ''].join(',')
      ),
      ...(data.series.ventasPorTurno || []).map((item) =>
        ['Turno', csvEscape(item.turno), item.pedidos, item.total, ''].join(',')
      ),
      ...(data.series.ventasPorOrigen || []).map((item) =>
        ['Origen', csvEscape(item.origen), item.pedidos, item.total, ''].join(',')
      ),
      ...(data.delivery.zonas || []).map((item) =>
        ['Zona delivery', csvEscape(item.zona), item.pedidos, item.total, item.neto].join(',')
      ),
      ...(data.clients.cumpleMes || []).map((item) =>
        ['Cumple mes', csvEscape(item.nombre), csvEscape(item.fecha_nacimiento), item.total_gastado, item.total_pedidos].join(',')
      ),
      ...(data.salon.topMesas || []).map((item) =>
        ['Salon', `Mesa ${csvEscape(item.mesa)}`, item.pedidos, item.total, ''].join(',')
      ),
    ].join('\n');

    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reportes_modo_sabor_${desde}_${hasta}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Reporte exportado');
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes premium</h1>
          <p className="text-sm text-gray-500">Ventas, operación, clientes, delivery y salón en una sola vista.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => aplicarPreset('hoy')} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">Hoy</button>
          <button onClick={() => aplicarPreset('7d')} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">7 dias</button>
          <button onClick={() => aplicarPreset('30d')} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">30 dias</button>
          <button onClick={() => aplicarPreset('mes')} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50">Este mes</button>
          <button onClick={exportarCsv} disabled={!data} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50">
            <Download size={15} />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => cargar()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
            >
              <CalendarRange size={15} />
              {loading ? 'Consultando...' : 'Actualizar'}
            </button>
            <button
              onClick={() => cargar()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={15} />
              Recargar
            </button>
          </div>
        </div>
      </div>

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <StatCard icon={ShoppingBag} label="Ventas" value={fmt(data.resumen.totalVentas)} helper={`${data.resumen.cantidadPedidos} pedidos`} />
            <StatCard icon={Wallet} label="Costo estimado" value={fmt(data.resumen.totalCosto)} helper="Costo directo segun ficha de producto" tone="slate" />
            <StatCard icon={TrendingUp} label="Margen bruto" value={fmt(data.resumen.margenBruto)} helper={`${data.resumen.margenPct}% sobre ventas`} tone="emerald" />
            <StatCard icon={Clock3} label="Ticket promedio" value={fmt(data.resumen.ticketPromedio)} helper={`${data.resumen.tiempoPromedio} min promedio`} tone="blue" />
            <StatCard icon={Users} label="Clientes activos" value={data.resumen.clientesActivos} helper={`${data.clients.recompraPct}% recompra`} tone="emerald" />
            <StatCard icon={Bike} label="Delivery" value={data.resumen.deliveryCount} helper={`${data.delivery.puntualidadPct}% dentro de ETA`} tone="purple" />
            <StatCard icon={Armchair} label="Salon" value={data.resumen.mesaCount} helper={`${fmt(data.salon.totalVentas)} en mesas`} tone="slate" />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Ventas por dia" subtitle={`Del ${format(toDate(data.rango.desde), 'dd/MM', { locale: es })} al ${format(toDate(data.rango.hasta), 'dd/MM', { locale: es })}`}>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.series.ventasPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="fecha" tickFormatter={(value) => format(toDate(value), 'dd/MM', { locale: es })} />
                    <YAxis />
                    <Tooltip formatter={(value, name) => (name === 'total' ? fmt(value) : value)} labelFormatter={(value) => format(toDate(value), 'PPP', { locale: es })} />
                    <Legend />
                    <Line type="monotone" dataKey="total" stroke="#f97316" strokeWidth={3} name="Ventas" />
                    <Line type="monotone" dataKey="pedidos" stroke="#0f172a" strokeWidth={2} name="Pedidos" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Picos por hora" subtitle="Ideal para definir promos, personal y mise en place">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series.ventasPorHora}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="hora" />
                    <YAxis />
                    <Tooltip formatter={(value, name) => (name === 'total' ? fmt(value) : value)} />
                    <Legend />
                    <Bar dataKey="pedidos" fill="#fb923c" radius={[6, 6, 0, 0]} name="Pedidos" />
                    <Bar dataKey="total" fill="#0f172a" radius={[6, 6, 0, 0]} name="Ventas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Ventas por turno" subtitle="Sirve para ver que franja del dia empuja mejor las ventas">
              {data.series.ventasPorTurno.length === 0 ? (
                <EmptyState message="No hay turnos con ventas para este rango." />
              ) : (
                <div className="space-y-4">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.series.ventasPorTurno}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="turno" />
                        <YAxis />
                        <Tooltip formatter={(value, name) => (name === 'total' ? fmt(value) : value)} />
                        <Legend />
                        <Bar dataKey="pedidos" fill="#fb923c" radius={[6, 6, 0, 0]} name="Pedidos" />
                        <Bar dataKey="total" fill="#f97316" radius={[6, 6, 0, 0]} name="Ventas" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.series.ventasPorTurno.map((item) => (
                      <div key={`turno-${item.turno}`} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{item.turno}</p>
                            <p className="text-xs text-gray-500">{item.pedidos} pedidos · ticket {fmt(item.ticketPromedio)}</p>
                          </div>
                          <p className="text-sm font-bold text-orange-600">{fmt(item.total)}</p>
                        </div>
                        <p className="mt-2 text-[11px] text-gray-500">Delivery {item.delivery || 0} · Retiro {item.retiro || 0} · Mesa {item.mesa || 0}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Origen de pedidos" subtitle="Cuanto empuja cada canal del negocio">
              {data.series.ventasPorOrigen.length === 0 ? (
                <EmptyState message="Sin origenes registrados en este rango." />
              ) : (
                <div className="space-y-3">
                  {data.series.ventasPorOrigen.map((item) => (
                    <div key={item.origen} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div>
                        <p className="text-sm font-semibold capitalize text-gray-900">{item.origen.replace('_', ' ')}</p>
                        <p className="text-xs text-gray-500">{item.pedidos} pedidos</p>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{fmt(item.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Zonas de delivery" subtitle="Te muestra donde se concentra el reparto y la facturacion">
              {data.delivery.zonas.length === 0 ? (
                <EmptyState message="Todavia no hay zonas de delivery con ventas." />
              ) : (
                <div className="space-y-3">
                  {data.delivery.zonas.map((item) => (
                    <div key={item.zona} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                          <MapPin size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.zona}</p>
                          <p className="text-xs text-gray-500">{item.pedidos} pedidos · envio {fmt(item.envio)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-sky-700">{fmt(item.total)}</p>
                        <p className="text-[11px] text-emerald-700">Neto {fmt(item.neto)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-4">
            <SectionCard title="Top productos" subtitle="Los que mas mueven el negocio">
              {data.products.topProductos.length === 0 ? (
                <EmptyState message="No hay ventas para este rango." />
              ) : (
                <div className="space-y-3">
                  {data.products.topProductos.map((item, index) => (
                    <div key={item.nombre} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-100 text-sm font-bold text-orange-700">{index + 1}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{item.nombre}</p>
                        <p className="text-xs text-gray-500">{item.categoria}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{item.cantidad} uds</p>
                        <p className="text-xs text-orange-600">{fmt(item.total)}</p>
                        <p className="text-[11px] text-emerald-700">Margen {fmt(item.margen)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Mas rentables" subtitle="Donde estas ganando mas margen bruto">
              {data.products.productosRentables.length === 0 ? (
                <EmptyState message="No hay margen calculable para este rango." />
              ) : (
                <div className="space-y-3">
                  {data.products.productosRentables.map((item) => (
                    <div key={`${item.nombre}-rentable`} className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{item.nombre}</p>
                          <p className="text-xs text-gray-500">{item.categoria} - {item.cantidad} uds</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-700">{fmt(item.margen)}</p>
                          <p className="text-[11px] text-gray-500">{item.margenPct}% margen</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Margen ajustado" subtitle="Productos para revisar costo, precio o promo">
              {data.products.productosBajoMargen.length === 0 ? (
                <EmptyState message="No hay datos de margen para este rango." />
              ) : (
                <div className="space-y-3">
                  {data.products.productosBajoMargen.map((item) => (
                    <div key={`${item.nombre}-bajo`} className="rounded-2xl border border-rose-100 bg-rose-50/60 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{item.nombre}</p>
                          <p className="text-xs text-gray-500">{item.categoria} - {item.cantidad} uds</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-rose-700">{item.margenPct}%</p>
                          <p className="text-[11px] text-gray-500">Margen {fmt(item.margen)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Categorias" subtitle="Lo que mas factura por rubro">
              {data.products.topCategorias.length === 0 ? (
                <EmptyState message="Sin categorias con ventas." />
              ) : (
                <div className="space-y-3">
                  {data.products.topCategorias.map((item) => (
                    <div key={item.categoria} className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.categoria}</p>
                          <p className="text-xs text-gray-500">{item.cantidad} unidades vendidas</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-orange-600">{fmt(item.total)}</p>
                          <p className="text-[11px] text-emerald-700">Margen {fmt(item.margen)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Metodos de pago" subtitle="Como esta pagando la gente">
              {metodoPagoChart.length === 0 ? (
                <EmptyState message="Sin movimientos en este rango." />
              ) : (
                <>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={metodoPagoChart} dataKey="total" nameKey="metodo_pago" innerRadius={55} outerRadius={80} paddingAngle={2}>
                          {metodoPagoChart.map((entry) => (
                            <Cell key={entry.metodo_pago} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => fmt(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {metodoPagoChart.map((item) => (
                      <div key={item.metodo_pago} className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-sm font-medium capitalize text-gray-700">{item.metodo_pago}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900">{fmt(item.total)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard title="Segmentos CRM" subtitle="Panorama rapido para activar campañas">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['VIP', data.clients.segmentos?.vip || 0],
                  ['Riesgo', data.clients.segmentos?.riesgo || 0],
                  ['Perdidos', data.clients.segmentos?.perdidos || 0],
                  ['Inactivos', data.clients.segmentos?.inactivos || 0],
                  ['Recurrentes', data.clients.segmentos?.recurrentes || 0],
                  ['Cumple mes', data.clients.segmentos?.cumpleMes || 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Clientes mas valiosos" subtitle="Quienes mas compraron en el periodo">
              {data.clients.topClientes.length === 0 ? (
                <EmptyState message="No hubo clientes en este rango." />
              ) : (
                <div className="space-y-3">
                  {data.clients.topClientes.map((item) => (
                    <div key={`${item.nombre}-${item.telefono}`} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">{item.nombre}</p>
                        <p className="text-xs text-gray-500">{item.telefono || 'Sin telefono'} - {item.pedidos} pedidos</p>
                      </div>
                      <p className="text-sm font-bold text-orange-600">{fmt(item.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Cumpleaños del mes" subtitle="Ideal para campañas afectivas y cupones de regreso">
              {data.clients.cumpleMes.length === 0 ? (
                <EmptyState message="No hay cumpleaños cargados para este mes." />
              ) : (
                <div className="space-y-3">
                  {data.clients.cumpleMes.map((item) => (
                    <div key={`cumple-${item.id}`} className="rounded-2xl border border-pink-100 bg-pink-50/60 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{item.nombre}</p>
                          <p className="text-xs text-gray-500">{item.telefono || 'Sin telefono'}</p>
                        </div>
                        <div className="flex items-center gap-2 text-pink-700">
                          <Cake size={15} />
                          <span className="text-xs font-bold">
                            {item.fecha_nacimiento ? format(toDate(item.fecha_nacimiento), 'dd/MM', { locale: es }) : 'Este mes'}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {item.total_pedidos || 0} pedidos · {fmt(item.total_gastado)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Clientes inactivos" subtitle="Buena base para campañas de regreso">
              {data.clients.clientesInactivos.length === 0 ? (
                <EmptyState message="No se detectaron clientes inactivos." />
              ) : (
                <div className="space-y-3">
                  {data.clients.clientesInactivos.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{item.nombre}</p>
                          <p className="text-xs text-gray-500">{item.telefono || 'Sin telefono'}</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{fmt(item.total_gastado)}</p>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Ultima compra: {item.ultima_compra ? format(toDate(item.ultima_compra), 'dd/MM/yyyy', { locale: es }) : 'Sin compras entregadas'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard title="Delivery" subtitle={`${data.delivery.totalPedidos} pedidos - ${data.delivery.tiempoPromedio} min promedio`}>
              {data.delivery.ranking.length === 0 ? (
                <EmptyState message="Sin entregas registradas en este rango." />
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Puntualidad</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{data.delivery.puntualidadPct}%</p>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Desvio ETA</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{data.delivery.desviacionPromedioEta} min</p>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Entregas</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{data.delivery.totalPedidos}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {data.delivery.ranking.map((item, index) => (
                      <div key={`${item.nombre}-${index}`} className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{item.nombre}</p>
                            <p className="text-xs text-gray-500">{item.entregas} entregas · ticket {fmt(item.ticketPromedio)}</p>
                          </div>
                          <p className="text-sm font-bold text-purple-700">{fmt(item.total)}</p>
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Tiempo</p>
                            <p className="text-sm font-semibold text-gray-900">{item.tiempoPromedio} min</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Puntualidad</p>
                            <p className="text-sm font-semibold text-emerald-700">{item.puntualidadPct}%</p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Foto entrega</p>
                            <p className="text-sm font-semibold text-sky-700">{item.fotoPct}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>

            <SectionCard title="Salon / mesas" subtitle={`${data.salon.totalPedidos} tickets - ticket promedio ${fmt(data.salon.ticketPromedio)}`}>
              {data.salon.topMesas.length === 0 ? (
                <EmptyState message="Sin consumo de salon en este rango." />
              ) : (
                <div className="space-y-3">
                  {data.salon.topMesas.map((item) => (
                    <div key={item.mesa} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Mesa {item.mesa}</p>
                        <p className="text-xs text-gray-500">{item.pedidos} tickets</p>
                      </div>
                      <p className="text-sm font-bold text-emerald-700">{fmt(item.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Ultimos pedidos del rango" subtitle="Vista rapida para bajar al detalle operativo">
            {data.recentOrders.length === 0 ? (
              <EmptyState message="No hay pedidos para este rango." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500">
                      <th className="pb-3 pr-4 font-semibold">#</th>
                      <th className="pb-3 pr-4 font-semibold">Cliente</th>
                      <th className="pb-3 pr-4 font-semibold">Turno</th>
                      <th className="pb-3 pr-4 font-semibold">Tipo</th>
                      <th className="pb-3 pr-4 font-semibold">Estado</th>
                      <th className="pb-3 pr-4 font-semibold">Pago</th>
                      <th className="pb-3 pr-4 font-semibold">Fecha</th>
                      <th className="pb-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.recentOrders.map((pedido) => (
                      <tr key={pedido.id}>
                        <td className="py-3 pr-4 font-semibold text-gray-900">#{pedido.numero}</td>
                        <td className="py-3 pr-4 text-gray-700">{pedido.cliente_nombre || 'Consumidor final'}</td>
                        <td className="py-3 pr-4 text-gray-500">{pedido.turno_operativo || 'Sin turno'}</td>
                        <td className="py-3 pr-4 capitalize text-gray-500">
                          {pedido.tipo_entrega}
                          {pedido.delivery_zona ? <p className="mt-1 text-[11px] text-gray-400">{pedido.delivery_zona}</p> : null}
                        </td>
                        <td className="py-3 pr-4 capitalize text-gray-500">{pedido.estado.replace('_', ' ')}</td>
                        <td className="py-3 pr-4 capitalize text-gray-500">{pedido.metodo_pago}</td>
                        <td className="py-3 pr-4 text-xs text-gray-400">{format(toDate(pedido.creado_en), 'dd/MM HH:mm', { locale: es })}</td>
                        <td className="py-3 text-right font-bold text-gray-900">{fmt(pedido.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      ) : (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
          <Package size={34} className="mx-auto text-gray-300" />
          <h2 className="mt-4 text-lg font-bold text-gray-900">Todavia no cargaste reportes</h2>
          <p className="mt-2 text-sm text-gray-500">Elegi un rango y consulta ventas, clientes, delivery y salon.</p>
        </div>
      )}
    </div>
  );
}
