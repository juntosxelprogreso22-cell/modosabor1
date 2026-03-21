import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import { ShoppingCart, Plus, Minus, X, MapPin, Phone, Bike, Store, ChevronRight, CheckCircle, AlertTriangle } from 'lucide-react';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

function ProductoCard({ producto, onAgregar }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="aspect-video overflow-hidden bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center">
        {producto.imagen ? (
          <img src={producto.imagen} alt={producto.nombre} className="h-full w-full object-cover" />
        ) : (
          <span className="text-5xl">{producto.categoria_icono || '🍽️'}</span>
        )}
      </div>
      <div className="p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="leading-tight font-bold text-gray-900">{producto.nombre}</h3>
          {producto.destacado === 1 ? (
            <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-600">Popular</span>
          ) : null}
        </div>
        {producto.descripcion ? <p className="mb-3 text-sm leading-snug text-gray-500">{producto.descripcion}</p> : null}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xl font-bold text-orange-600">{fmt(producto.precio)}</span>
          <button
            onClick={() => onAgregar(producto)}
            className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 active:bg-orange-700"
          >
            <Plus size={15} /> Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WebPublica() {
  const [config, setConfig] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [catActiva, setCatActiva] = useState(null);
  const [carrito, setCarrito] = useState([]);
  const [carritoOpen, setCarritoOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [confirmado, setConfirmado] = useState(null);
  const [form, setForm] = useState({
    nombre: '',
    telefono: '',
    direccion: '',
    tipo_entrega: 'delivery',
    metodo_pago: 'efectivo',
    notas: '',
    latitud: null,
    longitud: null,
  });
  const [variantModal, setVariantModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState({ costo_envio: 0, tiempo_estimado_min: 0, zone_name: '', available: true, pending: true, message: '' });
  const [sharingLocation, setSharingLocation] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/configuracion'), api.get('/categorias'), api.get('/productos?activo=1')])
      .then(([conf, cats, prods]) => {
        setConfig(conf);
        setCategorias(cats.filter((c) => c.activo));
        setProductos(prods);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pedidoId = params.get('pedido_id');
    const mpStatus = params.get('mp');
    const paymentId = params.get('payment_id') || params.get('collection_id');
    if (!pedidoId || !mpStatus) return;

    setVerifyingPayment(true);
    api.get(`/pedidos/${pedidoId}/pago/mercadopago${paymentId ? `?payment_id=${encodeURIComponent(paymentId)}` : ''}`)
      .then((pedido) => {
        setConfirmado(pedido);
        if (pedido.pago_estado === 'approved') {
          toast.success('Pago confirmado correctamente');
        } else if (mpStatus === 'failure') {
          toast.error('El pago no fue aprobado');
        } else {
          toast('Tu pago quedo pendiente de confirmacion');
        }
      })
      .catch(() => {
        toast.error('No se pudo verificar el pago');
      })
      .finally(() => {
        setVerifyingPayment(false);
        window.history.replaceState({}, '', '/');
      });
      }, []);

  useEffect(() => {
    if (form.tipo_entrega !== 'delivery') {
      setDeliveryQuote({ costo_envio: 0, tiempo_estimado_min: Number(config.tiempo_retiro || 20), zone_name: '', available: true, pending: false, message: '' });
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const quote = await api.post('/configuracion/delivery/cotizar', { direccion: form.direccion || '' });
        setDeliveryQuote(quote);
      } catch {
        setDeliveryQuote({ costo_envio: Number(config.costo_envio_base || 0), tiempo_estimado_min: Number(config.tiempo_delivery || 30), zone_name: '', available: true, pending: false, message: 'No se pudo calcular la zona ahora' });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [form.tipo_entrega, form.direccion, config.costo_envio_base, config.tiempo_delivery, config.tiempo_retiro]);

  const productosFiltrados = productos.filter((p) => !catActiva || p.categoria_id === catActiva);
  const totalItems = carrito.reduce((s, i) => s + i.cantidad, 0);
  const subtotal = carrito.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0);
  const envio = form.tipo_entrega === 'delivery' ? Number(deliveryQuote.costo_envio || 0) : 0;
  const total = subtotal + envio;
  const fueraDeTurno = config.abierto_ahora === false;
  const turnoLabel = config.turno_actual?.nombre || 'el siguiente turno';

  const addToCart = (producto, sel, extrasSel) => {
    const varKey = JSON.stringify(sel);
    let precioExtra = 0;
    Object.values(sel).forEach((o) => {
      if (o?.precio_extra) precioExtra += Number(o.precio_extra);
    });
    extrasSel.forEach((e) => {
      precioExtra += Number(e.precio || 0);
    });

    const existing = carrito.find((i) => i.producto_id === producto.id && i.varKey === varKey);
    const descVar = Object.entries(sel).map(([k, v]) => `${k}: ${v.nombre || v}`).join(', ');
    const descExtra = extrasSel.map((e) => e.nombre).join(', ');

    if (existing) {
      setCarrito((prev) => prev.map((i) => i.producto_id === producto.id && i.varKey === varKey ? { ...i, cantidad: i.cantidad + 1 } : i));
    } else {
      setCarrito((prev) => [
        ...prev,
        {
          id: Date.now(),
          producto_id: producto.id,
          nombre: producto.nombre,
          precio_unitario: Number(producto.precio) + precioExtra,
          cantidad: 1,
          variantes: sel,
          extras: extrasSel,
          varKey,
          descripcion: [descVar, descExtra].filter(Boolean).join(' | '),
        },
      ]);
    }

    setVariantModal(null);
    toast.success(`${producto.nombre} agregado`, { duration: 1500 });
  };

  const agregarAlCarrito = (producto) => {
    const variantes = JSON.parse(producto.variantes || '[]');
    const extras = JSON.parse(producto.extras || '[]');
    if (variantes.length > 0 || extras.length > 0) {
      setVariantModal({ producto, variantes, extras, sel: {}, extrasSel: [] });
      return;
    }
    addToCart(producto, {}, []);
  };

  const cambiarCantidad = (id, delta) => {
    setCarrito((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0)
    );
  };

  const hacerPedido = async () => {
    if (fueraDeTurno) return toast.error(`Ahora mismo estamos fuera de turno. Volve en ${turnoLabel}.`);
    if (!form.nombre || !form.telefono) return toast.error('Nombre y telefono requeridos');
    if (form.tipo_entrega === 'delivery' && !form.direccion) return toast.error('Ingresa tu direccion');
    if (form.tipo_entrega === 'delivery' && !deliveryQuote.available && !deliveryQuote.pending) {
      return toast.error(deliveryQuote.message || 'La direccion no esta dentro de una zona de delivery valida');
    }

    setLoading(true);
    try {
      const pedidoItems = carrito.map((i) => ({
        producto_id: i.producto_id,
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        variantes: i.variantes,
        extras: i.extras,
        descripcion: i.descripcion,
      }));

      if (form.metodo_pago === 'mercadopago') {
        const res = await api.post('/pedidos/checkout/mercadopago', {
          cliente_nombre: form.nombre,
          cliente_telefono: form.telefono,
          cliente_direccion: form.direccion,
          cliente_latitud: form.latitud,
          cliente_longitud: form.longitud,
          items: pedidoItems,
          subtotal,
          costo_envio: envio,
          descuento: 0,
          total,
          tipo_entrega: form.tipo_entrega,
          notas: form.notas,
          origen: 'web',
        });
        window.location.href = res.init_point || res.sandbox_init_point;
        return;
      }

      const res = await api.post('/pedidos', {
        cliente_nombre: form.nombre,
        cliente_telefono: form.telefono,
        cliente_direccion: form.direccion,
        cliente_latitud: form.latitud,
        cliente_longitud: form.longitud,
        items: pedidoItems,
        subtotal,
        costo_envio: envio,
        descuento: 0,
        total,
        tipo_entrega: form.tipo_entrega,
        metodo_pago: form.metodo_pago,
        notas: form.notas,
        origen: 'web',
      });

      setConfirmado(res);
      setCarrito([]);
      setCheckout(false);
      setCarritoOpen(false);
    } catch (error) {
      toast.error(error?.error || 'Error al hacer el pedido');
    } finally {
      setLoading(false);
    }
  };

  const compartirUbicacion = () => {
    if (!navigator.geolocation) {
      toast.error('Este dispositivo no permite compartir ubicacion');
      return;
    }
    setSharingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          latitud: position.coords.latitude,
          longitud: position.coords.longitude,
        }));
        setSharingLocation(false);
        toast.success('Ubicacion guardada para mejorar el ETA');
      },
      () => {
        setSharingLocation(false);
        toast.error('No pudimos obtener tu ubicacion');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (verifyingPayment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-orange-100">
            <CheckCircle size={40} className="text-orange-500" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Verificando pago</h2>
          <p className="text-gray-500">Estamos confirmando tu operacion con MercadoPago...</p>
        </div>
      </div>
    );
  }

  if (confirmado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 p-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <CheckCircle size={40} className="text-green-500" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Pedido recibido</h2>
          <p className="mb-1 text-gray-500">Pedido <span className="font-bold text-orange-600">#{confirmado.numero}</span></p>
          <p className="mb-5 text-gray-500">{config.mensaje_confirmacion || 'Gracias por tu pedido. En breve lo preparamos.'}</p>
          <div className="mb-6 rounded-2xl bg-gray-50 p-4 text-left">
            <p className="text-sm text-gray-600"><strong>Total:</strong> {fmt(confirmado.total)}</p>
            <p className="text-sm capitalize text-gray-600"><strong>Pago:</strong> {confirmado.metodo_pago}</p>
            {confirmado.metodo_pago === 'mercadopago' ? (
              <p className="text-sm capitalize text-gray-600"><strong>Estado pago:</strong> {confirmado.pago_estado || 'pending'}</p>
            ) : null}
            {confirmado.tipo_entrega === 'delivery' ? (
              <>
                <p className="text-sm text-gray-600"><strong>Zona:</strong> {confirmado.delivery_zona || 'General'}</p>
                <p className="text-sm text-gray-600"><strong>Tiempo estimado:</strong> {confirmado.tiempo_estimado_min || config.tiempo_delivery || 30} min</p>
              </>
            ) : null}
          </div>
          <Link
            to={`/seguimiento/${confirmado.id}`}
            className="mb-3 block w-full rounded-2xl bg-slate-950 py-3 text-center font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Seguir pedido en tiempo real
          </Link>
          {config.whatsapp_numero ? (
            <a
              href={`https://wa.me/${config.whatsapp_numero}?text=Hola! Hice el pedido %23${confirmado.numero} por $${confirmado.total}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-3 block rounded-2xl bg-green-500 py-3 font-semibold text-white transition-colors hover:bg-green-600"
            >
              Confirmar por WhatsApp
            </a>
          ) : null}
          <button
            onClick={() => setConfirmado(null)}
            className="block w-full rounded-2xl border border-gray-200 py-3 font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Hacer otro pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            {config.negocio_logo ? (
              <img src={config.negocio_logo} alt="logo" className="h-10 object-contain" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-xl text-white">🍕</div>
            )}
            <div>
              <h1 className="text-lg font-bold leading-none text-gray-900">{config.negocio_nombre || 'Modo Sabor'}</h1>
              <p className="text-xs text-gray-500">{config.negocio_descripcion || 'Pizzas, Empanadas y Milanesas'}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${config.abierto_ahora ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {config.abierto_ahora ? 'Abierto ahora' : 'Fuera de turno'}
                </span>
                {config.turno_actual?.nombre ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {config.turno_actual.nombre}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button onClick={() => setCarritoOpen(true)} className="relative flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-orange-600">
            <ShoppingCart size={18} />
            <span className="hidden sm:inline">Carrito</span>
            {totalItems > 0 ? (
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">{totalItems}</span>
            ) : null}
          </button>
        </div>
      </header>

      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <h2 className="mb-2 text-3xl font-bold">Pedi desde casa</h2>
          <p className="text-lg text-orange-100">Delivery y retiro disponible</p>
          {fueraDeTurno ? (
            <div className="mt-4 inline-flex max-w-2xl items-start gap-3 rounded-2xl border border-white/20 bg-white/15 px-4 py-3 text-sm text-white/95 backdrop-blur">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Ahora estamos fuera de turno.</p>
                <p className="mt-1 text-orange-50/90">
                  Podes revisar la carta y armar el carrito, pero la confirmacion online vuelve a estar disponible cuando abra {turnoLabel}.
                </p>
              </div>
            </div>
          ) : null}
          {config.negocio_telefono ? (
            <div className="mt-3 flex items-center gap-2 text-orange-100">
              <Phone size={15} /> <span className="text-sm">{config.negocio_telefono}</span>
              {config.negocio_direccion ? (
                <>
                  <MapPin size={15} className="ml-3" />
                  <span className="text-sm">{config.negocio_direccion}</span>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCatActiva(null)}
            className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${!catActiva ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100'}`}
          >
            Todo
          </button>
          {categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => setCatActiva(c.id)}
              className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${catActiva === c.id ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              <span className="mr-2">{c.icono}</span>{c.nombre}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {productosFiltrados.map((p) => <ProductoCard key={p.id} producto={p} onAgregar={agregarAlCarrito} />)}
        </div>

        {productosFiltrados.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="mb-3 text-5xl">🍽️</p>
            <p>Sin productos en esta categoria</p>
          </div>
        ) : null}
      </div>

      {carritoOpen ? (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setCarritoOpen(false)} />
          <div className="flex w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-5">
              <h2 className="text-lg font-bold">Tu pedido</h2>
              <button onClick={() => setCarritoOpen(false)} className="text-gray-400 transition-colors hover:text-gray-600"><X size={22} /></button>
            </div>

            {!checkout ? (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {carrito.length === 0 ? (
                    <div className="py-16 text-center text-gray-400">
                      <ShoppingCart size={48} className="mx-auto mb-3 opacity-25" />
                      <p>Tu carrito esta vacio</p>
                    </div>
                  ) : carrito.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 rounded-xl bg-gray-50 p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.nombre}</p>
                        {item.descripcion ? <p className="mt-0.5 text-xs text-gray-400">{item.descripcion}</p> : null}
                        <p className="mt-1 text-sm font-bold text-orange-600">{fmt(item.precio_unitario * item.cantidad)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => cambiarCantidad(item.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white transition-colors hover:bg-red-50"><Minus size={13} /></button>
                        <span className="w-5 text-center text-sm font-bold">{item.cantidad}</span>
                        <button onClick={() => cambiarCantidad(item.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white transition-colors hover:bg-green-50"><Plus size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
                {carrito.length > 0 ? (
                  <div className="border-t p-5">
                    <div className="mb-3 flex justify-between text-sm text-gray-600">
                      <span>Subtotal</span><span>{fmt(subtotal)}</span>
                    </div>
                    <div className="mb-3 flex justify-between text-sm text-gray-500">
                      <span>Envio (se calcula al checkout)</span><span className="text-gray-400">-</span>
                    </div>
                    <button onClick={() => setCheckout(true)} disabled={fueraDeTurno} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-3.5 font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                      {fueraDeTurno ? 'Fuera de turno' : 'Ir a pagar'} <ChevronRight size={18} />
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                  <h3 className="font-semibold text-gray-800">Tus datos</h3>
                  <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Tu nombre *" className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Telefono / WhatsApp *" className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />

                  <div className="flex gap-2">
                    {[{ v: 'delivery', l: 'Delivery', I: Bike }, { v: 'retiro', l: 'Retira', I: Store }].map(({ v, l, I }) => (
                      <button
                        key={v}
                        onClick={() => setForm({ ...form, tipo_entrega: v })}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-semibold transition-colors ${form.tipo_entrega === v ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500'}`}
                      >
                        <I size={16} /> {l}
                      </button>
                    ))}
                  </div>

                  {form.tipo_entrega === 'delivery' ? (
                    <>
                      <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Tu direccion de entrega *" className="w-full rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={compartirUbicacion}
                          disabled={sharingLocation}
                          className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
                        >
                          {sharingLocation ? 'Tomando ubicacion...' : (form.latitud && form.longitud ? 'Actualizar ubicacion precisa' : 'Compartir ubicacion precisa')}
                        </button>
                        {form.latitud && form.longitud ? <span className="text-xs font-semibold text-emerald-700">Ubicacion precisa lista para el rider</span> : null}
                      </div>
                      <div className={`rounded-xl border px-4 py-3 text-sm ${deliveryQuote.available ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : deliveryQuote.pending ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                        {deliveryQuote.pending ? 'Escribe tu direccion para calcular envio y demora.' : deliveryQuote.message}
                        {deliveryQuote.available && !deliveryQuote.pending ? (
                          <div className="mt-1 text-xs font-semibold">
                            Zona: {deliveryQuote.zone_name || 'General'} · Envio: {fmt(deliveryQuote.costo_envio)} · ETA: {deliveryQuote.tiempo_estimado_min || config.tiempo_delivery || 30} min
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  <h3 className="pt-2 font-semibold text-gray-800">Forma de pago</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {['efectivo', 'mercadopago', 'transferencia', 'modo', 'uala'].map((m) => (
                      <button
                        key={m}
                        onClick={() => setForm({ ...form, metodo_pago: m })}
                        className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium capitalize transition-colors ${form.metodo_pago === m ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                      >
                        {m === 'mercadopago' ? 'MercadoPago' : m}
                      </button>
                    ))}
                  </div>

                  {config.cbu_alias && ['transferencia', 'modo', 'uala'].includes(form.metodo_pago) ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                      <strong>CBU/Alias:</strong> {config.cbu_alias}
                    </div>
                  ) : null}

                  <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas (alergias, instrucciones especiales...)" rows={2} className="w-full resize-none rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                </div>

                <div className="border-t p-5">
                  {fueraDeTurno ? (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Estamos fuera de turno. El checkout queda visible para que revises el total, pero no vas a poder confirmar el pedido hasta que el local vuelva a abrir.
                    </div>
                  ) : null}
                  <div className="mb-4 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
                    {form.tipo_entrega === 'delivery' ? <div className="flex justify-between text-gray-600"><span>Envio</span><span>{fmt(envio)}</span></div> : null}
                    {form.tipo_entrega === 'delivery' && deliveryQuote.zone_name ? <div className="flex justify-between text-gray-600"><span>Zona</span><span>{deliveryQuote.zone_name}</span></div> : null}
                    {form.tipo_entrega === 'delivery' ? <div className="flex justify-between text-gray-600"><span>ETA</span><span>{deliveryQuote.tiempo_estimado_min || config.tiempo_delivery || 30} min</span></div> : null}
                    <div className="flex justify-between border-t border-gray-100 pt-2 text-base font-bold"><span>Total</span><span className="text-orange-600">{fmt(total)}</span></div>
                  </div>
                  <button onClick={hacerPedido} disabled={loading || fueraDeTurno || (form.tipo_entrega === 'delivery' && !deliveryQuote.available && !deliveryQuote.pending)} className="w-full rounded-2xl bg-orange-500 py-4 text-base font-bold text-white transition-colors hover:bg-orange-600 disabled:opacity-50">
                    {loading ? 'Enviando pedido...' : fueraDeTurno ? 'Fuera de turno' : form.metodo_pago === 'mercadopago' ? `Pagar con MercadoPago - ${fmt(total)}` : `Confirmar pedido - ${fmt(total)}`}
                  </button>
                  <button onClick={() => setCheckout(false)} className="mt-2 w-full py-2 text-sm text-gray-500 transition-colors hover:text-gray-700">Volver al carrito</button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {variantModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setVariantModal(null)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold">{variantModal.producto.nombre}</h3>
              <button onClick={() => setVariantModal(null)}><X size={22} className="text-gray-400" /></button>
            </div>
            {variantModal.variantes.map((v) => (
              <div key={v.nombre} className="mb-5">
                <p className="mb-2 text-sm font-semibold text-gray-700">{v.nombre}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(v.opciones || []).map((opt) => {
                    const oNombre = opt.nombre || opt;
                    const selected = variantModal.sel[v.nombre]?.nombre === oNombre;
                    return (
                      <button
                        key={oNombre}
                        onClick={() => setVariantModal((p) => ({ ...p, sel: { ...p.sel, [v.nombre]: typeof opt === 'string' ? { nombre: opt } : opt } }))}
                        className={`rounded-xl border-2 p-3 text-left text-sm ${selected ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}
                      >
                        <span className="font-medium">{oNombre}</span>
                        {opt.precio_extra > 0 ? <span className="block text-xs text-orange-600">+{fmt(opt.precio_extra)}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {variantModal.extras.length > 0 ? (
              <div className="mb-5">
                <p className="mb-2 text-sm font-semibold text-gray-700">Extras</p>
                <div className="space-y-2">
                  {variantModal.extras.map((e) => {
                    const sel = variantModal.extrasSel.some((x) => x.nombre === e.nombre);
                    return (
                      <button
                        key={e.nombre}
                        onClick={() => setVariantModal((p) => ({ ...p, extrasSel: sel ? p.extrasSel.filter((x) => x.nombre !== e.nombre) : [...p.extrasSel, e] }))}
                        className={`flex w-full items-center justify-between rounded-xl border-2 p-3 ${sel ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}
                      >
                        <span className="text-sm font-medium">{e.nombre}</span>
                        <span className="text-sm font-medium text-orange-600">+{fmt(e.precio)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <button onClick={() => addToCart(variantModal.producto, variantModal.sel, variantModal.extrasSel)} className="w-full rounded-2xl bg-orange-500 py-4 text-base font-bold text-white transition-colors hover:bg-orange-600">
              Agregar al carrito
            </button>
          </div>
        </div>
      ) : null}

      {totalItems > 0 && !carritoOpen ? (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <button onClick={() => setCarritoOpen(true)} className="flex items-center gap-3 rounded-2xl bg-orange-500 px-6 py-3.5 font-bold text-white shadow-xl transition-colors hover:bg-orange-600">
            <ShoppingCart size={20} />
            Ver pedido ({totalItems} items) - {fmt(subtotal)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
