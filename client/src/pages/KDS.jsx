import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, ChefHat, Clock3, Maximize, Minimize, PackageCheck, RefreshCw, UtensilsCrossed, Volume2, VolumeX } from 'lucide-react';
import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { SOCKET_URL } from '../lib/runtime.js';

const COLS = [
  { estado: 'confirmado', label: 'Por arrancar', tone: 'border-blue-200 bg-blue-50', icon: Clock3 },
  { estado: 'preparando', label: 'En cocina', tone: 'border-orange-200 bg-orange-50', icon: ChefHat },
  { estado: 'listo', label: 'Listos', tone: 'border-green-200 bg-green-50', icon: PackageCheck },
];

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

function elapsedLabel(fecha) {
  if (!fecha) return 'Sin hora';
  try {
    return formatDistanceToNowStrict(parseISO(fecha), { addSuffix: true, locale: es });
  } catch {
    return 'Sin hora';
  }
}

function itemText(item) {
  const parts = [];
  if (item.descripcion) parts.push(item.descripcion);
  if (item.variantes && Object.keys(item.variantes).length > 0) {
    parts.push(Object.entries(item.variantes).map(([k, v]) => `${k}: ${v?.nombre || v}`).join(', '));
  }
  if (item.extras?.length) {
    parts.push(`Extras: ${item.extras.map((extra) => extra.nombre).join(', ')}`);
  }
  return parts.filter(Boolean).join(' | ');
}

function minutesElapsed(fecha) {
  if (!fecha) return 0;
  try {
    return Math.max(0, Math.floor((Date.now() - parseISO(fecha).getTime()) / 60000));
  } catch {
    return 0;
  }
}

function urgencyClasses(pedido) {
  const mins = minutesElapsed(pedido.creado_en);
  if (pedido.estado === 'listo' && mins >= 5) {
    return 'border-green-300 ring-2 ring-green-200';
  }
  if (mins >= 35) {
    return 'border-rose-300 bg-rose-50/40 ring-2 ring-rose-200';
  }
  if (mins >= 20) {
    return 'border-amber-300 bg-amber-50/40 ring-2 ring-amber-200';
  }
  return 'border-gray-200';
}

function urgencyLabel(pedido) {
  const mins = minutesElapsed(pedido.creado_en);
  if (pedido.estado === 'listo' && mins >= 5) return { text: 'Listo hace rato', tone: 'bg-green-100 text-green-700' };
  if (mins >= 35) return { text: 'Urgente', tone: 'bg-rose-100 text-rose-700' };
  if (mins >= 20) return { text: 'Demorado', tone: 'bg-amber-100 text-amber-700' };
  return { text: 'En tiempo', tone: 'bg-slate-100 text-slate-600' };
}

function PedidoKitchenCard({ pedido, onEstado, updatingId, canAct }) {
  const items = useMemo(() => {
    try {
      return JSON.parse(pedido.items || '[]');
    } catch {
      return [];
    }
  }, [pedido.items]);

  const totalItems = items.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
  const nextAction = pedido.estado === 'confirmado'
    ? { estado: 'preparando', label: 'Empezar' }
    : pedido.estado === 'preparando'
      ? { estado: 'listo', label: 'Marcar listo' }
      : null;
  const urgency = urgencyLabel(pedido);

  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${urgencyClasses(pedido)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black text-slate-950">#{pedido.numero}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {pedido.tipo_entrega} {pedido.mesa ? `- Mesa ${pedido.mesa}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-orange-600">{fmt(pedido.total)}</p>
          <p className="mt-1 text-xs text-slate-400">{elapsedLabel(pedido.creado_en)}</p>
          <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${urgency.tone}`}>
            {urgency.text}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-900">{pedido.cliente_nombre || 'Pedido mostrador'}</p>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
            {totalItems} items
          </span>
        </div>
        {pedido.notas ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">{pedido.notas}</p>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {items.map((item, index) => (
          <div key={`${item.nombre}-${index}`} className="rounded-xl border border-slate-200 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-slate-900">{item.cantidad}x {item.nombre}</p>
              <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
            </div>
            {itemText(item) ? <p className="mt-1 text-xs leading-5 text-slate-500">{itemText(item)}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        {nextAction && canAct ? (
          <button
            onClick={() => onEstado(pedido.id, nextAction.estado)}
            disabled={updatingId === pedido.id}
            className="flex-1 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {updatingId === pedido.id ? 'Actualizando...' : nextAction.label}
          </button>
        ) : null}
        {pedido.estado === 'listo' && canAct ? (
          <button
            onClick={() => onEstado(pedido.id, pedido.tipo_entrega === 'delivery' ? 'en_camino' : 'entregado')}
            disabled={updatingId === pedido.id}
            className="flex-1 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-green-700 disabled:opacity-50"
          >
            {pedido.tipo_entrega === 'delivery' ? 'Pasar a delivery' : 'Entregar'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default function KDS() {
  const { hasPermission } = useAuth();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [filtroEntrega, setFiltroEntrega] = useState('todos');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [, forceTick] = useState(0);
  const audioRef = useRef(null);
  const canAct = hasPermission('pedidos.kitchen') || hasPermission('pedidos.edit');

  const cargar = async () => {
    try {
      setLoading(true);
      const data = await api.get('/pedidos/activos');
      setPedidos(data.filter((pedido) => ['confirmado', 'preparando', 'listo'].includes(pedido.estado)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    audioRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);

    cargar();
    const timer = setInterval(() => forceTick((n) => n + 1), 30000);
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('nuevo_pedido', (pedido) => {
      if (['confirmado', 'preparando', 'listo'].includes(pedido.estado)) {
        setPedidos((prev) => [pedido, ...prev.filter((item) => item.id !== pedido.id)]);
        toast.success(`Pedido #${pedido.numero} entro a cocina`);
        if (soundEnabled && audioRef.current) {
          const now = audioRef.current.currentTime;
          const osc = audioRef.current.createOscillator();
          const gain = audioRef.current.createGain();
          osc.connect(gain);
          gain.connect(audioRef.current.destination);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
          osc.frequency.setValueAtTime(880, now);
          osc.start(now);
          osc.stop(now + 0.25);
        }
      }
    });
    socket.on('pedido_actualizado', (pedido) => {
      setPedidos((prev) => {
        const next = prev.filter((item) => item.id !== pedido.id);
        if (['confirmado', 'preparando', 'listo'].includes(pedido.estado)) {
          return [...next, pedido].sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));
        }
        return next;
      });
    });
    return () => {
      clearInterval(timer);
      socket.disconnect();
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [soundEnabled]);

  const cambiarEstado = async (id, estado) => {
    setUpdatingId(id);
    try {
      const updated = await api.put(`/pedidos/${id}/estado`, { estado });
      setPedidos((prev) => {
        const next = prev.filter((item) => item.id !== id);
        if (['confirmado', 'preparando', 'listo'].includes(updated.estado)) return [...next, updated];
        return next;
      });
      toast.success(`Pedido #${updated.numero} actualizado`);
    } catch {
      toast.error('No se pudo cambiar el estado');
    } finally {
      setUpdatingId(null);
    }
  };

  const summary = {
    confirmados: pedidos.filter((pedido) => pedido.estado === 'confirmado').length,
    preparando: pedidos.filter((pedido) => pedido.estado === 'preparando').length,
    listos: pedidos.filter((pedido) => pedido.estado === 'listo').length,
  };

  const pedidosFiltrados = useMemo(() => {
    if (filtroEntrega === 'todos') return pedidos;
    return pedidos.filter((pedido) => pedido.tipo_entrega === filtroEntrega);
  }, [pedidos, filtroEntrega]);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fffaf5_0%,#f8fafc_35%,#f8fafc_100%)] p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-600">Kitchen display</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Cocina / KDS</h1>
          <p className="mt-2 text-sm text-slate-500">Pantalla viva de preparacion para comandas, tiempos y salida a delivery.</p>
        </div>
        <button
          onClick={cargar}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCw size={15} />
          Recargar
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm">
        <div className="flex gap-2">
          {[
            { value: 'todos', label: 'Todo' },
            { value: 'delivery', label: 'Delivery' },
            { value: 'retiro', label: 'Retiro' },
            { value: 'mesa', label: 'Mesa' },
          ].map((item) => (
            <button
              key={item.value}
              onClick={() => setFiltroEntrega(item.value)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                filtroEntrega === item.value ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setSoundEnabled((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {soundEnabled ? 'Sonido on' : 'Sonido off'}
          </button>
          <button
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
            {isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {[
          { label: 'Por arrancar', value: summary.confirmados, icon: Clock3, tone: 'bg-blue-100 text-blue-700' },
          { label: 'En cocina', value: summary.preparando, icon: ChefHat, tone: 'bg-orange-100 text-orange-700' },
          { label: 'Listos', value: summary.listos, icon: CheckCircle2, tone: 'bg-green-100 text-green-700' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/70 bg-white/95 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">{item.label}</p>
                <p className="mt-2 text-3xl font-black text-slate-950">{item.value}</p>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${item.tone}`}>
                <item.icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-white/70 bg-white/95 px-6 py-14 text-center text-slate-400 shadow-sm">
          Cargando cocina...
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          {COLS.map((col) => {
            const Icon = col.icon;
            const rows = pedidosFiltrados
              .filter((pedido) => pedido.estado === col.estado)
              .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

            return (
              <section key={col.estado} className="rounded-3xl border border-white/70 bg-white/95 p-4 shadow-sm">
                <div className={`mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3 ${col.tone}`}>
                  <Icon size={18} />
                  <div className="flex-1">
                    <p className="font-bold text-slate-900">{col.label}</p>
                    <p className="text-xs text-slate-500">{rows.length} pedidos</p>
                  </div>
                  <UtensilsCrossed size={16} className="text-slate-400" />
                </div>

                <div className="space-y-4">
                  {rows.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-400">
                      Sin pedidos en esta columna
                    </div>
                  ) : rows.map((pedido) => (
                    <PedidoKitchenCard
                      key={pedido.id}
                      pedido={pedido}
                      onEstado={cambiarEstado}
                      updatingId={updatingId}
                      canAct={canAct}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
