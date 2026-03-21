import { useState, useEffect, useRef } from 'react';
import api from '../lib/api.js';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Plus, Pencil, Trash2, X, Bike, Phone, MapPin, CheckCircle, UserCheck, RefreshCw, Navigation, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { SOCKET_URL, UPLOADS_BASE_URL } from '../lib/runtime.js';

const fmt = n => `$${Number(n || 0).toLocaleString('es-AR')}`;

function assetUrl(path, config = {}) {
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  const base = String(config?.public_api_url || UPLOADS_BASE_URL || '').replace(/\/$/, '');
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

function Badge({ estado }) {
  const map = {
    listo: 'bg-green-100 text-green-700',
    en_camino: 'bg-purple-100 text-purple-700',
    entregado: 'bg-gray-100 text-gray-500',
  };
  const labels = { listo: 'Listo para salir', en_camino: 'En camino', entregado: 'Entregado' };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[estado] || 'bg-gray-100 text-gray-600'}`}>
      {labels[estado] || estado}
    </span>
  );
}

function etaLabel(pedido) {
  const eta = Number(pedido?.eta_min_dinamico || pedido?.tiempo_estimado_min || 0);
  if (!eta) return 'Sin ETA';
  return `${eta} min`;
}

function etaSourceLabel(pedido) {
  const source = String(pedido?.eta_origen || '');
  if (source === 'rider_route') return 'ETA por ubicacion';
  if (source === 'rider_route_stale') return 'ETA por ultima ubicacion';
  if (source === 'estado') return 'ETA por estado';
  return 'ETA estimado';
}

export default function Delivery() {
  const { hasPermission } = useAuth();
  const [repartidores, setRepartidores] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [tab, setTab] = useState('activos');
  const [modal, setModal] = useState(null);
  const [asignarModal, setAsignarModal] = useState(null);
  const [form, setForm] = useState({ nombre: '', telefono: '', vehiculo: '', zona_preferida: '' });
  const [loading, setLoading] = useState(false);
  const [locatingId, setLocatingId] = useState(null);
  const [assigningAuto, setAssigningAuto] = useState(false);
  const configRef = useRef({});
  const canManage = hasPermission('delivery.manage');
  const repartidoresDisponibles = repartidores.filter(r => r.activo && r.disponible);

  const cargar = async () => {
    const [reps, peds] = await Promise.all([
      api.get('/repartidores'),
      api.get('/pedidos?limit=100')
    ]);
    setRepartidores(reps);
    setPedidos(peds);
  };

  useEffect(() => {
    api.get('/configuracion').then((data) => {
      configRef.current = data;
    }).catch(() => {});

    cargar();
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('nuevo_pedido', () => cargar());
    socket.on('pedido_actualizado', () => cargar());
    socket.on('repartidor_ubicacion', (rep) => {
      setRepartidores(prev => prev.map(item => item.id === rep.id ? rep : item));
    });
    return () => socket.disconnect();
  }, []);

  const pedidosDelivery = pedidos.filter(p => p.tipo_entrega === 'delivery');
  const activos = pedidosDelivery.filter(p => ['listo', 'en_camino'].includes(p.estado));
  const historial = pedidosDelivery.filter(p => p.estado === 'entregado').slice(0, 30);

  const guardarRepartidor = async () => {
    if (!form.nombre) return toast.error('Nombre requerido');
    setLoading(true);
    try {
      if (modal === 'nuevo') {
        await api.post('/repartidores', form);
        toast.success('Repartidor creado');
      } else {
        await api.put(`/repartidores/${modal.id}`, { ...modal, ...form });
        toast.success('Repartidor actualizado');
      }
      setModal(null);
      cargar();
    } catch { toast.error('Error al guardar'); }
    finally { setLoading(false); }
  };

  const eliminarRepartidor = async (id) => {
    if (!confirm('¿Eliminar repartidor?')) return;
    await api.delete(`/repartidores/${id}`);
    toast.success('Eliminado');
    cargar();
  };

  const toggleDisponible = async (rep) => {
    await api.put(`/repartidores/${rep.id}`, { ...rep, disponible: rep.disponible ? 0 : 1 });
    cargar();
  };

  const asignar = async (repartidorId) => {
    try {
      await api.post(`/repartidores/${repartidorId}/asignar/${asignarModal.id}`);
      toast.success('Repartidor asignado - pedido en camino');
      setAsignarModal(null);
      cargar();
    } catch { toast.error('Error al asignar'); }
  };

  const autoAsignar = async (pedidoId = asignarModal?.id) => {
    if (!pedidoId) return;
    setAssigningAuto(true);
    try {
      const response = await api.post(`/repartidores/auto-asignar/${pedidoId}`);
      const nombre = response?.repartidor?.nombre ? ` a ${response.repartidor.nombre}` : '';
      toast.success(`Pedido autoasignado${nombre}`);
      setAsignarModal(null);
      cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo autoasignar el pedido');
    } finally {
      setAssigningAuto(false);
    }
  };

  const marcarEntregado = async (pedidoId) => {
    try {
      const updated = await api.put(`/pedidos/${pedidoId}/estado`, { estado: 'entregado' });
      if (
        configRef.current.whatsapp_notificaciones_auto === '1' &&
        configRef.current.whatsapp_modo_envio !== 'api' &&
        updated?.cliente_telefono
      ) {
        try {
          const notification = await api.get(`/pedidos/${updated.id}/notificacion/entregado?base_url=${encodeURIComponent(window.location.origin)}`);
          const popup = window.open(notification.url, '_blank', 'noopener,noreferrer');
          if (!popup) {
            toast.error('Permiti ventanas emergentes para abrir WhatsApp');
          }
        } catch {
          toast.error('No se pudo preparar el mensaje postventa');
        }
      }
      toast.success('Pedido marcado como entregado');
      cargar();
    } catch { toast.error('Error'); }
  };

  const abrirModal = (rep = null) => {
    setForm(rep ? { nombre: rep.nombre, telefono: rep.telefono, vehiculo: rep.vehiculo, zona_preferida: rep.zona_preferida || '' } : { nombre: '', telefono: '', vehiculo: '', zona_preferida: '' });
    setModal(rep || 'nuevo');
  };

  const actualizarUbicacion = async (rep) => {
    if (!navigator.geolocation) {
      toast.error('Este dispositivo no permite geolocalizacion');
      return;
    }

    setLocatingId(rep.id);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const updated = await api.put(`/repartidores/${rep.id}/ubicacion`, {
            latitud: position.coords.latitude,
            longitud: position.coords.longitude,
          });
          setRepartidores(prev => prev.map(item => item.id === rep.id ? updated : item));
          toast.success(`Ubicacion actualizada para ${rep.nombre}`);
        } catch {
          toast.error('No se pudo guardar la ubicacion');
        } finally {
          setLocatingId(null);
        }
      },
      () => {
        setLocatingId(null);
        toast.error('No pudimos obtener la ubicacion');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const quitarUbicacion = async (rep) => {
    try {
      const updated = await api.delete(`/repartidores/${rep.id}/ubicacion`);
      setRepartidores(prev => prev.map(item => item.id === rep.id ? updated : item));
      toast.success('Ubicacion eliminada');
    } catch {
      toast.error('No se pudo borrar la ubicacion');
    }
  };

  const riderLink = (rep) => `${window.location.origin}/rider/${rep.id}/${rep.codigo_acceso}`;

  const copiarRiderLink = async (rep) => {
    try {
      await navigator.clipboard.writeText(riderLink(rep));
      toast.success(`Link rider copiado para ${rep.nombre}`);
    } catch {
      toast.error('No se pudo copiar el link');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delivery</h1>
          <p className="text-sm text-gray-500">{activos.length} entregas activas - {repartidoresDisponibles.length} repartidores disponibles</p>
        </div>
        <button onClick={cargar} className="p-2 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Repartidores */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Repartidores</h2>
          {canManage ? (
            <button onClick={() => abrirModal()} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-xl text-sm font-semibold transition-colors">
              <Plus size={15} /> Agregar
            </button>
          ) : null}
        </div>
        {repartidores.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">Sin repartidores. Agrega el primero.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {repartidores.filter(r => r.activo).map(rep => (
              <div key={rep.id} className={`border-2 rounded-xl p-4 transition-colors ${rep.disponible ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${rep.disponible ? 'bg-green-200 text-green-700' : 'bg-orange-200 text-orange-700'}`}>
                    {rep.nombre[0].toUpperCase()}
                  </div>
                  {canManage ? (
                    <div className="flex gap-1">
                      <button onClick={() => abrirModal(rep)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors"><Pencil size={13} /></button>
                      <button onClick={() => eliminarRepartidor(rep.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-white rounded-lg transition-colors"><Trash2 size={13} /></button>
                    </div>
                  ) : null}
                </div>
                <p className="font-semibold text-gray-900 text-sm">{rep.nombre}</p>
                {rep.vehiculo && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Bike size={11} /> {rep.vehiculo}</p>}
                {rep.telefono && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone size={11} /> {rep.telefono}</p>}
                {rep.zona_preferida && <p className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={11} /> Zona preferida: {rep.zona_preferida}</p>}
                {rep.latitud && rep.longitud && (
                  <div className="mt-2 rounded-lg bg-white/80 px-2 py-2 text-[11px] text-gray-500">
                    <p className="font-semibold text-gray-700">Ubicacion disponible</p>
                    {rep.ultima_ubicacion_en && <p className="mt-0.5">Actualizada {format(parseISO(rep.ultima_ubicacion_en), 'HH:mm', { locale: es })}</p>}
                  </div>
                )}
                {canManage ? (
                  <button onClick={() => toggleDisponible(rep)} className={`mt-3 w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${rep.disponible ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}>
                    {rep.disponible ? 'Disponible' : 'En reparto'}
                  </button>
                ) : null}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {canManage ? (
                    <button
                      onClick={() => actualizarUbicacion(rep)}
                      disabled={locatingId === rep.id}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      {locatingId === rep.id ? 'Ubicando...' : 'Mi ubicacion'}
                    </button>
                  ) : null}
                  {rep.latitud && rep.longitud ? (
                    canManage ? (
                      <button
                        onClick={() => quitarUbicacion(rep)}
                        className="rounded-lg border border-red-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        Borrar
                      </button>
                    ) : (
                      <a
                        href={`https://www.google.com/maps?q=${rep.latitud},${rep.longitud}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        Ver mapa
                      </a>
                    )
                  ) : (
                    <a
                      href={`https://wa.me/${(rep.telefono || '').replace(/\D/g,'')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      Contacto
                    </a>
                  )}
                </div>
                {canManage ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => window.open(riderLink(rep), '_blank')}
                      className="rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-50"
                    >
                      Modo rider
                    </button>
                    <button
                      onClick={() => copiarRiderLink(rep)}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                    >
                      Copiar link
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[{v:'activos',l:'Entregas activas'},{v:'historial',l:'Historial'}].map(({v,l}) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {l} {v === 'activos' && activos.length > 0 && <span className="ml-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">{activos.length}</span>}
          </button>
        ))}
      </div>

      {/* Entregas activas */}
      {tab === 'activos' && (
        <div className="space-y-3">
          {activos.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
              <Bike size={40} className="mx-auto mb-3 opacity-25" />
              <p>No hay entregas activas ahora</p>
              <p className="text-xs mt-1">Los pedidos delivery en estado "Listo" apareceran aqui</p>
            </div>
          )}
          {activos.map(p => {
            const items = JSON.parse(p.items || '[]');
            const repartidor = repartidores.find(r => r.id === p.repartidor_id);
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-gray-900 text-lg">#{p.numero}</span>
                      <Badge estado={p.estado} />
                      {p.repartidor_nombre && (
                        <span className="flex items-center gap-1 text-sm text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full">
                          <UserCheck size={13} /> {p.repartidor_nombre}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <span className="font-medium">{p.cliente_nombre}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Phone size={13} /> {p.cliente_telefono || '-'}
                      </div>
                      <div className="flex items-start gap-1.5 text-gray-500 col-span-2">
                        <MapPin size={13} className="mt-0.5 flex-shrink-0" />
                        <span>{p.cliente_direccion || '-'}</span>
                      </div>
                      <div className="text-xs text-gray-500">Zona: <span className="font-semibold text-gray-700">{p.delivery_zona || 'General'}</span></div>
                      <div className="text-xs text-gray-500">ETA: <span className="font-semibold text-gray-700">{etaLabel(p)}</span> <span className="text-[11px] text-gray-400">({etaSourceLabel(p)})</span></div>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      {items.map((i, idx) => <span key={idx}>{i.cantidad}x {i.nombre}{idx < items.length - 1 ? ' - ' : ''}</span>)}
                    </div>
                    {p.notas && <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg mt-2 italic">"{p.notas}"</p>}
                    {repartidor?.latitud && repartidor?.longitud && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                          Ubicacion {repartidor.ultima_ubicacion_en ? format(parseISO(repartidor.ultima_ubicacion_en), 'HH:mm', { locale: es }) : 'reciente'}
                        </span>
                        {p.distancia_repartidor_km ? (
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                            A {p.distancia_repartidor_km} km
                          </span>
                        ) : null}
                        {p.ubicacion_repartidor_atrasada ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                            Ubicacion atrasada
                          </span>
                        ) : null}
                        <a
                          href={`https://www.google.com/maps?q=${repartidor.latitud},${repartidor.longitud}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50"
                        >
                          <ExternalLink size={12} />
                          Ver mapa
                        </a>
                      </div>
                    )}
                    {p.entrega_foto ? (
                      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                        <img
                          src={assetUrl(p.entrega_foto, configRef.current)}
                          alt={`Entrega ${p.numero}`}
                          className="h-16 w-16 rounded-xl object-cover border border-emerald-200 bg-white"
                        />
                        <a
                          href={assetUrl(p.entrega_foto, configRef.current)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                        >
                          <CheckCircle size={12} />
                          Ver foto de entrega
                        </a>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-orange-600 text-lg">{fmt(p.total)}</p>
                    <p className="text-xs text-gray-400 capitalize">{p.metodo_pago}</p>
                    <p className="text-xs text-gray-400">{format(parseISO(p.creado_en), 'HH:mm', { locale: es })}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-50">
                  {p.estado === 'listo' && canManage && (
                    <>
                      {repartidoresDisponibles.length > 0 && (
                        <button
                          onClick={() => autoAsignar(p.id)}
                          disabled={assigningAuto}
                          className="flex-1 flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          <Bike size={15} />
                          {assigningAuto ? 'Autoasignando...' : (repartidoresDisponibles.length === 1 ? 'Autoasignar' : 'Autoasignar mejor')}
                        </button>
                      )}
                      <button onClick={() => setAsignarModal(p)}
                        className="flex-1 flex items-center justify-center gap-2 border border-purple-200 text-purple-700 hover:bg-purple-50 py-2.5 rounded-xl text-sm font-semibold transition-colors">
                        <Bike size={15} /> Elegir repartidor
                      </button>
                    </>
                  )}
                  {p.estado === 'en_camino' && canManage && (
                    <>
                      {repartidor && (
                        <button
                          onClick={() => actualizarUbicacion(repartidor)}
                          disabled={locatingId === repartidor.id}
                          className="flex items-center justify-center gap-2 border border-blue-200 text-blue-700 hover:bg-blue-50 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                        >
                          <Navigation size={15} />
                          {locatingId === repartidor.id ? 'Ubicando...' : 'Actualizar ubicacion'}
                        </button>
                      )}
                      {(p.entrega_pin || configRef.current.delivery_requiere_foto_entrega === '1') ? (
                        <div className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
                          Validar entrega desde rider {p.entrega_pin ? 'con PIN' : ''}{configRef.current.delivery_requiere_foto_entrega === '1' ? ' y foto' : ''}
                        </div>
                      ) : (
                        <button onClick={() => marcarEntregado(p.id)}
                          className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold transition-colors">
                          <CheckCircle size={15} /> Marcar entregado
                        </button>
                      )}
                    </>
                  )}
                  {p.cliente_telefono && (
                    <a href={`https://wa.me/${p.cliente_telefono.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-4 py-2.5 border border-green-200 text-green-600 hover:bg-green-50 rounded-xl text-sm font-medium transition-colors">
                      <Phone size={14} /> WhatsApp
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Historial */}
      {tab === 'historial' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Direccion</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Repartidor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Entrega</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Hora</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {historial.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">#{p.numero}</td>
                  <td className="px-4 py-3 text-gray-700">{p.cliente_nombre || '-'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-36 truncate">{p.cliente_direccion || '-'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.repartidor_nombre || <span className="text-gray-300">-</span>}</td>
                  <td className="px-4 py-3">
                    {p.entrega_foto ? (
                      <a href={assetUrl(p.entrega_foto, configRef.current)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 hover:underline">
                        <img src={assetUrl(p.entrega_foto, configRef.current)} alt={`Entrega ${p.numero}`} className="h-9 w-9 rounded-lg object-cover border border-emerald-200" />
                        Foto
                      </a>
                    ) : p.entrega_pin ? (
                      <span className="text-xs text-slate-500">PIN validado</span>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{format(parseISO(p.creado_en), 'dd/MM HH:mm', { locale: es })}</td>
                  <td className="px-4 py-3 font-bold text-gray-900 text-right">{fmt(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {historial.length === 0 && <p className="text-center text-gray-400 py-10">Sin historial</p>}
        </div>
      )}

      {/* Modal Repartidor */}
      {modal !== null && canManage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg">{modal === 'nuevo' ? 'Nuevo repartidor' : 'Editar repartidor'}</h2>
              <button onClick={() => setModal(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              {[['nombre','Nombre *'],['telefono','Telefono / WhatsApp'],['vehiculo','Vehiculo (moto, auto, bici...)'],['zona_preferida','Zona preferida (ej: Monteros)']].map(([k,l]) => (
                <div key={k}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{l}</label>
                  <input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal(null)} className="flex-1 py-2.5 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarRepartidor} disabled={loading} className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {loading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Asignar */}
      {asignarModal && canManage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setAsignarModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg">Asignar repartidor</h2>
              <button onClick={() => setAsignarModal(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
              <p className="font-medium text-gray-900">Pedido #{asignarModal.numero}</p>
              <p className="text-gray-500">{asignarModal.cliente_nombre} - {asignarModal.cliente_direccion}</p>
              <p className="font-bold text-orange-600 mt-1">{fmt(asignarModal.total)}</p>
            </div>
            {repartidoresDisponibles.length > 0 && (
              <button
                onClick={() => autoAsignar(asignarModal.id)}
                disabled={assigningAuto}
                className="mb-3 w-full rounded-xl bg-purple-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-purple-600 disabled:opacity-50"
              >
                {assigningAuto ? 'Autoasignando...' : repartidoresDisponibles.length === 1 ? 'Asignar automaticamente al unico disponible' : 'Autoasignar al mejor disponible'}
              </button>
            )}
            <div className="space-y-2">
              {repartidoresDisponibles.map(rep => (
                <button key={rep.id} onClick={() => asignar(rep.id)}
                  className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 rounded-xl transition-colors text-left">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-sm font-bold text-green-700">
                    {rep.nombre[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{rep.nombre}</p>
                    <p className="text-xs text-gray-500">{rep.vehiculo || 'Sin vehiculo registrado'}</p>
                  </div>
                  <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Disponible</span>
                </button>
              ))}
              {repartidoresDisponibles.length === 0 && (
                <p className="text-center text-gray-400 py-6 text-sm">No hay repartidores disponibles en este momento</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
