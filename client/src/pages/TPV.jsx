import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api.js';
import toast from 'react-hot-toast';
import { Search, Plus, Minus, Trash2, ShoppingCart, X, Bike, Store, Armchair, ChevronRight } from 'lucide-react';

const fmt = n => `$${Number(n || 0).toLocaleString('es-AR')}`;
const PAGOS = ['efectivo', 'mercadopago', 'transferencia', 'modo', 'uala'];

export default function TPV() {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [catActiva, setCatActiva] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState([]);
  const [tipoEntrega, setTipoEntrega] = useState('retiro');
  const [mesa, setMesa] = useState('');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [cliente, setCliente] = useState({ nombre: '', telefono: '', direccion: '', latitud: null, longitud: null });
  const [descuento, setDescuento] = useState(0);
  const [notas, setNotas] = useState('');
  const [variantModal, setVariantModal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState({ costo_envio: 0, tiempo_estimado_min: 0, zone_name: '', available: true, pending: true, message: '' });
  const [sharingLocation, setSharingLocation] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/categorias'), api.get('/productos?activo=1'), api.get('/configuracion')])
      .then(([cats, prods, conf]) => {
        setConfig(conf);
        setCategorias(cats.filter(c => c.activo));
        setProductos(prods);
      });
  }, []);

  useEffect(() => {
    if (tipoEntrega !== 'delivery') {
      setDeliveryQuote({ costo_envio: 0, tiempo_estimado_min: Number(config.tiempo_retiro || 20), zone_name: '', available: true, pending: false, message: '' });
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const quote = await api.post('/configuracion/delivery/cotizar', { direccion: cliente.direccion || '' });
        setDeliveryQuote(quote);
      } catch {
        setDeliveryQuote({ costo_envio: Number(config.costo_envio_base || 0), tiempo_estimado_min: Number(config.tiempo_delivery || 30), zone_name: '', available: true, pending: false, message: 'No se pudo calcular la zona ahora' });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [tipoEntrega, cliente.direccion, config.costo_envio_base, config.tiempo_delivery, config.tiempo_retiro]);

  useEffect(() => {
    const tipo = searchParams.get('tipo');
    const mesaParam = searchParams.get('mesa');

    if (tipo && ['delivery', 'retiro', 'mesa'].includes(tipo)) {
      setTipoEntrega(tipo);
    }

    if (mesaParam) {
      setTipoEntrega('mesa');
      setMesa(mesaParam);
    }
  }, [searchParams]);

  const productosFiltrados = productos.filter(p => {
    const matchCat = !catActiva || p.categoria_id === catActiva;
    const matchQ = !busqueda || p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return matchCat && matchQ;
  });

  const agregarItem = (producto) => {
    const variantes = JSON.parse(producto.variantes || '[]');
    const extras = JSON.parse(producto.extras || '[]');
    if (variantes.length > 0 || extras.length > 0) {
      setVariantModal({ producto, variantes, extras, sel: {}, extrasSel: [] });
      return;
    }
    addToCart(producto, {}, []);
  };

  const addToCart = (producto, sel, extrasSel) => {
    const varKey = JSON.stringify(sel);
    let precioExtra = 0;
    Object.values(sel).forEach(o => { if (o?.precio_extra) precioExtra += Number(o.precio_extra); });
    extrasSel.forEach(e => { precioExtra += Number(e.precio || 0); });

    const existing = items.find(i => i.producto_id === producto.id && i.varKey === varKey);
    if (existing) {
      setItems(prev => prev.map(i => i.producto_id === producto.id && i.varKey === varKey ? { ...i, cantidad: i.cantidad + 1 } : i));
    } else {
      const descVar = Object.entries(sel).map(([k, v]) => `${k}: ${v.nombre || v}`).join(', ');
      const descExtra = extrasSel.map(e => e.nombre).join(', ');
      setItems(prev => [...prev, {
        id: Date.now(),
        producto_id: producto.id,
        nombre: producto.nombre,
        precio_unitario: Number(producto.precio) + precioExtra,
        cantidad: 1,
        variantes: sel,
        extras: extrasSel,
        varKey,
        descripcion: [descVar, descExtra].filter(Boolean).join(' | ')
      }]);
    }
    setVariantModal(null);
  };

  const cambiarCantidad = (id, d) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, cantidad: i.cantidad + d } : i).filter(i => i.cantidad > 0));
  };

  const subtotal = items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0);
  const envio = tipoEntrega === 'delivery' ? Number(deliveryQuote.costo_envio || 0) : 0;
  const total = subtotal + envio - Number(descuento || 0);

  const limpiar = () => { setItems([]); setCliente({ nombre: '', telefono: '', direccion: '', latitud: null, longitud: null }); setDescuento(0); setNotas(''); setMesa(''); };

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

  const abrirImpresion = async (pedidoId, popup) => {
    try {
      const response = await api.post(`/pedidos/${pedidoId}/imprimir`, { tipo: 'comanda_cocina' });
      if (popup) {
        popup.document.open();
        popup.document.write(response.html);
        popup.document.close();
        toast.success('Comanda lista para imprimir');
      } else {
        imprimirEnIframe(response.html);
        toast.success('Comanda enviada a impresion');
      }
    } catch {
      if (popup) popup.close();
      toast.error('No se pudo generar la comanda');
    }
  };

  const confirmar = async (imprimir = false) => {
    if (items.length === 0) return toast.error('Agregá productos al pedido');
    if (tipoEntrega === 'delivery' && !cliente.nombre) return toast.error('Nombre requerido para delivery');
    if (tipoEntrega === 'delivery' && !cliente.direccion) return toast.error('Direccion requerida para delivery');
    if (tipoEntrega === 'delivery' && !deliveryQuote.available && !deliveryQuote.pending) {
      return toast.error(deliveryQuote.message || 'La direccion no pertenece a una zona valida');
    }
    const shouldAutoPrint = imprimir || config.impresion_auto_tpv === '1';
    let popup = null;
    if (imprimir) {
      popup = window.open('', '_blank', 'width=900,height=700');
      if (!popup) {
        toast.error('Permiti las ventanas emergentes para imprimir');
        return;
      }
      popup.document.write('<p style="font-family: Arial, sans-serif; padding: 24px;">Preparando impresion...</p>');
      popup.document.close();
    }

    setLoading(true);
    try {
      const pedidoItems = items.map(i => ({
        producto_id: i.producto_id, nombre: i.nombre, cantidad: i.cantidad,
        precio_unitario: i.precio_unitario, variantes: i.variantes, extras: i.extras, descripcion: i.descripcion
      }));
      const pedido = await api.post('/pedidos/interno', {
        cliente_nombre: cliente.nombre, cliente_telefono: cliente.telefono, cliente_direccion: cliente.direccion,
        cliente_latitud: cliente.latitud, cliente_longitud: cliente.longitud,
        items: pedidoItems, subtotal, costo_envio: envio, descuento: Number(descuento || 0), total,
        tipo_entrega: tipoEntrega, mesa, metodo_pago: metodoPago, notas, origen: 'tpv'
      });
      toast.success(shouldAutoPrint ? 'Pedido creado y enviado a impresion' : 'Pedido creado');
      if (shouldAutoPrint) {
        await abrirImpresion(pedido.id, popup);
      }
      limpiar();
    } catch {
      if (popup) popup.close();
      toast.error('Error al crear pedido');
    } finally {
      setLoading(false);
    }
  };

  const compartirUbicacionCliente = () => {
    if (!navigator.geolocation) {
      toast.error('Este dispositivo no permite geolocalizacion');
      return;
    }
    setSharingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCliente((prev) => ({
          ...prev,
          latitud: position.coords.latitude,
          longitud: position.coords.longitude,
        }));
        setSharingLocation(false);
        toast.success('Ubicacion del cliente guardada');
      },
      () => {
        setSharingLocation(false);
        toast.error('No se pudo obtener la ubicacion');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* LEFT */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        <div className="p-3 bg-white border-b">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
        </div>
        <div className="flex gap-2 px-3 py-2 bg-white border-b overflow-x-auto">
          <button onClick={() => setCatActiva(null)} className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!catActiva ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Todos</button>
          {categorias.map(c => (
            <button key={c.id} onClick={() => setCatActiva(c.id)} className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${catActiva === c.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <span>{c.icono}</span> {c.nombre}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5">
            {productosFiltrados.map(p => (
              <button key={p.id} onClick={() => agregarItem(p)}
                className="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-orange-400 hover:shadow-md transition-all active:scale-95">
                <div className="aspect-square bg-gray-100 rounded-lg mb-2 overflow-hidden flex items-center justify-center">
                  {p.imagen ? <img src={p.imagen} alt={p.nombre} className="w-full h-full object-cover" /> : <span className="text-3xl">{p.categoria_icono || '🍽️'}</span>}
                </div>
                <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">{p.nombre}</p>
                <p className="text-orange-600 font-bold text-sm mt-1">{fmt(p.precio)}</p>
                {p.destacado === 1 && <span className="text-xs text-orange-500">⭐</span>}
              </button>
            ))}
          </div>
          {productosFiltrados.length === 0 && <p className="text-center text-gray-400 text-sm mt-8">Sin productos</p>}
        </div>
      </div>

      {/* RIGHT - Ticket */}
      <div className="w-80 bg-white border-l flex flex-col shadow-lg">
        <div className="p-3 border-b">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {[{v:'retiro',l:'Retira',I:Store},{v:'delivery',l:'Delivery',I:Bike},{v:'mesa',l:'Mesa',I:Armchair}].map(({v,l,I}) => (
              <button key={v} onClick={() => setTipoEntrega(v)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${tipoEntrega === v ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500'}`}>
                <I size={13} /> {l}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 border-b space-y-1.5">
          {tipoEntrega === 'mesa' ? (
            <input value={mesa} onChange={e => setMesa(e.target.value)} placeholder="Número de mesa"
              className="w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
          ) : (
            <>
              <input value={cliente.nombre} onChange={e => setCliente({ ...cliente, nombre: e.target.value })} placeholder="Nombre del cliente"
                className="w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
              <input value={cliente.telefono} onChange={e => setCliente({ ...cliente, telefono: e.target.value })} placeholder="Teléfono"
                className="w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
              {tipoEntrega === 'delivery' && (
                <>
                  <input value={cliente.direccion} onChange={e => setCliente({ ...cliente, direccion: e.target.value })} placeholder="Dirección de entrega"
                    className="w-full text-sm border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={compartirUbicacionCliente}
                      disabled={sharingLocation}
                      className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
                    >
                      {sharingLocation ? 'Tomando ubicacion...' : (cliente.latitud && cliente.longitud ? 'Actualizar ubicacion precisa' : 'Guardar ubicacion precisa')}
                    </button>
                    {cliente.latitud && cliente.longitud ? <span className="text-[11px] font-semibold text-emerald-700">Mejora ETA del rider</span> : null}
                  </div>
                  <div className={`rounded-xl border px-3 py-2 text-xs ${deliveryQuote.available ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : deliveryQuote.pending ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                    {deliveryQuote.pending ? 'Escribí la dirección para calcular envío y demora.' : deliveryQuote.message}
                    {deliveryQuote.available && !deliveryQuote.pending ? (
                      <div className="mt-1 font-semibold">
                        Zona: {deliveryQuote.zone_name || 'General'} · Envío: {fmt(deliveryQuote.costo_envio)} · ETA: {deliveryQuote.tiempo_estimado_min || config.tiempo_delivery || 30} min
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ShoppingCart size={36} className="mx-auto mb-2 opacity-25" />
              <p className="text-sm">Agregá productos</p>
            </div>
          ) : items.map(item => (
            <div key={item.id} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 leading-tight">{item.nombre}</p>
                {item.descripcion && <p className="text-xs text-gray-400 leading-tight mt-0.5">{item.descripcion}</p>}
                <p className="text-sm font-bold text-orange-600 mt-0.5">{fmt(item.precio_unitario * item.cantidad)}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => cambiarCantidad(item.id, -1)} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-red-100 transition-colors"><Minus size={11} /></button>
                <span className="w-5 text-center text-sm font-bold">{item.cantidad}</span>
                <button onClick={() => cambiarCantidad(item.id, 1)} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-green-100 transition-colors"><Plus size={11} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t space-y-2.5 bg-gray-50">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
            {tipoEntrega === 'delivery' && <div className="flex justify-between text-gray-600"><span>Envío</span><span>{fmt(envio)}</span></div>}
            {tipoEntrega === 'delivery' && deliveryQuote.zone_name && <div className="flex justify-between text-gray-600"><span>Zona</span><span>{deliveryQuote.zone_name}</span></div>}
            {tipoEntrega === 'delivery' && <div className="flex justify-between text-gray-600"><span>ETA</span><span>{deliveryQuote.tiempo_estimado_min || config.tiempo_delivery || 30} min</span></div>}
            <div className="flex items-center gap-2">
              <span className="text-gray-600 text-sm">Descuento $</span>
              <input type="number" value={descuento} onChange={e => setDescuento(e.target.value)} min={0}
                className="flex-1 text-sm border rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-500 text-right" />
            </div>
            <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-200">
              <span>Total</span><span className="text-orange-600">{fmt(total)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {PAGOS.map(m => (
              <button key={m} onClick={() => setMetodoPago(m)}
                className={`flex-1 min-w-0 px-1 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${metodoPago === m ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {m === 'mercadopago' ? 'MP' : m}
              </button>
            ))}
          </div>

          <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas..."
            className="w-full text-xs border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white" />

          <div className="grid grid-cols-3 gap-2">
            <button onClick={limpiar} disabled={items.length === 0} className="py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors bg-white">
              Limpiar
            </button>
            <button onClick={() => confirmar(false)} disabled={loading || items.length === 0 || (tipoEntrega === 'delivery' && !deliveryQuote.available && !deliveryQuote.pending)}
              className="py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 transition-colors">
              {loading ? '...' : 'Confirmar'}
            </button>
            <button onClick={() => confirmar(true)} disabled={loading || items.length === 0 || (tipoEntrega === 'delivery' && !deliveryQuote.available && !deliveryQuote.pending)}
              className="py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold disabled:opacity-40 transition-colors">
              {loading ? '...' : 'Confirmar + comanda'}
            </button>
          </div>
        </div>
      </div>

      {/* Variant Modal */}
      {variantModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setVariantModal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg text-gray-900">{variantModal.producto.nombre}</h3>
              <button onClick={() => setVariantModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>

            {variantModal.variantes.map(v => (
              <div key={v.nombre} className="mb-5">
                <p className="font-semibold text-gray-800 mb-2 text-sm">{v.nombre}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(v.opciones || []).map(opt => {
                    const oNombre = opt.nombre || opt;
                    const selected = variantModal.sel[v.nombre]?.nombre === oNombre;
                    return (
                      <button key={oNombre} onClick={() => setVariantModal(p => ({ ...p, sel: { ...p.sel, [v.nombre]: typeof opt === 'string' ? { nombre: opt } : opt } }))}
                        className={`p-3 border-2 rounded-xl text-sm text-left transition-colors ${selected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <span className="font-medium">{oNombre}</span>
                        {opt.precio_extra > 0 && <span className="text-orange-600 text-xs block">+{fmt(opt.precio_extra)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {variantModal.extras.length > 0 && (
              <div className="mb-5">
                <p className="font-semibold text-gray-800 mb-2 text-sm">Extras</p>
                <div className="space-y-2">
                  {variantModal.extras.map(e => {
                    const sel = variantModal.extrasSel.some(x => x.nombre === e.nombre);
                    return (
                      <button key={e.nombre} onClick={() => setVariantModal(p => ({ ...p, extrasSel: sel ? p.extrasSel.filter(x => x.nombre !== e.nombre) : [...p.extrasSel, e] }))}
                        className={`w-full flex items-center justify-between p-3 border-2 rounded-xl transition-colors ${sel ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <span className="text-sm font-medium">{e.nombre}</span>
                        <span className="text-orange-600 text-sm font-medium">+{fmt(e.precio)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button onClick={() => addToCart(variantModal.producto, variantModal.sel, variantModal.extrasSel)}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl transition-colors">
              Agregar al pedido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
