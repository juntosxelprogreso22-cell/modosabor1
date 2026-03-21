import { useState, useEffect, useRef } from 'react';
import api from '../lib/api.js';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { Bike, Store, Armchair, X, RefreshCw, ChevronRight, Printer, History, RotateCcw, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const COLS = [
  { estado: 'nuevo', label: 'Nuevos', dot: 'bg-blue-500', header: 'bg-blue-50 border-blue-200' },
  { estado: 'confirmado', label: 'Confirmados', dot: 'bg-yellow-500', header: 'bg-yellow-50 border-yellow-200' },
  { estado: 'preparando', label: 'Preparando', dot: 'bg-orange-500', header: 'bg-orange-50 border-orange-200' },
  { estado: 'listo', label: 'Listos', dot: 'bg-green-500', header: 'bg-green-50 border-green-200' },
  { estado: 'en_camino', label: 'En camino', dot: 'bg-purple-500', header: 'bg-purple-50 border-purple-200' },
];

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const iconoTipo = { delivery: <Bike size={13} />, retiro: <Store size={13} />, mesa: <Armchair size={13} /> };
const tipoImpresionLabel = {
  comanda_cocina: 'Comanda',
  ticket_cliente: 'Ticket',
};

function PedidoCard({
  pedido,
  onEstado,
  onPrint,
  printingKey,
  onHistory,
  onNotify,
  notifyingKey,
  onSyncPayment,
  syncingPaymentKey,
  canPrint,
  canNotify,
  canChangeState,
  canCancel,
}) {
  const items = JSON.parse(pedido.items || '[]');
  const colIdx = COLS.findIndex((c) => c.estado === pedido.estado);
  const next = COLS[colIdx + 1];
  const printingComanda = printingKey === `${pedido.id}:comanda_cocina`;
  const printingTicket = printingKey === `${pedido.id}:ticket_cliente`;
  const notifying = notifyingKey === `${pedido.id}:${pedido.estado}`;
  const syncingPayment = syncingPaymentKey === pedido.id;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-900">#{pedido.numero}</span>
        <span className="text-xs text-gray-400">{format(parseISO(pedido.creado_en), 'HH:mm')}</span>
      </div>
      <div className="mb-1.5 flex items-center gap-1 text-xs text-gray-500">
        {iconoTipo[pedido.tipo_entrega]}
        <span className="capitalize">{pedido.tipo_entrega}</span>
        {pedido.mesa ? <span>- Mesa {pedido.mesa}</span> : null}
        <span className="ml-auto rounded bg-gray-100 px-1.5 py-0.5 text-xs capitalize">
          {pedido.metodo_pago === 'mercadopago' ? 'MP' : pedido.metodo_pago}
        </span>
      </div>
      {pedido.tipo_entrega === 'delivery' && (pedido.delivery_zona || pedido.tiempo_estimado_min) ? (
        <div className="mb-2 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
          {pedido.delivery_zona ? `Zona ${pedido.delivery_zona}` : 'Delivery'}{pedido.tiempo_estimado_min ? ` · ETA ${pedido.tiempo_estimado_min} min` : ''}
        </div>
      ) : null}
      {pedido.metodo_pago === 'mercadopago' ? (
        <div className="mb-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            pedido.pago_estado === 'approved'
              ? 'bg-emerald-100 text-emerald-700'
              : pedido.pago_estado === 'rejected'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-amber-100 text-amber-700'
          }`}>
            Pago {pedido.pago_estado || 'pending'}
          </span>
          {pedido.pago_estado !== 'approved' ? (
            <button
              onClick={() => onSyncPayment(pedido.id)}
              disabled={syncingPayment}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
            >
              <RefreshCw size={12} />
              {syncingPayment ? 'Revisando pago...' : 'Revisar pago'}
            </button>
          ) : null}
        </div>
      ) : null}
      {pedido.cliente_nombre ? <p className="mb-1.5 text-sm font-medium text-gray-800">{pedido.cliente_nombre}</p> : null}
      <div className="mb-2 space-y-0.5">
        {items.slice(0, 3).map((item, i) => (
          <p key={i} className="text-xs text-gray-500">{item.cantidad}x {item.nombre}</p>
        ))}
        {items.length > 3 ? <p className="text-xs italic text-gray-400">+{items.length - 3} mas</p> : null}
      </div>
      {pedido.notas ? <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs italic text-amber-600">"{pedido.notas}"</p> : null}
      <div className="mb-2.5 flex items-center justify-between">
        <span className="font-bold text-orange-600">{fmt(pedido.total)}</span>
      </div>
      {canPrint ? (
        <>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => onPrint(pedido.id, 'comanda_cocina')}
              disabled={printingComanda}
              className="flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              <Printer size={12} />
              {printingComanda ? 'Imprimiendo...' : 'Comanda'}
            </button>
            <button
              onClick={() => onPrint(pedido.id, 'ticket_cliente')}
              disabled={printingTicket}
              className="flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              <Printer size={12} />
              {printingTicket ? 'Imprimiendo...' : 'Ticket'}
            </button>
          </div>
          <button
            onClick={() => onHistory(pedido)}
            className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-gray-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            <History size={12} />
            Historial de impresion
          </button>
        </>
      ) : null}
      {pedido.cliente_telefono && canNotify ? (
        <button
          onClick={() => onNotify(pedido)}
          disabled={notifying}
          className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
        >
          <MessageCircle size={12} />
          {notifying ? 'Enviando...' : `WhatsApp ${pedido.estado.replace('_', ' ')}`}
        </button>
      ) : null}
      <div className="flex gap-1.5">
        {next && canChangeState(next.estado) ? (
          <button
            onClick={() => onEstado(pedido.id, next.estado)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-orange-500 py-1.5 text-xs font-medium text-white transition-colors hover:bg-orange-600"
          >
            {next.label} <ChevronRight size={12} />
          </button>
        ) : null}
        {pedido.estado === 'listo' && canChangeState('entregado') ? (
          <button
            onClick={() => onEstado(pedido.id, 'entregado')}
            className="flex-1 rounded-lg bg-green-500 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-600"
          >
            Entregado
          </button>
        ) : null}
        {canCancel ? (
          <button
            onClick={() => onEstado(pedido.id, 'cancelado')}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function Pedidos() {
  const { hasPermission } = useAuth();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printingKey, setPrintingKey] = useState('');
  const [notifyingKey, setNotifyingKey] = useState('');
  const [syncingPaymentKey, setSyncingPaymentKey] = useState(null);
  const [pendingNotifications, setPendingNotifications] = useState([]);
  const [historyModal, setHistoryModal] = useState({ open: false, pedido: null, loading: false, rows: [] });
  const configRef = useRef({});
  const canEdit = hasPermission('pedidos.edit');
  const canKitchen = hasPermission('pedidos.kitchen');
  const canPrint = hasPermission('pedidos.print');
  const canNotify = hasPermission('pedidos.edit') || hasPermission('delivery.manage');

  const canChangeState = (pedido, nextState) => {
    if (canEdit) return true;
    if (canKitchen) {
      if (pedido.estado === 'confirmado' && nextState === 'preparando') return true;
      if (pedido.estado === 'preparando' && nextState === 'listo') return true;
      if (pedido.estado === 'listo' && pedido.tipo_entrega === 'delivery' && nextState === 'en_camino') return true;
      if (pedido.estado === 'listo' && pedido.tipo_entrega !== 'delivery' && nextState === 'entregado') return true;
    }
    if (hasPermission('delivery.manage')) {
      return pedido.tipo_entrega === 'delivery' && pedido.estado === 'en_camino' && nextState === 'entregado';
    }
    return false;
  };

  const cargar = () => {
    setLoading(true);
    api.get('/pedidos/activos').then((data) => {
      setPedidos(data);
      setLoading(false);
    }).catch(() => setLoading(false));
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

  const prepararNotificacion = async (pedido, tipo = pedido.estado) => {
    return api.get(`/pedidos/${pedido.id}/notificacion/${tipo}?base_url=${encodeURIComponent(window.location.origin)}`);
  };

  useEffect(() => {
    api.get('/configuracion').then((data) => {
      configRef.current = data;
    }).catch(() => {});

    cargar();
    const socket = io('http://localhost:3001');
    socket.on('nuevo_pedido', (p) => {
      const remoteOrder = p.origen === 'web' || p.origen === 'whatsapp';
      setPedidos((prev) => [p, ...prev]);
      toast.success(`Nuevo pedido #${p.numero}`);
      if (remoteOrder && configRef.current.impresion_auto_web === '1' && canPrint) {
        imprimir(p.id, 'comanda_cocina', { auto: true, silent: true });
      }
      if (
        remoteOrder &&
        configRef.current.whatsapp_notificaciones_auto === '1' &&
        configRef.current.whatsapp_modo_envio !== 'api' &&
        p.cliente_telefono &&
        canNotify
      ) {
        prepararNotificacion(p, 'nuevo').then((notification) => {
          setPendingNotifications((prev) => {
            const next = [{ ...notification, pedidoId: p.id, numero: p.numero }, ...prev.filter((item) => item.pedidoId !== p.id)];
            return next.slice(0, 5);
          });
          toast.success(`WhatsApp listo para pedido #${p.numero}`);
        }).catch(() => {});
      }
    });
    socket.on('pedido_actualizado', (p) => {
      if (p.estado === 'entregado' || p.estado === 'cancelado') {
        setPedidos((prev) => prev.filter((x) => x.id !== p.id));
      } else {
        setPedidos((prev) => prev.map((x) => x.id === p.id ? p : x));
      }
    });
    return () => socket.disconnect();
  }, [canNotify, canPrint]);

  const notificarPedido = async (pedido, options = {}) => {
    const { silent = false } = options;
    setNotifyingKey(`${pedido.id}:${pedido.estado}`);
    try {
      if (configRef.current.whatsapp_modo_envio === 'api') {
        await api.post(`/pedidos/${pedido.id}/notificacion/${pedido.estado}/enviar`, {
          base_url: window.location.origin,
        });
        setPendingNotifications((prev) => prev.filter((item) => item.pedidoId !== pedido.id));
        if (!silent) toast.success('Mensaje enviado por WhatsApp API');
        return;
      }

      const result = await prepararNotificacion(pedido, pedido.estado);
      const popup = window.open(result.url, '_blank', 'noopener,noreferrer');
      if (!popup) {
        if (!silent) toast.error('Permiti ventanas emergentes para abrir WhatsApp');
        return;
      }
      setPendingNotifications((prev) => prev.filter((item) => item.pedidoId !== pedido.id));
      if (!silent) toast.success('Mensaje listo para WhatsApp');
    } catch (error) {
      if (!silent) toast.error(error?.error || 'No se pudo preparar el mensaje');
    } finally {
      setNotifyingKey('');
    }
  };

  const cambiarEstado = async (id, estado) => {
    try {
      const updated = await api.put(`/pedidos/${id}/estado`, { estado });
      if (estado === 'entregado' || estado === 'cancelado') {
        setPedidos((prev) => prev.filter((p) => p.id !== id));
        toast.success(estado === 'entregado' ? 'Pedido entregado' : 'Pedido cancelado');
      } else {
        setPedidos((prev) => prev.map((p) => p.id === id ? updated : p));
      }

      if (
        configRef.current.whatsapp_notificaciones_auto === '1' &&
        configRef.current.whatsapp_modo_envio !== 'api' &&
        updated?.cliente_telefono &&
        canNotify
      ) {
        await notificarPedido(updated, { silent: true });
      }
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const imprimir = async (id, tipo, options = {}) => {
    const { auto = false, silent = false } = options;
    let popup = null;
    if (!auto) {
      popup = window.open('', '_blank', 'width=900,height=700');
      if (!popup) {
        toast.error('Permiti las ventanas emergentes para imprimir');
        return;
      }
      popup.document.write('<p style="font-family: Arial, sans-serif; padding: 24px;">Preparando impresion...</p>');
      popup.document.close();
    }

    setPrintingKey(`${id}:${tipo}`);

    try {
      const response = await api.post(`/pedidos/${id}/imprimir`, { tipo });
      if (auto) {
        imprimirEnIframe(response.html);
      } else {
        popup.document.open();
        popup.document.write(response.html);
        popup.document.close();
      }
      if (!silent) {
        toast.success(tipo === 'comanda_cocina' ? 'Comanda lista para imprimir' : 'Ticket listo para imprimir');
      }
    } catch {
      if (popup) popup.close();
      if (!silent) toast.error('No se pudo generar la impresion');
    } finally {
      setPrintingKey('');
    }
  };

  const sincronizarPago = async (pedidoId) => {
    setSyncingPaymentKey(pedidoId);
    try {
      const result = await api.post(`/pedidos/${pedidoId}/pago/mercadopago/sync`);
      if (result?.pedido) {
        setPedidos((prev) => prev.map((pedido) => (pedido.id === pedidoId ? result.pedido : pedido)));
      }
      toast.success(result?.message || 'Pago sincronizado');
    } catch (error) {
      toast.error(error?.error || 'No se pudo revisar el pago');
    } finally {
      setSyncingPaymentKey(null);
    }
  };

  const abrirHistorial = async (pedido) => {
    setHistoryModal({ open: true, pedido, loading: true, rows: [] });
    try {
      const rows = await api.get(`/pedidos/${pedido.id}/impresiones`);
      setHistoryModal({ open: true, pedido, loading: false, rows });
    } catch {
      setHistoryModal({ open: true, pedido, loading: false, rows: [] });
      toast.error('No se pudo cargar el historial');
    }
  };

  const cerrarHistorial = () => {
    setHistoryModal({ open: false, pedido: null, loading: false, rows: [] });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden p-6">
      <div className="mb-5 flex flex-shrink-0 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500">{pedidos.length} pedidos activos - actualizacion en tiempo real</p>
        </div>
        <button onClick={cargar} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {pendingNotifications.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-emerald-800">Mensajes listos para enviar</p>
              <p className="mt-1 text-xs text-emerald-700">Pedidos web nuevos con WhatsApp preparado para confirmar recepcion.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700">
              {pendingNotifications.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {pendingNotifications.map((item) => (
              <div key={`${item.pedidoId}:${item.tipo}`} className="flex flex-col gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Pedido #{item.numero}</p>
                  <p className="text-xs text-gray-500 line-clamp-2">{item.mensaje}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const popup = window.open(item.url, '_blank', 'noopener,noreferrer');
                      if (popup) {
                        setPendingNotifications((prev) => prev.filter((row) => row.pedidoId !== item.pedidoId));
                      } else {
                        toast.error('Permiti ventanas emergentes para abrir WhatsApp');
                      }
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    <MessageCircle size={14} />
                    Enviar
                  </button>
                  <button
                    onClick={() => setPendingNotifications((prev) => prev.filter((row) => row.pedidoId !== item.pedidoId))}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    Ocultar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
        {COLS.map((col) => {
          const colPedidos = pedidos.filter((p) => p.estado === col.estado);
          return (
            <div key={col.estado} className="flex w-72 flex-shrink-0 flex-col">
              <div className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2.5 ${col.header}`}>
                <div className={`h-2 w-2 rounded-full ${col.dot}`} />
                <span className="text-sm font-semibold text-gray-800">{col.label}</span>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-bold text-gray-700">{colPedidos.length}</span>
              </div>
              <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
                {colPedidos.length === 0 ? (
                  <div className="rounded-xl border-2 border-dashed border-gray-200 py-8 text-center text-sm text-gray-300">Sin pedidos</div>
                ) : null}
                {colPedidos.map((p) => (
                  <PedidoCard
                    key={p.id}
                    pedido={p}
                    onEstado={cambiarEstado}
                    onPrint={imprimir}
                    printingKey={printingKey}
                    onHistory={abrirHistorial}
                    onNotify={notificarPedido}
                    notifyingKey={notifyingKey}
                    onSyncPayment={sincronizarPago}
                    syncingPaymentKey={syncingPaymentKey}
                    canPrint={canPrint}
                    canNotify={canNotify}
                    canChangeState={(nextState) => canChangeState(p, nextState)}
                    canCancel={canEdit}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {historyModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={cerrarHistorial}>
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Historial de impresion {historyModal.pedido ? `#${historyModal.pedido.numero}` : ''}
                </h3>
                <p className="text-sm text-gray-500">
                  Revisa que salio y relanza una comanda o ticket si hace falta
                </p>
              </div>
              <button
                onClick={cerrarHistorial}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              {historyModal.loading ? (
                <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-400">
                  Cargando historial...
                </div>
              ) : historyModal.rows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center">
                  <p className="text-base font-semibold text-gray-700">Todavia no hay impresiones</p>
                  <p className="mt-1 text-sm text-gray-400">Podes sacar la primera comanda o ticket desde esta misma tarjeta.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyModal.rows.map((row) => (
                    <div key={row.id} className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-700 shadow-sm">
                              {tipoImpresionLabel[row.tipo] || row.tipo}
                            </span>
                            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold capitalize text-white">
                              {row.estado}
                            </span>
                            {row.area ? (
                              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold capitalize text-orange-700">
                                {row.area}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm text-gray-500">
                            {row.creado_en ? format(parseISO(row.creado_en), 'dd/MM HH:mm') : 'Sin fecha'}
                            {' - '}
                            {row.copias || 1} copia{Number(row.copias || 1) === 1 ? '' : 's'}
                            {' - '}
                            intento{Number(row.intentos || 0) === 1 ? '' : 's'}: {row.intentos || 0}
                          </p>
                          {row.error ? <p className="text-sm text-red-500">{row.error}</p> : null}
                        </div>

                        {canPrint ? (
                          <button
                            onClick={() => imprimir(historyModal.pedido.id, row.tipo)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                          >
                            <RotateCcw size={14} />
                            Reimprimir
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
