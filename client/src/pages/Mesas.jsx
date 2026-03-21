import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { SOCKET_URL } from '../lib/runtime.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Armchair,
  ArrowRightLeft,
  ChevronRight,
  ClipboardList,
  CookingPot,
  DoorOpen,
  Minus,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Scissors,
  X,
} from 'lucide-react';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

const STATE_META = {
  nuevo: {
    label: 'Nuevo',
    classes: 'bg-sky-100 text-sky-700',
    next: 'confirmado',
    nextLabel: 'Confirmar',
  },
  confirmado: {
    label: 'Confirmado',
    classes: 'bg-amber-100 text-amber-700',
    next: 'preparando',
    nextLabel: 'Preparar',
  },
  preparando: {
    label: 'Preparando',
    classes: 'bg-orange-100 text-orange-700',
    next: 'listo',
    nextLabel: 'Marcar listo',
  },
  listo: {
    label: 'Listo',
    classes: 'bg-emerald-100 text-emerald-700',
    next: 'entregado',
    nextLabel: 'Cerrar mesa',
  },
  en_camino: {
    label: 'En camino',
    classes: 'bg-violet-100 text-violet-700',
    next: 'entregado',
    nextLabel: 'Cerrar mesa',
  },
};

function parseMesaNames(config) {
  const cantidad = Math.max(1, Number(config.mesas_cantidad) || 12);
  const custom = String(config.mesas_nombres || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (custom.length > 0) return custom;
  return Array.from({ length: cantidad }, (_, index) => String(index + 1));
}

function StatCard({ icon: Icon, label, value, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    orange: 'bg-orange-100 text-orange-700',
    blue: 'bg-sky-100 text-sky-700',
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone] || tones.slate}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function Mesas() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState({});
  const [pedidos, setPedidos] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState('');
  const [printingMesa, setPrintingMesa] = useState('');
  const [moveState, setMoveState] = useState(null);
  const [moveDestination, setMoveDestination] = useState('');
  const [moving, setMoving] = useState(false);
  const [splitState, setSplitState] = useState(null);
  const [splitDestination, setSplitDestination] = useState('');
  const [splitQuantities, setSplitQuantities] = useState([]);
  const [splitting, setSplitting] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [reservationForm, setReservationForm] = useState({
    mesa: '',
    cliente_nombre: '',
    cliente_telefono: '',
    cantidad_personas: 2,
    horario_reserva: '',
    notas: '',
  });
  const [savingReservation, setSavingReservation] = useState(false);
  const [fusionState, setFusionState] = useState(null);
  const [fusionDestination, setFusionDestination] = useState('');
  const [fusing, setFusing] = useState(false);
  const canUseTpv = hasPermission('tpv.use');
  const canEditPedidos = hasPermission('pedidos.edit');
  const canPrintPedidos = hasPermission('pedidos.print');

  const cargar = async () => {
    setLoading(true);
    try {
      const [configData, pedidosData, reservasData] = await Promise.all([
        api.get('/configuracion'),
        api.get('/pedidos/activos'),
        api.get('/pedidos/mesas/reservas'),
      ]);
      setConfig(configData);
      setPedidos(pedidosData);
      setReservas(reservasData);
    } catch {
      toast.error('No se pudieron cargar las mesas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('nuevo_pedido', () => cargar());
    socket.on('pedido_actualizado', () => cargar());
    return () => socket.disconnect();
  }, []);

  const pedidosMesa = useMemo(
    () =>
      pedidos
        .filter((pedido) => pedido.tipo_entrega === 'mesa' && String(pedido.mesa || '').trim())
        .sort((a, b) => String(a.mesa).localeCompare(String(b.mesa)) || a.numero - b.numero),
    [pedidos]
  );

  const mesas = useMemo(() => {
    const configuradas = parseMesaNames(config);
    const extras = pedidosMesa
      .map((pedido) => String(pedido.mesa).trim())
      .filter((mesa) => mesa && !configuradas.includes(mesa));
    const reservasExtras = reservas
      .map((reserva) => String(reserva.mesa || '').trim())
      .filter((mesa) => mesa && !configuradas.includes(mesa) && !extras.includes(mesa));
    return [...configuradas, ...extras, ...reservasExtras];
  }, [config, pedidosMesa, reservas]);

  const reservaMap = useMemo(() => {
    const map = new Map();
    reservas
      .slice()
      .sort((a, b) => String(a.horario_reserva || '').localeCompare(String(b.horario_reserva || '')))
      .forEach((reserva) => {
        const mesa = String(reserva.mesa || '').trim();
        if (mesa && !map.has(mesa) && ['reservada', 'confirmada'].includes(reserva.estado)) {
          map.set(mesa, reserva);
        }
      });
    return map;
  }, [reservas]);

  const ocupacion = useMemo(() => {
    const map = new Map();
    mesas.forEach((mesa) => {
      const abiertos = pedidosMesa.filter((pedido) => String(pedido.mesa).trim() === mesa);
      map.set(mesa, {
        mesa,
        abiertos,
        total: abiertos.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0),
      });
    });
    return map;
  }, [mesas, pedidosMesa]);

  const stats = useMemo(() => {
    const ocupadas = Array.from(ocupacion.values()).filter((item) => item.abiertos.length > 0).length;
    return {
      totalMesas: mesas.length,
      ocupadas,
      libres: Math.max(0, mesas.length - ocupadas),
      reservadas: Array.from(reservaMap.values()).length,
      tickets: pedidosMesa.length,
      totalSalon: pedidosMesa.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0),
    };
  }, [mesas, ocupacion, pedidosMesa, reservaMap]);

  const abrirMesaEnTpv = (mesa) => {
    navigate(`/admin/tpv?tipo=mesa&mesa=${encodeURIComponent(mesa)}`);
  };

  const imprimirEnIframe = (html) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1200);
    }, 250);
  };

  const cambiarEstado = async (pedido, estado) => {
    setUpdatingKey(`${pedido.id}:${estado}`);
    try {
      await api.put(`/pedidos/${pedido.id}/estado`, { estado });
      toast.success(estado === 'entregado' ? `Mesa ${pedido.mesa} cerrada` : 'Estado actualizado');
      await cargar();
    } catch {
      toast.error('No se pudo actualizar el pedido');
    } finally {
      setUpdatingKey('');
    }
  };

  const imprimirPrecuenta = async (mesa) => {
    setPrintingMesa(mesa);
    try {
      const response = await api.post(`/pedidos/mesa/${encodeURIComponent(mesa)}/precuenta`, {});
      imprimirEnIframe(response.html);
      toast.success(`Precuenta lista para mesa ${mesa}`);
    } catch (error) {
      toast.error(error?.error || 'No se pudo generar la precuenta');
    } finally {
      setPrintingMesa('');
    }
  };

  const abrirMoverMesa = (mesa, pedido = null) => {
    setMoveState({ mesa, pedido });
    setMoveDestination('');
  };

  const cerrarMover = () => {
    setMoveState(null);
    setMoveDestination('');
  };

  const confirmarMover = async () => {
    if (!moveState || !moveDestination) {
      toast.error('Elegi la mesa destino');
      return;
    }

    setMoving(true);
    try {
      if (moveState.pedido) {
        await api.put(`/pedidos/${moveState.pedido.id}/mover-mesa`, { mesa_destino: moveDestination });
        toast.success(`Pedido #${moveState.pedido.numero} movido a mesa ${moveDestination}`);
      } else {
        await api.put(`/pedidos/mesa/${encodeURIComponent(moveState.mesa)}/mover`, { mesa_destino: moveDestination });
        toast.success(`Mesa ${moveState.mesa} movida a mesa ${moveDestination}`);
      }
      cerrarMover();
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo mover la mesa');
    } finally {
      setMoving(false);
    }
  };

  const abrirDivision = (pedido) => {
    const items = JSON.parse(pedido.items || '[]');
    setSplitState({ pedido, items });
    setSplitDestination(String(pedido.mesa || '').trim());
    setSplitQuantities(items.map(() => 0));
  };

  const cerrarDivision = () => {
    setSplitState(null);
    setSplitDestination('');
    setSplitQuantities([]);
  };

  const setSplitQty = (index, value, max) => {
    const nextValue = Math.max(0, Math.min(max, Number(value || 0)));
    setSplitQuantities((prev) => prev.map((qty, itemIndex) => (itemIndex === index ? nextValue : qty)));
  };

  const confirmarDivision = async () => {
    if (!splitState) return;
    if (!splitDestination) {
      toast.error('Elegi la mesa destino');
      return;
    }

    setSplitting(true);
    try {
      const result = await api.post(`/pedidos/${splitState.pedido.id}/dividir`, {
        items: splitQuantities,
        mesa_destino: splitDestination,
      });
      toast.success(`Cuenta dividida: nuevo pedido #${result.nuevo.numero}`);
      cerrarDivision();
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo dividir la cuenta');
    } finally {
      setSplitting(false);
    }
  };

  const abrirReserva = (mesa = '') => {
    const initialDate = new Date();
    initialDate.setMinutes(initialDate.getMinutes() - initialDate.getTimezoneOffset());
    setReservationForm({
      mesa,
      cliente_nombre: '',
      cliente_telefono: '',
      cantidad_personas: 2,
      horario_reserva: initialDate.toISOString().slice(0, 16),
      notas: '',
    });
    setReservationOpen(true);
  };

  const cerrarReserva = () => {
    setReservationOpen(false);
  };

  const guardarReserva = async () => {
    if (!reservationForm.mesa || !reservationForm.cliente_nombre || !reservationForm.horario_reserva) {
      toast.error('Completa mesa, cliente y horario');
      return;
    }

    setSavingReservation(true);
    try {
      await api.post('/pedidos/mesas/reservas', reservationForm);
      toast.success(`Reserva creada para mesa ${reservationForm.mesa}`);
      cerrarReserva();
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar la reserva');
    } finally {
      setSavingReservation(false);
    }
  };

  const actualizarReservaEstado = async (reservaId, estado, successMessage) => {
    try {
      await api.put(`/pedidos/mesas/reservas/${reservaId}`, { estado });
      toast.success(successMessage);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar la reserva');
    }
  };

  const abrirFusion = (mesa) => {
    setFusionState({ mesa });
    setFusionDestination('');
  };

  const cerrarFusion = () => {
    setFusionState(null);
    setFusionDestination('');
  };

  const confirmarFusion = async () => {
    if (!fusionState || !fusionDestination) {
      toast.error('Elegi la mesa destino');
      return;
    }

    setFusing(true);
    try {
      const result = await api.post(`/pedidos/mesa/${encodeURIComponent(fusionState.mesa)}/fusionar`, {
        mesa_destino: fusionDestination,
      });
      toast.success(`Mesas unidas en mesa ${result.destino}`);
      cerrarFusion();
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudieron unir las mesas');
    } finally {
      setFusing(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mesas y salon</h1>
          <p className="text-sm text-gray-500">Control rapido de mesas, tickets abiertos y flujo del salon.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEditPedidos ? (
            <button
              onClick={() => abrirReserva('')}
              className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-100"
            >
              <Plus size={15} />
              Nueva reserva
            </button>
          ) : null}
          <button
            onClick={() => navigate('/admin/pedidos')}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ClipboardList size={15} />
            Ver pedidos
          </button>
          <button
            onClick={cargar}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <RefreshCw size={15} />
            Recargar
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard icon={Armchair} label="Mesas" value={stats.totalMesas} tone="slate" />
        <StatCard icon={DoorOpen} label="Libres" value={stats.libres} tone="emerald" />
        <StatCard icon={Receipt} label="Tickets abiertos" value={stats.tickets} tone="orange" />
        <StatCard icon={CookingPot} label="Mesas ocupadas" value={stats.ocupadas} tone="blue" />
        <StatCard icon={ClipboardList} label="Reservadas" value={stats.reservadas} tone="blue" />
        <StatCard icon={ClipboardList} label="Total salon" value={fmt(stats.totalSalon)} tone="slate" />
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-64 animate-pulse rounded-3xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {mesas.map((mesa) => {
              const mesaData = ocupacion.get(mesa) || { abiertos: [], total: 0 };
              const libre = mesaData.abiertos.length === 0;
              const reservaMesa = reservaMap.get(mesa);
              const reservada = libre && Boolean(reservaMesa);

              return (
                <div
                  key={mesa}
                  className={`rounded-3xl border p-4 transition-shadow hover:shadow-md ${
                    reservada
                      ? 'border-sky-200 bg-sky-50/60'
                      : libre
                        ? 'border-emerald-200 bg-emerald-50/60'
                        : 'border-orange-200 bg-orange-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mesa</p>
                      <h2 className="mt-1 text-2xl font-bold text-gray-900">{mesa}</h2>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        reservada
                          ? 'bg-sky-100 text-sky-700'
                          : libre
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      {reservada ? 'Reservada' : libre ? 'Libre' : 'Ocupada'}
                    </span>
                  </div>

                  {libre ? (
                    <>
                      <div className={`mt-6 rounded-2xl border bg-white/70 px-4 py-8 text-center ${
                        reservada ? 'border-sky-200' : 'border-dashed border-emerald-200'
                      }`}>
                        <p className="text-sm font-semibold text-gray-700">
                          {reservada ? `Reservada para ${reservaMesa.cliente_nombre}` : 'Sin pedidos activos'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {reservada
                            ? `${new Date(reservaMesa.horario_reserva).toLocaleString('es-AR')} · ${reservaMesa.cantidad_personas} personas`
                            : 'Abri la mesa desde caja para empezar a cargar consumos.'}
                        </p>
                        {reservada && reservaMesa.notas ? (
                          <p className="mt-2 text-xs italic text-sky-700">{reservaMesa.notas}</p>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-2">
                        {canUseTpv ? (
                          <button
                            onClick={() => abrirMesaEnTpv(mesa)}
                            className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white transition-colors ${
                              reservada ? 'bg-sky-600 hover:bg-sky-700' : 'bg-emerald-600 hover:bg-emerald-700'
                            }`}
                          >
                            <Plus size={15} />
                            {reservada ? 'Abrir mesa reservada' : 'Abrir mesa en TPV'}
                          </button>
                        ) : null}
                        {reservada && canEditPedidos ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => actualizarReservaEstado(reservaMesa.id, 'atendida', `Reserva de mesa ${mesa} marcada como atendida`)}
                              className="rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50"
                            >
                              Marcar llegada
                            </button>
                            <button
                              onClick={() => actualizarReservaEstado(reservaMesa.id, 'cancelada', `Reserva de mesa ${mesa} cancelada`)}
                              className="rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Pedidos</p>
                          <p className="mt-1 text-xl font-bold text-gray-900">{mesaData.abiertos.length}</p>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Total</p>
                          <p className="mt-1 text-xl font-bold text-orange-600">{fmt(mesaData.total)}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {canPrintPedidos ? (
                          <button
                            onClick={() => imprimirPrecuenta(mesa)}
                            disabled={printingMesa === mesa}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Printer size={14} />
                            {printingMesa === mesa ? 'Generando...' : 'Precuenta'}
                          </button>
                        ) : <div />}
                        {canEditPedidos ? (
                          <button
                            onClick={() => abrirMoverMesa(mesa)}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100"
                          >
                            <ArrowRightLeft size={14} />
                            Mover mesa
                          </button>
                        ) : null}
                      </div>

                      {canEditPedidos ? (
                        <button
                          onClick={() => abrirFusion(mesa)}
                          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                        >
                          <ArrowRightLeft size={14} />
                          Unir mesa / fusionar cuentas
                        </button>
                      ) : null}

                      <div className="mt-4 space-y-3">
                        {mesaData.abiertos.map((pedido) => {
                          const meta = STATE_META[pedido.estado] || STATE_META.nuevo;
                          const updating = updatingKey === `${pedido.id}:${meta.next}`;
                          const items = JSON.parse(pedido.items || '[]');

                          return (
                            <div key={pedido.id} className="rounded-2xl border border-white/70 bg-white p-3 shadow-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-bold text-gray-900">Pedido #{pedido.numero}</p>
                                  <p className="mt-1 text-xs text-gray-500">
                                    {items.length} item{items.length === 1 ? '' : 's'} - {fmt(pedido.total)}
                                  </p>
                                </div>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.classes}`}>
                                  {meta.label}
                                </span>
                              </div>

                              <div className="mt-3 space-y-1">
                                {items.slice(0, 3).map((item, index) => (
                                  <p key={`${pedido.id}-${index}`} className="text-xs text-gray-600">
                                    {item.cantidad}x {item.nombre}
                                  </p>
                                ))}
                                {items.length > 3 ? (
                                  <p className="text-xs italic text-gray-400">+{items.length - 3} mas</p>
                                ) : null}
                              </div>

                              {pedido.notas ? (
                                <p className="mt-3 rounded-xl bg-amber-50 px-2.5 py-2 text-xs italic text-amber-700">
                                  {pedido.notas}
                                </p>
                              ) : null}

                              <div className="mt-3 grid grid-cols-2 gap-2">
                                {canUseTpv ? (
                                  <button
                                    onClick={() => abrirMesaEnTpv(mesa)}
                                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                                  >
                                    <Plus size={13} />
                                    Agregar
                                  </button>
                                ) : <div />}
                                {canEditPedidos ? (
                                  <button
                                    onClick={() => cambiarEstado(pedido, meta.next)}
                                    disabled={updating}
                                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                                  >
                                    {updating ? '...' : meta.nextLabel}
                                    <ChevronRight size={13} />
                                  </button>
                                ) : null}
                              </div>

                              {canEditPedidos ? (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <button
                                    onClick={() => abrirMoverMesa(mesa, pedido)}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                                  >
                                    <ArrowRightLeft size={13} />
                                    Mover
                                  </button>
                                  <button
                                    onClick={() => abrirDivision(pedido)}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100"
                                  >
                                    <Scissors size={13} />
                                    Dividir
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {moveState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={cerrarMover}>
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {moveState.pedido ? `Mover pedido #${moveState.pedido.numero}` : `Mover mesa ${moveState.mesa}`}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {moveState.pedido
                    ? `Este ticket pasara de mesa ${moveState.mesa} a otra mesa abierta o libre.`
                    : `Se moveran todos los tickets abiertos de mesa ${moveState.mesa}.`}
                </p>
              </div>
              <button onClick={cerrarMover} className="rounded-2xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Mesa destino</label>
              <select
                value={moveDestination}
                onChange={(event) => setMoveDestination(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              >
                <option value="">Seleccionar mesa</option>
                {mesas
                  .filter((mesa) => mesa !== moveState.mesa)
                  .map((mesa) => (
                    <option key={mesa} value={mesa}>
                      Mesa {mesa}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={cerrarMover}
                className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarMover}
                disabled={moving}
                className="flex-1 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-60"
              >
                {moving ? 'Moviendo...' : 'Confirmar movimiento'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {fusionState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={cerrarFusion}>
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Unir mesa {fusionState.mesa}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Se fusionaran los tickets abiertos y quedara una sola cuenta en la mesa destino.
                </p>
              </div>
              <button onClick={cerrarFusion} className="rounded-2xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Mesa destino</label>
              <select
                value={fusionDestination}
                onChange={(event) => setFusionDestination(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
              >
                <option value="">Seleccionar mesa</option>
                {mesas
                  .filter((mesa) => mesa !== fusionState.mesa)
                  .map((mesa) => (
                    <option key={mesa} value={mesa}>
                      Mesa {mesa}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={cerrarFusion}
                className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarFusion}
                disabled={fusing}
                className="flex-1 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
              >
                {fusing ? 'Uniendo...' : 'Unir y fusionar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {splitState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={cerrarDivision}>
          <div
            className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Dividir cuenta del pedido #{splitState.pedido.numero}</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Elegi que cantidades queres separar para generar un nuevo ticket.
                </p>
              </div>
              <button onClick={cerrarDivision} className="rounded-2xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1.3fr,0.7fr]">
              <div className="rounded-2xl border border-gray-100">
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="text-sm font-semibold text-gray-800">Items del pedido</p>
                </div>
                <div className="max-h-[360px] space-y-3 overflow-y-auto p-4">
                  {splitState.items.map((item, index) => (
                    <div key={`${splitState.pedido.id}-${index}`} className="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.nombre}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Disponible: {item.cantidad} - {fmt(Number(item.precio_unitario || 0) * Number(item.cantidad || 0))}
                          </p>
                          {item.descripcion ? (
                            <p className="mt-1 text-xs text-gray-400">{item.descripcion}</p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSplitQty(index, splitQuantities[index] - 1, item.cantidad)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-100"
                          >
                            <Minus size={13} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={item.cantidad}
                            value={splitQuantities[index] ?? 0}
                            onChange={(event) => setSplitQty(index, event.target.value, item.cantidad)}
                            className="w-16 rounded-xl border border-gray-200 px-2 py-1.5 text-center text-sm font-semibold text-gray-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                          />
                          <button
                            onClick={() => setSplitQty(index, splitQuantities[index] + 1, item.cantidad)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-100"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-100 p-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Mesa destino</label>
                  <select
                    value={splitDestination}
                    onChange={(event) => setSplitDestination(event.target.value)}
                    className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    {mesas.map((mesa) => (
                      <option key={mesa} value={mesa}>
                        Mesa {mesa}{mesa === String(splitState.pedido.mesa || '').trim() ? ' actual' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Resumen</p>
                  <p className="mt-2 text-sm text-gray-700">
                    Items a separar: <strong>{splitQuantities.reduce((acc, qty) => acc + Number(qty || 0), 0)}</strong>
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    Mesa origen: <strong>{splitState.pedido.mesa}</strong>
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={cerrarDivision}
                    className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarDivision}
                    disabled={splitting}
                    className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60"
                  >
                    {splitting ? 'Dividiendo...' : 'Crear nueva cuenta'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {reservationOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={cerrarReserva}>
          <div
            className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Nueva reserva</h3>
                <p className="mt-1 text-sm text-gray-500">Carga una reserva para marcar la mesa como ocupacion futura.</p>
              </div>
              <button onClick={cerrarReserva} className="rounded-2xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Mesa</label>
                <select
                  value={reservationForm.mesa}
                  onChange={(event) => setReservationForm((prev) => ({ ...prev, mesa: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Seleccionar mesa</option>
                  {mesas.map((mesa) => (
                    <option key={mesa} value={mesa}>
                      Mesa {mesa}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Horario</label>
                <input
                  type="datetime-local"
                  value={reservationForm.horario_reserva}
                  onChange={(event) => setReservationForm((prev) => ({ ...prev, horario_reserva: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Cliente</label>
                <input
                  value={reservationForm.cliente_nombre}
                  onChange={(event) => setReservationForm((prev) => ({ ...prev, cliente_nombre: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="Nombre del cliente"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Telefono</label>
                <input
                  value={reservationForm.cliente_telefono}
                  onChange={(event) => setReservationForm((prev) => ({ ...prev, cliente_telefono: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="Telefono"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Personas</label>
                <input
                  type="number"
                  min="1"
                  value={reservationForm.cantidad_personas}
                  onChange={(event) => setReservationForm((prev) => ({ ...prev, cantidad_personas: Number(event.target.value || 1) }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Notas</label>
                <textarea
                  rows={3}
                  value={reservationForm.notas}
                  onChange={(event) => setReservationForm((prev) => ({ ...prev, notas: event.target.value }))}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  placeholder="Silla para bebe, cumpleanos, ubicacion preferida..."
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={cerrarReserva}
                className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarReserva}
                disabled={savingReservation}
                className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60"
              >
                {savingReservation ? 'Guardando...' : 'Crear reserva'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
