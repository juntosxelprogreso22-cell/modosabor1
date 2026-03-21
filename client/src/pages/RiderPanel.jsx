import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Bike,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Store,
} from 'lucide-react';
import { API_BASE_URL, SOCKET_URL } from '../lib/runtime.js';

async function publicJson(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Error de comunicacion');
  }
  return data;
}

function money(value) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

export default function RiderPanel() {
  const { id, codigo } = useParams();
  const [repartidor, setRepartidor] = useState(null);
  const [pedido, setPedido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [pin, setPin] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [settings, setSettings] = useState({ delivery_requiere_foto_entrega: false });
  const watchIdRef = useRef(null);

  const load = async () => {
    try {
      if (!repartidor) setLoading(true);
      const data = await publicJson(`/api/repartidores/${id}/rider/${codigo}`);
      setRepartidor(data.repartidor);
      setPedido(data.pedido);
      setSettings(data.settings || { delivery_requiere_foto_entrega: false });
      if (!data.pedido) {
        setPin('');
        setPhotoFile(null);
      }
      setError('');
    } catch (err) {
      setError(err.message || 'No se pudo abrir el modo rider');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socket.on('pedido_actualizado', (updated) => {
      if (String(updated.repartidor_id || '') === String(id)) {
        setPedido(updated.estado === 'entregado' ? null : updated);
      }
    });
    socket.on('repartidor_ubicacion', (updated) => {
      if (String(updated.id) === String(id)) {
        setRepartidor(updated);
      }
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
    };
  }, [id, codigo]);

  useEffect(() => {
    if (!pedido && sharing && watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setSharing(false);
    }
  }, [pedido, sharing]);

  const sendLocation = async (coords) => {
    await publicJson(`/api/repartidores/${id}/rider/${codigo}/ubicacion`, {
      method: 'PUT',
      body: JSON.stringify({
        latitud: coords.latitude,
        longitud: coords.longitude,
      }),
    });
  };

  const updateNow = () => {
    if (!navigator.geolocation) {
      setError('Este dispositivo no soporta geolocalizacion');
      return;
    }

    setUpdating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await sendLocation(position.coords);
          await load();
        } catch (err) {
          setError(err.message || 'No se pudo enviar la ubicacion');
        } finally {
          setUpdating(false);
        }
      },
      () => {
        setUpdating(false);
        setError('No pudimos obtener tu ubicacion actual');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const toggleSharing = () => {
    if (sharing) {
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setSharing(false);
      return;
    }

    if (!navigator.geolocation) {
      setError('Este dispositivo no soporta geolocalizacion');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          await sendLocation(position.coords);
        } catch (err) {
          setError(err.message || 'No se pudo compartir la ubicacion');
        }
      },
      () => {
        setSharing(false);
        setError('No se pudo mantener la ubicacion en vivo');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    watchIdRef.current = watchId;
    setSharing(true);
  };

  const marcarEntregado = async () => {
    if (!pedido) return;
    if (settings.delivery_requiere_foto_entrega && !photoFile) {
      setError('Este negocio exige foto de entrega para cerrar el pedido');
      return;
    }
    try {
      const body = new FormData();
      body.append('pin', pin);
      if (photoFile) body.append('foto', photoFile);
      const result = await publicJson(`/api/repartidores/${id}/rider/${codigo}/entregar/${pedido.id}`, {
        method: 'POST',
        body,
      });
      setRepartidor(result.repartidor);
      setPedido(null);
      setPin('');
      setPhotoFile(null);
    } catch (err) {
      setError(err.message || 'No se pudo marcar como entregado');
    }
  };

  const mapsLink = useMemo(() => {
    if (!pedido?.cliente_direccion) return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pedido.cliente_direccion)}`;
  }, [pedido]);

  const items = useMemo(() => {
    if (!pedido?.items) return [];
    try {
      return typeof pedido.items === 'string' ? JSON.parse(pedido.items) : pedido.items;
    } catch {
      return [];
    }
  }, [pedido]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#fffdf9_35%,#f8fafc_100%)] px-4 py-6">
      <div className="mx-auto max-w-xl space-y-5">
        <div className="rounded-[28px] border border-white/70 bg-white/95 px-5 py-5 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-600">Modo rider</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{repartidor?.nombre || 'Repartidor'}</h1>
              {repartidor?.vehiculo ? <p className="mt-1 text-sm text-slate-500">{repartidor.vehiculo}</p> : null}
            </div>
            <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${sharing ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {sharing ? 'Ubicacion en vivo' : 'Ubicacion pausada'}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={updateNow}
              disabled={updating}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {updating ? 'Actualizando...' : 'Actualizar ahora'}
            </button>
            <button
              onClick={toggleSharing}
              className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${sharing ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
            >
              {sharing ? 'Detener en vivo' : 'Iniciar en vivo'}
            </button>
          </div>

          {repartidor?.ultima_ubicacion_en ? (
            <p className="mt-4 text-xs text-slate-400">
              Ultima ubicacion {formatDistanceToNowStrict(parseISO(repartidor.ultima_ubicacion_en), { addSuffix: true, locale: es })}
            </p>
          ) : null}
          {error ? <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-3 text-sm text-rose-700">{error}</p> : null}
        </div>

        {loading ? (
          <div className="rounded-[28px] border border-white/70 bg-white/95 px-5 py-10 text-center text-slate-400 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
            Cargando reparto...
          </div>
        ) : pedido ? (
          <div className="rounded-[28px] border border-white/70 bg-white/95 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
            <div className="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(59,130,246,0.10),rgba(255,255,255,0.86))] px-5 py-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Entrega activa</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-950">Pedido #{pedido.numero}</h2>
                  <p className="mt-1 text-sm text-slate-500 capitalize">{pedido.estado.replace('_', ' ')}</p>
                </div>
                <div className="rounded-full bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700">
                  {money(pedido.total)}
                </div>
              </div>
            </div>

            <div className="px-5 py-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                <p className="font-bold text-slate-950">{pedido.cliente_nombre || 'Cliente'}</p>
                {pedido.cliente_telefono ? (
                  <p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Phone size={15} /> {pedido.cliente_telefono}</p>
                ) : null}
                {pedido.cliente_direccion ? (
                  <p className="mt-2 flex items-start gap-2 text-sm text-slate-600"><MapPin size={15} className="mt-0.5" /> {pedido.cliente_direccion}</p>
                ) : null}
                {pedido.notas ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-700">{pedido.notas}</p> : null}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-400">Pedido</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    {items.reduce((acc, item) => acc + Number(item.cantidad || 0), 0)} items
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {items.map((item, index) => (
                    <div key={`${item.nombre}-${index}`} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3">
                      <div>
                        <p className="font-semibold text-slate-900">{item.cantidad}x {item.nombre}</p>
                        {item.descripcion ? <p className="mt-1 text-xs text-slate-500">{item.descripcion}</p> : null}
                      </div>
                      <span className="text-sm font-bold text-slate-700">{money(Number(item.precio_unitario || 0) * Number(item.cantidad || 0))}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {pedido.entrega_pin ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Validacion de entrega</p>
                    <p className="mt-2 text-sm text-amber-900">Pedi al cliente el PIN y cargalo para confirmar que la entrega fue correcta.</p>
                    <input
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="PIN de 4 digitos"
                      className="mt-3 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-amber-400"
                    />
                  </div>
                ) : null}
                <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Foto de entrega</p>
                  <p className="mt-2 text-sm text-sky-900">
                    {settings.delivery_requiere_foto_entrega
                      ? 'Este cierre exige foto. Sacala antes de marcar entregado.'
                      : 'Opcional, pero deja mejor constancia de la entrega.'}
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                    className="mt-3 block w-full text-sm text-slate-700"
                  />
                  {photoFile ? <p className="mt-2 text-xs font-semibold text-emerald-700">Foto lista: {photoFile.name}</p> : null}
                </div>
                {pedido.cliente_telefono ? (
                  <a
                    href={`tel:${pedido.cliente_telefono}`}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Phone size={15} />
                    Llamar cliente
                  </a>
                ) : null}
                {mapsLink ? (
                  <a
                    href={mapsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
                  >
                    <Navigation size={15} />
                    Navegar con Maps
                  </a>
                ) : null}
                {pedido.cliente_telefono ? (
                  <a
                    href={`https://wa.me/${pedido.cliente_telefono.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    <Phone size={15} />
                    WhatsApp cliente
                  </a>
                ) : null}
                {repartidor?.latitud && repartidor?.longitud ? (
                  <a
                    href={`https://www.google.com/maps?q=${repartidor.latitud},${repartidor.longitud}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ExternalLink size={15} />
                    Ver mi ubicacion
                  </a>
                ) : null}
                <Link
                  to={`/seguimiento/${pedido.id}`}
                  target="_blank"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
                >
                  <Bike size={15} />
                  Ver tracking del cliente
                </Link>
                <button
                  onClick={marcarEntregado}
                  disabled={(Boolean(pedido.entrega_pin) && String(pin).trim().length !== 4) || (settings.delivery_requiere_foto_entrega && !photoFile)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 size={15} />
                  Marcar entregado
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[28px] border border-white/70 bg-white/95 px-5 py-10 text-center shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Bike size={28} />
            </div>
            <h2 className="mt-4 text-xl font-black text-slate-950">Sin entrega activa</h2>
            <p className="mt-2 text-sm text-slate-500">Cuando te asignen un pedido, va a aparecer aca automaticamente.</p>
          </div>
        )}

        <Link
          to="/"
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Store size={15} />
          Ver menu publico
        </Link>
      </div>
    </div>
  );
}
