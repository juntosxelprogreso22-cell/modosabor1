import { useState, useEffect } from 'react';
import api from '../lib/api.js';
import { DollarSign, ShoppingBag, Users, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const fmt = n => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function Dashboard() {
  const [data, setData] = useState(null);

  const cargar = () => api.get('/reportes/dashboard').then(setData).catch(console.error);

  useEffect(() => {
    cargar();
    const iv = setInterval(cargar, 30000);
    return () => clearInterval(iv);
  }, []);

  if (!data) return (
    <div className="flex items-center justify-center h-96">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  const diff = data.ventasHoy.total - data.ventasAyer;
  const diffPct = data.ventasAyer > 0 ? ((diff / data.ventasAyer) * 100).toFixed(1) : 0;

  const stats = [
    { label: 'Ventas hoy', value: fmt(data.ventasHoy.total), sub: `${data.ventasHoy.pedidos} pedidos`, icon: DollarSign, color: 'bg-orange-500' },
    { label: 'vs. ayer', value: `${diff >= 0 ? '+' : ''}${diffPct}%`, sub: `Ayer: ${fmt(data.ventasAyer)}`, icon: diff >= 0 ? TrendingUp : TrendingDown, color: diff >= 0 ? 'bg-green-500' : 'bg-red-500' },
    { label: 'Pedidos activos', value: data.pedidosActivos, sub: 'En proceso', icon: Clock, color: 'bg-blue-500' },
    { label: 'Clientes', value: data.clientesTotal, sub: 'Registrados', icon: Users, color: 'bg-purple-500' },
  ];

  const chartData = data.ventas7dias.map(d => ({
    fecha: format(parseISO(d.fecha), 'EEE', { locale: es }),
    total: d.total,
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">{format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500 font-medium">{s.label}</p>
              <div className={`w-9 h-9 ${s.color} rounded-xl flex items-center justify-center`}>
                <s.icon size={17} className="text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">Ventas últimos 7 días</h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => [fmt(v), 'Ventas']} />
              <Area type="monotone" dataKey="total" stroke="#f97316" strokeWidth={2.5} fill="url(#grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">Métodos de pago hoy</h2>
          {data.porMetodoPago.length === 0 ? (
            <p className="text-gray-400 text-sm">Sin ventas hoy</p>
          ) : (
            <div className="space-y-3">
              {data.porMetodoPago.map(m => (
                <div key={m.metodo_pago} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800 capitalize">{m.metodo_pago}</p>
                    <p className="text-xs text-gray-400">{m.cantidad} pedidos</p>
                  </div>
                  <p className="font-bold text-gray-900 text-sm">{fmt(m.total)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <h2 className="font-semibold text-gray-900 mb-4">Últimos pedidos</h2>
        {data.ultimosPedidos.length === 0 ? (
          <p className="text-gray-400 text-sm">Sin pedidos aún</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="pb-3 font-medium">#</th>
                  <th className="pb-3 font-medium">Cliente</th>
                  <th className="pb-3 font-medium">Tipo</th>
                  <th className="pb-3 font-medium">Estado</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.ultimosPedidos.map(p => (
                  <tr key={p.id}>
                    <td className="py-2.5 font-medium text-gray-900">#{p.numero}</td>
                    <td className="py-2.5 text-gray-600">{p.cliente_nombre || '—'}</td>
                    <td className="py-2.5 text-gray-500 capitalize">{p.tipo_entrega}</td>
                    <td className="py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.estado === 'entregado' ? 'bg-green-100 text-green-700' :
                        p.estado === 'cancelado' ? 'bg-red-100 text-red-700' :
                        p.estado === 'preparando' ? 'bg-orange-100 text-orange-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>{p.estado}</span>
                    </td>
                    <td className="py-2.5 font-bold text-gray-900 text-right">{fmt(p.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
